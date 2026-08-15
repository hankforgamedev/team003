import { applyClassification, classifyDocument } from './classify.js';
import type { Classification } from './classify.js';
import { makeId, now } from './id.js';
import { formatBudget, looksLikeMeetingJson, type MeetingJson } from './meeting.js';
import type { KnowledgeStore } from './store.js';
import { activeKinds, normalizePath } from './taxonomy.js';
import type { KnowledgeDoc, KnowledgeDocInput, TaxonomyMode } from './types.js';

/**
 * 匯入的結果。
 *
 * 兩套分類系統各自回報自己的把握度和理由 —— UI 要能分開顯示
 * 「歸檔：很有把握」和「標籤：猜不出來」，因為使用者要分開確認。
 */
export interface IngestResult {
  doc: KnowledgeDoc;
  classification: Classification;
}

/* ------------------------------------------------------------------ */
/* 企業自有文件：上傳或貼上                                              */
/* ------------------------------------------------------------------ */

export interface IngestTextOptions {
  title?: string;
  /**
   * 指定資料夾就跳過自動歸檔。使用者已經知道要放哪就尊重他。
   * 明確傳 `null` 代表「這份知識不要進資料夾系統」，跟不傳是不同的意思。
   */
  path?: string | null;
  /** 指定標籤就跳過自動標籤。 */
  tags?: string[];
  fileName?: string;
  source?: 'upload' | 'paste';
  /** 只跑啟用中的分類系統。 */
  mode?: TaxonomyMode;
}

/**
 * 把一段文字收進知識庫，兩套分類系統各跑各的。
 *
 * 使用者可以只指定其中一套（例如「我知道要放哪個資料夾，但標籤讓 AI 猜」），
 * 這時只有沒指定的那套會跑自動分類。
 */
export function prepareTextDoc(
  body: string,
  options: IngestTextOptions = {},
): IngestResult {
  const title = (options.title ?? deriveTitle(body)).trim() || '未命名文件';
  const timestamp = now();
  const mode = options.mode ?? 'both';

  const base: KnowledgeDoc = {
    id: makeId('doc'),
    title,
    body,
    path: null,
    tags: [],
    docType: 'other',
    source: options.source ?? 'paste',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(options.fileName ? { sourceRef: { fileName: options.fileName } } : {}),
  };

  const classification = classifyDocument(title, body, mode);
  let doc = applyClassification(base, classification);

  // 使用者的明確指定永遠覆蓋 AI 的猜測，而且是逐系統覆蓋 ——
  // 指定資料夾不該把 AI 猜的標籤也一起清掉。
  if (options.path !== undefined) {
    doc = { ...doc, path: normalizePath(options.path), autoFiled: false };
    classification.folder = {
      path: doc.path,
      docType: doc.docType,
      confidence: 1,
      reasons: ['你指定了資料夾，沒有套用自動歸檔'],
    };
  }

  if (options.tags !== undefined) {
    doc = { ...doc, tags: options.tags, autoTagged: false };
    classification.tag = {
      tags: options.tags,
      confidence: 1,
      reasons: ['你指定了標籤，沒有套用自動標籤'],
    };
  }

  return { doc, classification };
}

/** 從內文推一個標題出來：第一個 Markdown 標題，或第一行。 */
function deriveTitle(body: string): string {
  const heading = body.match(/^#{1,6}\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim();
  const firstLine = body.split('\n').find((line) => line.trim().length > 0);
  return (firstLine ?? '').trim().slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* 會議沉澱：從 JSON 產生客戶知識                                        */
/* ------------------------------------------------------------------ */

/**
 * 把一場會議的抽取結果轉成一篇「客戶知識」。
 *
 * 注意這裡**不是**在做 CRM 的事：CRM 存的是案件狀態（階段、金額、下一步），
 * 知識庫存的是「關於這個客戶，我們知道什麼」——需求、在意什麼、誰做決定。
 * 兩者刻意分開，因為案件會結案，但客戶知識會一直累積。
 */
export function prepareMeetingDoc(
  meeting: MeetingJson,
  mode: TaxonomyMode = 'both',
): IngestResult {
  const company = (meeting.company ?? '').trim() || '未知客戶';
  const date = (meeting.meeting_date ?? '').trim();
  const timestamp = now();
  const kinds = activeKinds(mode);

  // 【資料夾系統】公司名就是天然的分類鍵，不需要 AI 猜。
  const folderPath = kinds.includes('folder')
    ? normalizePath(`/客戶知識/${company}`)
    : null;

  // 【標籤系統】獨立於資料夾算出來 —— 標的是這場會議的特徵，
  // 不是「它放在哪個資料夾」。
  const tags: string[] = [];
  const tagReasons: string[] = [];
  if (kinds.includes('tag')) {
    const add = (tag: string, reason: string) => {
      tags.push(tag);
      tagReasons.push(reason);
    };
    if (meeting.customer_type) {
      add(meeting.customer_type, `客戶類型是「${meeting.customer_type}」`);
    }
    if (meeting.plan) add(meeting.plan, `銷售方案是「${meeting.plan}」`);
    if (meeting.objection) add('有異議', '這場會議客戶提出了異議');
    if (meeting.decision_maker?.attended === false) {
      add('決策者未出席', '決策者本次未出席');
    }
  }

  const doc: KnowledgeDoc = {
    id: makeId('doc'),
    title: date ? `${company}｜${date} 會議沉澱` : `${company}｜會議沉澱`,
    body: renderMeetingKnowledge(meeting),
    path: folderPath,
    tags,
    docType: 'customer',
    source: 'meeting',
    customer: company,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(meeting.meeting_id
      ? { sourceRef: { meetingId: meeting.meeting_id } }
      : {}),
  };

  return {
    doc,
    classification: {
      folder: {
        path: folderPath,
        docType: 'customer',
        confidence: folderPath ? 1 : 0,
        reasons: folderPath
          ? [`公司名「${company}」→ 歸到 /客戶知識/${company}`]
          : [],
      },
      tag: {
        tags,
        confidence: tags.length > 0 ? 1 : 0,
        reasons: tagReasons,
      },
    },
  };
}

/**
 * 把會議 JSON 排版成人看得懂的 Markdown。
 *
 * 排版本身就是檢索品質的一部分：每個主題自成一段，切片時才會被切成
 * 獨立的引文，問「預算多少」時回的就是預算那一段，而不是整篇。
 */
function renderMeetingKnowledge(meeting: MeetingJson): string {
  const sections: string[] = [];
  const quotes = meeting.quotes ?? {};

  const push = (heading: string, lines: Array<string | null | undefined>) => {
    const content = lines.filter((l): l is string => Boolean(l && l.trim()));
    if (content.length === 0) return;
    sections.push(`## ${heading}\n${content.join('\n')}`);
  };

  const quoteLine = (text?: string | null) =>
    text ? `> 客戶原話：「${text}」` : null;

  push('基本資料', [
    meeting.company ? `- 公司：${meeting.company}` : null,
    meeting.contact_name
      ? `- 窗口：${meeting.contact_name}${meeting.contact_role ? `（${meeting.contact_role}）` : ''}`
      : null,
    meeting.customer_type ? `- 客戶類型：${meeting.customer_type}` : null,
    meeting.meeting_date ? `- 會議日期：${meeting.meeting_date}` : null,
  ]);

  push('需求', [meeting.need ? `- ${meeting.need}` : null]);

  push('方案與預算', [
    meeting.plan ? `- 銷售方案：${meeting.plan}` : null,
    (() => {
      const budget = formatBudget(meeting.budget, meeting.budget_confidence);
      return budget ? `- 預算：${budget}` : null;
    })(),
    quoteLine(quotes.plan),
    quoteLine(quotes.budget),
  ]);

  push('異議與顧慮', [
    meeting.objection ? `- ${meeting.objection}` : null,
    quoteLine(quotes.objection),
  ]);

  push('決策鏈', [
    (() => {
      const dm = meeting.decision_maker;
      if (!dm) return null;
      const who = [dm.name, dm.role].filter(Boolean).join('／');
      if (!who) return null;
      const attended =
        dm.attended === true
          ? '（本次有出席）'
          : dm.attended === false
            ? '（本次未出席）'
            : '';
      return `- 決策者：${who}${attended}`;
    })(),
    quoteLine(quotes.decision_maker),
  ]);

  push('時程與下一步', [
    meeting.timeline ? `- 客戶時程：${meeting.timeline}` : null,
    meeting.next_action ? `- 下一步：${meeting.next_action}` : null,
    meeting.follow_up_date
      ? `- Follow-up：${meeting.follow_up_date}${meeting.follow_up_raw ? `（客戶說「${meeting.follow_up_raw}」）` : ''}`
      : null,
  ]);

  return sections.join('\n\n');
}

/* ------------------------------------------------------------------ */
/* 統一入口                                                             */
/* ------------------------------------------------------------------ */

/**
 * 收任何東西進知識庫，自動判斷是會議 JSON 還是一般文件。
 *
 * 使用者把 pipeline 吐出來的 JSON 直接貼進來就會被認出來，
 * 不用先選「我要匯入哪一種」。
 */
export function prepare(
  input: string | MeetingJson,
  options: IngestTextOptions = {},
): IngestResult {
  const mode = options.mode ?? 'both';

  if (typeof input !== 'string') {
    return prepareMeetingDoc(input, mode);
  }

  const trimmed = input.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const first = items[0];
      if (looksLikeMeetingJson(first)) {
        return prepareMeetingDoc(first, mode);
      }
    } catch {
      // 不是合法 JSON 就當一般文字處理，不要報錯打斷使用者。
    }
  }

  return prepareTextDoc(input, options);
}

/** 準備好之後寫進 store。 */
export async function ingest(
  store: KnowledgeStore,
  input: string | MeetingJson,
  options: IngestTextOptions = {},
): Promise<IngestResult> {
  const result = prepare(input, options);
  const saved = await store.putDoc(result.doc as KnowledgeDocInput);
  return { ...result, doc: saved };
}

/** 批次匯入多場會議。給「把歷史會議一次倒進來」用。 */
export async function ingestMeetings(
  store: KnowledgeStore,
  meetings: MeetingJson[],
  mode: TaxonomyMode = 'both',
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const meeting of meetings) {
    const result = prepareMeetingDoc(meeting, mode);
    const saved = await store.putDoc(result.doc as KnowledgeDocInput);
    results.push({ ...result, doc: saved });
  }
  return results;
}
