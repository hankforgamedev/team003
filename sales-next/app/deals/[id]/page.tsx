"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, CalendarClock, CheckCircle2, CircleDollarSign, Mail, Mic, Phone, Quote, ShieldAlert, Sparkles, Target, UserRound, UsersRound } from "lucide-react";
import { useSales } from "@/lib/store";
import { fmtNT } from "@/lib/data/analytics";
import { Card, Chip, EmptyState, SectionTitle, StageBadge } from "@/components/ui";
import { STAGE_LABEL } from "@/lib/types";
import { dealForecast, dealHealth, dealLastActivity, dealNextStep, dealProbability, FORECAST_LABEL, PRIORITY_LABEL, weightedAmount } from "@/lib/crm";

export default function DealDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { deals, meetings, hydrated } = useSales();
  const d = deals.find((x) => x.id === id);

  if (!hydrated) return null;
  if (!d) return <EmptyState title="找不到這筆案件" action={<Link href="/deals" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">回案件列表</Link>} />;

  const dealMeetings = meetings.filter((m) => d.meetingIds.includes(m.id) || m.dealId === d.id).sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const latestNba = dealMeetings.find((m) => m.nba)?.nba;
  const probability = dealProbability(d);
  const health = dealHealth(d);
  const healthScore = { healthy: 88, attention: 55, risk: 22 }[health.value];
  const decisionCriteria = d.decisionCriteria?.length ? d.decisionCriteria : ["專案品質", "交付穩定性", "價格合理性"];
  const painPoints = d.painPoints?.length ? d.painPoints : [d.need];
  const competitorMentioned = d.competitorMentioned?.length ? d.competitorMentioned : d.competitors?.length ? d.competitors : [];
  const riskFlags = d.riskFlags ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/deals" className="mb-3 flex w-fit items-center gap-1 text-xs font-semibold text-muted hover:text-primary"><ArrowLeft size={13} /> 案件工作台</Link>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2.5"><h1 className="text-2xl font-black tracking-tight">{d.dealName ?? `${d.company}｜${d.plan}`}</h1><StageBadge stage={d.stage} /></div>
            <p className="mt-1 text-sm text-muted">{d.company} · {d.contact}（{d.role}）· 負責業務 {d.owner}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/meetings/new" className="rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-bold text-ink-2 transition hover:border-primary hover:text-primary">記錄新會議</Link>
            <button className="rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white">建立下一步任務</button>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          <HeroMetric label="案件金額" value={fmtNT(d.budget)} sub={`加權 ${fmtNT(weightedAmount(d))}`} icon={<CircleDollarSign size={18} />} />
          <HeroMetric label="成交機率" value={`${probability}%`} sub={FORECAST_LABEL[dealForecast(d)]} icon={<Target size={18} />} progress={probability} />
          <HeroMetric label="預計結案" value={d.expectedCloseDate ? dateLabel(d.expectedCloseDate) : d.timeline} sub={`優先級 ${PRIORITY_LABEL[d.priority ?? "medium"]}`} icon={<CalendarClock size={18} />} />
          <HeroMetric label="案件健康度" value={health.label} sub={health.reason} icon={<Sparkles size={18} />} tone={health.value} progress={healthScore} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.86fr_1.35fr_0.95fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle><span className="flex items-center gap-1.5"><Building2 size={15} className="text-primary" /> 公司資訊</span></SectionTitle>
            <div className="space-y-2.5 text-[13px]">
              <Row k="產業" v={d.industry ?? d.customerType} />
              <Row k="規模" v={d.companySize ?? d.employeeRange ?? "11–50 人"} />
              <Row k="年營收" v={d.annualRevenueRange} />
              <Row k="地區" v={d.location ?? "台灣"} />
              <Row k="ICP" v={d.icpTier ?? "Tier 2"} />
              <Row k="來源" v={d.leadSource ?? "主動開發"} />
              <Row k="類型" v={d.dealType ?? "新客開發"} />
              {(d.currentToolsInUse?.length ?? 0) > 0 && <Row k="現有工具" v={d.currentToolsInUse!.join("、")} />}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">{(d.tags ?? [d.customerType, d.plan]).map((tag) => <Chip key={tag} tone="blue">{tag}</Chip>)}</div>
          </Card>

          <Card>
            <SectionTitle><span className="flex items-center gap-1.5"><UserRound size={15} className="text-primary" /> 主要窗口</span></SectionTitle>
            <div className="rounded-xl bg-bg p-3">
              <div className="font-bold">{d.contact}</div><div className="text-xs text-muted">{d.role} · {d.preferredChannel ?? "會議"} 優先</div>
              <div className="mt-3 space-y-2 text-xs text-ink-2">
                <div className="flex items-center gap-2"><Mail size={13} className="text-muted" />{d.contactEmail ?? "尚未記錄 Email"}</div>
                <div className="flex items-center gap-2"><Phone size={13} className="text-muted" />{d.contactPhone ?? "尚未記錄電話"}</div>
              </div>
              {(d.contactDepartment || d.contactRole) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.contactDepartment && <Chip>{d.contactDepartment}</Chip>}
                  {d.contactRole && <Chip tone="blue">{d.contactRole}</Chip>}
                </div>
              )}
            </div>
            <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${d.decisionMakerMet ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}><UsersRound size={14} />{d.decisionMakerName ?? (d.decisionMakerMet ? "關鍵決策者已參與" : "關鍵決策者尚未參與")}</div>
            {(d.additionalStakeholders?.length ?? 0) > 0 && (
              <div className="mt-2.5 text-[11px] leading-relaxed text-muted">其他關係人：{d.additionalStakeholders!.join("、")}</div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="border-primary/20 bg-gradient-to-br from-white via-white to-primary-soft/40">
            <SectionTitle><span className="flex items-center gap-1.5"><Sparkles size={15} className="text-primary" /> 現在最重要的一步</span></SectionTitle>
            <div className="rounded-xl border border-primary/15 bg-white p-4">
              <div className="text-base font-black">{latestNba?.actions[0]?.title ?? dealNextStep(d)}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{latestNba?.actions[0]?.why ?? "依目前階段、異議與決策者參與狀態推導。完成後更新案件活動，AI 會重新計算優先順序。"}</p>
              <div className="mt-3 flex items-center justify-between"><span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">{latestNba?.actions[0]?.dueInDays ?? 3} 天內</span><span className="text-[11px] text-muted">依自家案件資料</span></div>
            </div>
            {latestNba && latestNba.actions.length > 1 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{latestNba.actions.slice(1, 3).map((a, i) => <div key={i} className="rounded-xl border border-line bg-white/70 p-3"><div className="text-xs font-bold">{a.title}</div><div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{a.why}</div></div>)}</div>}
          </Card>

          <Card>
            <SectionTitle right={<span className="text-[11px] text-muted">最後互動 {dateLabel(dealLastActivity(d))}</span>}>活動時間軸</SectionTitle>
            <ol className="relative ml-2 space-y-4 border-l-2 border-line pl-5">
              {dealMeetings.map((m) => <li key={m.id} className="relative"><span className="absolute -left-[27px] top-1 flex h-3.5 w-3.5 rounded-full border-[3px] border-white bg-primary" /><Link href={`/meetings/${m.id}`} className="block rounded-xl border border-line p-3 transition hover:border-primary/40 hover:bg-primary-soft/30"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold">{m.title}</div><div className="mt-1 text-[11px] text-muted">{m.summary[0]}</div></div><Mic size={14} className="shrink-0 text-primary" /></div><div className="num mt-2 text-[10px] text-muted">{dateLabel(m.date)} · {m.durationMin} 分鐘</div></Link></li>)}
              {d.stageHistory.map((e, i) => <li key={`${e.stage}-${i}`} className="relative"><span className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white ${e.stage === "won" ? "bg-good" : e.stage === "lost" ? "bg-bad" : "bg-[#aab6cb]"}`} /><div className="text-xs font-semibold">階段更新為「{STAGE_LABEL[e.stage]}」</div><div className="num mt-0.5 text-[10px] text-muted">{dateLabel(e.date)}</div></li>)}
            </ol>
            {!dealMeetings.length && <p className="text-sm text-muted">尚無會議紀錄。</p>}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="border-primary/25 bg-gradient-to-br from-white via-white to-primary-soft/40">
            <SectionTitle><span className="flex items-center gap-1.5"><Sparkles size={15} className="text-primary" /> AI 洞察</span></SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {d.urgencyLevel && <Chip tone={d.urgencyLevel === "高" ? "warn" : "neutral"}>急迫度：{d.urgencyLevel}</Chip>}
              {d.sentimentTone && <Chip tone="neutral">氛圍：{d.sentimentTone}</Chip>}
              {d.budgetConfirmed && <Chip tone="blue">預算：{d.budgetConfirmed}</Chip>}
            </div>
            {riskFlags.length > 0 && (
              <div className="mt-3 rounded-xl bg-warn-soft px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-warn"><ShieldAlert size={13} /> 風險警示</div>
                <ul className="mt-1.5 space-y-1 text-xs text-warn">{riskFlags.map((r, i) => <li key={i}>・{r}</li>)}</ul>
              </div>
            )}
            {d.meetingSummary && <p className="mt-3 text-xs leading-relaxed text-ink-2">{d.meetingSummary}</p>}
            {(d.keyQuotes?.length ?? 0) > 0 && (
              <div className="mt-3 space-y-1.5">
                {d.keyQuotes!.map((q, i) => (
                  <div key={i} className="flex gap-1.5 rounded-lg bg-bg px-2.5 py-2 text-xs italic text-ink-2">
                    <Quote size={12} className="mt-0.5 shrink-0 text-primary" /><span>{q}</span>
                  </div>
                ))}
              </div>
            )}
            {!riskFlags.length && !d.meetingSummary && !(d.keyQuotes?.length ?? 0) && !d.urgencyLevel && !d.sentimentTone && (
              <p className="mt-2 text-xs text-muted">此案件尚無 AI 抽取的洞察內容。</p>
            )}
          </Card>

          <Card>
            <SectionTitle><span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-primary" /> 資格判斷</span></SectionTitle>
            <Qualification label="需求與痛點" values={painPoints} done={Boolean(d.need)} />
            <Qualification label="預算" values={[fmtNT(d.budget)]} done={d.budget > 0} />
            <Qualification label="決策權" values={[d.decisionMakerName ?? (d.decisionMakerMet ? "決策者已參與" : "尚待確認決策者")]} done={d.decisionMakerMet} />
            <Qualification label="時程" values={[d.timeline]} done={!/未定|評估中/.test(d.timeline)} />
          </Card>

          <Card>
            <SectionTitle>商業脈絡</SectionTitle>
            {d.proposedSolution && <ListBlock label="提案方案" values={[d.proposedSolution]} />}
            <ListBlock label="決策標準" values={decisionCriteria} />
            <ListBlock label="主要異議" values={d.objections.length ? d.objections : ["目前無明確異議"]} />
            <ListBlock label="競品／替代方案" values={competitorMentioned.length ? competitorMentioned : ["尚未識別"]} />
            <ListBlock label="採購流程" values={[d.procurementProcess ?? "尚待確認"]} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function HeroMetric({ label, value, sub, icon, progress, tone }: { label: string; value: string; sub: string; icon: React.ReactNode; progress?: number; tone?: "healthy" | "attention" | "risk" }) {
  const color = tone === "risk" ? "text-bad" : tone === "attention" ? "text-warn" : tone === "healthy" ? "text-good" : "text-primary";
  const barColor = tone === "risk" ? "bg-bad" : tone === "attention" ? "bg-warn" : tone === "healthy" ? "bg-good" : "bg-primary";
  return <div className="p-4.5"><div className={`mb-2 flex items-center gap-2 text-xs font-semibold text-muted ${color}`}>{icon}<span className="text-muted">{label}</span></div><div className={`num text-xl font-black ${tone ? color : "text-ink"}`}>{value}</div><div className="mt-1 text-[11px] text-muted">{sub}</div>{progress != null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${barColor}`} style={{ width: `${progress}%` }} /></div>}</div>;
}

function Row({ k, v }: { k: string; v?: string }) { return <div className="flex items-baseline gap-3"><span className="w-14 shrink-0 text-xs text-muted">{k}</span><span className="min-w-0 font-medium">{v || "—"}</span></div>; }

function Qualification({ label, values, done }: { label: string; values: string[]; done: boolean }) { return <div className="flex gap-2.5 border-b border-line py-2.5 last:border-0"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${done ? "bg-good text-white" : "bg-warn-soft text-warn"}`}>{done ? "✓" : "!"}</span><div><div className="text-xs font-bold">{label}</div><div className="mt-0.5 text-[11px] leading-relaxed text-muted">{values.join("、")}</div></div></div>; }

function ListBlock({ label, values }: { label: string; values: string[] }) { return <div className="mb-3 last:mb-0"><div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{label}</div><div className="flex flex-wrap gap-1.5">{values.map((v, i) => <span key={`${v}-${i}`} className="rounded-lg bg-bg px-2.5 py-1.5 text-xs font-medium text-ink-2">{v}</span>)}</div></div>; }

function dateLabel(value: string) { return new Date(value).toLocaleDateString("zh-TW", { year: "numeric", month: "short", day: "numeric" }); }
