// Sales Next 核心資料模型
// B 組交付的 Data Schema：Transcript → Structured CRM 的欄位定義即 MeetingExtraction

export type CustomerType = "品牌方" | "行銷公司" | "企業客戶";
export type PlanType = "年約方案" | "單次專案" | "Pilot 試行" | "企業方案" | "標準方案";
export type ForecastCategory = "pipeline" | "best_case" | "commit" | "closed" | "omitted";
export type DealPriority = "high" | "medium" | "low";
export type DealHealth = "healthy" | "attention" | "risk";

// ===== CRM 欄位擴充（見 crm-schema.md）：公司／窗口／商機／AI 洞察四大群組 =====
export type CompanySizeRange = "1-10" | "11-50" | "51-200" | "201-500" | "500以上";
export type AnnualRevenueRange = "1000萬以下" | "1000萬-1億" | "1億-5億" | "5億以上" | "未知";
export type ContactDepartment = "業務銷售" | "行銷" | "IT資訊" | "財務" | "人資" | "營運" | "經營層" | "其他";
export type ContactRole = "經濟買家" | "決策者" | "使用者" | "技術把關者" | "內部推薦人（Champion）" | "影響者";
export type BudgetConfirmed = "已確認" | "估算中" | "未提及";
export type UrgencyLevel = "高" | "中" | "低" | "未知";
export type SentimentTone = "積極正向" | "中性觀望" | "保留疑慮" | "消極抗拒";
export type AiProvider = "bedrock" | "openai";

export type Stage = "lead" | "meeting" | "proposal" | "negotiation" | "won" | "lost";

export const STAGE_ORDER: Stage[] = ["lead", "meeting", "proposal", "negotiation", "won"];

export const STAGE_LABEL: Record<Stage, string> = {
  lead: "接觸",
  meeting: "已約會議",
  proposal: "提案中",
  negotiation: "談判中",
  won: "成交",
  lost: "流失",
};

export interface StageEvent {
  stage: Stage;
  date: string; // ISO
}

export interface Deal {
  id: string;
  company: string;
  contact: string;
  role: string;
  customerType: CustomerType;
  plan: PlanType;
  budget: number; // NT$
  need: string;
  timeline: string;
  objections: string[];
  decisionMakerMet: boolean;
  stage: Stage;
  stageHistory: StageEvent[];
  meetingIds: string[];
  owner: string;
  createdAt: string;
  closedAt?: string;
  nextFollowUp?: string;
  showcase?: boolean; // 手工撰寫的重點案件（有完整會議紀錄）

  // CRM 進階欄位：參考成熟 CRM 的 Company / Contact / Deal / Activity 分層，
  // 以 optional 保持既有本地資料相容；沒有值時由 UI 依案件資料推導。
  dealName?: string;
  dealType?: "新客開發" | "既有客戶增購";
  leadSource?: "主動開發" | "客戶轉介" | "官網詢問" | "活動名單" | "合作夥伴";
  probability?: number; // 0–100
  forecastCategory?: ForecastCategory;
  expectedCloseDate?: string;
  nextStep?: string;
  lastActivityAt?: string;
  nextActivity?: string;
  priority?: DealPriority;
  health?: DealHealth;
  industry?: string;
  employeeRange?: string;
  annualRevenue?: number;
  website?: string;
  location?: string;
  icpTier?: "Tier 1" | "Tier 2" | "Tier 3";
  contactEmail?: string;
  contactPhone?: string;
  preferredChannel?: "Email" | "LINE" | "電話" | "會議";
  products?: string[];
  painPoints?: string[];
  successMetrics?: string[];
  decisionCriteria?: string[];
  competitors?: string[];
  procurementProcess?: string;
  tags?: string[];
  recordSource?: "AI 會議抽取" | "手動建立" | "匯入" | "API";

  // 公司資訊（Company）：對應 Salesforce Account / HubSpot Company
  companySize?: CompanySizeRange; // 公司規模（人數區間），細於 employeeRange 的粗分類
  currentToolsInUse?: string[]; // 現有使用工具／系統
  annualRevenueRange?: AnnualRevenueRange; // 年營收區間

  // 窗口資訊（Contact）：對應 Salesforce Contact / HubSpot Contact
  contactDepartment?: ContactDepartment; // 所屬部門
  contactRole?: ContactRole; // 窗口角色（對應 MEDDIC Economic Buyer / Champion）
  additionalStakeholders?: string[]; // 其他關係人（姓名與角色）

  // 商機資訊（Opportunity）：融入 BANT／MEDDIC 資格要素
  proposedSolution?: string; // 提案方案（解法或產品組合的描述）
  budgetConfirmed?: BudgetConfirmed; // 預算是否已確認（對應 BANT Budget）
  decisionMakerName?: string; // 決策者描述文字，例：「已到場（李淑芬 創辦人）」
  competitorMentioned?: string[]; // 提及競爭對手（對應 MEDDPICC Competition）

  // AI 洞察（AI-derived Insights）：逐字稿分析衍生，非傳統 CRM 標準欄位
  urgencyLevel?: UrgencyLevel; // 急迫程度
  sentimentTone?: SentimentTone; // 會議氛圍／客戶態度
  riskFlags?: string[]; // 風險警示，如「無決策者出席」「預算未確認」
  keyQuotes?: string[]; // 關鍵語句摘錄
  meetingSummary?: string; // AI 生成的會議濃縮摘要
}

export interface TranscriptSegment {
  t: number; // 秒
  speaker: string;
  text: string;
}

export interface MeetingExtraction {
  company: string;
  contact: string;
  role: string;
  customerType: CustomerType | "";
  plan: PlanType | "";
  need: string;
  budget: string;
  stage: Stage;
  timeline: string;
  objections: string[];
  decisionMaker: string; // 例：「未到場（總經理）」
  nextActions: string[];
  followUpDate: string;
  contactEmail?: string;
  contactPhone?: string;
  industry?: string;
  employeeRange?: string;
  leadSource?: string;
  dealType?: string;
  probability?: number;
  forecastCategory?: ForecastCategory;
  expectedCloseDate?: string;
  priority?: DealPriority;
  painPoints?: string[];
  successMetrics?: string[];
  decisionCriteria?: string[];
  competitors?: string[];
  procurementProcess?: string;
  preferredChannel?: string;

  // CRM 欄位擴充：公司／窗口／商機／AI 洞察（見 crm-schema.md），全部 AI 可選抽取
  companySize?: CompanySizeRange;
  currentToolsInUse?: string[];
  annualRevenueRange?: AnnualRevenueRange;
  contactDepartment?: ContactDepartment;
  contactRole?: ContactRole;
  additionalStakeholders?: string[];
  proposedSolution?: string;
  budgetConfirmed?: BudgetConfirmed;
  competitorMentioned?: string[];
  urgencyLevel?: UrgencyLevel;
  sentimentTone?: SentimentTone;
  riskFlags?: string[];
  keyQuotes?: string[];
  meetingSummary?: string;
}

export interface NBAAction {
  title: string;
  detail: string;
  why: string; // 資料依據，可解釋性
  dueInDays: number;
}

export interface NBAResult {
  actions: NBAAction[];
  reasoning: string[];
  aiMode: "rules" | "rules+llm";
}

export interface Meeting {
  id: string;
  dealId?: string;
  title: string;
  date: string;
  durationMin: number;
  attendees: string[];
  transcript: TranscriptSegment[];
  summary: string[];
  extraction?: MeetingExtraction;
  nba?: NBAResult;
  source: "demo" | "recorded" | "uploaded" | "pasted";
  consent?: boolean; // 錄音同意（C 組：產品內建同意機制)
  pipeline?: PipelineStepSnapshot[];
}

export interface PipelineStepSnapshot {
  key: string;
  label: string;
  detail: string;
  status: "done" | "current" | "pending";
}

// 知識庫改用 @sales-next/knowledge-base 模組（資料夾＋標籤雙獨立分類），
// 舊的 KnowledgeCard 型別已移除。KB 型別請直接從該模組 import。

export type ViewRole = "rep" | "manager";
