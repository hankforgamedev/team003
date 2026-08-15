import { createHash } from 'node:crypto';
import { loadOptional } from '../core/load-module.js';
import type {
  PipelineDocument,
  PipelineDocumentSink,
  PipelineWriteResult,
  SyncStateStore,
} from './types.js';
import { renderPipelineDocument } from './types.js';

export interface S3PipelineClientLike {
  send(command: unknown): Promise<unknown>;
}

type CommandCtor = new (input: Record<string, unknown>) => unknown;

interface S3Sdk {
  S3Client: new (config: Record<string, unknown>) => S3PipelineClientLike;
  GetObjectCommand: CommandCtor;
  PutObjectCommand: CommandCtor;
}

interface S3ConnectionOptions {
  bucket: string;
  region?: string;
  client?: S3PipelineClientLike;
}

export interface S3RawDocumentSinkOptions extends S3ConnectionOptions {
  /** 預設寫入既有 pipeline 監看的 `raw/`。 */
  prefix?: string;
}

export interface S3SyncStateStoreOptions extends S3ConnectionOptions {
  /** sync token 與 raw 進料分開，避免觸發黑盒子。 */
  prefix?: string;
}

class LazyS3Connection {
  private client: S3PipelineClientLike | undefined;
  private sdkCache: S3Sdk | undefined;

  constructor(
    readonly bucket: string,
    private readonly region?: string,
    client?: S3PipelineClientLike,
  ) {
    this.client = client;
  }

  async get(): Promise<{ client: S3PipelineClientLike; sdk: S3Sdk }> {
    this.sdkCache ??= (await loadOptional(
      '@aws-sdk/client-s3',
      'LINE／Google Calendar ingestion',
    )) as S3Sdk;

    this.client ??= new this.sdkCache.S3Client(
      this.region ? { region: this.region } : {},
    );

    return { client: this.client, sdk: this.sdkCache };
  }
}

/** 每筆來源事件一個穩定 key：沒有 S3 append 競態，重送只覆寫同一筆。 */
export function makeRawObjectKey(
  document: PipelineDocument,
  prefix = 'raw',
): string {
  const day = safeDate(document.occurredAt);
  const subject = safeSegment(document.subjectId, 'unknown');
  const external = safeSegment(document.externalId, shortHash(document.externalId));
  const root = prefix.replace(/^\/+|\/+$/g, '') || 'raw';
  return `${root}/${document.source}_${subject}_${day}_${external}.txt`;
}

export class S3RawDocumentSink implements PipelineDocumentSink {
  private readonly connection: LazyS3Connection;
  private readonly prefix: string;

  constructor(options: S3RawDocumentSinkOptions) {
    this.connection = new LazyS3Connection(
      options.bucket,
      options.region,
      options.client,
    );
    this.prefix = options.prefix ?? 'raw';
  }

  async write(document: PipelineDocument): Promise<PipelineWriteResult> {
    const { client, sdk } = await this.connection.get();
    const key = makeRawObjectKey(document, this.prefix);

    await client.send(
      new sdk.PutObjectCommand({
        Bucket: this.connection.bucket,
        Key: key,
        Body: renderPipelineDocument(document),
        ContentType: 'text/plain; charset=utf-8',
        Metadata: {
          source: document.source,
          externalid: safeMetadata(document.externalId),
          subjectid: safeMetadata(document.subjectId),
        },
      }),
    );

    return { location: `s3://${this.connection.bucket}/${key}` };
  }
}

/** 用同一個 S3 bucket 保存 Calendar syncToken，不需要新增資料庫。 */
export class S3SyncStateStore implements SyncStateStore {
  private readonly connection: LazyS3Connection;
  private readonly prefix: string;

  constructor(options: S3SyncStateStoreOptions) {
    this.connection = new LazyS3Connection(
      options.bucket,
      options.region,
      options.client,
    );
    this.prefix = (options.prefix ?? '_ingestion-state').replace(/^\/+|\/+$/g, '');
  }

  async get(key: string): Promise<string | undefined> {
    const { client, sdk } = await this.connection.get();
    try {
      const result = (await client.send(
        new sdk.GetObjectCommand({
          Bucket: this.connection.bucket,
          Key: this.objectKey(key),
        }),
      )) as { Body?: { transformToString(): Promise<string> } };
      return await result.Body?.transformToString();
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const { client, sdk } = await this.connection.get();
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: this.connection.bucket,
        Key: this.objectKey(key),
        Body: value,
        ContentType: 'text/plain; charset=utf-8',
      }),
    );
  }

  private objectKey(key: string): string {
    return `${this.prefix}/${safeSegment(key, shortHash(key))}.txt`;
  }
}

function safeDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'unknown-date'
    : parsed.toISOString().slice(0, 10);
}

function safeSegment(value: string, fallback: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

function safeMetadata(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '_').slice(0, 1024);
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

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
