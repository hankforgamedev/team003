import { runNbaRules } from "@/lib/ai/nba-rules";
import { Deal, Meeting, MeetingExtraction, Stage, TranscriptSegment } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

function iso(now: Date, offsetDays: number): string {
  return new Date(now.getTime() + offsetDays * DAY).toISOString();
}

function stageHistory(now: Date, entries: [Stage, number][]) {
  return entries.map(([stage, days]) => ({ stage, date: iso(now, days) }));
}

function transcript(lines: [string, string][]): TranscriptSegment[] {
  return lines.map(([speaker, text], i) => ({ t: i * 18, speaker, text }));
}

function forecastFor(stage: Stage): Deal["forecastCategory"] {
  if (stage === "won") return "closed";
  if (stage === "lost") return "omitted";
  if (stage === "negotiation") return "commit";
  if (stage === "proposal") return "best_case";
  return "pipeline";
}

type FixtureCase = {
  dealId: string;
  meetingId: string;
  title: string;
  durationMin: number;
  attendees: string[];
  owner: string;
  createdDaysAgo: number;
  stageEvents: [Stage, number][];
  closedDaysAgo?: number;
  budget: number;
  extraction: MeetingExtraction;
  lines: [string, string][];
};

const EXTRA_COMPANIES = [
  "禾映美妝",
  "遠曜科技",
  "青嶼家居",
  "澄光旅宿",
  "捷禾電商",
  "方舟顧問",
  "拾光文創",
  "台灣植研",
  "迅聯通路",
  "安辰醫材",
  "原點設計",
  "凌森戶外",
  "有序餐飲",
  "昕河軟體",
  "睿品教育",
  "光引廣告",
  "森田農產",
  "映策公關",
  "朗捷客服",
  "品岳建材",
  "川曜能源",
  "柏恩服飾",
  "群策展覽",
  "海石電子",
  "沛然生技",
] as const;

const EXTRA_CONTACTS = [
  "林佳穎",
  "黃柏翰",
  "蔡依庭",
  "許哲宇",
  "王念慈",
  "周彥廷",
  "陳以安",
  "李承恩",
  "張雅筑",
  "吳宗翰",
  "楊品萱",
  "鄭凱翔",
  "賴怡君",
  "曾柏宇",
  "郭語涵",
  "謝明哲",
  "何佳蓉",
  "宋冠廷",
  "羅心妤",
  "潘建宏",
  "葉庭瑋",
  "范郁婷",
  "邱士杰",
  "盧沛珊",
  "洪維中",
] as const;

const STAGE_SEQUENCE: Stage[] = ["proposal", "meeting", "negotiation", "lead", "won", "lost"];
const PROBABILITY_BY_STAGE: Record<Stage, number> = {
  lead: 10,
  meeting: 25,
  proposal: 55,
  negotiation: 80,
  won: 100,
  lost: 0,
};

const DEPARTMENT_PROFILES: {
  department: NonNullable<MeetingExtraction["contactDepartment"]>;
  role: string;
  contactRole: NonNullable<MeetingExtraction["contactRole"]>;
  industry: string;
  need: string;
  objection: string;
  nextAction: string;
  painPoints: string[];
  decisionCriteria: string[];
  currentToolsInUse: string[];
  stakeholder: string;
  quote: string;
}[] = [
  {
    department: "行銷",
    role: "品牌經理",
    contactRole: "內部推薦人（Champion）",
    industry: "消費品牌",
    need: "把檔期會議、素材審核與社群回饋整合成同一套追蹤流程",
    objection: "擔心導入時間影響檔期",
    nextAction: "提供檔期導入時程與同產業案例",
    painPoints: ["檔期資訊分散", "素材審核靠人工追", "會後待辦漏接"],
    decisionCriteria: ["導入速度", "品牌案例", "跨部門可視性"],
    currentToolsInUse: ["Google Sheet", "LINE 群組", "Notion"],
    stakeholder: "品牌總監／決策者",
    quote: "只要會後待辦能自動進 CRM，行銷部就少掉很多追人的時間。",
  },
  {
    department: "IT資訊",
    role: "資訊主任",
    contactRole: "技術把關者",
    industry: "製造科技",
    need: "把會議抽取欄位匯出到既有系統，並保留權限控管紀錄",
    objection: "擔心資料權限與系統整合成本",
    nextAction: "提供 API 欄位對照與權限矩陣",
    painPoints: ["資料無法進 BI", "權限控管分散", "欄位手動補登"],
    decisionCriteria: ["API 完整性", "資料權限", "維運成本"],
    currentToolsInUse: ["ERP", "Power BI", "內部表單"],
    stakeholder: "營運副總／決策者",
    quote: "如果權限不能跟現有系統對齊，IT 這關一定會卡住。",
  },
  {
    department: "財務",
    role: "財務經理",
    contactRole: "影響者",
    industry: "通路服務",
    need: "讓年度報價、會議承諾與付款條件都能被稽核追蹤",
    objection: "需要確認付款條件與年度 ROI",
    nextAction: "送出付款版本與 ROI 試算",
    painPoints: ["報價版本難追", "年度預算需稽核", "合約條件散落"],
    decisionCriteria: ["ROI", "付款條件", "稽核完整性"],
    currentToolsInUse: ["Excel", "HubSpot"],
    stakeholder: "業務總監／簽核者",
    quote: "財務不是反對導入，是需要看到預算依據和付款條件。",
  },
  {
    department: "營運",
    role: "營運副理",
    contactRole: "使用者",
    industry: "營運服務",
    need: "把客訴會議與改善任務變成跨班別交接清單",
    objection: "現場擔心新增填寫負擔",
    nextAction: "整理現場流程圖並安排 PoC",
    painPoints: ["交接靠口頭", "客訴改善斷點", "主管難看進度"],
    decisionCriteria: ["現場負擔低", "任務清楚", "主管看板"],
    currentToolsInUse: ["紙本交接表", "LINE 群組"],
    stakeholder: "營運長／決策者",
    quote: "現場最怕多填一套，所以流程一定要比現在省事。",
  },
  {
    department: "經營層",
    role: "創辦人",
    contactRole: "經濟買家",
    industry: "成長型企業",
    need: "每週掌握重要案件、風險異議與需要高層出面的下一步",
    objection: "擔心主管週報無法反映真實會議內容",
    nextAction: "安排主管版週報 Demo 與啟動盤點",
    painPoints: ["高層看不到風險", "會議結論散落", "新人交接慢"],
    decisionCriteria: ["主管可視性", "資料依據", "快速導入"],
    currentToolsInUse: ["Notion", "Google Drive", "LINE"],
    stakeholder: "營運長／導入負責人",
    quote: "我想知道哪些案子該我出面，不要等月底才發現。",
  },
];

function stageEventsFor(stage: Stage, createdDaysAgo: number, cycleDays: number): [Stage, number][] {
  const events: [Stage, number][] = [["lead", createdDaysAgo]];
  if (["meeting", "proposal", "negotiation", "won", "lost"].includes(stage)) {
    events.push(["meeting", createdDaysAgo + 5]);
  }
  if (["proposal", "negotiation", "won", "lost"].includes(stage)) {
    events.push(["proposal", createdDaysAgo + 11]);
  }
  if (["negotiation", "won", "lost"].includes(stage)) {
    events.push(["negotiation", createdDaysAgo + 17]);
  }
  if (stage === "won" || stage === "lost") {
    events.push([stage, createdDaysAgo + cycleDays]);
  }
  return events;
}

function makeExtraCases(now: Date): FixtureCase[] {
  return EXTRA_COMPANIES.map((company, i) => {
    const no = i + 6;
    const profile = DEPARTMENT_PROFILES[i % DEPARTMENT_PROFILES.length];
    const goldenWin = i % 7 === 0;
    const stage = goldenWin ? "won" : STAGE_SEQUENCE[i % STAGE_SEQUENCE.length];
    const customerType: NonNullable<MeetingExtraction["customerType"]> =
      goldenWin || i % 4 !== 0 ? "品牌方" : "行銷公司";
    const plan: NonNullable<MeetingExtraction["plan"]> =
      goldenWin || i % 3 === 0 ? "年約方案" : "單次專案";
    const cycleDays = goldenWin ? 20 + (i % 4) : 24 + (i % 9);
    const createdDaysAgo = stage === "won" || stage === "lost" ? -(58 + i * 2) : -(32 + i * 2);
    const closedDaysAgo = stage === "won" || stage === "lost" ? createdDaysAgo + cycleDays : undefined;
    const budget = 420_000 + ((i * 137_000) % 1_180_000) + (plan === "年約方案" ? 360_000 : 0);
    const decisionMakerMet = stage === "won" || stage === "negotiation" || (i % 5 === 2);
    const decisionMaker = decisionMakerMet ? `已到場（${profile.stakeholder}）` : `未到場（${profile.stakeholder}）`;
    const expectedCloseOffset = stage === "won" || stage === "lost" ? closedDaysAgo ?? -1 : 10 + (i % 35);
    const emailCompany = `itest-${String(no).padStart(2, "0")}@sales-next.test`;
    const phone = `02-66${String(1000 + i * 37).slice(-4)}-${String(2000 + i * 53).slice(-4)}`;

    return {
      dealId: `itest-deal-${String(no).padStart(2, "0")}`,
      meetingId: `itest-meeting-${String(no).padStart(2, "0")}`,
      title: `聯動測試｜${profile.department}${stage === "won" ? "成交" : stage === "lost" ? "流失" : "推進"} ${company}`,
      durationMin: 24 + (i % 22),
      attendees: [`${i % 2 ? "張予安" : "劉柏均"}`, `${EXTRA_CONTACTS[i]} ${profile.role}`, profile.stakeholder],
      owner: i % 3 === 0 ? "張予安" : i % 3 === 1 ? "劉柏均" : "林思妤",
      createdDaysAgo,
      stageEvents: stageEventsFor(stage, createdDaysAgo, cycleDays),
      closedDaysAgo,
      budget,
      extraction: {
        company,
        contact: EXTRA_CONTACTS[i],
        role: profile.role,
        customerType,
        plan,
        need: profile.need,
        budget: `NT$${budget.toLocaleString()}`,
        stage,
        timeline: stage === "won" ? "已簽約並進入啟動" : stage === "lost" ? "已結案，保留回訪名單" : `${9 + (i % 4)} 月前完成下一階段`,
        objections: stage === "won" ? [] : [profile.objection],
        decisionMaker,
        nextActions:
          stage === "won"
            ? ["安排啟動會議", "匯入歷史會議"]
            : stage === "lost"
              ? ["記錄流失原因", "三個月後回訪"]
              : [profile.nextAction, decisionMakerMet ? "確認簽核時程" : "安排決策者參與下一次會議"],
        followUpDate: stage === "won" ? "下週一" : stage === "lost" ? "三個月後" : i % 2 === 0 ? "三天內" : "一週內",
        contactEmail: emailCompany,
        contactPhone: phone,
        industry: profile.industry,
        employeeRange: i % 4 === 0 ? "201-500" : i % 4 === 1 ? "51-200" : "11-50",
        leadSource: i % 4 === 0 ? "客戶轉介" : i % 4 === 1 ? "官網詢問" : i % 4 === 2 ? "活動名單" : "主動開發",
        dealType: i % 6 === 0 ? "既有客戶增購" : "新客開發",
        probability: PROBABILITY_BY_STAGE[stage],
        forecastCategory: forecastFor(stage),
        expectedCloseDate: iso(now, expectedCloseOffset),
        priority: budget >= 1_200_000 ? "high" : budget >= 720_000 ? "medium" : "low",
        painPoints: profile.painPoints,
        successMetrics: [`${profile.department}待辦準時率提升`, "會後資料可追溯"],
        decisionCriteria: profile.decisionCriteria,
        competitors: i % 4 === 0 ? ["既有供應商"] : i % 4 === 1 ? ["內部自建流程"] : [],
        procurementProcess: `${profile.department}初評，${profile.stakeholder}確認`,
        preferredChannel: i % 3 === 0 ? "Email" : i % 3 === 1 ? "LINE" : "會議",
        companySize: i % 4 === 0 ? "201-500" : i % 4 === 1 ? "51-200" : "11-50",
        currentToolsInUse: profile.currentToolsInUse,
        annualRevenueRange: i % 4 === 0 ? "5億以上" : i % 4 === 1 ? "1億-5億" : "1000萬-1億",
        contactDepartment: profile.department,
        contactRole: profile.contactRole,
        additionalStakeholders: [profile.stakeholder],
        proposedSolution: `${plan}，先導入${profile.department}會議沉澱與 CRM 待辦同步`,
        budgetConfirmed: stage === "won" || stage === "negotiation" ? "已確認" : i % 3 === 0 ? "估算中" : "未提及",
        competitorMentioned: i % 4 === 0 ? ["既有供應商"] : [],
        urgencyLevel: stage === "negotiation" || stage === "won" ? "高" : i % 2 === 0 ? "中" : "低",
        sentimentTone: stage === "lost" ? "保留疑慮" : stage === "won" ? "積極正向" : i % 2 === 0 ? "中性觀望" : "保留疑慮",
        riskFlags: stage === "won" ? [] : decisionMakerMet ? [profile.objection] : ["無決策者出席", profile.objection],
        keyQuotes: [profile.quote],
        meetingSummary: `${company}的${profile.department}窗口正在評估 Sales Next；此案用來測試第 ${no} 筆資料是否同步到 CRM、會議與知識庫。`,
      },
      lines: [
        [i % 2 ? "張予安" : "劉柏均", `今天確認 ${company} 的${profile.department}流程，這是第 ${no} 筆聯動測試資料。`],
        [EXTRA_CONTACTS[i], profile.quote],
        [EXTRA_CONTACTS[i], `目前需求是${profile.need}，預算約 ${Math.round(budget / 10_000)} 萬。`],
        [i % 2 ? "張予安" : "劉柏均", `${stage === "won" ? "我們會安排啟動會議並同步知識庫。" : profile.nextAction}，下一步會同步更新 CRM。`],
      ],
    };
  });
}

export function buildIntegrationTestSeed(now = new Date()): {
  deals: Deal[];
  meetings: Meeting[];
  seededAt: string;
} {
  const cases: FixtureCase[] = [
    {
      dealId: "itest-deal-marketing",
      meetingId: "itest-meeting-marketing",
      title: "聯動測試｜行銷部新品上市",
      durationMin: 38,
      attendees: ["張予安", "吳佩珊 行銷經理", "周子庭 品牌副理"],
      owner: "張予安",
      createdDaysAgo: -24,
      stageEvents: [
        ["lead", -24],
        ["meeting", -18],
        ["proposal", -12],
      ],
      budget: 1_200_000,
      extraction: {
        company: "森果食品",
        contact: "吳佩珊",
        role: "行銷經理",
        customerType: "品牌方",
        plan: "年約方案",
        need: "新品上市檔期需要把通路活動、素材審核與客戶回饋集中追蹤",
        budget: "NT$1,200,000",
        stage: "proposal",
        timeline: "9 月新品上市前完成導入",
        objections: ["擔心導入時間壓縮到素材審核"],
        decisionMaker: "未到場（林總經理）",
        nextActions: ["三天內提供導入時程表", "補上食品品牌年約案例", "協助安排決策者版 Demo"],
        followUpDate: "三天內",
        contactEmail: "peishan.wu@senguof.svg",
        contactPhone: "02-2712-8801",
        industry: "食品飲料",
        employeeRange: "51-200",
        leadSource: "活動名單",
        dealType: "新客開發",
        probability: 55,
        forecastCategory: "best_case",
        expectedCloseDate: iso(now, 18),
        priority: "high",
        painPoints: ["活動檔期分散", "素材審核靠人工追蹤", "會後待辦容易漏接"],
        successMetrics: ["新品上市前三週完成導入", "行銷待辦準時率提升到 90%"],
        decisionCriteria: ["導入速度", "食品品牌案例", "跨部門可視性"],
        competitors: ["既有專案管理工具"],
        procurementProcess: "行銷部先評估，總經理核准年度預算",
        preferredChannel: "LINE",
        companySize: "51-200",
        currentToolsInUse: ["Google Sheet", "LINE 群組", "Trello"],
        annualRevenueRange: "1億-5億",
        contactDepartment: "行銷",
        contactRole: "內部推薦人（Champion）",
        additionalStakeholders: ["林總經理／決策者", "周子庭／品牌副理"],
        proposedSolution: "年約版 Sales Next，先導入新品上市專案與會議自動待辦",
        budgetConfirmed: "估算中",
        competitorMentioned: ["既有專案管理工具"],
        urgencyLevel: "高",
        sentimentTone: "積極正向",
        riskFlags: ["無決策者出席", "導入時程緊"],
        keyQuotes: ["新品上市前三週如果還靠人工追，行銷部一定會漏待辦。"],
        meetingSummary: "行銷部已確認新品上市需要跨部門追蹤，下一步要用導入時程與案例說服總經理。",
      },
      lines: [
        ["張予安", "今天先確認新品上市流程，看看會議紀錄、CRM 與知識庫能不能串起來。"],
        ["吳佩珊", "行銷部最大問題是通路活動、素材審核和客戶回饋都散在不同表格。"],
        ["周子庭", "新品上市前三週如果還靠人工追，行銷部一定會漏待辦。"],
        ["吳佩珊", "預算大概一百二十萬，但林總經理今天沒辦法出席，最後還是要他核准。"],
        ["張予安", "我三天內補導入時程表和食品品牌案例，再安排決策者版 Demo。"],
      ],
    },
    {
      dealId: "itest-deal-it",
      meetingId: "itest-meeting-it",
      title: "聯動測試｜IT 資訊整合",
      durationMin: 31,
      attendees: ["劉柏均", "陳昱廷 IT 資訊主任"],
      owner: "劉柏均",
      createdDaysAgo: -14,
      stageEvents: [
        ["lead", -14],
        ["meeting", -10],
      ],
      budget: 680_000,
      extraction: {
        company: "北曜製造",
        contact: "陳昱廷",
        role: "IT 資訊主任",
        customerType: "品牌方",
        plan: "單次專案",
        need: "把會議抽取資料匯出給既有 ERP 與內部 BI 報表",
        budget: "NT$680,000",
        stage: "meeting",
        timeline: "10 月前完成 PoC",
        objections: ["擔心資料權限與系統整合成本"],
        decisionMaker: "未到場（營運副總）",
        nextActions: ["提供 API 欄位對照表", "安排資安與權限設定討論"],
        followUpDate: "一週內",
        contactEmail: "it.chen@peiyaw.com.tw",
        contactPhone: "03-466-1020",
        industry: "製造業",
        employeeRange: "201-500",
        leadSource: "官網詢問",
        dealType: "新客開發",
        probability: 25,
        forecastCategory: "pipeline",
        expectedCloseDate: iso(now, 45),
        priority: "medium",
        painPoints: ["會議資訊無法進 BI", "資料權限分散", "ERP 欄位手動補登"],
        successMetrics: ["PoC 匯出 5 個 CRM 欄位", "權限矩陣通過 IT 審查"],
        decisionCriteria: ["API 欄位完整性", "資料權限", "維運成本"],
        competitors: ["內部自建表單"],
        procurementProcess: "IT 審查後送營運副總決策",
        preferredChannel: "Email",
        companySize: "201-500",
        currentToolsInUse: ["ERP", "Power BI", "內部表單"],
        annualRevenueRange: "5億以上",
        contactDepartment: "IT資訊",
        contactRole: "技術把關者",
        additionalStakeholders: ["營運副總／決策者", "BI 分析師／使用者"],
        proposedSolution: "單次整合專案，先做 ERP/BI 匯出 PoC",
        budgetConfirmed: "估算中",
        competitorMentioned: ["內部自建表單"],
        urgencyLevel: "中",
        sentimentTone: "中性觀望",
        riskFlags: ["無決策者出席", "需通過 IT 權限審查"],
        keyQuotes: ["如果資料權限不能跟 ERP 權限對齊，IT 這關會卡住。"],
        meetingSummary: "IT 部門關注 API、權限與維運成本，下一步要用欄位對照和資安設定降低整合風險。",
      },
      lines: [
        ["劉柏均", "今天我們把 IT 需要的資料流和權限先盤清楚。"],
        ["陳昱廷", "如果資料權限不能跟 ERP 權限對齊，IT 這關會卡住。"],
        ["陳昱廷", "我們想先做 PoC，把會議抽取的公司、預算、階段匯進 BI。"],
        ["劉柏均", "我會提供 API 欄位對照表，再約一場資安和權限設定討論。"],
      ],
    },
    {
      dealId: "itest-deal-finance",
      meetingId: "itest-meeting-finance",
      title: "聯動測試｜財務預算審查",
      durationMin: 42,
      attendees: ["張予安", "鄭雅琳 財務經理", "郭彥廷 業務總監"],
      owner: "張予安",
      createdDaysAgo: -45,
      stageEvents: [
        ["lead", -45],
        ["meeting", -36],
        ["proposal", -29],
        ["negotiation", -7],
      ],
      budget: 1_580_000,
      extraction: {
        company: "雲橋商貿",
        contact: "鄭雅琳",
        role: "財務經理",
        customerType: "行銷公司",
        plan: "年約方案",
        need: "把年度客戶會議與報價紀錄變成可稽核的 CRM 流程",
        budget: "NT$1,580,000",
        stage: "negotiation",
        timeline: "本季內簽約，下季啟動",
        objections: ["價格高於原始預算", "需要確認付款條件"],
        decisionMaker: "已到場（郭彥廷 業務總監）",
        nextActions: ["送出分期付款版本", "提供年度 ROI 試算表"],
        followUpDate: "兩天內",
        contactEmail: "yalin.cheng@cloudbridge.tw",
        contactPhone: "02-8780-6699",
        industry: "代理商／通路商",
        employeeRange: "51-200",
        leadSource: "客戶轉介",
        dealType: "既有客戶增購",
        probability: 80,
        forecastCategory: "commit",
        expectedCloseDate: iso(now, 9),
        priority: "high",
        painPoints: ["報價版本難追", "年度預算需可稽核", "跨客戶資料散落"],
        successMetrics: ["報價版本追蹤時間減半", "年度審查資料可一鍵匯出"],
        decisionCriteria: ["ROI", "付款條件", "稽核完整性"],
        competitors: ["既有 CRM 外掛"],
        procurementProcess: "財務確認付款條件，業務總監簽核",
        preferredChannel: "Email",
        companySize: "51-200",
        currentToolsInUse: ["HubSpot", "Excel"],
        annualRevenueRange: "1億-5億",
        contactDepartment: "財務",
        contactRole: "影響者",
        additionalStakeholders: ["郭彥廷／業務總監", "採購窗口／合約審核"],
        proposedSolution: "年約方案加付款分期與 ROI 報表模板",
        budgetConfirmed: "已確認",
        competitorMentioned: ["既有 CRM 外掛"],
        urgencyLevel: "高",
        sentimentTone: "保留疑慮",
        riskFlags: ["價格異議", "付款條件待確認"],
        keyQuotes: ["價格可以談，但財務需要看到年度 ROI 和付款條件。"],
        meetingSummary: "財務已確認預算方向但要求付款條件與 ROI 證據，案件已進入談判收斂。",
      },
      lines: [
        ["張予安", "今天聚焦財務審查，確認年度預算和付款條件。"],
        ["鄭雅琳", "價格可以談，但財務需要看到年度 ROI 和付款條件。"],
        ["郭彥廷", "如果分期版本合理，我這邊可以協助往簽約推。"],
        ["張予安", "我兩天內送分期付款版本和 ROI 試算表。"],
      ],
    },
    {
      dealId: "itest-deal-ops",
      meetingId: "itest-meeting-ops",
      title: "聯動測試｜營運流程盤點",
      durationMin: 27,
      attendees: ["林思妤", "許承恩 營運副理"],
      owner: "林思妤",
      createdDaysAgo: -5,
      stageEvents: [["lead", -5]],
      budget: 420_000,
      extraction: {
        company: "晨線物流",
        contact: "許承恩",
        role: "營運副理",
        customerType: "品牌方",
        plan: "單次專案",
        need: "把客訴會議與改善任務整理成跨班別交接清單",
        budget: "NT$420,000",
        stage: "lead",
        timeline: "先評估兩週內是否進 PoC",
        objections: ["現場班別擔心新增填寫負擔"],
        decisionMaker: "未確認（營運長）",
        nextActions: ["整理客訴改善流程圖", "確認營運長是否參與 PoC 評估"],
        followUpDate: "一週內",
        contactEmail: "ops.hsu@morningline.tw",
        contactPhone: "04-2266-3188",
        industry: "物流服務",
        employeeRange: "51-200",
        leadSource: "主動開發",
        dealType: "新客開發",
        probability: 10,
        forecastCategory: "pipeline",
        expectedCloseDate: iso(now, 60),
        priority: "medium",
        painPoints: ["客訴改善追蹤斷點", "跨班別交接靠口頭", "主管難看即時進度"],
        successMetrics: ["交接漏項降低", "客訴改善任務可追蹤"],
        decisionCriteria: ["現場負擔低", "任務清楚", "主管看板"],
        competitors: ["紙本交接表"],
        procurementProcess: "營運副理初評，營運長決策",
        preferredChannel: "會議",
        companySize: "51-200",
        currentToolsInUse: ["紙本交接表", "LINE 群組"],
        annualRevenueRange: "1億-5億",
        contactDepartment: "營運",
        contactRole: "使用者",
        additionalStakeholders: ["營運長／決策者", "班別主管／使用者"],
        proposedSolution: "單次 PoC，先把客訴會議轉成跨班別任務清單",
        budgetConfirmed: "未提及",
        competitorMentioned: ["紙本交接表"],
        urgencyLevel: "中",
        sentimentTone: "中性觀望",
        riskFlags: ["預算未確認", "決策者未確認"],
        keyQuotes: ["現場最怕多填一套，所以流程一定要比現在更省事。"],
        meetingSummary: "營運部門先做流程盤點，關鍵是證明 AI 建檔能減少交接負擔而不是增加工作。",
      },
      lines: [
        ["林思妤", "我們先確認客訴會議之後，營運現場怎麼交接改善任務。"],
        ["許承恩", "現場最怕多填一套，所以流程一定要比現在更省事。"],
        ["許承恩", "預算還沒談，營運長也還沒進來，但如果 PoC 能省交接時間就有機會。"],
        ["林思妤", "我先整理客訴改善流程圖，下週確認營運長是否一起評估。"],
      ],
    },
    {
      dealId: "itest-deal-exec",
      meetingId: "itest-meeting-exec",
      title: "聯動測試｜經營層簽約回顧",
      durationMin: 34,
      attendees: ["劉柏均", "楊子涵 創辦人", "李昱翔 營運長"],
      owner: "劉柏均",
      createdDaysAgo: -75,
      stageEvents: [
        ["lead", -75],
        ["meeting", -68],
        ["proposal", -62],
        ["negotiation", -58],
        ["won", -54],
      ],
      closedDaysAgo: -54,
      budget: 1_360_000,
      extraction: {
        company: "沐禾生活",
        contact: "楊子涵",
        role: "創辦人",
        customerType: "品牌方",
        plan: "年約方案",
        need: "讓創辦人每週看到業務會議、重要異議與下一步行動",
        budget: "NT$1,360,000",
        stage: "won",
        timeline: "已完成簽約，9 月啟動",
        objections: [],
        decisionMaker: "已到場（楊子涵 創辦人）",
        nextActions: ["安排啟動會議", "匯入第一批歷史會議"],
        followUpDate: "下週一",
        contactEmail: "founder.yang@muhe-life.tw",
        contactPhone: "02-2558-2210",
        industry: "生活選品",
        employeeRange: "51-200",
        leadSource: "合作夥伴",
        dealType: "新客開發",
        probability: 100,
        forecastCategory: "closed",
        expectedCloseDate: iso(now, -54),
        priority: "high",
        painPoints: ["創辦人無法即時掌握業務風險", "會議結論散落", "新人交接慢"],
        successMetrics: ["每週風險案件自動摘要", "新人交接時間縮短 30%"],
        decisionCriteria: ["主管可視性", "資料依據", "快速導入"],
        competitors: [],
        procurementProcess: "創辦人直接決策，營運長協助導入",
        preferredChannel: "會議",
        companySize: "51-200",
        currentToolsInUse: ["Notion", "Google Drive", "LINE"],
        annualRevenueRange: "1億-5億",
        contactDepartment: "經營層",
        contactRole: "經濟買家",
        additionalStakeholders: ["李昱翔／營運長", "業務主管／使用者"],
        proposedSolution: "年約方案，主管週報、風險案件與知識庫同步導入",
        budgetConfirmed: "已確認",
        competitorMentioned: [],
        urgencyLevel: "高",
        sentimentTone: "積極正向",
        riskFlags: [],
        keyQuotes: ["我想每週知道哪些案子該我出面，不要等月底才發現。"],
        meetingSummary: "經營層已簽約，重點轉為啟動會議、歷史會議匯入與主管週報節奏。",
      },
      lines: [
        ["劉柏均", "今天確認簽約後啟動事項，以及經營層希望看到的週報內容。"],
        ["楊子涵", "我想每週知道哪些案子該我出面，不要等月底才發現。"],
        ["李昱翔", "如果可以把歷史會議匯入知識庫，新人交接會快很多。"],
        ["劉柏均", "我們下週一安排啟動會議，同步匯入第一批歷史會議。"],
      ],
    },
  ];

  const allCases = [...cases, ...makeExtraCases(now)];

  const deals: Deal[] = allCases.map((item) => {
    const stage = item.extraction.stage;
    return {
      id: item.dealId,
      company: item.extraction.company,
      contact: item.extraction.contact,
      role: item.extraction.role,
      customerType: item.extraction.customerType || "品牌方",
      plan: item.extraction.plan || "單次專案",
      budget: item.budget,
      need: item.extraction.need,
      timeline: item.extraction.timeline,
      objections: item.extraction.objections,
      decisionMakerMet: !item.extraction.decisionMaker.includes("未"),
      stage,
      stageHistory: stageHistory(now, item.stageEvents),
      meetingIds: [item.meetingId],
      owner: item.owner,
      createdAt: iso(now, item.createdDaysAgo),
      closedAt: item.closedDaysAgo == null ? undefined : iso(now, item.closedDaysAgo),
      nextFollowUp: stage === "won" || stage === "lost" ? undefined : iso(now, stage === "negotiation" ? 2 : 7),
      showcase: true,
      dealName: `${item.extraction.company}｜${item.extraction.contactDepartment}聯動測試`,
      dealType: item.extraction.dealType === "既有客戶增購" ? "既有客戶增購" : "新客開發",
      leadSource: item.extraction.leadSource as Deal["leadSource"],
      probability: item.extraction.probability,
      forecastCategory: item.extraction.forecastCategory ?? forecastFor(stage),
      expectedCloseDate: item.extraction.expectedCloseDate,
      nextStep: item.extraction.nextActions[0],
      lastActivityAt: iso(now, item.stageEvents.at(-1)?.[1] ?? item.createdDaysAgo),
      nextActivity: stage === "won" ? "啟動會議" : "追蹤會議",
      priority: item.extraction.priority,
      industry: item.extraction.industry,
      employeeRange: item.extraction.employeeRange,
      contactEmail: item.extraction.contactEmail,
      contactPhone: item.extraction.contactPhone,
      preferredChannel: item.extraction.preferredChannel as Deal["preferredChannel"],
      products: [item.extraction.plan || "單次專案"],
      painPoints: item.extraction.painPoints,
      successMetrics: item.extraction.successMetrics,
      decisionCriteria: item.extraction.decisionCriteria,
      competitors: item.extraction.competitors,
      procurementProcess: item.extraction.procurementProcess,
      tags: ["聯動測試", item.extraction.contactDepartment ?? "部門未標記", item.extraction.customerType || "品牌方", item.extraction.plan || "單次專案"],
      recordSource: "AI 會議抽取",
      companySize: item.extraction.companySize,
      currentToolsInUse: item.extraction.currentToolsInUse,
      annualRevenueRange: item.extraction.annualRevenueRange,
      contactDepartment: item.extraction.contactDepartment,
      contactRole: item.extraction.contactRole,
      additionalStakeholders: item.extraction.additionalStakeholders,
      proposedSolution: item.extraction.proposedSolution,
      budgetConfirmed: item.extraction.budgetConfirmed,
      decisionMakerName: item.extraction.decisionMaker,
      competitorMentioned: item.extraction.competitorMentioned,
      urgencyLevel: item.extraction.urgencyLevel,
      sentimentTone: item.extraction.sentimentTone,
      riskFlags: item.extraction.riskFlags,
      keyQuotes: item.extraction.keyQuotes,
      meetingSummary: item.extraction.meetingSummary,
    };
  });

  const meetings: Meeting[] = allCases.map((item) => ({
    id: item.meetingId,
    dealId: item.dealId,
    title: item.title,
    date: iso(now, item.stageEvents.at(-1)?.[1] ?? item.createdDaysAgo),
    durationMin: item.durationMin,
    attendees: item.attendees,
    transcript: transcript(item.lines),
    summary: [
      `部門：${item.extraction.contactDepartment ?? "未標記"}，階段：${item.extraction.stage}`,
      `需求：${item.extraction.need}`,
      `下一步：${item.extraction.nextActions.join("；")}`,
    ],
    extraction: item.extraction,
    nba: runNbaRules(item.extraction, deals),
    source: "demo",
    consent: true,
  }));

  return { deals, meetings, seededAt: now.toISOString() };
}
