// 分析引擎：所有儀表板數字一律從案件資料「推導」，不存任何寫死的統計值。
// 這保證 funnel、轉換率、成交週期、黃金客群之間永遠互相吻合。

import { CustomerType, Deal, PlanType, Stage, STAGE_ORDER } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

export function reachedStage(deal: Deal, stage: Stage): boolean {
  return deal.stageHistory.some((e) => e.stage === stage);
}

function stageDate(deal: Deal, stage: Stage): number | null {
  const e = deal.stageHistory.find((x) => x.stage === stage);
  return e ? new Date(e.date).getTime() : null;
}

export interface FunnelRow {
  stage: Stage;
  count: number;
  pct: number; // 相對於第一層
  conv: number; // 相對於上一層
}

export function funnel(deals: Deal[]): FunnelRow[] {
  const counts = STAGE_ORDER.map((s) => deals.filter((d) => reachedStage(d, s)).length);
  return STAGE_ORDER.map((s, i) => ({
    stage: s,
    count: counts[i],
    pct: counts[0] ? counts[i] / counts[0] : 0,
    conv: i === 0 ? 1 : counts[i - 1] ? counts[i] / counts[i - 1] : 0,
  }));
}

export function bottleneck(rows: FunnelRow[]): { from: Stage; to: Stage; conv: number } {
  let worst = 1;
  let idx = 1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].conv < worst) {
      worst = rows[i].conv;
      idx = i;
    }
  }
  return { from: rows[idx - 1].stage, to: rows[idx].stage, conv: rows[idx].conv };
}

export interface SegmentStat {
  customerType: CustomerType;
  plan: PlanType;
  total: number;
  won: number;
  lost: number;
  winRate: number; // won / closed-or-total? 用 won / (won+lost) 之外，pitch 用 won/total leads
  avgCycleDays: number | null;
  avgBudget: number;
  score: number; // 黃金客群排序分數
}

export function segmentStats(deals: Deal[]): SegmentStat[] {
  const seen = new Set<string>();
  const segs = deals
    .map((d) => ({ customerType: d.customerType, plan: d.plan }))
    .filter((s) => {
      const key = `${s.customerType}::${s.plan}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return segs
    .map((s) => {
      const pool = deals.filter((d) => d.customerType === s.customerType && d.plan === s.plan);
      const won = pool.filter((d) => d.stage === "won");
      const lost = pool.filter((d) => d.stage === "lost");
      const cycles = won
        .map((d) => {
          const a = stageDate(d, "lead");
          const b = stageDate(d, "won");
          return a && b ? (b - a) / DAY : null;
        })
        .filter((x): x is number => x !== null);
      const avgCycle = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;
      const winRate = pool.length ? won.length / pool.length : 0;
      const avgBudget = won.length ? won.reduce((a, d) => a + d.budget, 0) / won.length : pool.length ? pool.reduce((a, d) => a + d.budget, 0) / pool.length : 0;
      return {
        ...s,
        total: pool.length,
        won: won.length,
        lost: lost.length,
        winRate,
        avgCycleDays: avgCycle,
        avgBudget,
        score: winRate * 1000 - (avgCycle ?? 120),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export interface Kpis {
  newDeals30d: number;
  newDealsPrev30d: number;
  pipelineValue: number;
  pipelineValuePrev: number;
  overallWinRate: number; // 近 90 天建立且已結案
  overallWinRatePrev: number;
  avgCycleDays: number | null;
  avgCycleDaysPrev: number | null;
}

export function kpis(deals: Deal[], now: Date): Kpis {
  const t = now.getTime();
  const in30 = (d: Deal) => t - new Date(d.createdAt).getTime() <= 30 * DAY;
  const inPrev30 = (d: Deal) => {
    const age = t - new Date(d.createdAt).getTime();
    return age > 30 * DAY && age <= 60 * DAY;
  };
  const open = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const openPrev = deals.filter((d) => {
    // 30 天前的 pipeline：當時已建立且尚未結案
    const created = new Date(d.createdAt).getTime();
    const closed = d.closedAt ? new Date(d.closedAt).getTime() : Infinity;
    const ref = t - 30 * DAY;
    return created <= ref && closed > ref;
  });

  const winRateWindow = (from: number, to: number) => {
    const pool = deals.filter((d) => {
      const c = new Date(d.createdAt).getTime();
      return c >= from && c < to;
    });
    if (!pool.length) return 0;
    return pool.filter((d) => d.stage === "won").length / pool.length;
  };

  const cycleWindow = (from: number, to: number) => {
    const cycles = deals
      .filter((d) => d.stage === "won" && d.closedAt)
      .filter((d) => {
        const c = new Date(d.closedAt!).getTime();
        return c >= from && c < to;
      })
      .map((d) => (new Date(d.closedAt!).getTime() - new Date(d.createdAt).getTime()) / DAY);
    return cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;
  };

  return {
    newDeals30d: deals.filter(in30).length,
    newDealsPrev30d: deals.filter(inPrev30).length,
    pipelineValue: open.reduce((a, d) => a + d.budget, 0),
    pipelineValuePrev: openPrev.reduce((a, d) => a + d.budget, 0),
    overallWinRate: winRateWindow(t - 150 * DAY, t - 60 * DAY),
    overallWinRatePrev: winRateWindow(t - 180 * DAY, t - 90 * DAY),
    avgCycleDays: cycleWindow(t - 60 * DAY, t),
    avgCycleDaysPrev: cycleWindow(t - 120 * DAY, t - 60 * DAY),
  };
}

// 決策者出席與成交率的關聯（NBA 規則引擎的資料依據）
export function dmImpact(deals: Deal[]): { withDm: number; withoutDm: number } {
  const closed = deals.filter((d) => d.stage === "won" || d.stage === "lost");
  const withDm = closed.filter((d) => d.decisionMakerMet);
  const withoutDm = closed.filter((d) => !d.decisionMakerMet);
  const rate = (pool: Deal[]) => (pool.length ? pool.filter((d) => d.stage === "won").length / pool.length : 0);
  return { withDm: rate(withDm), withoutDm: rate(withoutDm) };
}

// 月趨勢（近 6 個月）：新增案件與成交數
export function monthlyTrend(deals: Deal[], now: Date): { label: string; created: number; won: number }[] {
  const out: { label: string; created: number; won: number }[] = [];
  for (let m = 5; m >= 0; m--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const label = `${ref.getMonth() + 1}月`;
    const created = deals.filter((d) => {
      const c = new Date(d.createdAt);
      return c >= ref && c < next;
    }).length;
    const won = deals.filter((d) => {
      if (d.stage !== "won" || !d.closedAt) return false;
      const c = new Date(d.closedAt);
      return c >= ref && c < next;
    }).length;
    out.push({ label, created, won });
  }
  return out;
}

export function fmtNT(n: number): string {
  if (n >= 100_000_000) return `NT$ ${(n / 100_000_000).toFixed(1)} 億`;
  if (n >= 10_000) return `NT$ ${Math.round(n / 10_000).toLocaleString()} 萬`;
  return `NT$ ${n.toLocaleString()}`;
}

export function fmtPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}
