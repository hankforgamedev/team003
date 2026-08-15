import { buildPrompt } from '../core/qa.js';
import type { LlmProvider } from '../core/qa.js';
import type { Citation } from '../core/types.js';

/**
 * AWS Bedrock provider。
 *
 * 這個檔案是整個模組唯一碰到網路的地方，而且是 **lazy import**：
 * 沒安裝 `@anthropic-ai/bedrock-sdk` 也不影響其他功能，
 * 前端 bundle 也不會把 AWS SDK 打包進去。
 *
 * 只能在**伺服器端**呼叫（Next.js route handler / Lambda）。
 * 不要在瀏覽器裡用 —— 那會把 AWS 憑證送到客戶端。
 */

/**
 * Bedrock 上的 Claude model id 帶 `anthropic.` 前綴，
 * 跟第一方 API 的 `claude-opus-5` 不同，寫錯會 400。
 */
export const BEDROCK_CLAUDE_MODEL = 'anthropic.claude-opus-5';

/** Amazon 自家的多語 embedding 模型，中文表現堪用。 */
export const BEDROCK_EMBED_MODEL = 'amazon.titan-embed-text-v2:0';

export interface BedrockOptions {
  /** AWS region，例如 `us-east-1`。Bedrock 一定要指定。 */
  region: string;
  /** 覆寫模型。預設 `anthropic.claude-opus-5`。 */
  model?: string;
  /**
   * 思考深度。知識庫問答是「照著 context 講清楚」，不需要深度推理，
   * 用 `low` 可以明顯省 token 和延遲。
   */
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

/**
 * 用執行期字串載入模組。
 *
 * 刻意不用字面量 specifier：那會讓 TypeScript 去靜態解析這兩個 AWS 套件，
 * 沒安裝就編譯失敗 —— 但整個模組的賣點就是「不裝 AWS SDK 也能跑」。
 * 走這條路，型別由下面的結構型別介面保證，安不安裝都不影響其他功能。
 *
 * 注意：這是**伺服器端專用**。打包工具遇到動態 specifier 會警告，
 * 這個檔案本來就不該進前端 bundle。
 */
async function loadModule(specifier: string): Promise<unknown> {
  return import(/* @vite-ignore */ /* webpackIgnore: true */ specifier);
}

/** SDK 的最小介面。用結構型別避免對 SDK 版本產生硬相依。 */
interface MantleClient {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      stop_reason?: string | null;
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

let clientPromise: Promise<MantleClient> | null = null;

async function getClient(region: string): Promise<MantleClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      // 沒裝這個套件時，錯誤只會在真的要用 Bedrock 時才出現。
      const mod = (await loadModule('@anthropic-ai/bedrock-sdk')) as {
        AnthropicBedrockMantle: new (opts: { awsRegion: string }) => MantleClient;
      };
      return new mod.AnthropicBedrockMantle({ awsRegion: region });
    })();
  }
  return clientPromise;
}

const SYSTEM = [
  '你是企業內部知識庫的問答助理，服務對象是業務人員。',
  '你只能根據使用者提供的知識庫片段回答，片段裡沒有的資訊一律回答「知識庫裡沒有這項資訊」。',
  '絕對不要根據常識或訓練資料補充內容 —— 業務會拿你的回答去跟客戶講，講錯的代價很高。',
].join('\n');

/**
 * 建立 Bedrock 問答 provider。
 *
 * 這個 provider 只負責「把檢索到的片段講成人話」。檢索本身在本地完成，
 * 所以就算 Bedrock 掛掉，`ask()` 也會自動降級成抽取式回答（見 qa.ts）。
 */
export function createBedrockProvider(options: BedrockOptions): LlmProvider {
  const {
    region,
    model = BEDROCK_CLAUDE_MODEL,
    effort = 'low',
    // 思考 token 和回覆 token 共用 max_tokens，所以要留足空間。
    maxTokens = 4096,
  } = options;

  return {
    name: 'bedrock',
    async complete({ question, context, signal }) {
      const client = await getClient(region);

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: SYSTEM,
        output_config: { effort },
        messages: [{ role: 'user', content: buildPrompt(question, context) }],
        ...(signal ? { signal } : {}),
      });

      // 安全分類器可能擋下請求，這時 content 會是空的。
      // 先檢查 stop_reason 再讀 content，不要無條件取 content[0]。
      if (response.stop_reason === 'refusal') {
        throw new Error('模型拒絕回答這個問題');
      }

      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('')
        .trim();

      if (!text) throw new Error('模型沒有回傳內容');
      return text;
    },
  };
}

/* ------------------------------------------------------------------ */
/* 語意檢索（選用）                                                      */
/* ------------------------------------------------------------------ */

/**
 * 用 Titan embedding 對關鍵字檢索的結果重排序。
 *
 * 為什麼是「重排序」而不是直接用向量檢索：關鍵字檢索負責高召回、
 * 向量負責挑出語意最貼近的幾段，兩段式的成本遠低於把整個知識庫都算成向量，
 * 而且關鍵字那層永遠可用，Bedrock 掛掉時檢索品質只是回到 BM25，不會歸零。
 *
 * 這條路徑是選用的 —— 預設的 `ask()` 不會走到這裡。
 */
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

interface InvokeClient {
  send(command: unknown): Promise<{ body: Uint8Array }>;
}

export function createBedrockEmbedder(
  options: Pick<BedrockOptions, 'region'> & { model?: string },
): Embedder {
  const { region, model = BEDROCK_EMBED_MODEL } = options;
  let runtime: Promise<{ client: InvokeClient; Command: new (input: unknown) => unknown }> | null =
    null;

  const getRuntime = async () => {
    if (!runtime) {
      runtime = (async () => {
        const { BedrockRuntimeClient, InvokeModelCommand } = (await loadModule(
          '@aws-sdk/client-bedrock-runtime',
        )) as {
          BedrockRuntimeClient: new (opts: { region: string }) => InvokeClient;
          InvokeModelCommand: new (input: unknown) => unknown;
        };
        return {
          client: new BedrockRuntimeClient({ region }),
          Command: InvokeModelCommand,
        };
      })();
    }
    return runtime;
  };

  return {
    async embed(texts) {
      const { client, Command } = await getRuntime();
      const vectors: number[][] = [];

      // Titan 一次只吃一段文字，所以逐筆送。量大時應該改用批次或先做快取。
      for (const text of texts) {
        const command = new Command({
          modelId: model,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({ inputText: text, normalize: true }),
        });
        const response = await client.send(command);
        const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
          embedding: number[];
        };
        vectors.push(parsed.embedding);
      }

      return vectors;
    },
  };
}

/** 餘弦相似度。Titan 開了 `normalize` 之後其實就是內積，但保留除法比較穩健。 */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** 用語意相似度重排引文。失敗時原樣回傳，不讓問答整條斷掉。 */
export async function rerank(
  embedder: Embedder,
  question: string,
  citations: Citation[],
): Promise<Citation[]> {
  if (citations.length <= 1) return citations;

  try {
    const [questionVector, ...chunkVectors] = await embedder.embed([
      question,
      ...citations.map((c) => c.text),
    ]);
    if (!questionVector) return citations;

    return citations
      .map((citation, index) => {
        const vector = chunkVectors[index];
        const semantic = vector ? cosine(questionVector, vector) : 0;
        // 關鍵字分數和語意分數各佔一半，兩邊都同意的片段才會排到最前面。
        return { ...citation, score: citation.score * 0.5 + semantic * 0.5 };
      })
      .sort((a, b) => b.score - a.score);
  } catch {
    return citations;
  }
}
