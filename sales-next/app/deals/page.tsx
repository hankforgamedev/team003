"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { useSales } from "@/lib/store";
import { fmtNT } from "@/lib/data/analytics";
import { Card, StageBadge } from "@/components/ui";
import { CustomerType, DealHealth, PlanType, Stage, STAGE_LABEL } from "@/lib/types";
import { dealForecast, dealHealth, dealNextStep, dealProbability, FORECAST_LABEL, weightedAmount } from "@/lib/crm";

const STAGE_FILTERS: (Stage | "all" | "open")[] = ["open", "all", "lead", "meeting", "proposal", "negotiation", "won", "lost"];

export default function DealsPage() {
  const { deals } = useSales();
  const [stageFilter, setStageFilter] = useState<Stage | "all" | "open">("open");
  const [typeFilter, setTypeFilter] = useState<CustomerType | "all">("all");
  const [planFilter, setPlanFilter] = useState<PlanType | "all">("all");
  const [healthFilter, setHealthFilter] = useState<DealHealth | "all">("all");
  const [query, setQuery] = useState("");
  const typeOptions = useMemo(() => ["all", ...Array.from(new Set(deals.map((d) => d.customerType)))] as const, [deals]);
  const planOptions = useMemo(() => ["all", ...Array.from(new Set(deals.map((d) => d.plan)))] as const, [deals]);

  const matched = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return deals
      .filter((d) => {
        if (stageFilter === "open") return d.stage !== "won" && d.stage !== "lost";
        if (stageFilter !== "all") return d.stage === stageFilter;
        return true;
      })
      .filter((d) => typeFilter === "all" || d.customerType === typeFilter)
      .filter((d) => planFilter === "all" || d.plan === planFilter)
      .filter((d) => healthFilter === "all" || dealHealth(d).value === healthFilter)
      .filter(
        (d) =>
          !normalized ||
          [
            d.company,
            d.contact,
            d.role,
            d.need,
            d.owner,
            d.industry,
            d.contactDepartment,
            d.contactRole,
            ...(d.additionalStakeholders ?? []),
            ...(d.tags ?? []),
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalized)
      )
      .sort((a, b) => (b.showcase ? 1 : 0) - (a.showcase ? 1 : 0) || +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [deals, stageFilter, typeFilter, planFilter, healthFilter, query]);

  const filtered = matched.slice(0, 60);
  const totalValue = matched.reduce((a, d) => a + d.budget, 0);
  const weighted = matched.reduce((a, d) => a + weightedAmount(d), 0);
  const atRisk = matched.filter((d) => dealHealth(d).value === "risk").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            <Sparkles size={13} /> AI CRM
          </div>
          <h1 className="text-2xl font-black tracking-tight">案件工作台</h1>
          <p className="mt-1 text-sm text-muted">把逐字稿轉成可預測、可追蹤、能採取行動的銷售管線。</p>
        </div>
        <Link href="/meetings/new" className="w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110">
          ＋ 新增會議
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="符合篩選案件" value={`${matched.length} 筆`} hint={`管線總額 ${fmtNT(totalValue)}`} />
        <Metric label="加權預估營收" value={fmtNT(weighted)} hint="依目前階段成交機率" accent />
        <Metric label="需要立即處理" value={`${atRisk} 筆`} hint="逾期或缺少關鍵決策者" danger={atRisk > 0} />
      </div>

      <Card className="p-3.5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1 xl:max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋公司、窗口、需求或負責人"
              className="w-full rounded-xl border border-line bg-bg py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white"
            />
          </label>
          <div className="scroll-slim flex items-center gap-1 overflow-x-auto rounded-xl border border-line bg-bg p-1 text-xs">
            {STAGE_FILTERS.map((s) => (
              <button key={s} onClick={() => setStageFilter(s)} className={`shrink-0 rounded-lg px-3 py-1.5 font-semibold transition ${stageFilter === s ? "bg-white text-primary shadow-sm" : "text-ink-2 hover:text-primary"}`}>
                {s === "all" ? "全部" : s === "open" ? "進行中" : STAGE_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SlidersHorizontal size={14} className="text-muted" />
            <Select
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as CustomerType | "all")}
              options={typeOptions.map((v) => (v === "all" ? "全部類型" : v))}
              values={[...typeOptions]}
            />
            <Select
              value={planFilter}
              onChange={(v) => setPlanFilter(v as PlanType | "all")}
              options={planOptions.map((v) => (v === "all" ? "全部方案" : v))}
              values={[...planOptions]}
            />
            <Select value={healthFilter} onChange={(v) => setHealthFilter(v as DealHealth | "all")} options={["全部健康度", "進展正常", "需要關注", "高風險"]} values={["all", "healthy", "attention", "risk"]} />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="text-sm font-bold">銷售管線</div>
          <div className="text-xs text-muted">顯示 {Math.min(matched.length, 60)} / {matched.length} 筆</div>
        </div>
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-line bg-bg text-left text-[11px] font-bold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">公司與窗口</th>
                <th className="px-3 py-3">案件</th>
                <th className="px-3 py-3">階段／預測</th>
                <th className="px-3 py-3 text-right">金額／加權</th>
                <th className="px-3 py-3">下一步</th>
                <th className="px-3 py-3">下次活動</th>
                <th className="px-3 py-3">健康度</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const health = dealHealth(d);
                const probability = dealProbability(d);
                return (
                  <tr key={d.id} className="group border-b border-line/70 align-top transition last:border-0 hover:bg-primary-soft/25">
                    <td className="px-5 py-3.5">
                      <Link href={`/deals/${d.id}`} className="font-bold text-ink hover:text-primary">
                        {d.company}{d.showcase && <span className="ml-1.5 text-[10px] text-primary">●</span>}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">{d.contact}・{d.role}</div>
                      <div className="mt-1 text-[10px] font-semibold text-ink-2">{d.industry ?? d.customerType} · {d.icpTier ?? "Tier 2"}{d.companySize ? ` · ${d.companySize} 人` : ""}</div>
                    </td>
                    <td className="max-w-[180px] px-3 py-3.5">
                      <div className="truncate text-xs font-semibold">{d.dealName ?? `${d.company}｜${d.plan}`}</div>
                      <div className="mt-1 flex gap-1 text-[10px] text-muted"><span>{d.dealType ?? "新客開發"}</span><span>·</span><span>{d.owner}</span></div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2"><StageBadge stage={d.stage} /><span className="num text-xs font-bold text-ink-2">{probability}%</span></div>
                      <div className="mt-1.5 text-[10px] font-semibold text-muted">{FORECAST_LABEL[dealForecast(d)]}</div>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <div className="num font-bold">{fmtNT(d.budget)}</div>
                      <div className="num mt-0.5 text-[10px] text-muted">加權 {fmtNT(weightedAmount(d))}</div>
                    </td>
                    <td className="max-w-[220px] px-3 py-3.5">
                      <div className="line-clamp-2 text-xs font-medium leading-relaxed text-ink-2">{dealNextStep(d)}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold"><CalendarDays size={13} className="text-primary" />{d.nextActivity ?? "追蹤"}</div>
                      <div className="num mt-1 text-[10px] text-muted">{d.nextFollowUp ? shortDate(d.nextFollowUp) : "尚未安排"}</div>
                    </td>
                    <td className="px-3 py-3.5"><HealthBadge value={health.value} label={health.label} reason={health.reason} /></td>
                    <td className="px-3 py-4"><ChevronRight size={16} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && <div className="px-6 py-16 text-center text-sm text-muted">找不到符合條件的案件，試著放寬篩選。</div>}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value, hint, accent, danger }: { label: string; value: string; hint: string; accent?: boolean; danger?: boolean }) {
  return <div className={`card p-4 ${accent ? "border-primary/20 bg-primary-soft/40" : ""}`}><div className="text-xs font-semibold text-muted">{label}</div><div className={`num mt-1 text-2xl font-black ${danger ? "text-bad" : "text-ink"}`}>{value}</div><div className="mt-1 text-[11px] text-muted">{hint}</div></div>;
}

function Select({ value, onChange, options, values }: { value: string; onChange: (value: string) => void; options: string[]; values: string[] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-line bg-white px-2.5 py-2 font-semibold outline-none focus:border-primary">{options.map((label, i) => <option key={values[i]} value={values[i]}>{label}</option>)}</select>;
}

function HealthBadge({ value, label, reason }: { value: DealHealth; label: string; reason: string }) {
  const style = value === "healthy" ? "bg-good-soft text-good" : value === "attention" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad";
  return <div title={reason}><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${style}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span><div className="mt-1 max-w-[130px] truncate text-[10px] text-muted">{reason}</div></div>;
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}
