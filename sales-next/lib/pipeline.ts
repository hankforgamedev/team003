import {
  CustomerType,
  MeetingExtraction,
  PipelineStepSnapshot,
  PlanType,
  Stage,
  TranscriptSegment,
} from "@/lib/types";

export type PipelinePhase =
  | "input"
  | "transcribing"
  | "diarization"
  | "extracting"
  | "validating"
  | "crm"
  | "analysis"
  | "knowledge"
  | "done";

export const PIPELINE_STEPS = [
  {
    key: "input",
    label: "接收輸入",
    detail: "錄音、音檔、JSON 或逐字稿進入 Input Adapter",
  },
  {
    key: "transcribing",
    label: "建立逐字稿",
    detail: "音訊轉文字；貼上逐字稿則直接進入標準化",
  },
  {
    key: "diarization",
    label: "說話者整理",
    detail: "保留業務、客戶與決策者的對話脈絡",
  },
  {
    key: "extracting",
    label: "抽取 CRM JSON",
    detail: "需求、預算、異議、決策者、下一步轉成 strict JSON",
  },
  {
    key: "validating",
    label: "驗證與正規化",
    detail: "把桃園新竹格式轉成 Sales Next 可用欄位",
  },
  {
    key: "crm",
    label: "建立案件頁",
    detail: "自動建立 Deal、Meeting 與活動時間軸",
  },
  {
    key: "analysis",
    label: "產生分析",
    detail: "更新漏斗、案件健康度與 Next Best Action",
  },
  {
    key: "knowledge",
    label: "同步知識庫",
    detail: "把摘要、逐字稿與客戶原話放進可問答的記憶庫",
  },
] as const;

const PHASE_ORDER: PipelinePhase[] = [
  "input",
  "transcribing",
  "diarization",
  "extracting",
  "validating",
  "crm",
  "analysis",
  "knowledge",
  "done",
];

export function pipelineSnapshots(phase: PipelinePhase): PipelineStepSnapshot[] {
  const active = phase === "done" ? PIPELINE_STEPS.length : PHASE_ORDER.indexOf(phase);
  return PIPELINE_STEPS.map((step, index) => ({
    ...step,
    status: phase === "done" || index < active ? "done" : index === active ? "current" : "pending",
  }));
}

export function parseTranscriptSegments(raw: string): TranscriptSegment[] {
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const cleaned = line.replace(/^[-*]\s*/, "");
      const match =
        cleaned.match(/^(Speaker\s*[A-Z]|[A-Z]|業務|客戶|AI Sales Assistant|[^：:]{1,12})[：:]\s*(.+)$/i);
      if (match) {
        return {
          t: index * 15,
          speaker: match[1].trim(),
          text: match[2].trim(),
        };
      }
      return { t: index * 15, speaker: "對話", text: cleaned };
    });
}

export function normalizeStage(raw?: string | null): Stage {
  const text = (raw ?? "").toLowerCase();
  if (/流失|lost|未成交|不採購/.test(text)) return "lost";
  if (/成交|won|已簽|簽約|結案|啟動/.test(text)) return "won";
  if (/談判|negotiation|議價|合約|採購流程|拍板/.test(text)) return "negotiation";
  if (/提案|proposal|報價|pilot|樣品|nda|avl|po[ c]?c/.test(text)) return "proposal";
  if (/接觸|lead|cold|初次|陌生/.test(text)) return "lead";
  return "meeting";
}

export function normalizeCustomerType(raw?: string | null, context = ""): CustomerType | "" {
  const text = `${raw ?? ""} ${context}`.toLowerCase();
  if (/行銷公司|代理商|廣告|公關|agency|白牌/.test(text)) return "行銷公司";
  if (/品牌|電商|食品|家居|保養|文創|消費/.test(text)) return "品牌方";
  if (/企業|資訊|it|採購|製造|erp|data|gcp|aws|hubspot|salesforce|供應商|客戶/.test(text)) {
    return "企業客戶";
  }
  return "";
}

export function normalizePlan(raw?: string | null, context = ""): PlanType | "" {
  const text = `${raw ?? ""} ${context}`.toLowerCase();
  if (/pilot|試行|試用|poc|po c|樣品|小批量|nda|demo/.test(text)) return "Pilot 試行";
  if (/年約|年度|全年|長期|半年|blanket|team plan|月費|訂閱/.test(text)) return "年約方案";
  if (/標準|standard/.test(text)) return "標準方案";
  if (/tier|managed|erp|進銷存|sla|enterprise|api|adapter|crm/.test(text)) return "企業方案";
  if (/專案|單次|檔期|報價|方案/.test(text)) return "單次專案";
  return "";
}

export function normalizeBudgetText(value: unknown, confidence?: string | null): string {
  if (value === null || value === undefined || value === "") return "未提及";
  if (typeof value === "number") {
    return `NT$${value.toLocaleString("zh-TW")}${confidence ? `（${confidence}）` : ""}`;
  }
  if (typeof value === "object") {
    const obj = value as { raw_text?: string | null; amount?: number | null; period?: string | null };
    if (obj.raw_text) return obj.raw_text;
    if (typeof obj.amount === "number") {
      const period = obj.period === "monthly" ? "／月" : obj.period === "yearly" ? "／年" : "";
      return `NT$${obj.amount.toLocaleString("zh-TW")}${period}`;
    }
  }
  return String(value);
}

export function parseBudgetAmount(text: string): number {
  const normalized = text.replace(/,/g, "");
  const range = normalized.match(/(\d+(?:\.\d+)?)\s*(?:到|-|–|~)\s*(\d+(?:\.\d+)?)\s*萬/);
  if (range) return Math.round(((Number(range[1]) + Number(range[2])) / 2) * 10_000);
  const wan = normalized.match(/(\d+(?:\.\d+)?)\s*萬/);
  if (wan) return Math.round(Number(wan[1]) * 10_000);
  const ntd = normalized.match(/(?:nt\$|ntd|台幣|新台幣)?\s*(\d{5,})/i);
  if (ntd) return Math.round(Number(ntd[1]));
  return 500_000;
}

export function resolveFollowUpIso(raw?: string | null, base = new Date()): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const iso = trimmed.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return new Date(`${iso}T12:00:00`).toISOString();

  const addDays = (days: number) => new Date(base.getTime() + days * 86400000).toISOString();
  if (/明天/.test(trimmed)) return addDays(1);
  if (/三天|3\s*天/.test(trimmed)) return addDays(3);
  if (/一週|一周|7\s*天/.test(trimmed)) return addDays(7);
  if (/兩週|二週|14\s*天/.test(trimmed)) return addDays(14);

  const weekday = trimmed.match(/下週([一二三四五六日天])/);
  if (weekday) {
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    const target = map[weekday[1]];
    const current = base.getDay();
    const days = ((target - current + 7) % 7) + 7;
    return addDays(days);
  }
  return undefined;
}

function decisionMakerText(value: unknown): string {
  if (!value) return "未提及";
  if (typeof value === "string") return value;
  const dm = value as { name?: string | null; role?: string | null; attended?: boolean | null; evidence?: string | null };
  const who = [dm.name, dm.role].filter(Boolean).join(" ");
  if (dm.attended === true) return `已到場（${who || "決策者"}）`;
  if (dm.attended === false) return `未到場（${who || "決策者"}）`;
  return who || dm.evidence || "未提及";
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function quoteValues(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>)
    .filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
    .slice(0, 4);
}

export function normalizeExtraction(input: Partial<MeetingExtraction>, transcript = ""): MeetingExtraction {
  const context = [
    transcript,
    input.company,
    input.customerType,
    input.plan,
    input.need,
    input.proposedSolution,
    input.industry,
  ]
    .filter(Boolean)
    .join(" ");

  const stage = normalizeStage(input.stage);
  const customerType = normalizeCustomerType(input.customerType, context);
  const plan = normalizePlan(input.plan, context);

  return {
    company: input.company?.trim() || "（待補公司）",
    contact: input.contact?.trim() || "（待補窗口）",
    role: input.role?.trim() || "",
    customerType,
    plan,
    need: input.need?.trim() || "（待補需求）",
    budget: input.budget?.trim() || "未提及",
    stage,
    timeline: input.timeline?.trim() || "未定",
    objections: input.objections ?? [],
    decisionMaker: input.decisionMaker?.trim() || "未提及",
    nextActions: input.nextActions?.length ? input.nextActions : ["整理會議摘要並安排下一步"],
    followUpDate: input.followUpDate?.trim() || "一週內",
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    industry: input.industry,
    employeeRange: input.employeeRange,
    leadSource: input.leadSource,
    dealType: input.dealType,
    probability: input.probability,
    forecastCategory: input.forecastCategory,
    expectedCloseDate: input.expectedCloseDate,
    priority: input.priority,
    painPoints: input.painPoints ?? [],
    successMetrics: input.successMetrics ?? [],
    decisionCriteria: input.decisionCriteria ?? [],
    competitors: input.competitors ?? [],
    procurementProcess: input.procurementProcess,
    preferredChannel: input.preferredChannel,
    companySize: input.companySize,
    currentToolsInUse: input.currentToolsInUse,
    annualRevenueRange: input.annualRevenueRange,
    contactDepartment: input.contactDepartment,
    contactRole: input.contactRole,
    additionalStakeholders: input.additionalStakeholders,
    proposedSolution: input.proposedSolution,
    budgetConfirmed: input.budgetConfirmed,
    competitorMentioned: input.competitorMentioned ?? [],
    urgencyLevel: input.urgencyLevel,
    sentimentTone: input.sentimentTone,
    riskFlags: input.riskFlags ?? [],
    keyQuotes: input.keyQuotes ?? [],
    meetingSummary: input.meetingSummary,
  };
}

export function extractionSummary(extraction: MeetingExtraction): string[] {
  return [
    `需求：${extraction.need}`,
    `預算：${extraction.budget}`,
    `下一步：${extraction.nextActions.join("；")}`,
  ];
}

type TaoyuanHsinchuInput = Record<string, unknown>;

export function taoyuanHsinchuToExtraction(input: TaoyuanHsinchuInput): MeetingExtraction {
  const sales = (input.sales_intelligence ?? null) as TaoyuanHsinchuInput | null;
  const meetingInfo = (input.meeting_info ?? null) as TaoyuanHsinchuInput | null;
  const budget = sales?.budget ?? input.budget;
  const decisionMaker = sales?.decision_maker ?? input.decision_maker;
  const followUp = (sales?.follow_up ?? null) as TaoyuanHsinchuInput | null;

  const base: Partial<MeetingExtraction> = {
    company: String(input.company ?? meetingInfo?.company ?? "").trim(),
    contact: String(input.contact_name ?? meetingInfo?.customer_name ?? "").trim(),
    role: String(input.contact_role ?? "").trim(),
    customerType: String(input.customer_type ?? "").trim() as MeetingExtraction["customerType"],
    plan: String(input.plan ?? "").trim() as MeetingExtraction["plan"],
    need: sales
      ? normalizeStringArray(sales.customer_needs).join("；")
      : String(input.need ?? "").trim(),
    budget: normalizeBudgetText(budget, typeof input.budget_confidence === "string" ? input.budget_confidence : null),
    stage: normalizeStage(String(input.stage ?? sales?.opportunity_score ?? "")),
    timeline: String(input.timeline ?? "").trim(),
    objections: sales ? normalizeStringArray(sales.objections) : normalizeStringArray(input.objection),
    decisionMaker: decisionMakerText(decisionMaker),
    nextActions: sales ? normalizeStringArray(sales.next_actions) : normalizeStringArray(input.next_action),
    followUpDate: String(input.follow_up_date ?? followUp?.normalized_date ?? input.follow_up_raw ?? "").trim(),
    painPoints: normalizeStringArray(sales?.pain_points),
    successMetrics: normalizeStringArray(sales?.pilot_metrics),
    decisionCriteria: normalizeStringArray(sales?.decision_criteria),
    competitorMentioned: normalizeStringArray(sales?.competitors),
    proposedSolution: sales ? normalizeStringArray(sales.sales_recommendations).slice(0, 2).join("；") : String(input.plan ?? ""),
    budgetConfirmed:
      input.budget_confidence === "明確" || input.budget_confidence === "客戶自述"
        ? "已確認"
        : input.budget_confidence === "推估"
          ? "估算中"
          : input.budget_confidence === "未提及"
            ? "未提及"
            : undefined,
    urgencyLevel: sales?.opportunity_score === "HIGH" ? "高" : sales?.opportunity_score === "LOW" ? "低" : undefined,
    sentimentTone: sales?.opportunity_score === "HIGH" ? "積極正向" : undefined,
    riskFlags: [
      ...normalizeStringArray(input.objection),
      ...(decisionMakerText(decisionMaker).includes("未到場") ? ["決策者尚未參與"] : []),
    ],
    keyQuotes: quoteValues(input.quotes),
    meetingSummary: typeof sales?.summary === "string" ? sales.summary : undefined,
  };

  return normalizeExtraction(base);
}

export function tryParsePipelineInput(raw: string):
  | {
      extraction: MeetingExtraction;
      segments: TranscriptSegment[];
      title: string;
    }
  | null {
  try {
    const parsed = JSON.parse(raw) as TaoyuanHsinchuInput;
    if (!parsed || typeof parsed !== "object") return null;
    const hasPipelineShape =
      "sales_intelligence" in parsed ||
      "transcription" in parsed ||
      "company" in parsed ||
      "meeting_id" in parsed ||
      "next_action" in parsed;
    if (!hasPipelineShape) return null;

    const transcription = (parsed.transcription ?? null) as TaoyuanHsinchuInput | null;
    const segmentsRaw = Array.isArray(transcription?.segments) ? transcription.segments : [];
    const segments = segmentsRaw.length
      ? segmentsRaw.map((segment, index) => {
          const s = segment as { start?: number; speaker?: string; text?: string };
          return {
            t: Math.round(s.start ?? index * 15),
            speaker: s.speaker ?? "對話",
            text: s.text ?? "",
          };
        })
      : transcription?.full_text
        ? parseTranscriptSegments(String(transcription.full_text))
        : parseTranscriptSegments(raw);

    const extraction = taoyuanHsinchuToExtraction(parsed);
    return {
      extraction,
      segments,
      title: `${extraction.company || "桃園新竹"}｜Pipeline 匯入`,
    };
  } catch {
    return null;
  }
}
