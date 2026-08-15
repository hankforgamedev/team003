import { applyClassification, classifyDocument, INBOX } from './classify.js';
import { makeId, now } from './id.js';
import { formatBudget, looksLikeMeetingJson, type MeetingJson } from './meeting.js';
import type { KnowledgeStore } from './store.js';
import { normalizePath } from './taxonomy.js';
import type { KnowledgeDoc, KnowledgeDocInput } from './types.js';

/** 匯入的結果，包含 AI 的歸檔理由，UI 直接顯示給使用者確認。 */
export interface IngestResult {
  doc: KnowledgeDoc;
  /** 為什麼放在這個資料夾、為什麼帶這些標籤。 */
  reasons: string[];
  confidence: number;
}

/* ------------------------------------------------------------------ */
/* 企業自有文件：上傳或貼上                                              */
/* ------------------------------------------------------------------ */

export interface IngestTextOptions {
  title?: string;
  /** 指定資料夾就不做自動歸檔。使用者已經知道要放哪就尊重他。 */
  path?: string;
  tags?: string[];
  fileName?: string;
  source?: 'upload' | 'paste';
}

/** 把一段文字收進知識庫，並自動歸檔。 */
export function prepareTextDoc(
  body: string,
  options: IngestTextOptions = {},
): IngestResult {
  const title = (options.title ?? deriveTitle(body)).trim() || '未命名文件';
  const timestamp = now();

  const base: KnowledgeDoc = {
    id: makeId('doc'),
    title,
    body,
    path: INBOX,
    tags: options.tags ?? [],
    docType: 'other',
    source: options.source ?? 'paste',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(options.fileName ? { sourceRef: { fileName: options.fileName } } : {}),
  };

  // 使用者明確指定資料夾 → 直接照做，不覆寫他的判斷。
  if (options.path) {
    return {
      doc: { ...base, path: normalizePath(options.path), autoFiled: false },
      reasons: ['你指定了資料夾，沒有套用自動歸檔'],
      confidence: 1,
    };
  }

  const classification = classifyDocument(title, body);
  return {
    doc: applyClassification(base, classification),
    reasons: classification.reasons,
    confidence: classification.confidence,
  };
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
export function prepareMeetingDoc(meeting: MeetingJson): IngestResult {
  const company = (meeting.company ?? '').trim() || '未知客戶';
  const date = (meeting.meeting_date ?? '').trim();
  const timestamp = now();

  const body = renderMeetingKnowledge(meeting);
  const tags = new Set<string>(['客戶知識']);
  if (meeting.customer_type) tags.add(meeting.customer_type);
  if (meeting.plan) tags.add(meeting.plan);
  if (meeting.objection) tags.add('有異議');
  if (meeting.decision_maker?.attended === false) tags.add('決策者未出席');

  const doc: KnowledgeDoc = {
    id: makeId('doc'),
    title: date ? `${company}｜${date} 會議沉澱` : `${company}｜會議沉澱`,
    body,
    // 每個客戶一個資料夾。公司名就是天然的分類鍵，不需要 AI 猜。
    path: normalizePath(`/客戶知識/${company}`),
    tags: [...tags],
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
    reasons: [`公司名「${company}」→ 歸到 /客戶知識/${company}`],
    confidence: 1,
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
  if (typeof input !== 'string') {
    return prepareMeetingDoc(input);
  }

  const trimmed = input.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const first = items[0];
      if (looksLikeMeetingJson(first)) {
        return prepareMeetingDoc(first);
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
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const meeting of meetings) {
    const result = prepareMeetingDoc(meeting);
    const saved = await store.putDoc(result.doc as KnowledgeDocInput);
    results.push({ ...result, doc: saved });
  }
  return results;
}
