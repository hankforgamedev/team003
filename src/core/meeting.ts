/**
 * 會議 JSON 的型別契約。
 *
 * 這份型別直接對應 pipeline（語音 → 逐字稿 → 抽取）輸出的格式。
 * 所有欄位都當成**可能缺漏**來處理：AI 抽取本來就會有抽不到的欄位，
 * 而且 schema 之後很可能再長欄位，寬鬆解析比嚴格驗證更耐用。
 */

export interface DecisionMaker {
  name?: string | null;
  role?: string | null;
  attended?: boolean | null;
}

/** 原話引用。這是知識庫做「附出處」時最有價值的欄位。 */
export interface MeetingQuotes {
  budget?: string | null;
  objection?: string | null;
  plan?: string | null;
  decision_maker?: string | null;
  [key: string]: string | null | undefined;
}

export interface MeetingJson {
  // 信封
  meeting_id?: string | null;
  meeting_date?: string | null;
  company?: string | null;
  contact_name?: string | null;

  // 抽取欄位
  contact_role?: string | null;
  customer_type?: string | null;
  stage?: string | null;
  plan?: string | null;
  need?: string | null;
  budget?: number | string | null;
  budget_confidence?: string | null;
  timeline?: string | null;
  objection?: string | null;
  decision_maker?: DecisionMaker | null;
  next_action?: string | null;
  follow_up_raw?: string | null;
  follow_up_date?: string | null;
  quotes?: MeetingQuotes | null;
}

/** 判斷一個未知物件像不像會議 JSON，用在貼上／上傳時的自動辨識。 */
export function looksLikeMeetingJson(value: unknown): value is MeetingJson {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  const markers = [
    'meeting_id',
    'company',
    'customer_type',
    'next_action',
    'decision_maker',
  ];
  return markers.some((key) => key in obj);
}

/** 把預算格式化成好讀的字串。 */
export function formatBudget(
  budget: MeetingJson['budget'],
  confidence?: string | null,
): string | null {
  if (budget === null || budget === undefined || budget === '') return null;
  const amount =
    typeof budget === 'number'
      ? `${budget.toLocaleString('zh-TW')} 元`
      : String(budget);
  return confidence ? `${amount}（${confidence}）` : amount;
}
