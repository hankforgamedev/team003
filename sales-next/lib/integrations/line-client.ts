import type {
  CustomerType,
  Deal,
  Meeting,
  MeetingExtraction,
  PlanType,
  Stage,
  TranscriptSegment,
} from "@/lib/types";
import type { LineIntegrationRecord } from "@/lib/integrations/line-types";

export function meetingIdForLineRecord(record: LineIntegrationRecord) {
  return `line-${record.id}`;
}

export function dealIdForLineCustomer(record: LineIntegrationRecord) {
  return `line-deal-${record.customerKey}`;
}

export function lineRecordToMeeting(record: LineIntegrationRecord): Meeting {
  const extraction = lineExtraction(record);
  const summary = [
    record.crm.need && `需求：${record.crm.need}`,
    record.crm.nextAction && `下一步：${record.crm.nextAction}`,
    record.crm.timeline && `時程：${record.crm.timeline}`,
  ].filter((value): value is string => Boolean(value));

  return {
    id: meetingIdForLineRecord(record),
    dealId: dealIdForLineCustomer(record),
    title: `${record.company}｜LINE 對話`,
    date: record.receivedAt,
    durationMin: 0,
    attendees: [record.crm.contactName || "LINE 客戶"],
    transcript: transcriptSegments(record.transcript),
    summary: summary.length ? summary : ["LINE 客戶訊息已自動匯入。"],
    extraction,
    source: "line",
    consent: true,
  };
}

export function lineRecordToDeal(record: LineIntegrationRecord, meetingIds: string[]): Deal {
  const stage = normalizeStage(record.crm.stage);
  const createdAt = record.receivedAt;
  return {
    id: dealIdForLineCustomer(record),
    company: record.company,
    contact: record.crm.contactName || "LINE 客戶",
    role: "客戶窗口",
    customerType: normalizeCustomerType(record.crm.customerType),
    plan: normalizePlan(record.crm.plan),
    budget: parseBudget(record.crm.budget),
    need: record.crm.need || "待從後續對話確認需求",
    timeline: record.crm.timeline || "待確認",
    objections: record.crm.objection ? [record.crm.objection] : [],
    decisionMakerMet: Boolean(record.crm.decisionMaker?.includes("已到場")),
    stage,
    stageHistory: [{ stage, date: createdAt }],
    meetingIds,
    owner: "LINE 自動匯入",
    createdAt,
    nextFollowUp: normalizeDate(record.crm.followUpDate) || undefined,
    nextStep: record.crm.nextAction || "確認客戶需求與下一步",
    lastActivityAt: createdAt,
    preferredChannel: "LINE",
    tags: ["LINE", "自動匯入"],
    recordSource: "API",
    meetingSummary: record.crm.need || undefined,
    keyQuotes: record.crm.quotes,
  };
}

function lineExtraction(record: LineIntegrationRecord): MeetingExtraction {
  const stage = normalizeStage(record.crm.stage);
  return {
    company: record.company,
    contact: record.crm.contactName || "LINE 客戶",
    role: "客戶窗口",
    customerType: normalizeCustomerType(record.crm.customerType),
    plan: normalizePlan(record.crm.plan),
    need: record.crm.need || "待確認",
    budget: record.crm.budget || "未提及",
    stage,
    timeline: record.crm.timeline || "待確認",
    objections: record.crm.objection ? [record.crm.objection] : [],
    decisionMaker: record.crm.decisionMaker || "未確認",
    nextActions: record.crm.nextAction ? [record.crm.nextAction] : [],
    followUpDate: record.crm.followUpDate || "",
    leadSource: "LINE 官方帳號",
    preferredChannel: "LINE",
    keyQuotes: record.crm.quotes,
    meetingSummary: record.crm.need || undefined,
  };
}

function transcriptSegments(transcript: string): TranscriptSegment[] {
  const lines = transcript.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [{ t: 0, speaker: "LINE 客戶", text: "訊息內容待同步" }];
  return lines.slice(0, 200).map((line, index) => {
    const match = line.match(/^([^：:]{1,30})[：:]\s*(.+)$/);
    return {
      t: index,
      speaker: match?.[1]?.trim() || "LINE 客戶",
      text: match?.[2]?.trim() || line,
    };
  });
}

function normalizeCustomerType(value: string | null): CustomerType {
  if (value?.includes("品牌")) return "品牌方";
  if (value?.includes("行銷")) return "行銷公司";
  return "企業客戶";
}

function normalizePlan(value: string | null): PlanType {
  if (value?.includes("年")) return "年約方案";
  if (value?.toLowerCase().includes("pilot") || value?.includes("試")) return "Pilot 試行";
  if (value?.includes("企業")) return "企業方案";
  if (value?.includes("單次") || value?.includes("專案")) return "單次專案";
  return "標準方案";
}

function normalizeStage(value: string | null): Stage {
  const normalized = value?.toLowerCase() || "";
  if (/won|成交|簽約/.test(normalized)) return "won";
  if (/lost|流失|拒絕/.test(normalized)) return "lost";
  if (/negotiation|談判|議價/.test(normalized)) return "negotiation";
  if (/proposal|提案|報價/.test(normalized)) return "proposal";
  if (/meeting|會議|約訪/.test(normalized)) return "meeting";
  return "lead";
}

function parseBudget(value: string | null): number {
  if (!value) return 0;
  const match = value.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  return /萬/.test(value) ? amount * 10_000 : amount;
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
