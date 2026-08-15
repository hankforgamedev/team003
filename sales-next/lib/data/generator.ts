// 背景母體資料產生器：用固定 seed 的偽隨機數，確定性地生成 ~520 筆案件，
// 分佈調校成與 pitch 敘事一致（品牌方＋年約 ~21 天 / ~28%；行銷公司＋單次專案 ~92 天 / ~10%）。
// 所有儀表板數字都從這批案件「推導」出來，因此 funnel、轉換率、成交週期天生自洽。

import {
  AnnualRevenueRange,
  BudgetConfirmed,
  CompanySizeRange,
  ContactDepartment,
  ContactRole,
  CustomerType,
  Deal,
  PlanType,
  SentimentTone,
  Stage,
  StageEvent,
  UrgencyLevel,
} from "@/lib/types";

// mulberry32：小而穩定的 seeded PRNG
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SegmentProfile {
  customerType: CustomerType;
  plan: PlanType;
  weight: number; // 出現比例
  winRate: number; // lead → won
  cycleDays: number; // 成交案件的平均週期
  cycleJitter: number;
  budgetMin: number;
  budgetMax: number;
}

// 四個客群 × 方案組合的「真實」參數（黃金客群：品牌方＋年約）
const SEGMENTS: SegmentProfile[] = [
  { customerType: "品牌方", plan: "年約方案", weight: 0.24, winRate: 0.28, cycleDays: 21, cycleJitter: 6, budgetMin: 780_000, budgetMax: 2_400_000 },
  { customerType: "品牌方", plan: "單次專案", weight: 0.3, winRate: 0.15, cycleDays: 45, cycleJitter: 12, budgetMin: 180_000, budgetMax: 850_000 },
  { customerType: "行銷公司", plan: "年約方案", weight: 0.12, winRate: 0.18, cycleDays: 60, cycleJitter: 14, budgetMin: 600_000, budgetMax: 1_500_000 },
  { customerType: "行銷公司", plan: "單次專案", weight: 0.34, winRate: 0.1, cycleDays: 92, cycleJitter: 18, budgetMin: 120_000, budgetMax: 600_000 },
];

// 各階段通過率：整體大致重現 100% → 50% → 25% → 12.5% → 6.3% 的漏斗形狀，
// 但依 segment 的 winRate 微調（黃金客群每一關都略高）。
function stagePassRates(winRate: number): number[] {
  // lead→meeting, meeting→proposal, proposal→negotiation, negotiation→won
  const base = [0.5, 0.5, 0.5, 0.5];
  const overall = base.reduce((a, b) => a * b, 1); // 0.0625
  const ratio = Math.pow(winRate / overall, 1 / 4);
  return base.map((p) => Math.min(0.92, p * ratio));
}

const COMPANY_PREFIX = ["晨光", "沐日", "青嶼", "岸品", "山澗", "拾穗", "白瀾", "森畝", "曜石", "南風", "初霽", "雲杉", "澄波", "禾冉", "旭岩", "暮雲", "原澗", "沛然", "梧陽", "澗石", "芙洛", "潮汐", "曙田", "凜冬", "映月", "松果", "海桐", "礫川", "菫青", "煦陽"];
const BRAND_SUFFIX = ["食品", "生活", "保養", "家居", "服飾", "飲品", "寵物", "母嬰", "運動", "科技", "美妝", "傢俱", "選物", "烘焙", "茶業"];
const AGENCY_SUFFIX = ["行銷", "整合行銷", "廣告", "媒體", "數位行銷", "公關", "品牌顧問"];
const CONTACT_SURNAMES = ["陳", "林", "黃", "張", "李", "王", "吳", "劉", "蔡", "楊", "許", "鄭", "謝", "郭", "洪"];
const CONTACT_GIVEN = ["怡君", "志明", "淑芬", "建宏", "雅婷", "俊傑", "美玲", "冠廷", "佩珊", "家豪", "曉彤", "承翰", "詩涵", "柏睿", "宛蓉"];
const BRAND_ROLES = ["行銷經理", "品牌經理", "行銷總監", "電商負責人", "營運經理"];
const AGENCY_ROLES = ["專案總監", "業務總監", "客戶總監", "營運長", "創辦人"];
const OWNERS = ["張予安", "劉哲瑋", "林芳瑜", "陳威廷", "黃郁婷"];
const NEEDS_BRAND = ["品牌年度內容經營", "新品上市整合行銷", "電商轉換率優化", "社群內容全年代操", "品牌影音內容製作"];
const NEEDS_AGENCY = ["專案外包協作", "影音製作支援", "大型檔期人力支援", "白牌內容製作", "投放素材量產"];
const OBJECTION_POOL = ["價格比同業高", "導入時間有疑慮", "內部還要比價", "決策者尚未參與", "既有供應商合約未到期", "對成效指標有疑慮", "預算要等下季"];

// ===== CRM 欄位擴充：確定性衍生新欄位所需的對照表／選項池 =====
const INDUSTRY_BY_BRAND_SUFFIX: Record<string, string> = {
  食品: "零售電商", 生活: "零售電商", 保養: "零售電商", 家居: "零售電商", 服飾: "零售電商",
  飲品: "餐飲", 寵物: "零售電商", 母嬰: "零售電商", 運動: "零售電商", 科技: "科技軟體",
  美妝: "零售電商", 傢俱: "零售電商", 選物: "零售電商", 烘焙: "餐飲", 茶業: "餐飲",
};
const CONTACT_ROLE_BY_ROLE: Record<string, string> = {
  行銷經理: "使用者", 品牌經理: "使用者", 行銷總監: "內部推薦人（Champion）", 電商負責人: "決策者", 營運經理: "影響者",
  專案總監: "影響者", 業務總監: "經濟買家", 客戶總監: "影響者", 營運長: "經濟買家", 創辦人: "決策者",
};
const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500以上"] as const;
const CURRENT_TOOLS_BRAND = ["Meta 廣告", "官網／電商平台", "LINE 官方帳號", "IG 自營"];
const CURRENT_TOOLS_AGENCY = ["內部剪輯團隊", "外部工作室配合", "接案平台"];
const COMPETITOR_POOL = ["既有供應商／工作室", "另一家代理商比價中", "同業競品方案"];
const PAIN_POOL_BRAND = ["內部行銷團隊人力吃緊，內容量能不足", "過去合作成效不穩定、缺乏數據追蹤", "檔期一到內容產出經常延遲", "社群經營仰賴單一窗口，缺乏系統化流程"];
const PAIN_POOL_AGENCY = ["尖峰檔期內部產能無法消化", "既有配合夥伴交期不穩定", "客戶要求量大但預算有限", "白牌交付品質參差不齊"];

const DAY = 24 * 60 * 60 * 1000;

// 母體以「昨天」為觀測終點；所有日期往回推，確保載入當下永遠是新鮮的資料
export function generateDeals(now: Date): Deal[] {
  const rand = mulberry32(20260813);
  const deals: Deal[] = [];
  const end = new Date(now.getTime() - DAY);
  const TOTAL = 520;

  const pickSegment = (): SegmentProfile => {
    const r = rand();
    let acc = 0;
    for (const s of SEGMENTS) {
      acc += s.weight;
      if (r <= acc) return s;
    }
    return SEGMENTS[SEGMENTS.length - 1];
  };

  for (let i = 0; i < TOTAL; i++) {
    const seg = pickSegment();
    const isBrand = seg.customerType === "品牌方";
    const company =
      COMPANY_PREFIX[Math.floor(rand() * COMPANY_PREFIX.length)] +
      (isBrand
        ? BRAND_SUFFIX[Math.floor(rand() * BRAND_SUFFIX.length)]
        : AGENCY_SUFFIX[Math.floor(rand() * AGENCY_SUFFIX.length)]);
    const contact =
      CONTACT_SURNAMES[Math.floor(rand() * CONTACT_SURNAMES.length)] +
      CONTACT_GIVEN[Math.floor(rand() * CONTACT_GIVEN.length)];
    const role = isBrand
      ? BRAND_ROLES[Math.floor(rand() * BRAND_ROLES.length)]
      : AGENCY_ROLES[Math.floor(rand() * AGENCY_ROLES.length)];

    // 建立日期：過去 180 天內，越近期越多（demo 時「本月」有足夠案量）
    const ageDays = Math.floor(Math.pow(rand(), 1.35) * 180) + 1;
    const createdAt = new Date(end.getTime() - ageDays * DAY);

    const pass = stagePassRates(seg.winRate);
    const targetCycle = Math.max(7, Math.round(seg.cycleDays + (rand() * 2 - 1) * seg.cycleJitter));
    // 四段 dwell 時間比例（接觸期較短、談判期較長），總和 = targetCycle
    const w = [0.18, 0.24, 0.3, 0.28];
    const dwell = w.map((x) => Math.max(1, Math.round(x * targetCycle)));

    const history: StageEvent[] = [{ stage: "lead", date: createdAt.toISOString() }];
    let cursor = createdAt.getTime();
    let finalStage: Stage = "lead";
    let closedAt: string | undefined;
    const stages: Stage[] = ["meeting", "proposal", "negotiation", "won"];

    for (let s = 0; s < stages.length; s++) {
      const passed = rand() < pass[s];
      const dwellMs = dwell[s] * DAY;
      if (!passed) {
        // 卡在目前階段一段時間後流失；若流失時間還沒到，就是「還在 pipeline 裡」
        const lostAt = cursor + dwellMs * (1.6 + rand());
        if (lostAt < end.getTime()) {
          history.push({ stage: "lost", date: new Date(lostAt).toISOString() });
          finalStage = "lost";
          closedAt = new Date(lostAt).toISOString();
        }
        break;
      }
      cursor += dwellMs;
      if (cursor >= end.getTime()) break; // 進度還沒走到，停在上一階段
      const st = stages[s];
      history.push({ stage: st, date: new Date(cursor).toISOString() });
      finalStage = st;
      if (st === "won") closedAt = new Date(cursor).toISOString();
    }
    if (finalStage === "lead" && history.length === 1) finalStage = "lead";
    else if (finalStage !== "lost" && finalStage !== "won") finalStage = history[history.length - 1].stage;

    const budget = Math.round((seg.budgetMin + rand() * (seg.budgetMax - seg.budgetMin)) / 10_000) * 10_000;
    const objections: string[] = [];
    if (rand() < 0.55) objections.push(OBJECTION_POOL[Math.floor(rand() * OBJECTION_POOL.length)]);
    if (rand() < 0.2) objections.push(OBJECTION_POOL[Math.floor(rand() * OBJECTION_POOL.length)]);

    const open = finalStage !== "won" && finalStage !== "lost";
    const probability = ({ lead: 10, meeting: 25, proposal: 55, negotiation: 80, won: 100, lost: 0 } as const)[finalStage];
    const priority = budget >= 1_000_000 ? "high" : budget >= 500_000 ? "medium" : "low";
    const source = (["主動開發", "客戶轉介", "官網詢問", "活動名單"] as const)[Math.floor(rand() * 4)];
    const nextFollowUp = open ? new Date(end.getTime() + (1 + Math.floor(rand() * 10)) * DAY).toISOString() : undefined;
    const decisionMakerMet = rand() < (finalStage === "won" ? 0.72 : 0.38);
    const role2 = role; // 供 CONTACT_ROLE_BY_ROLE 對照使用

    // ---- CRM 欄位擴充：公司資訊 ----
    const industry: string = isBrand ? INDUSTRY_BY_BRAND_SUFFIX[company.slice(-2)] ?? "零售電商" : "專業服務";
    const companySize: CompanySizeRange = COMPANY_SIZES[Math.min(3, Math.floor(rand() * rand() * 4))]; // 偏小型分佈
    const annualRevenueRange: AnnualRevenueRange =
      budget >= 1_000_000 ? "1億-5億" : budget >= 400_000 ? "1000萬-1億" : rand() < 0.15 ? "未知" : "1000萬以下";
    const currentToolsInUse: string[] = (() => {
      const pool = isBrand ? CURRENT_TOOLS_BRAND : CURRENT_TOOLS_AGENCY;
      const count = rand() < 0.3 ? 0 : rand() < 0.7 ? 1 : 2;
      const picked = new Set<string>();
      while (picked.size < count) picked.add(pool[Math.floor(rand() * pool.length)]);
      return [...picked];
    })();

    // ---- 窗口資訊 ----
    const contactDepartment: ContactDepartment = isBrand
      ? (["行銷", "營運", "經營層"] as const)[Math.floor(rand() * 3)]
      : (["營運", "業務銷售", "經營層"] as const)[Math.floor(rand() * 3)];
    const contactRole: ContactRole = (CONTACT_ROLE_BY_ROLE[role2] as ContactRole) ?? "影響者";

    // ---- 商機資訊 ----
    const budgetConfirmed: BudgetConfirmed =
      finalStage === "negotiation" || finalStage === "won"
        ? "已確認"
        : finalStage === "proposal"
        ? (rand() < 0.6 ? "估算中" : "已確認")
        : rand() < 0.5
        ? "估算中"
        : "未提及";
    const decisionMakerName = decisionMakerMet ? `已到場（${contact} ${role}）` : `未到場（${role}，需邀請）`;
    const competitorMentioned: string[] = rand() < 0.28 ? [COMPETITOR_POOL[Math.floor(rand() * COMPETITOR_POOL.length)]] : [];
    const painPointsPool = isBrand ? PAIN_POOL_BRAND : PAIN_POOL_AGENCY;
    const painPoints: string[] = [painPointsPool[Math.floor(rand() * painPointsPool.length)]];
    if (rand() < 0.35) {
      const second = painPointsPool[Math.floor(rand() * painPointsPool.length)];
      if (!painPoints.includes(second)) painPoints.push(second);
    }

    // ---- AI 洞察 ----
    const urgencyLevel: UrgencyLevel =
      finalStage === "negotiation" ? (rand() < 0.7 ? "高" : "中") : finalStage === "proposal" ? (rand() < 0.5 ? "中" : "高") : rand() < 0.4 ? "低" : "未知";
    const sentimentTone: SentimentTone =
      objections.length === 0
        ? (rand() < 0.75 ? "積極正向" : "中性觀望")
        : objections.length === 1
        ? (rand() < 0.55 ? "中性觀望" : "保留疑慮")
        : rand() < 0.6
        ? "保留疑慮"
        : "消極抗拒";
    const riskFlags: string[] = [];
    if (open && !decisionMakerMet && ["proposal", "negotiation"].includes(finalStage)) riskFlags.push("決策者尚未參與");
    if (open && budgetConfirmed === "未提及") riskFlags.push("預算未確認");
    if (competitorMentioned.length) riskFlags.push("競品已在評估中");

    deals.push({
      id: `gen-${i}`,
      company,
      contact,
      role,
      customerType: seg.customerType,
      plan: seg.plan,
      budget,
      need: isBrand
        ? NEEDS_BRAND[Math.floor(rand() * NEEDS_BRAND.length)]
        : NEEDS_AGENCY[Math.floor(rand() * NEEDS_AGENCY.length)],
      timeline: rand() < 0.5 ? "希望下季啟動" : "評估中，未定",
      objections: [...new Set(objections)],
      decisionMakerMet,
      stage: finalStage,
      stageHistory: history,
      meetingIds: [],
      owner: OWNERS[Math.floor(rand() * OWNERS.length)],
      createdAt: createdAt.toISOString(),
      closedAt,
      nextFollowUp,
      dealName: `${company}｜${seg.plan}`,
      dealType: rand() < 0.82 ? "新客開發" : "既有客戶增購",
      leadSource: source,
      probability,
      forecastCategory:
        finalStage === "won" ? "closed" : finalStage === "lost" ? "omitted" : finalStage === "negotiation" ? "commit" : finalStage === "proposal" ? "best_case" : "pipeline",
      expectedCloseDate: open ? new Date(createdAt.getTime() + targetCycle * DAY).toISOString() : closedAt,
      lastActivityAt: history.at(-1)?.date,
      nextActivity: open ? (rand() < 0.5 ? "追蹤電話" : "提案會議") : undefined,
      priority,
      industry,
      employeeRange: (["11–50 人", "51–100 人", "101–200 人"] as const)[Math.floor(rand() * 3)],
      location: (["台北市", "新北市", "台中市", "高雄市"] as const)[Math.floor(rand() * 4)],
      icpTier: seg.customerType === "品牌方" && seg.plan === "年約方案" ? "Tier 1" : budget >= 600_000 ? "Tier 2" : "Tier 3",
      preferredChannel: (["Email", "LINE", "電話", "會議"] as const)[Math.floor(rand() * 4)],
      products: [seg.plan],
      painPoints,
      decisionCriteria: rand() < 0.5 ? ["交付穩定性", "過往案例"] : ["價格", "啟動速度"],
      tags: [seg.customerType, seg.plan, priority === "high" ? "高價值" : "一般案件"],
      recordSource: "AI 會議抽取",
      companySize,
      annualRevenueRange,
      currentToolsInUse,
      contactDepartment,
      contactRole,
      budgetConfirmed,
      decisionMakerName,
      competitorMentioned,
      urgencyLevel,
      sentimentTone,
      riskFlags,
    });
  }
  return deals;
}
