import type { KnowledgeDoc } from './types.js';

/**
 * 把文件切成可引用的片段。
 *
 * 片段要夠小才能當作精準的出處（使用者點了要跳到正確的段落），
 * 又要夠大才有足夠語意。這裡以段落為單位、目標約 300 字，
 * 過長的段落再依句號切開。
 *
 * 每個片段都記住在原文的字元起訖位置 —— 這是「點引文跳回原文並 highlight」
 * 能做到的關鍵，不要只存片段字串。
 */

export interface Chunk {
  docId: string;
  /** 在 `doc.body` 中的起始字元位置（含）。 */
  start: number;
  /** 結束位置（不含）。 */
  end: number;
  text: string;
}

const TARGET = 300;
const MAX = 500;

/** 依句尾標點找出可切開的位置。 */
function sentenceBreaks(text: string): number[] {
  const breaks: number[] = [];
  const re = /[。！？!?；;\n]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    breaks.push(match.index + 1);
  }
  return breaks;
}

/** 把一段過長的文字再切小。回傳相對於這段文字的區間。 */
function splitLongBlock(text: string): Array<[number, number]> {
  if (text.length <= MAX) return [[0, text.length]];

  const breaks = sentenceBreaks(text);
  const spans: Array<[number, number]> = [];
  let start = 0;

  while (start < text.length) {
    const ideal = start + TARGET;
    if (text.length - start <= MAX) {
      spans.push([start, text.length]);
      break;
    }
    // 找最接近理想長度、且還在上限內的句界。
    const candidate = breaks.find((b) => b >= ideal && b - start <= MAX);
    const end = candidate ?? Math.min(start + TARGET, text.length);
    spans.push([start, end]);
    start = end;
  }

  return spans;
}

/** 把一份文件切成片段。 */
export function chunkDoc(doc: KnowledgeDoc): Chunk[] {
  const body = doc.body;
  const chunks: Chunk[] = [];

  // 先依空行分段，段落是作者本來就標好的語意邊界。
  const blockRe = /\n\s*\n/g;
  const blocks: Array<[number, number]> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(body)) !== null) {
    blocks.push([cursor, match.index]);
    cursor = match.index + match[0].length;
  }
  blocks.push([cursor, body.length]);

  for (const [blockStart, blockEnd] of blocks) {
    const raw = body.slice(blockStart, blockEnd);
    if (raw.trim().length === 0) continue;

    for (const [relStart, relEnd] of splitLongBlock(raw)) {
      const start = blockStart + relStart;
      const end = blockStart + relEnd;
      const text = body.slice(start, end).trim();
      if (text.length === 0) continue;
      chunks.push({ docId: doc.id, start, end, text });
    }
  }

  // 文件完全沒有內容時，至少給一個空片段，讓上層不用特判。
  if (chunks.length === 0 && body.length > 0) {
    chunks.push({ docId: doc.id, start: 0, end: body.length, text: body });
  }

  return chunks;
}
