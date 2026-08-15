"use client";

// 總覽：雙視角儀表板
// 業務視角 = 我的今日行動（NBA 待辦、近期會議、我的案件）
// 主管視角 = 漏斗、KPI、瓶頸、黃金客群洞察（對齊 mockup 的總覽頁）

import Link from "next/link";
import { ArrowRight, CalendarClock, Mic, Sparkles, Target } from "lucide-react";
import { useSales } from "@/lib/store";
import { bottleneck, fmtNT, fmtPct, funnel, kpis, monthlyTrend, segmentStats } from "@/lib/data/analytics";
import { Card, SectionTitle, StageBadge, StatTile, Chip } from "@/components/ui";
import { FunnelChart, TrendChart } from "@/components/charts";
import { STAGE_LABEL } from "@/lib/types";
import { LineDashboardCard } from "@/components/LineDashboardCard";

function delta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return (cur - prev) / prev;
}

export default function Dashboard() {
  const { deals, meetings, view } = useSales();
  const now = new Date();
  const f = funnel(deals);
  const k = kpis(deals, now);
  const bn = bottleneck(f);
  const segs = segmentStats(deals);
  const golden = segs[0];
  const trend = monthlyTrend(deals, now);

  const openShowcase = deals
    .filter((d) => d.stage !== "won" && d.stage !== "lost" && d.showcase)
    .slice(0, 5);
  const recentMeetings = meetings.slice(0, 4);

  return (
    <div className="flex flex-col gap-5">
      {/* 標題列 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">總覽</h1>
          <p className="mt-0.5 text-sm text-muted">
            {view === "rep" ? "你的下一步，AI 已經排好了" : "整體漏斗與客群洞察，一眼掌握"}
          </p>
        </div>
        <Link
          href="/meetings/new"
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-pop transition hover:brightness-110"
        >
          <Mic size={16} />
          開始新會議
        </Link>
      </div>

      {/* KPI 列 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          className="rise"
          label="本月新開發案件"
          value={k.newDeals30d.toLocaleString()}
          delta={delta(k.newDeals30d, k.newDealsPrev30d)}
          hint="vs 上月"
        />
        <StatTile
          className="rise rise-1"
          label="商機總額（進行中）"
          value={fmtNT(k.pipelineValue)}
          delta={delta(k.pipelineValue, k.pipelineValuePrev)}
          hint="vs 30 天前"
        />
        <StatTile
          className="rise rise-2"
          label="整體成交率"
          value={fmtPct(k.overallWinRate)}
          delta={delta(k.overallWinRate, k.overallWinRatePrev)}
          hint="近一季結案母體"
        />
        <StatTile
          className="rise rise-3"
          label="平均成交週期"
          value={k.avgCycleDays ? `${Math.round(k.avgCycleDays)} 天` : "—"}
          delta={
            k.avgCycleDays && k.avgCycleDaysPrev ? delta(k.avgCycleDays, k.avgCycleDaysPrev) : null
          }
          deltaGoodWhenUp={false}
          hint="越短越好"
        />
      </div>

      <LineDashboardCard />

      {view === "manager" ? (
        <>
          {/* 主管視角：漏斗＋AI 洞察 */}
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card className="rise rise-2">
              <SectionTitle
                right={
                  <Link href="/funnel" className="flex items-center gap-1 text-xs font-semibold text-primary">
                    查看完整分析 <ArrowRight size={13} />
                  </Link>
                }
              >
                銷售漏斗總覽（近 6 個月）
              </SectionTitle>
              <FunnelChart rows={f} highlightWorst />
            </Card>
            <Card className="rise rise-3 bg-primary-soft/35">
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <Sparkles size={15} className="text-primary" /> AI 洞察
                </span>
              </SectionTitle>
              <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-2">
                <p>
                  「{STAGE_LABEL[bn.from]} → {STAGE_LABEL[bn.to]}」的轉換率僅{" "}
                  <span className="num font-bold text-bad">{fmtPct(bn.conv)}</span>
                  ，是目前最大瓶頸，建議優先優化。
                </p>
                {golden && (
                  <p>
                    「{golden.customerType}＋{golden.plan}」是你的黃金客群：成交率{" "}
                    <span className="num font-bold text-good">{fmtPct(golden.winRate, 0)}</span>
                    、平均{" "}
                    <span className="num font-bold text-good">
                      {Math.round(golden.avgCycleDays ?? 0)} 天
                    </span>{" "}
                    成交，明顯優於其他組合。
                  </p>
                )}
                <p className="text-xs text-muted">以上洞察由 {deals.length.toLocaleString()} 筆案件即時計算。</p>
                <Link
                  href="/analytics"
                  className="mt-1 flex w-fit items-center gap-1 rounded-full border border-primary/30 px-3.5 py-1.5 text-xs font-bold text-primary transition hover:bg-primary-soft"
                >
                  查看黃金客群分析 <ArrowRight size={13} />
                </Link>
              </div>
            </Card>
          </div>

          <Card className="rise rise-4">
            <SectionTitle>近 6 個月動能</SectionTitle>
            <TrendChart data={trend} />
          </Card>
        </>
      ) : (
        <>
          {/* 業務視角：今日行動＋我的案件 */}
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Card className="rise rise-2">
              <SectionTitle
                right={
                  <Link href="/deals" className="flex items-center gap-1 text-xs font-semibold text-primary">
                    全部案件 <ArrowRight size={13} />
                  </Link>
                }
              >
                <span className="flex items-center gap-1.5">
                  <Target size={15} className="text-primary" /> 今日建議行動（Next Best Action）
                </span>
              </SectionTitle>
              <div className="flex flex-col divide-y divide-line">
                {meetings
                  .filter((m) => m.nba)
                  .slice(0, 3)
                  .flatMap((m) =>
                    (m.nba?.actions ?? []).slice(0, 2).map((a, i) => (
                      <Link
                        key={m.id + i}
                        href={`/meetings/${m.id}`}
                        className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                          {a.dueInDays}天
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink group-hover:text-primary">
                            {a.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {m.extraction?.company}｜{a.why}
                          </span>
                        </span>
                      </Link>
                    ))
                  )}
              </div>
            </Card>
            <Card className="rise rise-3">
              <SectionTitle
                right={
                  <Link href="/meetings" className="flex items-center gap-1 text-xs font-semibold text-primary">
                    全部 <ArrowRight size={13} />
                  </Link>
                }
              >
                <span className="flex items-center gap-1.5">
                  <CalendarClock size={15} className="text-primary" /> 最近會議
                </span>
              </SectionTitle>
              <div className="flex flex-col gap-2.5">
                {recentMeetings.map((m) => (
                  <Link
                    key={m.id}
                    href={`/meetings/${m.id}`}
                    className="rounded-xl border border-line px-3.5 py-2.5 transition hover:border-primary/40 hover:bg-primary-soft/40"
                  >
                    <div className="truncate text-[13px] font-semibold">{m.title}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {new Date(m.date).toLocaleDateString("zh-TW")}｜{m.durationMin} 分鐘
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          <Card className="rise rise-4">
            <SectionTitle>我的進行中案件</SectionTitle>
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="pb-2 font-medium">客戶</th>
                    <th className="pb-2 font-medium">類型／方案</th>
                    <th className="pb-2 font-medium">階段</th>
                    <th className="pb-2 font-medium text-right">預算</th>
                    <th className="pb-2 font-medium text-right">下次追蹤</th>
                  </tr>
                </thead>
                <tbody>
                  {openShowcase.map((d) => (
                    <tr key={d.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5">
                        <Link href={`/deals/${d.id}`} className="font-semibold hover:text-primary">
                          {d.company}
                        </Link>
                        <div className="text-xs text-muted">
                          {d.contact} {d.role}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-1.5">
                          <Chip tone="blue">{d.customerType}</Chip>
                          <Chip tone="purple">{d.plan}</Chip>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <StageBadge stage={d.stage} />
                      </td>
                      <td className="num py-2.5 text-right font-semibold">{fmtNT(d.budget)}</td>
                      <td className="num py-2.5 text-right text-xs text-muted">
                        {d.nextFollowUp ? new Date(d.nextFollowUp).toLocaleDateString("zh-TW") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
