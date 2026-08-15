import type { KnowledgeDoc } from './types.js';

/**
 * 快速切換（Obsidian 的 Cmd+P / VS Code 的 Cmd+P）。
 *
 * 這跟 `search.ts` 的 BM25 是**不同用途**，不要混在一起：
 *
 *   - BM25（`searchDocs`）：「這個問題的答案在哪」—— 比對**內文**，看詞頻。
 *   - 快速切換（這裡）：「我要跳到那份文件」—— 比對**標題**，看模糊子序列。
 *
 * 使用者已經知道要去哪的時候，不需要排序演算法，需要的是三個字就跳到位。
 *
 * ## 為什麼中文特別適合模糊比對
 *
 * 英文的模糊比對（fzf 那種）靠的是「字母子序列」，例如 `knwbs` 命中
 * `knowledge-base`。中文更直接 —— 每個字本身就是一個有意義的單位，
 * 打「報價」就命中「報價與折扣授權 SOP」，不需要斷詞、不需要詞典。
 * 所以這裡刻意用字元層級的子序列比對，中英文共用同一套邏輯。
 */

/** 命中的字元區間，UI 用來把配對到的字反白。 */
export interface MatchRange {
  start: number;
  end: number;
}

export interface QuickMatch {
  doc: KnowledgeDoc;
  score: number;
  /** 標題上命中的區間。 */
  titleRanges: MatchRange[];
  /** 命中的是標題還是路徑 —— UI 可以標示「靠路徑找到的」。 */
  matchedOn: 'title' | 'path';
}

interface FuzzyResult {
  score: number;
  ranges: MatchRange[];
}

/** 這些字元後面的位置算「詞首」，命中詞首給加分。 */
const BOUNDARY = new Set([' ', '/', '-', '_', '.', '｜', '|', '：', ':']);

/**
 * 模糊子序列比對。
 *
 * query 的每個字元都必須在 target 裡**依序**出現，否則不算命中。
 * 分數規則（照重要性排）：
 *   - 連續命中加分最多 —— 「報價」連在一起比分散在兩處有意義得多
 *   - 命中開頭或詞首加分
 *   - 命中位置越前面越好
 *   - target 越短越好（同樣命中的話，短標題更可能是使用者要的）
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  if (query.length === 0) return { score: 0, ranges: [] };

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  const ranges: MatchRange[] = [];
  let score = 0;
  let qi = 0;
  let consecutive = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) {
      consecutive = 0;
      continue;
    }

    // 連續命中：第 n 個連續字給 n 倍加分，讓整段吻合遠勝於零散命中。
    consecutive += 1;
    score += 10 * consecutive;

    if (ti === 0) score += 15;
    else if (BOUNDARY.has(t[ti - 1] as string)) score += 8;

    // 越靠前越好，但衰減要溫和，免得長標題完全沒機會。
    score += Math.max(0, 8 - ti / 4);

    const last = ranges.at(-1);
    if (last && last.end === ti) last.end = ti + 1;
    else ranges.push({ start: ti, end: ti + 1 });

    qi += 1;
  }

  // 沒有把 query 走完 = 不算命中，寧可少給也不要給錯的。
  if (qi < q.length) return null;

  // 同樣命中的情況下短標題優先。
  score -= t.length * 0.3;

  return { score, ranges };
}

/**
 * 快速切換的主入口。
 *
 * 先比標題，標題比不到再比路徑 —— 使用者記得「那份在 SOP 資料夾」
 * 的時候也找得到。空 query 回傳最近更新的幾筆，跟 Obsidian 一樣
 * 一打開就有東西可選。
 */
export function quickSwitch(
  docs: KnowledgeDoc[],
  query: string,
  limit = 8,
): QuickMatch[] {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return [...docs]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((doc) => ({
        doc,
        score: 0,
        titleRanges: [],
        matchedOn: 'title' as const,
      }));
  }

  const matches: QuickMatch[] = [];

  for (const doc of docs) {
    const byTitle = fuzzyMatch(trimmed, doc.title);
    if (byTitle) {
      matches.push({
        doc,
        score: byTitle.score,
        titleRanges: byTitle.ranges,
        matchedOn: 'title',
      });
      continue;
    }

    // 標題沒中就試路徑，但分數打折 —— 標題命中永遠該排前面。
    if (doc.path) {
      const byPath = fuzzyMatch(trimmed, doc.path);
      if (byPath) {
        matches.push({
          doc,
          score: byPath.score * 0.5,
          titleRanges: [],
          matchedOn: 'path',
        });
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * 把字串照命中區間切成「要反白／不要反白」的片段，給 UI 直接 render。
 * 跟 `search.ts` 的 `splitForHighlight` 是同樣的概念，
 * 差別是這裡吃的是多個區間。
 */
export function splitByRanges(
  text: string,
  ranges: MatchRange[],
): Array<{ text: string; hit: boolean }> {
  if (ranges.length === 0) return [{ text, hit: false }];

  const out: Array<{ text: string; hit: boolean }> = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      out.push({ text: text.slice(cursor, range.start), hit: false });
    }
    out.push({ text: text.slice(range.start, range.end), hit: true });
    cursor = range.end;
  }

  if (cursor < text.length) {
    out.push({ text: text.slice(cursor), hit: false });
  }

  return out;
}
