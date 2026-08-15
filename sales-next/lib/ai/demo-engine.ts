// Demo 備援引擎：沒有 OPENAI_API_KEY（或斷網）時，讓所有 AI 功能仍可完整運作。
// 任意貼上的逐字稿 → 規則式欄位抽取（正則＋關鍵字啟發）。
// （知識庫問答改由 @sales-next/knowledge-base 模組處理，離線檢索邏輯已移除。）

import { MeetingExtraction, Stage } from "@/lib/types";

export function heuristicExtract(raw: string): MeetingExtraction {
  const text = raw.replace(/\s+/g, " ");

  const company =
    text.match(/([一-龥A-Za-z0-9]{2,12}(?:股份有限公司|有限公司|公司|行銷|文創|生活|食品|家居|保養))/)?.[1] ?? "";

  const budgetMatch =
    text.match(/(?:預算|報價|金額)[^\d]{0,12}(\d+(?:\.\d+)?)\s*萬/) ?? text.match(/(\d{2,4})\s*萬/);
  const budget = budgetMatch ? `NT$${(parseFloat(budgetMatch[1]) * 10000).toLocaleString()}` : "未提及";

  const isPilot = /pilot|PoC|POC|試行|試用|樣品|NDA|demo/.test(text);
  const isEnterprisePlan = /ERP|CRM|HubSpot|Salesforce|data pipeline|GCP|AWS|API|SLA|managed|standard tier|進銷存/.test(text);
  const isAnnual = /年約|年度|全年|長期合作|team plan|月費|訂閱|半年/.test(text);
  const plan = isPilot
    ? "Pilot 試行"
    : isAnnual
        ? "年約方案"
        : /standard tier|標準/.test(text)
          ? "標準方案"
          : isEnterprisePlan
            ? "企業方案"
            : /專案|單次|檔期/.test(text)
              ? "單次專案"
              : "";

  const isAgency = /(行銷公司|代理商|整合行銷|廣告公司|外包|白牌)/.test(text);
  const isEnterprise = /(資訊部|採購|ERP|CRM|HubSpot|Salesforce|data pipeline|GCP|AWS|SaaS|企業|供應商|AVL|製造)/.test(text);
  const customerType = isAgency ? "行銷公司" : isEnterprise ? "企業客戶" : company ? "品牌方" : "";

  let stage: Stage = "meeting";
  if (/簽約|合約.*(準備|最終|細節)|拍板/.test(text)) stage = "negotiation";
  else if (/提案|報價|方案書|估價|pilot|樣品|NDA|AVL/.test(text)) stage = "proposal";

  const objections: string[] = [];
  if (/太趕|來不及|導入.{0,6}(時間|時程)|時程.{0,4}疑慮|旺季/.test(text)) objections.push("導入時間有疑慮");
  if (/(價格|報價|預算).{0,8}(高|超出|貴)/.test(text)) objections.push("價格高於預期");
  if (/比價|另外.{0,4}家|其他供應商/.test(text)) objections.push("內部還要比價");
  if (/預算.{0,6}(用完|明年|下季)/.test(text)) objections.push("預算要等下期");
  if (/資安|security|PII|保存位置|刪除政策|SOC 2|compliance/.test(text)) objections.push("資安審查待確認");

  const dmAbsent = /(總經理|老闆|創辦人|決策者|總監)[^。]{0,12}(不在|沒來|未出席|出差|董事會|沒參與|要.{0,3}核准|拍板)/.test(text);

  const contact = text.match(/(?:^|[\s，。])([一-龥]{2,3})(?:經理|總監|副理|專員|小姐|先生)/)?.[1] ?? "";
  const role = text.match(/(行銷經理|品牌經理|行銷總監|專案總監|業務總監|電商負責人|營運長|創辦人|總經理|資訊部|資訊主任|採購經理|財務經理|業務副總)/)?.[1] ?? "";

  const followUp = text.match(/(三天內|3 天內|一週後|下週[一二三四五]?|明天|兩週內)/)?.[1] ?? "一週內";

  const nextActions: string[] = [];
  if (/寄送|提供|整理.{0,6}(方案|提案|報價|合約|資料|案例|時程|文件|proposal|compliance)/.test(text)) nextActions.push("寄送承諾的方案／資料");
  if (dmAbsent) nextActions.push("邀請決策者參與下次會議");
  if (!nextActions.length) nextActions.push("安排下一次會議");

  const probability = ({ lead: 10, meeting: 25, proposal: 55, negotiation: 80, won: 100, lost: 0 } as const)[stage];
  const forecastCategory = stage === "negotiation" ? "commit" : stage === "proposal" ? "best_case" : "pipeline";

  // ---- CRM 欄位擴充：規則式抽取（無 API Key 時的離線備援，仍需涵蓋新欄位）----
  const painPointMatches = [...text.matchAll(/(?:最痛|痛點|問題是|困難是|不夠|量能不足|產能不足)[^，。]{0,20}/g)].map((m) => m[0]);
  const painPoints = [...new Set(painPointMatches)].slice(0, 3);

  const competitorMentioned: string[] = [];
  if (/既有供應商|工作室|比價|另外.{0,4}家/.test(text)) competitorMentioned.push("既有供應商／比價對象");

  const contactDepartment = /行銷|品牌/.test(text) ? "行銷" : /業務|銷售/.test(text) ? "業務銷售" : /IT|資訊系統|資訊部|security|data/.test(text) ? "IT資訊" : /採購|供應商|AVL/.test(text) ? "營運" : /財務|預算核准/.test(text) ? "財務" : /總經理|創辦人|執行長|副總/.test(text) ? "經營層" : "";
  const contactRole = /總經理|創辦人|拍板|副總/.test(text) ? "決策者" : /資訊部|security|IT/.test(text) ? "技術把關者" : /總監|champion/.test(text) ? "內部推薦人（Champion）" : /經理|負責人|採購/.test(text) ? "使用者" : "";

  const budgetConfirmed = /已確認|沒有問題|可以.{0,3}簽/.test(text) ? "已確認" : /核准|估算|大概|區間/.test(text) ? "估算中" : "未提及";

  const negativeCue = /抗拒|不考慮|沒興趣|太貴.{0,4}(不|沒)/.test(text);
  const cautiousCue = /疑慮|猶豫|再考慮|比較貴|要.{0,3}核准/.test(text);
  const sentimentTone = negativeCue ? "消極抗拒" : cautiousCue || objections.length ? "保留疑慮" : /認同|喜歡|沒問題|往簽約走/.test(text) ? "積極正向" : "中性觀望";

  const urgencyLevel = /來不及|太趕|急|馬上|盡快/.test(text) ? "高" : /下季|明年|之後再/.test(text) ? "低" : stage === "negotiation" || stage === "proposal" ? "中" : "未知";

  const riskFlags: string[] = [];
  if (dmAbsent) riskFlags.push("無決策者出席");
  if (budgetConfirmed === "未提及") riskFlags.push("預算未確認");
  if (competitorMentioned.length) riskFlags.push("競品已在評估中");

  const keyQuotes: string[] = [];
  const quoteMatch = text.match(/[「"]([^「」"]{6,40})[」"]/);
  if (quoteMatch) keyQuotes.push(quoteMatch[1]);

  return {
    company: company || "（未識別，請補充）",
    contact: contact || "（未識別）",
    role: role || "",
    customerType: customerType as MeetingExtraction["customerType"],
    plan: plan as MeetingExtraction["plan"],
    need: text.match(/(?:想做|需要|需求是|在準備|想找)([^，。]{4,24})/)?.[1] ?? "（請補充）",
    budget,
    stage,
    timeline: text.match(/([一二三四五六七八九十\d]+月[^，。]{0,10}(?:開跑|上市|啟動|上線))/)?.[1] ?? "未定",
    objections,
    decisionMaker: dmAbsent ? "未到場（需邀請）" : "已到場或未提及",
    nextActions,
    followUpDate: followUp,
    probability,
    forecastCategory,
    priority: /(?:預算|報價|金額)[^。]{0,12}(?:100|120|150|200)\s*萬/.test(text) ? "high" : "medium",
    painPoints: painPoints.length ? painPoints : text.match(/(?:最痛|痛點|問題是|困難是)([^，。]{3,28})/)?.[1]
      ? [text.match(/(?:最痛|痛點|問題是|困難是)([^，。]{3,28})/)![1]]
      : [],
    successMetrics: [],
    decisionCriteria: /交期|穩定/.test(text) ? ["交付穩定性"] : /價格|預算/.test(text) ? ["價格"] : [],
    competitors: /既有供應商|工作室|比價/.test(text) ? ["既有供應商／比價對象"] : [],
    procurementProcess: dmAbsent ? "需由決策者核准" : "未提及",
    preferredChannel: "會議",
    competitorMentioned,
    contactDepartment: contactDepartment as MeetingExtraction["contactDepartment"],
    contactRole: contactRole as MeetingExtraction["contactRole"],
    budgetConfirmed: budgetConfirmed as MeetingExtraction["budgetConfirmed"],
    sentimentTone: sentimentTone as MeetingExtraction["sentimentTone"],
    urgencyLevel: urgencyLevel as MeetingExtraction["urgencyLevel"],
    riskFlags,
    keyQuotes,
    meetingSummary: `${company || "客戶"}目前處於「${stageZh(stage)}」階段，需求為${text.match(/(?:想做|需要|需求是|在準備|想找)([^，。]{4,24})/)?.[1] ?? "尚待釐清"}，${dmAbsent ? "決策者尚未參與，需盡快安排" : "已與關鍵人接觸"}。`,
  };
}

function stageZh(s: string): string {
  return ({ lead: "接觸", meeting: "已約會議", proposal: "提案中", negotiation: "談判中", won: "成交", lost: "流失" } as Record<string, string>)[s] ?? s;
}
