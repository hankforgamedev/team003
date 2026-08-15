export type SearchPurpose = "lookalike" | "hiring_signal" | "growth_signal";

export interface LeadDiscoveryKnowledgeRecord {
  id: string;
  source: "meeting" | "deal";
  company: string;
  date?: string;
  contact?: string;
  role?: string;
  customerType?: string;
  currentStage?: string;
  need?: string;
  plan?: string;
  budget?: string | number;
  objections?: string[];
  decisionRoles?: string[];
  nextActions?: string[];
  painPoints?: string[];
  successMetrics?: string[];
  decisionCriteria?: string[];
  industry?: string;
  location?: string;
  summary?: string[];
  keyQuotes?: string[];
  meetingId?: string;
  dealId?: string;
}

export interface KnowledgeProfile {
  company: string | null;
  customer_type: string | null;
  current_stage: string | null;
  needs: string[];
  plans: string[];
  budget_signals: string[];
  objections: string[];
  decision_roles: string[];
  lookalike_traits: string[];
  search_keywords: string[];
}

export interface LeadSearchQuery {
  query: string;
  purpose: SearchPurpose;
}

export interface WebCitation {
  title: string;
  url: string;
}

export interface PublicLeadSearchRun {
  query: string;
  purpose: SearchPurpose;
  text: string;
  citations: WebCitation[];
}

export interface LeadEvidence {
  title: string;
  url: string;
  reason: string;
}

export interface PotentialLead {
  company_name: string;
  website: string | null;
  industry: string | null;
  location: string | null;
  fit_score: number;
  confidence: "高" | "中" | "低";
  why_match: string;
  signals: string[];
  suggested_contact_role: string | null;
  recommended_next_action: string;
  evidence: LeadEvidence[];
}

export interface LeadDiscoveryResult {
  source_company: string | null;
  generated_at: string;
  knowledge_profile: KnowledgeProfile;
  search_queries: LeadSearchQuery[];
  leads: PotentialLead[];
}

export interface LeadDiscoveryApiResponse {
  knowledgeProfile: KnowledgeProfile;
  searchPlan: LeadSearchQuery[];
  searchRuns: PublicLeadSearchRun[];
  result: LeadDiscoveryResult;
}

export const KNOWLEDGE_PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    company: { type: ["string", "null"] },
    customer_type: { type: ["string", "null"] },
    current_stage: { type: ["string", "null"] },
    needs: { type: "array", items: { type: "string" } },
    plans: { type: "array", items: { type: "string" } },
    budget_signals: { type: "array", items: { type: "string" } },
    objections: { type: "array", items: { type: "string" } },
    decision_roles: { type: "array", items: { type: "string" } },
    lookalike_traits: { type: "array", items: { type: "string" } },
    search_keywords: { type: "array", items: { type: "string" } },
  },
  required: [
    "company",
    "customer_type",
    "current_stage",
    "needs",
    "plans",
    "budget_signals",
    "objections",
    "decision_roles",
    "lookalike_traits",
    "search_keywords",
  ],
} as const;

export const SEARCH_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    queries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string" },
          purpose: { type: "string", enum: ["lookalike", "hiring_signal", "growth_signal"] },
        },
        required: ["query", "purpose"],
      },
    },
  },
  required: ["queries"],
} as const;

export const LEAD_DISCOVERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    source_company: { type: ["string", "null"] },
    generated_at: { type: "string" },
    knowledge_profile: KNOWLEDGE_PROFILE_SCHEMA,
    search_queries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string" },
          purpose: { type: "string", enum: ["lookalike", "hiring_signal", "growth_signal"] },
        },
        required: ["query", "purpose"],
      },
    },
    leads: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company_name: { type: "string" },
          website: { type: ["string", "null"] },
          industry: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          fit_score: { type: "integer" },
          confidence: { type: "string", enum: ["高", "中", "低"] },
          why_match: { type: "string" },
          signals: { type: "array", items: { type: "string" } },
          suggested_contact_role: { type: ["string", "null"] },
          recommended_next_action: { type: "string" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                reason: { type: "string" },
              },
              required: ["title", "url", "reason"],
            },
          },
        },
        required: [
          "company_name",
          "website",
          "industry",
          "location",
          "fit_score",
          "confidence",
          "why_match",
          "signals",
          "suggested_contact_role",
          "recommended_next_action",
          "evidence",
        ],
      },
    },
  },
  required: ["source_company", "generated_at", "knowledge_profile", "search_queries", "leads"],
} as const;
