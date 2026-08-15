import { NextRequest, NextResponse } from "next/server";
import {
  KNOWLEDGE_PROFILE_SCHEMA,
  LEAD_DISCOVERY_SCHEMA,
  SEARCH_PLAN_SCHEMA,
  type KnowledgeProfile,
  type LeadDiscoveryKnowledgeRecord,
  type LeadDiscoveryResult,
  type LeadSearchQuery,
  type PublicLeadSearchRun,
  type SearchPurpose,
  type WebCitation,
} from "@/lib/lead/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const API = "https://api.openai.com/v1";

type JsonObject = Record<string, unknown>;

function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function modelChain(): string[] {
  return Array.from(
    new Set([process.env.OPENAI_MODEL || "gpt-5.6-terra", "gpt-5.6", "gpt-5-mini", "gpt-4o-mini"])
  );
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getOutputText(data: unknown): string {
  if (isRecord(data) && typeof data.output_text === "string") return data.output_text.trim();

  const chunks: string[] = [];
  const output = isRecord(data) && Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      const type = String(content.type ?? "");
      if ((type === "output_text" || type === "text") && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("").trim();
}

function parseJSON<T>(data: unknown): T {
  const text = getOutputText(data);
  if (!text) throw new Error("OpenAI 沒有回傳文字內容");
  return JSON.parse(text) as T;
}

async function createResponse(body: JsonObject): Promise<unknown> {
  let lastError = "";

  for (const model of modelChain()) {
    const res = await fetch(`${API}/responses`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...body, model }),
    });

    if (res.ok) return res.json();

    const text = await res.text();
    lastError = `OpenAI ${res.status}: ${text}`;
    if (![400, 403, 404].includes(res.status)) break;
  }

  throw new Error(lastError || "OpenAI Responses API 呼叫失敗");
}

async function responsesJSON<T>(
  system: string,
  user: string,
  schemaName: string,
  schema: object
): Promise<T> {
  const data = await createResponse({
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema,
      },
    },
    store: false,
  });

  return parseJSON<T>(data);
}

function extractWebCitations(data: unknown): WebCitation[] {
  const seen = new Set<string>();
  const citations: WebCitation[] = [];
  const output = isRecord(data) && Array.isArray(data.output) ? data.output : [];

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content) || !Array.isArray(content.annotations)) continue;
      for (const annotation of content.annotations) {
        if (!isRecord(annotation) || annotation.type !== "url_citation") continue;

        const nested = isRecord(annotation.url_citation) ? annotation.url_citation : {};
        const url = String(annotation.url ?? nested.url ?? "").trim();
        const title = String(annotation.title ?? nested.title ?? url).trim();

        if (!url || seen.has(url) || url.toLowerCase().includes("linkedin.com")) continue;
        seen.add(url);
        citations.push({ title, url });
      }
    }
  }

  return citations;
}

function cleanRecords(records: unknown): LeadDiscoveryKnowledgeRecord[] {
  if (!Array.isArray(records)) return [];
  return records
    .filter(isRecord)
    .map((record): LeadDiscoveryKnowledgeRecord => ({
      id: String(record.id ?? ""),
      source: record.source === "deal" ? "deal" : "meeting",
      company: String(record.company ?? "").trim(),
      date: typeof record.date === "string" ? record.date : undefined,
      contact: typeof record.contact === "string" ? record.contact : undefined,
      role: typeof record.role === "string" ? record.role : undefined,
      customerType: typeof record.customerType === "string" ? record.customerType : undefined,
      currentStage: typeof record.currentStage === "string" ? record.currentStage : undefined,
      need: typeof record.need === "string" ? record.need : undefined,
      plan: typeof record.plan === "string" ? record.plan : undefined,
      budget:
        typeof record.budget === "string" || typeof record.budget === "number"
          ? record.budget
          : undefined,
      objections: Array.isArray(record.objections) ? record.objections.map(String) : undefined,
      decisionRoles: Array.isArray(record.decisionRoles) ? record.decisionRoles.map(String) : undefined,
      nextActions: Array.isArray(record.nextActions) ? record.nextActions.map(String) : undefined,
      painPoints: Array.isArray(record.painPoints) ? record.painPoints.map(String) : undefined,
      successMetrics: Array.isArray(record.successMetrics) ? record.successMetrics.map(String) : undefined,
      decisionCriteria: Array.isArray(record.decisionCriteria)
        ? record.decisionCriteria.map(String)
        : undefined,
      industry: typeof record.industry === "string" ? record.industry : undefined,
      location: typeof record.location === "string" ? record.location : undefined,
      summary: Array.isArray(record.summary) ? record.summary.map(String) : undefined,
      keyQuotes: Array.isArray(record.keyQuotes) ? record.keyQuotes.map(String) : undefined,
      meetingId: typeof record.meetingId === "string" ? record.meetingId : undefined,
      dealId: typeof record.dealId === "string" ? record.dealId : undefined,
    }))
    .filter((record) => record.id && record.company)
    .slice(0, 20);
}

async function summarizeCompanyKnowledge(
  company: string,
  records: LeadDiscoveryKnowledgeRecord[]
): Promise<KnowledgeProfile> {
  return responsesJSON<KnowledgeProfile>(
    `你是 B2B Sales Knowledge Analyst。
請把同一家公司歷次 CRM / Meeting records 統整成可用於尋找相似潛在客戶的客戶輪廓。

規則：
1. 只能根據提供資料整理，不可補造。
2. lookalike_traits 應描述「什麼樣的其他公司可能有相似需求」，不要包含私人個資。
3. search_keywords 應適合搜尋公開公司網站、新聞、產業資訊與公開職缺訊號。
4. 不要尋找、推斷或輸出私人電話、私人 Email、住址等個人資料。
5. 使用繁體中文。`,
    JSON.stringify({ company, records }, null, 2),
    "company_knowledge_profile",
    KNOWLEDGE_PROFILE_SCHEMA
  );
}

async function generateLeadSearchPlan(
  knowledgeProfile: KnowledgeProfile,
  geography: string
): Promise<LeadSearchQuery[]> {
  const payload = await responsesJSON<{ queries: LeadSearchQuery[] }>(
    `你是 B2B Lead Research Planner。
根據既有客戶 Knowledge Profile，產生 3 個互補的公開網路搜尋查詢：

1. lookalike：尋找產業、商業模式、需求情境相似的公司。
2. hiring_signal：利用公開職缺作為成長、擴編、數位轉型、海外拓展或特定能力需求的公司級訊號。
3. growth_signal：利用公司官網、新聞、政府／協會／產業公開資訊尋找擴產、投資、新市場、新產品等訊號。

地理範圍：${geography}

重要：
- 目標是「公司級潛在客戶」，不是求職者或個人名單。
- 不得要求私人聯絡資訊或履歷資料。
- 不要把 LinkedIn 自動爬取設計成搜尋策略。
- 查詢要短、可直接交給 Web Search。`,
    JSON.stringify(knowledgeProfile, null, 2),
    "lead_search_plan",
    SEARCH_PLAN_SCHEMA
  );

  return payload.queries.slice(0, 3);
}

async function runPublicLeadSearch(
  query: string,
  purpose: SearchPurpose,
  geography: string
): Promise<PublicLeadSearchRun> {
  const sourceGuidance: Record<SearchPurpose, string> = {
    lookalike: "優先尋找公司官網、產品頁、公開新聞、產業協會、政府／公開企業資料。",
    hiring_signal:
      "把公開職缺當作公司級商業訊號，例如擴編、海外業務、數位轉型、新廠、新產品、CRM／行銷／供應鏈能力需求。可參考公開人力銀行職缺頁，但不要取得履歷、求職者個資或會員限定內容。",
    growth_signal:
      "優先尋找擴廠、投資、新市場、海外拓展、新產品、策略合作、招募成長等公開訊號。",
  };

  const data = await createResponse({
    input: [
      {
        role: "system",
        content: `你是 B2B Public-Web Lead Research Agent。

只研究公開可存取、公司級的商業資訊。
不得蒐集或輸出私人電話、私人 Email、住址、履歷內容或其他非必要個人資料。
不要自動爬取 LinkedIn，也不要繞過登入、robots、CAPTCHA、rate limit 或其他存取控制。
若資料來自公開職缺，只把它當成「公司成長／需求訊號」，不要分析求職者。
每個候選公司都要有可驗證的公開來源。`,
      },
      {
        role: "user",
        content: `地理範圍：${geography}
搜尋目的：${purpose}
來源偏好：${sourceGuidance[purpose]}

搜尋查詢：
${query}

請找出可能值得 B2B 業務開發的公司，並用繁體中文簡短說明：
- 公司名稱
- 公開訊號
- 為何值得進一步研究
- 來源依據

不要列個人聯絡資料。`,
      },
    ],
    reasoning: { effort: "low" },
    tools: [{ type: "web_search", search_context_size: "medium" }],
    store: false,
  });

  return {
    query,
    purpose,
    text: getOutputText(data),
    citations: extractWebCitations(data),
  };
}

async function normalizeLeadDiscovery(
  sourceCompany: string,
  knowledgeProfile: KnowledgeProfile,
  searchPlan: LeadSearchQuery[],
  searchRuns: PublicLeadSearchRun[],
  maxLeads: number
): Promise<LeadDiscoveryResult> {
  const sourceCatalog = Array.from(
    new Map(searchRuns.flatMap((run) => run.citations).map((citation) => [citation.url, citation])).values()
  );

  return responsesJSON<LeadDiscoveryResult>(
    `你是 B2B Lead Qualification Analyst。

根據：
1. 既有客戶 Knowledge Profile
2. 公開 Web Search 的研究摘要
3. 實際 source catalog URL

選出最多 ${maxLeads} 家公司級潛在新客戶。

評分 fit_score 0-100：
- 與既有客戶需求／產業情境相似度
- 是否存在具體公開成長、招聘、擴產、轉型或市場訊號
- 是否有合理的 B2B 切入點
- 證據品質

規則：
- 不要建立或推測個人私人聯絡資料。
- suggested_contact_role 只能是職務類型，例如「採購經理」「業務營運主管」「行銷主管」。
- evidence.url 必須只能使用 source catalog 中提供的 URL，不可自行捏造 URL。
- 若證據不足就降低 confidence / fit_score，不可硬湊。
- 排除 LinkedIn URL。
- 使用繁體中文。`,
    JSON.stringify(
      {
        source_company: sourceCompany,
        knowledge_profile: knowledgeProfile,
        search_plan: searchPlan,
        search_runs: searchRuns,
        source_catalog: sourceCatalog,
      },
      null,
      2
    ),
    "lead_discovery_result",
    LEAD_DISCOVERY_SCHEMA
  );
}

function clampMaxLeads(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 6;
  return Math.max(3, Math.min(12, Math.round(parsed)));
}

export async function POST(req: NextRequest) {
  try {
    if (!hasOpenAiKey()) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY 未設定，Lead Discovery 需要 OpenAI web_search。" },
        { status: 503 }
      );
    }

    const body = await req.json();
    const company = String(body.company ?? "").trim();
    const geography = String(body.geography ?? "台灣").trim() || "台灣";
    const maxLeads = clampMaxLeads(body.maxLeads);
    const records = cleanRecords(body.records);

    if (!company || records.length === 0) {
      return NextResponse.json({ error: "缺少可用的公司知識紀錄。" }, { status: 400 });
    }

    const knowledgeProfile = await summarizeCompanyKnowledge(company, records);
    const searchPlan = await generateLeadSearchPlan(knowledgeProfile, geography);
    const searchRuns: PublicLeadSearchRun[] = [];

    for (const item of searchPlan) {
      searchRuns.push(await runPublicLeadSearch(item.query, item.purpose, geography));
    }

    const result = await normalizeLeadDiscovery(
      company,
      knowledgeProfile,
      searchPlan,
      searchRuns,
      maxLeads
    );

    return NextResponse.json({ knowledgeProfile, searchPlan, searchRuns, result });
  } catch (error) {
    console.error("lead discovery failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead Discovery 失敗" },
      { status: 500 }
    );
  }
}
