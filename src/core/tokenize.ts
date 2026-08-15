/**
 * 中英混合的斷詞。
 *
 * 這是整個檢索最關鍵、也最容易做錯的一塊：
 * 中文沒有空白分隔，用 `text.split(/\s+/)` 去切「沐日食品的預算是多少」
 * 會得到一個 token，什麼都搜不到。
 *
 * 作法：
 * - 中日韓字元切成 **bigram**（連續兩字），例如「預算是多少」→ 預算/算是/是多/多少。
 *   bigram 不需要詞典就能達到堪用的中文檢索品質，很適合黑客松的時間預算。
 * - 英數照一般 word boundary 切，並轉小寫。
 * - 單一個中文字也保留成 unigram，讓「錢」這種單字查詢還搜得到。
 */

const CJK = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]/;
const LATIN_NUM = /[a-zA-Z0-9_]/;

function isCjk(ch: string): boolean {
  return CJK.test(ch);
}

/** 切出檢索用的 token。回傳可能含重複，由呼叫端決定要不要計次。 */
export function tokenize(input: string): string[] {
  const text = input.normalize('NFKC');
  const tokens: string[] = [];

  let latinBuffer = '';
  const flushLatin = () => {
    if (latinBuffer.length > 0) {
      tokens.push(latinBuffer.toLowerCase());
      latinBuffer = '';
    }
  };

  const cjkRun: string[] = [];
  const flushCjk = () => {
    if (cjkRun.length === 0) return;
    // 單字 unigram
    for (const ch of cjkRun) tokens.push(ch);
    // 相鄰 bigram
    for (let i = 0; i + 1 < cjkRun.length; i++) {
      tokens.push(`${cjkRun[i]}${cjkRun[i + 1]}`);
    }
    cjkRun.length = 0;
  };

  for (const ch of text) {
    if (isCjk(ch)) {
      flushLatin();
      cjkRun.push(ch);
    } else if (LATIN_NUM.test(ch)) {
      flushCjk();
      latinBuffer += ch;
    } else {
      flushLatin();
      flushCjk();
    }
  }
  flushLatin();
  flushCjk();

  return tokens;
}

/** token → 出現次數。 */
export function termFrequency(input: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokenize(input)) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return freq;
}

/**
 * 中文常見的功能詞。這些字在 bigram 下噪音很大，
 * 查詢時降權（不是完全丟掉，因為「的」在「目的」裡是有意義的）。
 */
const STOP = new Set([
  '的', '是', '在', '了', '和', '就', '都', '而', '及', '與', '也', '很', '到',
  '要', '會', '有', '我', '你', '他', '她', '它', '們', '這', '那', '個', '嗎',
  '呢', '吧', '啊', '請', '問', '一', '不',
  'the', 'a', 'an', 'is', 'are', 'of', 'to', 'and', 'or', 'in', 'on', 'for',
]);

/** 這個 token 的權重。停用詞降權，長 token（bigram / 英文字）加權。 */
export function tokenWeight(token: string): number {
  if (STOP.has(token)) return 0.15;
  if (token.length >= 2) return 1.4;
  return 1;
}

/**
 * 是不是「有訊息量」的 token。
 *
 * 單一個中文字幾乎一定會在語料裡出現（「的」「子」「理」都是），
 * 只靠它們命中等於沒命中。檢索時要求至少命中一個 strong token，
 * 否則問一個知識庫根本沒有的主題，也會回一堆分數很低但看起來像出處的片段 ——
 * 那比直接說「找不到」更傷信任。
 */
export function isStrongToken(token: string): boolean {
  return token.length >= 2 && !STOP.has(token);
}
