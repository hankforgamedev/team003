import { buildIndex, searchChunks } from './search.js';
import type { Answer, Citation, KnowledgeDoc } from './types.js';

/**
 * 知識庫問答：檢索 → 生成，回答一定附出處。
 *
 * 架構上刻意分成兩段：
 *   1. 檢索（`searchChunks`）——本地、零依賴、確定性。
 *   2. 潤飾（`LlmProvider`）——可選。沒有 provider、或呼叫失敗，
 *      就用抽取式回答（把最相關的原文片段直接拼給使用者）。
 *
 * 這個降級路徑不是備案，是**預設能跑的那條路**：
 * 沿用 Sales Next 既有的「沒 key、斷網、API 掛掉都自動降級」慣例，
 * demo 當天網路出問題也不會開天窗。
 */

/** 生成層的介面。任何 LLM 都可以實作，模組本身不綁定廠商。 */
export interface LlmProvider {
  /** 顯示在 UI 上的引擎名稱。 */
  readonly name: 'bedrock';
  /**
   * 根據檢索到的片段回答問題。
   * 實作只需要「照著 context 回答、不要編造」，引用的組裝由這一層負責。
   */
  complete(params: {
    question: string;
    context: Citation[];
    signal?: AbortSignal;
  }): Promise<string>;
}

export interface AskOptions {
  /** 檢索要餵幾段給模型。太多會稀釋重點，6 段是堪用的起點。 */
  topK?: number;
  provider?: LlmProvider;
  signal?: AbortSignal;
}

/** 檢索不到東西時的固定回覆。不要讓模型在沒有依據時自由發揮。 */
const NO_CONTEXT =
  '知識庫裡目前找不到相關內容。可以換個說法再問一次，或先把相關文件上傳進來。';

export function buildPrompt(question: string, context: Citation[]): string {
  const sources = context
    .map(
      (citation, index) =>
        `[${index + 1}] 出自《${citation.docTitle}》（${citation.docPath}）\n${citation.text}`,
    )
    .join('\n\n');

  return [
    '以下是公司知識庫檢索到的片段，請只根據這些片段回答問題。',
    '',
    sources,
    '',
    `問題：${question}`,
    '',
    '回答要求：',
    '- 只使用上面片段裡有的資訊。片段沒提到的就說「知識庫裡沒有這項資訊」，不要推測。',
    '- 用繁體中文，直接回答，不要重複問題。',
    '- 在引用資訊的句子後面標上來源編號，例如 [1]。',
    '- 三句話以內講完重點。',
  ].join('\n');
}

/**
 * 抽取式回答：不生成任何新句子，直接把最相關的片段整理出來。
 * 因為完全不編造，所以在沒有 LLM 時也是可信的答案。
 */
export function extractiveAnswer(
  question: string,
  context: Citation[],
): string {
  if (context.length === 0) return NO_CONTEXT;

  const lines = context.slice(0, 3).map((citation, index) => {
    const snippet = citation.text.replace(/\s+/g, ' ').trim();
    const clipped =
      snippet.length > 160 ? `${snippet.slice(0, 160)}…` : snippet;
    return `[${index + 1}] ${clipped}`;
  });

  return [
    `在知識庫裡找到 ${context.length} 段相關內容，以下是最相關的原文：`,
    '',
    ...lines,
    '',
    '（目前使用內建檢索引擎，以上為原文摘錄未經改寫。點引文可以跳回完整文件。）',
  ].join('\n');
}

/** 問一個問題。這是知識庫對外的主要 API。 */
export async function ask(
  docs: KnowledgeDoc[],
  question: string,
  options: AskOptions = {},
): Promise<Answer> {
  const { topK = 6, provider, signal } = options;

  const trimmed = question.trim();
  if (trimmed.length === 0) {
    return {
      question,
      text: '請先輸入問題。',
      citations: [],
      engine: 'offline',
    };
  }

  const index = buildIndex(docs);
  const citations = searchChunks(index, trimmed, topK);

  if (citations.length === 0) {
    return {
      question: trimmed,
      text: NO_CONTEXT,
      citations: [],
      engine: 'offline',
    };
  }

  if (!provider) {
    return {
      question: trimmed,
      text: extractiveAnswer(trimmed, citations),
      citations,
      engine: 'offline',
    };
  }

  try {
    const text = await provider.complete({
      question: trimmed,
      context: citations,
      ...(signal ? { signal } : {}),
    });
    return {
      question: trimmed,
      text: text.trim(),
      citations,
      engine: provider.name,
    };
  } catch (error) {
    // 生成失敗不等於問答失敗 —— 檢索結果還在，照樣給得出附出處的答案。
    return {
      question: trimmed,
      text: extractiveAnswer(trimmed, citations),
      citations,
      engine: 'offline',
      note: `AI 生成暫時無法使用（${describeError(error)}），已改用內建檢索引擎。`,
    };
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
