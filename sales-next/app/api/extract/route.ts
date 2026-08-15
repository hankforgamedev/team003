import { NextRequest, NextResponse } from "next/server";
import { chatJSONWithProvider, getAiProviderFromRequest } from "@/lib/ai/llm";

const SCHEMA = {
  type: "object",
  properties: {
    company: { type: "string" },
    contact: { type: "string" },
    role: { type: "string" },
    customerType: { type: "string", enum: ["品牌方", "行銷公司", "企業客戶", ""] },
    plan: { type: "string", enum: ["年約方案", "單次專案", "Pilot 試行", "企業方案", "標準方案", ""] },
    need: { type: "string" },
    budget: { type: "string" },
    stage: { type: "string", enum: ["lead", "meeting", "proposal", "negotiation", "won", "lost"] },
    timeline: { type: "string" },
    objections: { type: "array", items: { type: "string" } },
    decisionMaker: { type: "string" },
    nextActions: { type: "array", items: { type: "string" } },
    followUpDate: { type: "string" },
    contactEmail: { type: "string" },
    contactPhone: { type: "string" },
    industry: { type: "string" },
    employeeRange: { type: "string" },
    leadSource: { type: "string" },
    dealType: { type: "string" },
    probability: { type: "number" },
    forecastCategory: { type: "string", enum: ["pipeline", "best_case", "commit", "closed", "omitted"] },
    expectedCloseDate: { type: "string" },
    priority: { type: "string", enum: ["high", "medium", "low"] },
    painPoints: { type: "array", items: { type: "string" } },
    successMetrics: { type: "array", items: { type: "string" } },
    decisionCriteria: { type: "array", items: { type: "string" } },
    competitors: { type: "array", items: { type: "string" } },
    procurementProcess: { type: "string" },
    preferredChannel: { type: "string" },
    companySize: { type: "string", enum: ["1-10", "11-50", "51-200", "201-500", "500以上", ""] },
    currentToolsInUse: { type: "array", items: { type: "string" } },
    annualRevenueRange: { type: "string", enum: ["1000萬以下", "1000萬-1億", "1億-5億", "5億以上", "未知", ""] },
    contactDepartment: { type: "string", enum: ["業務銷售", "行銷", "IT資訊", "財務", "人資", "營運", "經營層", "其他", ""] },
    contactRole: { type: "string", enum: ["經濟買家", "決策者", "使用者", "技術把關者", "內部推薦人（Champion）", "影響者", ""] },
    additionalStakeholders: { type: "array", items: { type: "string" } },
    proposedSolution: { type: "string" },
    budgetConfirmed: { type: "string", enum: ["已確認", "估算中", "未提及", ""] },
    competitorMentioned: { type: "array", items: { type: "string" } },
    urgencyLevel: { type: "string", enum: ["高", "中", "低", "未知", ""] },
    sentimentTone: { type: "string", enum: ["積極正向", "中性觀望", "保留疑慮", "消極抗拒", ""] },
    riskFlags: { type: "array", items: { type: "string" } },
    keyQuotes: { type: "array", items: { type: "string" } },
    meetingSummary: { type: "string" },
  },
  required: ["company", "stage"],
} as const;

const SYSTEM = `你是 B2B 銷售會議的資訊抽取引擎。從逐字稿抽取結構化 CRM 欄位，用繁體中文回答。
規則：
- customerType：客戶是品牌／零售／產品公司→「品牌方」；是行銷/廣告/代理商→「行銷公司」；一般 B2B 企業、IT、採購、製造、SaaS 導入對象→「企業客戶」；無法判斷→空字串
- plan：談年度/長期合作→「年約方案」；談單一專案/檔期→「單次專案」；談 pilot/PoC/試行/樣品/NDA→「Pilot 試行」；談 ERP、資料管線、CRM/API/企業系統導入→「企業方案」；明確 standard tier→「標準方案」
- stage：初次接觸=lead；已進入需求訪談=meeting；已報價或準備提案=proposal；在談合約條件=negotiation
- decisionMaker：說明決策者是否出席（例：「未到場（總經理）」）
- budget：保留原始幣別與區間（例：「NT$1,200,000／年」）
- objections：客戶明確表達的疑慮，逐條列出
- probability：依 stage 給出 0–100 的成交機率（接觸 10、需求訪談 25、提案 55、談判 80、成交 100、流失 0）
- forecastCategory：lead/meeting=pipeline；proposal=best_case；negotiation=commit；won=closed；lost=omitted
- painPoints、successMetrics、decisionCriteria、competitors、procurementProcess：只抽取逐字稿明確提及的內容
- nextActions 與 followUpDate 要可執行；若有日期，expectedCloseDate 優先使用 ISO 日期
- painPoints：拆解客戶提到的具體痛點，條列 1-3 條（對應 MEDDIC Identify Pain）
- competitorMentioned：逐字稿提到的競品、既有供應商或比價對象；沒有提及就回傳空陣列，不要幻造
- decisionCriteria：客戶用來比較方案的標準（如價格、交期、品質、服務）
- contactRole：判斷窗口在採購中的角色（經濟買家／決策者／使用者／技術把關者／內部推薦人（Champion）／影響者），無法判斷留空字串
- contactDepartment：窗口所屬部門，無法判斷留空字串
- budgetConfirmed：預算是否已在對話中明確確認（已確認／估算中／未提及）
- sentimentTone：綜合客戶語氣判斷會議氛圍（積極正向／中性觀望／保留疑慮／消極抗拒）
- urgencyLevel：客戶是否表達明確的導入壓力或期限（高／中／低／未知）
- riskFlags：標記案件風險訊號，例如「無決策者出席」「預算未確認」「競品已在使用」，用繁中短句條列
- keyQuotes：摘錄逐字稿中 1-3 句客戶原話的關鍵句子（一字不改，供業務引用）
- meetingSummary：2-3 句話濃縮整場會議重點，供未參會同事快速掌握
- 逐字稿中沒有的資訊留空字串或空陣列，不要編造`;

export async function POST(req: NextRequest) {
  try {
    const { transcript, provider } = await req.json();
    const aiProvider = getAiProviderFromRequest(provider);
    const extraction = await chatJSONWithProvider(
      aiProvider,
      SYSTEM,
      `逐字稿：\n${transcript}`,
      "crm_extraction",
      SCHEMA,
    );
    return NextResponse.json({ extraction, provider: aiProvider });
  } catch (e) {
    console.error("extract 失敗，回退 demo 模式", e);
    return NextResponse.json({ demoMode: true });
  }
}
