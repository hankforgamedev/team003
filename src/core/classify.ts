import type { DocType, KnowledgeDoc } from './types.js';
import { normalizePath } from './taxonomy.js';

/**
 * 自動歸檔：從標題和內文猜出這份知識該放哪個資料夾、帶哪些標籤。
 *
 * 這是 demo 的亮點 —— 使用者上傳一份 PDF，AI 直接說「我把它放進
 * 公司知識／SOP，並標上『報價』『折扣』」，使用者按一下確認就好。
 *
 * 規則引擎是**確定性**的：同一份文件永遠得到同一個結果，不需要網路、
 * 不會產生幻覺，demo 時不會出意外。`suggestWithLlm`（在 qa.ts）可以在
 * 有 Bedrock 時疊上去做語意分類，猜不到就回落到這裡。
 */

export interface Classification {
  path: string;
  tags: string[];
  docType: DocType;
  /** 0–1，規則命中的強度。低於 0.4 時 UI 應該明顯提示「請確認」。 */
  confidence: number;
  /** 命中的理由，直接顯示給使用者看，讓自動歸檔是可解釋的。 */
  reasons: string[];
}

interface Rule {
  docType: DocType;
  path: string;
  /** 命中任一關鍵字就算。 */
  keywords: string[];
  /** 命中時要補的標籤。 */
  tags: string[];
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
  '/待整理',
] as const;

/** 自動歸檔猜不出來時的去處。刻意不丟進根目錄，避免根目錄變垃圾場。 */
export const INBOX = '/待整理';

const RULES: Rule[] = [
  {
    docType: 'sop',
    path: '/公司知識/SOP',
    keywords: [
      'SOP', '標準作業', '流程', '步驟', '作業程序', '規範', '準則',
      '簽核', '授權', '權限', 'workflow',
    ],
    tags: ['SOP'],
  },
  {
    docType: 'faq',
    path: '/公司知識/FAQ',
    keywords: ['FAQ', '常見問題', '問答', 'Q&A', 'Q＆A', '怎麼辦', '如何處理'],
    tags: ['FAQ'],
  },
  {
    docType: 'catalog',
    path: '/公司知識/產品型錄',
    keywords: [
      '型錄', '產品', '方案', '規格', '報價', '價目', '定價', '費率',
      '服務內容', 'pricing', 'catalog',
    ],
    tags: ['產品'],
  },
];

/** 主題標籤：不影響資料夾，只是額外的檢索面向。 */
const TOPIC_TAGS: Array<{ tag: string; keywords: string[] }> = [
  { tag: '報價', keywords: ['報價', '價格', '定價', '費用', '價目'] },
  { tag: '折扣', keywords: ['折扣', '優惠', '議價', '讓價'] },
  { tag: '合約', keywords: ['合約', '契約', '條款', '年約', '續約'] },
  { tag: '退貨', keywords: ['退貨', '退款', '退費', '解約'] },
  { tag: '交付', keywords: ['交付', '交期', '上線', '導入', '交接'] },
  { tag: '售後', keywords: ['售後', '客服', '維運', '保固', '支援'] },
  { tag: '法務', keywords: ['法務', '個資', '合規', '保密', 'NDA'] },
];

function countHits(haystack: string, keywords: string[]): string[] {
  const hits: string[] = [];
  for (const keyword of keywords) {
    if (haystack.includes(keyword.toLowerCase())) hits.push(keyword);
  }
  return hits;
}

/**
 * 對一份「企業自有文件」做自動歸檔。
 * 會議沉澱的客戶知識不走這裡 —— 它的歸檔位置由公司名決定，見 ingest.ts。
 */
export function classifyDocument(
  title: string,
  body: string,
): Classification {
  // 標題的訊號比內文強很多，所以重複三次來加權。
  const haystack = `${title} ${title} ${title} ${body}`.toLowerCase();

  let best: { rule: Rule; hits: string[] } | null = null;
  for (const rule of RULES) {
    const hits = countHits(haystack, rule.keywords);
    if (hits.length === 0) continue;
    if (!best || hits.length > best.hits.length) best = { rule, hits };
  }

  const tags = new Set<string>();
  const reasons: string[] = [];

  for (const topic of TOPIC_TAGS) {
    const hits = countHits(haystack, topic.keywords);
    if (hits.length > 0) {
      tags.add(topic.tag);
      reasons.push(`內文提到「${hits[0]}」→ 標籤 ${topic.tag}`);
    }
  }

  if (!best) {
    return {
      path: INBOX,
      tags: [...tags],
      docType: 'other',
      confidence: 0.2,
      reasons: [
        ...reasons,
        '沒有命中任何分類關鍵字，先放進「待整理」等你確認',
      ],
    };
  }

  for (const tag of best.rule.tags) tags.add(tag);
  reasons.unshift(
    `標題／內文出現「${best.hits.slice(0, 3).join('」「')}」→ 歸到 ${best.rule.path}`,
  );

  // 命中越多關鍵字越有把握，但上限壓在 0.95，永遠保留「可能猜錯」的餘地。
  const confidence = Math.min(0.4 + best.hits.length * 0.15, 0.95);

  return {
    path: normalizePath(best.rule.path),
    tags: [...tags],
    docType: best.rule.docType,
    confidence,
    reasons,
  };
}

/** 把分類結果套用到文件上。 */
export function applyClassification(
  doc: KnowledgeDoc,
  classification: Classification,
): KnowledgeDoc {
  return {
    ...doc,
    path: classification.path,
    tags: [...new Set([...doc.tags, ...classification.tags])],
    docType: classification.docType,
    autoFiled: true,
  };
}
