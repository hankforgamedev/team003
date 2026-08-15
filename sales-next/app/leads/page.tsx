"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Brain,
  Building2,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Radar,
  SearchCheck,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useSales } from "@/lib/store";
import { Card, Chip, EmptyState, SectionTitle } from "@/components/ui";
import { STAGE_LABEL, type Deal, type Meeting } from "@/lib/types";
import type {
  LeadDiscoveryApiResponse,
  LeadDiscoveryKnowledgeRecord,
  PotentialLead,
} from "@/lib/lead/types";

interface CachedLeadRun {
  id: string;
  sourceCompany: string;
  geography: string;
  maxLeads: number;
  createdAt: string;
  response: LeadDiscoveryApiResponse;
}

const STORAGE_KEY = "sales-next-lead-discovery-runs-v1";

export default function LeadsPage() {
  const { deals, meetings, hydrated } = useSales();
  const companies = useMemo(() => listCompanies(deals, meetings), [deals, meetings]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [geography, setGeography] = useState("台灣");
  const [maxLeads, setMaxLeads] = useState(6);
  const [runs, setRuns] = useState<CachedLeadRun[]>([]);
  const [activeRun, setActiveRun] = useState<CachedLeadRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedCompany && companies[0]) setSelectedCompany(companies[0]);
  }, [companies, selectedCompany]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as CachedLeadRun[];
      const valid = Array.isArray(parsed) ? parsed : [];
      setRuns(valid);
      setActiveRun(valid[0] ?? null);
    } catch {
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    const latest = runs.find((run) => run.sourceCompany === selectedCompany);
    if (latest) {
      setActiveRun(latest);
      setGeography(latest.geography);
      setMaxLeads(latest.maxLeads);
    }
  }, [runs, selectedCompany]);

  const records = useMemo(
    () => buildKnowledgeRecords(selectedCompany, deals, meetings),
    [deals, meetings, selectedCompany]
  );
  const leads = useMemo(
    () =>
      [...(activeRun?.response.result.leads ?? [])].sort(
        (a, b) => b.fit_score - a.fit_score
      ),
    [activeRun]
  );
  const profile = activeRun?.response.knowledgeProfile;
  const selectedDeals = deals.filter((deal) => deal.company === selectedCompany);
  const selectedMeetings = meetings.filter((meeting) => meeting.extraction?.company === selectedCompany);

  async function runDiscovery() {
    if (!selectedCompany || records.length === 0) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/lead-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: selectedCompany,
          geography,
          maxLeads,
          records,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Lead Discovery 失敗");

      const nextRun: CachedLeadRun = {
        id: `lead-${Date.now()}`,
        sourceCompany: selectedCompany,
        geography,
        maxLeads,
        createdAt: new Date().toISOString(),
        response: payload as LeadDiscoveryApiResponse,
      };
      const nextRuns = [
        nextRun,
        ...runs.filter(
          (run) =>
            !(run.sourceCompany === selectedCompany && run.geography === geography)
        ),
      ].slice(0, 8);

      setRuns(nextRuns);
      setActiveRun(nextRun);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRuns));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lead Discovery 失敗");
    } finally {
      setLoading(false);
    }
  }

  function downloadJSON() {
    if (!activeRun) return;
    const blob = new Blob([JSON.stringify(activeRun.response.result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeRun.sourceCompany}_lead_discovery.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!hydrated) {
    return <div className="py-24 text-center text-sm text-muted">載入潛在客戶工作區…</div>;
  }

  if (!companies.length) {
    return (
      <EmptyState
        title="還沒有可探索的既有客戶"
        hint="先新增或載入一場會議，系統會用 CRM 與會議摘要建立基準客戶輪廓。"
        action={
          <Link href="/meetings/new" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">
            新增會議
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            <Radar size={13} /> Lead Discovery
          </div>
          <h1 className="text-2xl font-black tracking-tight">潛在客戶探索</h1>
          <p className="mt-1 text-sm text-muted">
            用既有客戶知識輪廓，研究公開公司訊號並產生下一批開發名單。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadJSON}
            disabled={!activeRun}
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink-2 transition hover:border-primary/40 hover:text-primary disabled:opacity-45"
          >
            <Download size={15} /> 下載 JSON
          </button>
          <button
            type="button"
            onClick={() => void runDiscovery()}
            disabled={loading || records.length === 0}
            className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <SearchCheck size={15} />}
            {loading ? "搜尋與評分中" : "搜尋潛在客戶"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="可作為基準的客戶" value={`${companies.length} 家`} hint="來自 CRM 與會議紀錄" />
        <Metric label="本客戶知識紀錄" value={`${records.length} 筆`} hint={`${selectedMeetings.length} 場會議 / ${selectedDeals.length} 筆案件`} />
        <Metric label="已產生名單" value={`${leads.length} 家`} hint={activeRun ? shortDateTime(activeRun.createdAt) : "尚未執行"} accent />
        <Metric label="公開來源" value={`${countSources(activeRun)} 個`} hint="排除 LinkedIn 自動爬取" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr_1fr] lg:items-end">
          <label className="text-xs font-bold text-muted">
            基準客戶
            <select
              value={selectedCompany}
              onChange={(event) => setSelectedCompany(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm font-bold text-ink outline-none transition focus:border-primary focus:bg-white"
            >
              {companies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-muted">
            目標市場
            <input
              value={geography}
              onChange={(event) => setGeography(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm font-bold text-ink outline-none transition focus:border-primary focus:bg-white"
            />
          </label>
          <label className="text-xs font-bold text-muted">
            最多輸出 {maxLeads} 家
            <input
              type="range"
              min={3}
              max={12}
              value={maxLeads}
              onChange={(event) => setMaxLeads(Number(event.target.value))}
              className="mt-3 w-full accent-primary"
            />
          </label>
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-bad/20 bg-bad-soft px-3 py-2 text-xs leading-relaxed text-bad">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-xs leading-relaxed text-muted">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-good" />
          僅使用公開公司級資訊與職缺訊號，不蒐集私人聯絡資料、履歷或會員限定內容。
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <Brain size={15} className="text-primary" /> 客戶知識輪廓
              </span>
            </SectionTitle>
            {profile ? (
              <ProfileView profile={profile} />
            ) : (
              <RecordPreview records={records} />
            )}
          </Card>

          <Card>
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <Target size={15} className="text-primary" /> 搜尋策略
              </span>
            </SectionTitle>
            {activeRun ? (
              <div className="space-y-2.5">
                {activeRun.response.searchPlan.map((query) => (
                  <div key={`${query.purpose}-${query.query}`} className="rounded-xl border border-line bg-bg px-3 py-2.5">
                    <div className="mb-1">
                      <PurposeChip value={query.purpose} />
                    </div>
                    <div className="text-[13px] font-semibold leading-relaxed text-ink-2">
                      {query.query}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-bg px-3 py-8 text-center text-sm text-muted">
                執行後會顯示 Look-alike、招聘訊號與成長訊號三組搜尋。
              </div>
            )}
          </Card>

          {runs.length > 0 && (
            <Card>
              <SectionTitle>Recent Runs</SectionTitle>
              <div className="space-y-2">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      setSelectedCompany(run.sourceCompany);
                      setActiveRun(run);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
                      activeRun?.id === run.id
                        ? "border-primary bg-primary-soft"
                        : "border-line bg-bg hover:border-primary/40"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-bold">{run.sourceCompany}</span>
                      <span className="text-xs text-muted">
                        {run.response.result.leads.length} 家 · {shortDateTime(run.createdAt)}
                      </span>
                    </span>
                    <ChevronRight size={15} className="text-muted" />
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <Building2 size={15} className="text-primary" /> Potential Leads
            </div>
            <div className="text-xs text-muted">
              {activeRun ? `${activeRun.geography} · ${leads.length} 家` : "尚未產生"}
            </div>
          </div>
          {loading ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
              <Loader2 size={28} className="animate-spin text-primary" />
              <div>
                <div className="text-sm font-black">建立輪廓 → 公開搜尋 → 去重評分</div>
                <div className="mt-1 text-xs text-muted">這一步會呼叫 OpenAI web_search，通常需要一點時間。</div>
              </div>
            </div>
          ) : leads.length ? (
            <div className="divide-y divide-line">
              {leads.map((lead, index) => (
                <LeadRow key={`${lead.company_name}-${index}`} lead={lead} rank={index + 1} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Radar size={22} />
              </div>
              <div className="mt-3 text-sm font-black">選一個既有客戶，產生潛在新客戶名單</div>
              <div className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
                名單會附上 fit score、公開訊號、建議切入角色與來源連結。
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function listCompanies(deals: Deal[], meetings: Meeting[]): string[] {
  const set = new Set<string>();
  for (const deal of deals) {
    if (deal.company) set.add(deal.company);
  }
  for (const meeting of meetings) {
    if (meeting.extraction?.company) set.add(meeting.extraction.company);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function buildKnowledgeRecords(
  company: string,
  deals: Deal[],
  meetings: Meeting[]
): LeadDiscoveryKnowledgeRecord[] {
  if (!company) return [];

  const meetingRecords = meetings
    .filter((meeting) => meeting.extraction?.company === company)
    .map((meeting) => {
      const extraction = meeting.extraction;
      return {
        id: `meeting:${meeting.id}`,
        source: "meeting" as const,
        company,
        date: meeting.date,
        contact: extraction?.contact,
        role: extraction?.role,
        customerType: extraction?.customerType,
        currentStage: extraction?.stage,
        need: extraction?.need,
        plan: extraction?.plan,
        budget: extraction?.budget,
        objections: extraction?.objections,
        decisionRoles: [extraction?.decisionMaker, extraction?.contactRole].filter(Boolean) as string[],
        nextActions: extraction?.nextActions,
        painPoints: extraction?.painPoints,
        successMetrics: extraction?.successMetrics,
        decisionCriteria: extraction?.decisionCriteria,
        industry: extraction?.industry,
        summary: meeting.summary,
        keyQuotes: extraction?.keyQuotes,
        meetingId: meeting.id,
      };
    });

  const dealRecords = deals
    .filter((deal) => deal.company === company)
    .map((deal) => ({
      id: `deal:${deal.id}`,
      source: "deal" as const,
      company,
      date: deal.createdAt,
      contact: deal.contact,
      role: deal.role,
      customerType: deal.customerType,
      currentStage: deal.stage,
      need: deal.need,
      plan: deal.plan,
      budget: deal.budget,
      objections: deal.objections,
      decisionRoles: [deal.decisionMakerName, deal.contactRole].filter(Boolean) as string[],
      nextActions: [deal.nextStep, deal.nextActivity].filter(Boolean) as string[],
      painPoints: deal.painPoints,
      successMetrics: deal.successMetrics,
      decisionCriteria: deal.decisionCriteria,
      industry: deal.industry,
      location: deal.location,
      summary: deal.meetingSummary ? [deal.meetingSummary] : undefined,
      keyQuotes: deal.keyQuotes,
      dealId: deal.id,
    }));

  return [...meetingRecords, ...dealRecords].slice(0, 20);
}

function Metric({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className={`card p-4 ${accent ? "border-primary/20 bg-gradient-to-br from-white to-primary-soft/55" : ""}`}>
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="num mt-1 text-2xl font-black text-ink">{value}</div>
      <div className="mt-1 text-[11px] text-muted">{hint}</div>
    </div>
  );
}

function RecordPreview({ records }: { records: LeadDiscoveryKnowledgeRecord[] }) {
  const needs = records.map((record) => record.need).filter(isPresent).slice(0, 4);
  const painPoints = records.flatMap((record) => record.painPoints ?? []).slice(0, 4);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="blue">{records.filter((record) => record.source === "meeting").length} 場會議</Chip>
        <Chip tone="purple">{records.filter((record) => record.source === "deal").length} 筆案件</Chip>
      </div>
      <PreviewList title="需求線索" items={needs.length ? needs : ["尚未有明確需求欄位"]} />
      <PreviewList title="痛點" items={painPoints.length ? painPoints : ["尚未有痛點欄位"]} />
    </div>
  );
}

function ProfileView({ profile }: { profile: NonNullable<CachedLeadRun["response"]["knowledgeProfile"]> }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {profile.customer_type && <Chip tone="blue">{profile.customer_type}</Chip>}
        {profile.current_stage && <Chip tone="warn">{stageLabel(profile.current_stage)}</Chip>}
      </div>
      <PreviewList title="相似客戶特徵" items={profile.lookalike_traits} />
      <PreviewList title="搜尋關鍵字" items={profile.search_keywords} />
      <PreviewList title="常見阻礙" items={profile.objections} />
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-bold text-muted">{title}</div>
      <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink-2">
        {items.slice(0, 5).map((item, index) => (
          <li key={`${title}-${index}`} className="rounded-lg bg-bg px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LeadRow({ lead, rank }: { lead: PotentialLead; rank: number }) {
  return (
    <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_112px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-black text-primary">
            {rank}
          </div>
          <h2 className="text-base font-black">{lead.company_name}</h2>
          {lead.website && (
            <a
              href={lead.website}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              官網 <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {lead.industry && <Chip>{lead.industry}</Chip>}
          {lead.location && <Chip>{lead.location}</Chip>}
          {lead.suggested_contact_role && <Chip tone="blue">{lead.suggested_contact_role}</Chip>}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{lead.why_match}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-bold text-muted">Signals</div>
            <ul className="space-y-1 text-[13px] leading-relaxed text-ink-2">
              {lead.signals.slice(0, 4).map((signal, index) => (
                <li key={index}>・{signal}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 text-xs font-bold text-muted">Recommended Next Action</div>
            <p className="text-[13px] leading-relaxed text-ink-2">{lead.recommended_next_action}</p>
          </div>
        </div>
        {lead.evidence.length > 0 && (
          <div className="mt-3 rounded-xl border border-line bg-bg p-3">
            <div className="mb-1.5 text-xs font-bold text-muted">Evidence / Sources</div>
            <div className="space-y-1.5">
              {lead.evidence.slice(0, 3).map((evidence) => (
                <a
                  key={evidence.url}
                  href={evidence.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs leading-relaxed text-primary hover:underline"
                >
                  {evidence.title}
                  <span className="text-muted"> — {evidence.reason}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex lg:justify-end">
        <div className="h-fit w-full rounded-xl border border-line bg-bg p-3 text-center lg:w-28">
          <div className="text-xs font-bold text-muted">Fit Score</div>
          <div className="num mt-1 text-3xl font-black text-primary">{lead.fit_score}</div>
          <div className="mt-1 text-xs font-bold text-ink-2">信心：{lead.confidence}</div>
        </div>
      </div>
    </div>
  );
}

function PurposeChip({ value }: { value: string }) {
  const label =
    value === "hiring_signal" ? "Hiring Signal" : value === "growth_signal" ? "Growth Signal" : "Look-alike";
  const tone = value === "hiring_signal" ? "warn" : value === "growth_signal" ? "purple" : "blue";
  return <Chip tone={tone}>{label}</Chip>;
}

function stageLabel(value: string) {
  return value in STAGE_LABEL ? STAGE_LABEL[value as keyof typeof STAGE_LABEL] : value;
}

function shortDateTime(value: string) {
  return new Date(value).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countSources(run: CachedLeadRun | null) {
  if (!run) return 0;
  return new Set(run.response.searchRuns.flatMap((item) => item.citations.map((citation) => citation.url))).size;
}

function isPresent(value: string | null | undefined): value is string {
  return Boolean(value);
}
