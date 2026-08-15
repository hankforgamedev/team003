import { chunkDoc, type Chunk } from './chunk.js';
import {
  isStrongToken,
  termFrequency,
  tokenize,
  tokenWeight,
} from './tokenize.js';
import { sortDocs } from './taxonomy.js';
import type { Citation, KnowledgeDoc, SearchResult } from './types.js';

/**
 * 檢索。用的是 BM25 的簡化版，作用在「片段」而非整份文件上，
 * 因為問答需要的是精準的引文位置，不是「這份文件大概相關」。
 *
 * 沒有用 embedding —— 這是刻意的取捨：
 * 關鍵字檢索零依賴、零延遲、離線可跑，而且中文 bigram 在
 * 「沐日食品的預算是多少」這類具名查詢上表現本來就好。
 * 要接語意檢索時，在 `providers/` 加一個 embedding provider 疊上去即可，
 * 這一層的介面不用動。
 */

const K1 = 1.5;
const B = 0.75;

interface IndexedChunk extends Chunk {
  doc: KnowledgeDoc;
  freq: Map<string, number>;
  length: number;
}

export interface SearchIndex {
  chunks: IndexedChunk[];
  /** token → 含有這個 token 的片段數。 */
  docFreq: Map<string, number>;
  avgLength: number;
}

/** 建索引。文件不多時每次重建就好；量大時可以在上層 memo 住。 */
export function buildIndex(docs: KnowledgeDoc[]): SearchIndex {
  const chunks: IndexedChunk[] = [];
  const docFreq = new Map<string, number>();

  for (const doc of docs) {
    for (const chunk of chunkDoc(doc)) {
      // 標題和標籤併進片段的索引文字，讓「SOP」這種只出現在標題的詞也搜得到。
      const indexedText = `${doc.title} ${doc.tags.join(' ')} ${chunk.text}`;
      const freq = termFrequency(indexedText);
      const length = [...freq.values()].reduce((a, b) => a + b, 0);
      chunks.push({ ...chunk, doc, freq, length });

      for (const token of freq.keys()) {
        docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
      }
    }
  }

  const avgLength =
    chunks.length === 0
      ? 1
      : chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length;

  return { chunks, docFreq, avgLength };
}

function toCitation(chunk: IndexedChunk, score: number): Citation {
  return {
    docId: chunk.doc.id,
    docTitle: chunk.doc.title,
    docPath: chunk.doc.path,
    start: chunk.start,
    end: chunk.end,
    text: chunk.text,
    score,
    ...(chunk.doc.sourceRef?.meetingId
      ? { meetingId: chunk.doc.sourceRef.meetingId }
      : {}),
  };
}

/** 檢索片段，回傳最相關的引文。給問答用。 */
export function searchChunks(
  index: SearchIndex,
  query: string,
  limit = 6,
): Citation[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const total = Math.max(index.chunks.length, 1);
  const uniqueTokens = new Set(queryTokens);

  // 查詢本身如果只有單字（例如使用者只打了「錢」），就不能要求 strong 命中，
  // 否則永遠是零結果。這種查詢退回單純看分數。
  const queryHasStrong = [...uniqueTokens].some(isStrongToken);

  const scored: Array<{ chunk: IndexedChunk; score: number }> = [];

  for (const chunk of index.chunks) {
    let score = 0;
    let strongHits = 0;

    for (const token of uniqueTokens) {
      const tf = chunk.freq.get(token);
      if (!tf) continue;
      if (isStrongToken(token)) strongHits += 1;

      const df = index.docFreq.get(token) ?? 0;
      // BM25 的 IDF，加 1 避免常見詞算出負值。
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      const norm =
        tf * (K1 + 1) /
        (tf + K1 * (1 - B + (B * chunk.length) / index.avgLength));
      score += idf * norm * tokenWeight(token);
    }

    // 只靠單字命中的視為沒命中 —— 這是「查不到就說查不到」的關鍵。
    if (queryHasStrong && strongHits === 0) continue;

    if (score > 0) {
      // 釘選的知識稍微加權，讓公司想主推的內容浮上來。
      if (chunk.doc.pinned) score *= 1.15;
      scored.push({ chunk, score });
    }
  }

  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);

  // 相對門檻：砍掉分數遠低於最佳命中的長尾。
  // 引文列表只放「真的相關」的，寧可少給也不要給看起來像出處的雜訊。
  const floor = (scored[0]?.score ?? 0) * 0.25;

  return scored
    .filter((entry) => entry.score >= floor)
    .slice(0, limit)
    .map(({ chunk, score }) => toCitation(chunk, score));
}

/** 檢索文件，一份文件只回傳一次（取它最強的片段當摘要）。給列表搜尋用。 */
export function searchDocs(
  docs: KnowledgeDoc[],
  query: string,
  limit = 20,
): SearchResult[] {
  if (query.trim().length === 0) {
    return sortDocs(docs)
      .slice(0, limit)
      .map((doc) => ({
        doc,
        score: 0,
        best: {
          docId: doc.id,
          docTitle: doc.title,
          docPath: doc.path,
          start: 0,
          end: Math.min(doc.body.length, 120),
          text: doc.body.slice(0, 120),
          score: 0,
        },
      }));
  }

  const index = buildIndex(docs);
  const citations = searchChunks(index, query, docs.length * 3 + 10);

  const bestPerDoc = new Map<string, Citation>();
  const totalPerDoc = new Map<string, number>();
  for (const citation of citations) {
    totalPerDoc.set(
      citation.docId,
      (totalPerDoc.get(citation.docId) ?? 0) + citation.score,
    );
    const current = bestPerDoc.get(citation.docId);
    if (!current || citation.score > current.score) {
      bestPerDoc.set(citation.docId, citation);
    }
  }

  const byId = new Map(docs.map((d) => [d.id, d]));
  return [...totalPerDoc.entries()]
    .map(([docId, score]) => {
      const doc = byId.get(docId);
      const best = bestPerDoc.get(docId);
      if (!doc || !best) return null;
      return { doc, score, best };
    })
    .filter((r): r is SearchResult => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
