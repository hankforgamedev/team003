import { loadOptional } from '../core/load-module.js';
import { BaseStore, EMPTY, parseSnapshot } from '../core/store.js';
import type { Snapshot } from '../core/store.js';

/**
 * S3 版的儲存層 —— 「AWS 的 localStorage」。
 *
 * 整個知識庫存成 bucket 裡的**一個 JSON 物件**，讀就是 GetObject、
 * 寫就是 PutObject。跟 `LocalStorageStore` 是同一個模型，
 * 只是把瀏覽器換成 S3，所以 UI 和上層邏輯一行都不用改：
 *
 * ```ts
 * <KnowledgeBase store={new S3Store({ bucket: 'my-kb' })} />
 * ```
 *
 * 為什麼是 S3 而不是 DynamoDB／RDS：我們的規模是幾筆到幾十筆知識，
 * 而且每次操作本來就要讀整包（資料夾樹和標籤統計都是全量推導的）。
 * 這種存取模式用物件儲存最單純 —— 不用設 schema、不用管 VPC、
 * 不用處理連線池，權限就是一條 IAM policy。
 *
 * ## 只能在伺服器端用
 *
 * `@aws-sdk/client-s3` 是 lazy import 的，而且憑證絕對不能進瀏覽器。
 * 在 Next.js 裡請放在 route handler 或 server action，不要在 client component。
 *
 * ## 已知限制：整包覆寫，後寫的贏
 *
 * 每次修改都是「讀整包 → 改 → 寫整包」，兩個人同時改會後者覆蓋前者。
 * 在 demo 和小團隊的規模這不會發生；真的要多人同時編輯時，
 * 改用 `ifMatch` 選項（見下）或換成每份文件一個物件的實作。
 */

/** 建構參數。`client` 可以自己傳，方便測試或共用既有的 S3 client。 */
export interface S3StoreOptions {
  /** S3 bucket 名稱。 */
  bucket: string;
  /** 物件 key。預設 `knowledge-base.json`。 */
  key?: string;
  /** AWS region。不給就用環境變數（`AWS_REGION`）。 */
  region?: string;
  /**
   * 開啟樂觀鎖：寫入時帶上讀取到的 ETag，物件被別人改過就丟錯而不是覆蓋。
   * 預設關閉 —— demo 規模用不到，開了反而要處理重試。
   */
  ifMatch?: boolean;
  /** 直接注入 S3 client（測試或想共用連線時用）。 */
  client?: S3ClientLike;
}

/**
 * 我們只用到 `send()`，所以用這個最小介面代替真正的 S3Client 型別。
 * 好處是不用把 `@aws-sdk/client-s3` 變成編譯期依賴，測試也好塞假的。
 */
export interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

interface GetObjectResult {
  Body?: { transformToString(): Promise<string> };
  ETag?: string;
}

/** SDK 的最小介面。用結構型別避免對 SDK 版本產生硬相依。 */
type CommandCtor = new (input: Record<string, unknown>) => unknown;

interface S3Sdk {
  S3Client: new (config: Record<string, unknown>) => S3ClientLike;
  GetObjectCommand: CommandCtor;
  PutObjectCommand: CommandCtor;
}

export class S3Store extends BaseStore {
  private readonly bucket: string;
  private readonly key: string;
  private readonly region: string | undefined;
  private readonly ifMatch: boolean;

  private client: S3ClientLike | undefined;
  private sdkCache: S3Sdk | undefined;
  /** 最近一次讀到的 ETag，開啟 ifMatch 時用來偵測衝突。 */
  private etag: string | undefined;

  constructor(options: S3StoreOptions) {
    super();
    this.bucket = options.bucket;
    this.key = options.key ?? 'knowledge-base.json';
    this.region = options.region;
    this.ifMatch = options.ifMatch ?? false;
    this.client = options.client;
  }

  /**
   * 延遲載入 AWS SDK。
   *
   * 跟 Bedrock 那邊一樣的處理：核心模組保持零依賴，
   * 沒裝 `@aws-sdk/client-s3` 的人不會因為 import 這個檔案就爆掉。
   */
  private async sdk(): Promise<{ client: S3ClientLike; sdk: S3Sdk }> {
    this.sdkCache ??= (await loadOptional(
      '@aws-sdk/client-s3',
      'S3Store',
    )) as S3Sdk;

    this.client ??= new this.sdkCache.S3Client(
      this.region ? { region: this.region } : {},
    );

    return { client: this.client, sdk: this.sdkCache };
  }

  protected async read(): Promise<Snapshot> {
    const { client, sdk } = await this.sdk();

    try {
      const result = (await client.send(
        new sdk.GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
      )) as GetObjectResult;

      this.etag = result.ETag;
      const raw = await result.Body?.transformToString();
      return raw ? parseSnapshot(raw) : EMPTY;
    } catch (error) {
      // 物件還不存在 = 空知識庫，這是正常的初始狀態，不是錯誤。
      if (isNotFound(error)) {
        this.etag = undefined;
        return EMPTY;
      }
      throw error;
    }
  }

  protected async write(snapshot: Snapshot): Promise<void> {
    const { client, sdk } = await this.sdk();

    const result = (await client.send(
      new sdk.PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        Body: JSON.stringify(snapshot),
        ContentType: 'application/json',
        // 開了樂觀鎖才帶 IfMatch；物件不存在時（etag 未定義）不能帶。
        ...(this.ifMatch && this.etag ? { IfMatch: this.etag } : {}),
      }),
    )) as { ETag?: string };

    // 記住新的 ETag，下一次寫入才比對得到。
    this.etag = result.ETag;
  }
}

/** S3 的「物件不存在」在不同版本 SDK 有幾種長相，一併判掉。 */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const err = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    err.name === 'NoSuchKey' ||
    err.name === 'NotFound' ||
    err.Code === 'NoSuchKey' ||
    err.$metadata?.httpStatusCode === 404
  );
}
