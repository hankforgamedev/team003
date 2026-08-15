import type { DocType, KnowledgeDoc, TaxonomyMode } from './types.js';
import { activeKinds, normalizePath } from './taxonomy.js';

/**
 * 自動分類。
 *
 * 因為資料夾和標籤是**兩套獨立系統**，這裡就是兩個各自獨立的分類器：
 *
 *   - `classifyIntoFolder()`：判斷「這是什麼**種類**的文件」→ SOP／FAQ／型錄
 *   - `classifyIntoTags()`：判斷「這份文件在講**什麼主題**」→ 報價／折扣／合約…
 *
 * 兩者用不同的規則、算各自的把握度、給各自的理由，互不參考。
 * 一份文件可能歸檔成功但標不出標籤（放進 SOP 但講的主題規則沒收錄），
 * 也可能標得出標籤但歸不了檔 —— 這是刻意允許的結果，不是失敗。
 */

/** 單一系統的分類結果。 */
export interface FolderClassification {
  /** `null` 代表猜不出來，維持未歸檔。 */
  path: string | null;
  docType: DocType;
  /** 0–1。低於 0.4 時 UI 應該明顯提示「請確認」。 */
  confidence: number;
  /** 命中的理由，直接顯示給使用者看，讓自動分類是可解釋的。 */
  reasons: string[];
}

export interface TagClassification {
  /** 空陣列代表猜不出來，維持未標記。 */
  tags: string[];
  confidence: number;
  reasons: string[];
}

/** 兩套系統各跑一次的合併結果。 */
export interface Classification {
  folder: FolderClassification;
  tag: TagClassification;
}

/**
 * 預設的資料夾骨架。刻意做得像 Google Drive —— 兩層、名稱是業務看得懂的中文，
 * 企業從 Drive 搬過來時不需要重新學一套心智模型。
 */
export const DEFAULT_FOLDERS = [
  '/公司知識/SOP',
  '/公司知識/FAQ',
  '/公司知識/產品型錄',
  '/客戶知識',
] as const;

/* ------------------------------------------------------------------ */
/* 分類器一：資料夾（文件種類）                                          */
/* ------------------------------------------------------------------ */

interface FolderRule {
  docType: DocType;
  path: string;
  keywords: string[];
}

const FOLDER_RULES: FolderRule[] = [
  {
    docType: 'sop',
    path: '/公司知識/SOP',
    keywords: [
      'SOP', '標準作業', '流程', '步驟', '作業程序', '規範', '準則',
      '簽核', '授權', 'workflow',
    ],
  },
  {
    docType: 'faq',
    path: '/公司知識/FAQ',
    keywords: ['FAQ', '常見問題', '問答', 'Q&A', 'Q＆A', '怎麼辦', '如何處理'],
  },
  {
    docType: 'catalog',
    path: '/公司知識/產品型錄',
    keywords: [
      '型錄', '產品', '方案', '規格', '價目', '定價', '費率',
      '服務內容', 'pricing', 'catalog',
    ],
  },
];

/* ------------------------------------------------------------------ */
/* 分類器二：標籤（文件主題）                                            */
/* ------------------------------------------------------------------ */

/**
 * 標籤規則刻意**不含**「SOP」「FAQ」這種文件種類詞 ——
 * 那是資料夾系統的職責。兩套系統的詞彙不重疊，才是真的獨立：
 * 資料夾回答「這是什麼」，標籤回答「這在講什麼」。
 */
const TAG_RULES: Array<{ tag: string; keywords: string[] }> = [
  { tag: '報價', keywords: ['報價', '價格', '定價', '費用', '價目'] },
  { tag: '折扣', keywords: ['折扣', '優惠', '議價', '讓價'] },
  { tag: '合約', keywords: ['合約', '契約', '條款', '年約', '續約'] },
  { tag: '退貨', keywords: ['退貨', '退款', '退費', '解約', '違約'] },
  { tag: '交付', keywords: ['交付', '交期', '上線', '導入', '交接'] },
  { tag: '售後', keywords: ['售後', '客服', '維運', '保固', '支援'] },
  { tag: '法務', keywords: ['法務', '個資', '合規', '保密', 'NDA'] },
  { tag: '付款', keywords: ['付款', '請款', '分期', '匯款', '發票'] },
];

function hits(haystack: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => haystack.includes(keyword.toLowerCase()));
}

/** 標題的訊號比內文強很多，所以重複三次來加權。 */
function haystackOf(title: string, body: string): string {
  return `${title} ${title} ${title} ${body}`.toLowerCase();
}

/** 分類器一：只決定資料夾，完全不產生標籤。 */
export function classifyIntoFolder(
  title: string,
  body: string,
): FolderClassification {
  const haystack = haystackOf(title, body);

  let best: { rule: FolderRule; matched: string[] } | null = null;
  for (const rule of FOLDER_RULES) {
    const matched = hits(haystack, rule.keywords);
    if (matched.length === 0) continue;
    if (!best || matched.length > best.matched.length) {
      best = { rule, matched };
    }
  }

  if (!best) {
    return {
      path: null,
      docType: 'other',
      confidence: 0,
      reasons: ['認不出這是哪一類文件，先不歸檔 —— 你可以自己選資料夾'],
    };
  }

  return {
    path: normalizePath(best.rule.path),
    docType: best.rule.docType,
    // 命中越多關鍵字越有把握，但上限壓在 0.95，永遠保留「可能猜錯」的餘地。
    confidence: Math.min(0.4 + best.matched.length * 0.15, 0.95),
    reasons: [
      `出現「${best.matched.slice(0, 3).join('」「')}」→ 歸到 ${best.rule.path}`,
    ],
  };
}

/** 分類器二：只決定標籤，完全不決定資料夾。 */
export function classifyIntoTags(
  title: string,
  body: string,
): TagClassification {
  const haystack = haystackOf(title, body);

  const tags: string[] = [];
  const reasons: string[] = [];

  for (const rule of TAG_RULES) {
    const matched = hits(haystack, rule.keywords);
    if (matched.length === 0) continue;
    tags.push(rule.tag);
    reasons.push(`提到「${matched[0]}」→ 標上「${rule.tag}」`);
  }

  if (tags.length === 0) {
    return {
      tags: [],
      confidence: 0,
      reasons: ['認不出主題，先不標籤 —— 你可以自己加'],
    };
  }

  return {
    tags,
    confidence: Math.min(0.45 + tags.length * 0.15, 0.95),
    reasons,
  };
}

/**
 * 兩套系統各跑一次。
 * `mode` 關掉的系統不會被計算，回傳的結果是「維持未分類」。
 */
export function classifyDocument(
  title: string,
  body: string,
  mode: TaxonomyMode = 'both',
): Classification {
  const kinds = activeKinds(mode);

  return {
    folder: kinds.includes('folder')
      ? classifyIntoFolder(title, body)
      : { path: null, docType: 'other', confidence: 0, reasons: [] },
    tag: kinds.includes('tag')
      ? classifyIntoTags(title, body)
      : { tags: [], confidence: 0, reasons: [] },
  };
}

/**
 * 把分類結果套用到文件上。
 *
 * 兩個系統各自標記 `autoFiled` / `autoTagged`，使用者可以分開確認 ——
 * 同意 AI 的歸檔但想自己改標籤是很常見的情況。
 */
export function applyClassification(
  doc: KnowledgeDoc,
  classification: Classification,
): KnowledgeDoc {
  const next = { ...doc };

  if (classification.folder.path !== null) {
    next.path = classification.folder.path;
    next.docType = classification.folder.docType;
    next.autoFiled = true;
  }

  if (classification.tag.tags.length > 0) {
    next.tags = [...new Set([...doc.tags, ...classification.tag.tags])];
    next.autoTagged = true;
  }

  return next;
}
