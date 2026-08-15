"use client";

// 分析報表：成交週期 × 客戶類型 × 方案 → 黃金客群（顧問方法論 Step 3 的產品化）

import { Star } from "lucide-react";
import { useSales } from "@/lib/store";
import { dmImpact, fmtNT, fmtPct, monthlyTrend, segmentStats } from "@/lib/data/analytics";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { HBar, TrendChart } from "@/components/charts";

export default function AnalyticsPage() {
  const { deals } = useSales();
  const segs = segmentStats(deals);
  const golden = segs[0];
  const dm = dmImpact(deals);
  const trend = monthlyTrend(deals, new Date());
  const maxCycle = Math.max(...segs.map((s) => s.avgCycleDays ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-black">分析報表</h1>
        <p className="mt-0.5 text-sm text-muted">成交週期與黃金客群——告訴團隊該把時間花在哪</p>
      </div>

      {/* 黃金客群 hero */}
      {golden && (
        <div className="rise overflow-hidden rounded-2xl bg-primary p-6 text-white shadow-pop">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <Star size={14} fill="currentColor" /> 黃金客群
          </div>
          <div className="mt-2 text-2xl font-black">
            {golden.customerType}＋{golden.plan}
          </div>
          <div className="mt-3 flex flex-wrap gap-6 text-sm">
            <span>
              成交率 <b className="num text-lg text-emerald-300">{fmtPct(golden.winRate, 0)}</b>
            </span>
            <span>
              平均成交週期 <b className="num text-lg text-emerald-300">{Math.round(golden.avgCycleDays ?? 0)} 天</b>
            </span>
            <span>
              平均客單 <b className="num text-lg text-emerald-300">{fmtNT(golden.avgBudget)}</b>
            </span>
          </div>
          <p className="mt-3 max-w-xl text-xs leading-relaxed text-white/70">
            資源有限時，優先開發此類客戶：同樣的業務時間，這個組合的期望回報最高。此洞察由{" "}
            {deals.length.toLocaleString()} 筆案件即時計算，每場新會議都會自動更新。
          </p>
        </div>
      )}

      {/* 四組合比較表 */}
      <Card className="rise rise-1 p-0">
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">客戶類型</th>
                <th className="px-3 py-3 font-medium">方案</th>
                <th className="px-3 py-3 font-medium text-right">案件數</th>
                <th className="px-3 py-3 font-medium text-right">平均成交週期</th>
                <th className="px-3 py-3 font-medium text-right">成交率</th>
                <th className="px-5 py-3 font-medium text-right">平均客單</th>
              </tr>
            </thead>
            <tbody>
              {segs.map((s, i) => (
                <tr
                  key={s.customerType + s.plan}
                  className={`border-b border-line/60 last:border-0 ${i === 0 ? "bg-amber-50/60" : ""}`}
                >
                  <td className="px-5 py-3">
                    <Chip tone="blue">{s.customerType}</Chip>
                  </td>
                  <td className="px-3 py-3">
                    <Chip tone="purple">{s.plan}</Chip>
                  </td>
                  <td className="num px-3 py-3 text-right">{s.total}</td>
                  <td className="num px-3 py-3 text-right font-semibold">
                    {s.avgCycleDays ? `${Math.round(s.avgCycleDays)} 天` : "—"}
                  </td>
                  <td className="num px-3 py-3 text-right font-semibold">
                    {fmtPct(s.winRate, 0)}
                    {i === 0 && <Star size={12} className="ml-1 inline text-amber-500" fill="currentColor" />}
                  </td>
                  <td className="num px-5 py-3 text-right">{fmtNT(s.avgBudget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          範例洞察：「{segs[0]?.customerType}＋{segs[0]?.plan}」通常{" "}
          {Math.round((segs[0]?.avgCycleDays ?? 21) / 7)} 週內可簽約；「
          {segs[segs.length - 1]?.customerType}＋{segs[segs.length - 1]?.plan}」則需要約{" "}
          {Math.round((segs[segs.length - 1]?.avgCycleDays ?? 92) / 30)} 個月。
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rise rise-2">
          <SectionTitle>成交週期比較（天，越短越好）</SectionTitle>
          <div className="space-y-3">
            {segs.map((s, i) => (
              <HBar
                key={i}
                label={`${s.customerType}・${s.plan}`}
                value={Math.round(s.avgCycleDays ?? 0)}
                max={maxCycle}
                color={s.customerType === "品牌方" ? "#003153" : "#727272"}
                fmt={(v) => `${v} 天`}
              />
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" /> 品牌方
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-series-2" /> 行銷公司
            </span>
          </div>
        </Card>

        <Card className="rise rise-3">
          <SectionTitle>決策者參與 × 成交率</SectionTitle>
          <div className="space-y-3">
            <HBar label="決策者曾參與會議" value={Math.round(dm.withDm * 100)} max={100} color="#246b50" fmt={(v) => `${v}%`} />
            <HBar label="決策者未參與" value={Math.round(dm.withoutDm * 100)} max={100} color="#999999" fmt={(v) => `${v}%`} />
          </div>
          <p className="mt-4 rounded-lg bg-bg px-3 py-2.5 text-xs leading-relaxed text-ink-2">
            這就是 AI 建議「邀請決策者參與下次會議」的資料依據——Next Best Action
            的每一條建議都能追溯到這樣的自家數據。
          </p>
        </Card>
      </div>

      <Card className="rise rise-4">
        <SectionTitle>近 6 個月動能</SectionTitle>
        <TrendChart data={trend} />
      </Card>
    </div>
  );
}
