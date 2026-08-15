import { Deal, DealHealth, DealPriority, ForecastCategory, Stage } from "@/lib/types";

const PROBABILITY: Record<Stage, number> = {
  lead: 10,
  meeting: 25,
  proposal: 55,
  negotiation: 80,
  won: 100,
  lost: 0,
};

export const FORECAST_LABEL: Record<ForecastCategory, string> = {
  pipeline: "Pipeline",
  best_case: "Best case",
  commit: "Commit",
  closed: "Closed won",
  omitted: "Omitted",
};

export const PRIORITY_LABEL: Record<DealPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function dealProbability(deal: Deal): number {
  return deal.probability ?? PROBABILITY[deal.stage];
}

export function dealForecast(deal: Deal): ForecastCategory {
  if (deal.forecastCategory) return deal.forecastCategory;
  if (deal.stage === "won") return "closed";
  if (deal.stage === "lost") return "omitted";
  if (deal.stage === "negotiation") return "commit";
  if (deal.stage === "proposal") return "best_case";
  return "pipeline";
}

export function dealLastActivity(deal: Deal): string {
  return deal.lastActivityAt ?? deal.stageHistory.at(-1)?.date ?? deal.createdAt;
}

export function dealNextStep(deal: Deal): string {
  if (deal.nextStep) return deal.nextStep;
  if (!deal.decisionMakerMet) return "邀請決策者參與下一次會議";
  if (deal.objections.length) return `回應異議：${deal.objections[0]}`;
  if (deal.stage === "lead") return "完成資格確認並安排需求訪談";
  if (deal.stage === "meeting") return "整理需求並提供初步方案";
  if (deal.stage === "proposal") return "確認提案回饋與決策流程";
  if (deal.stage === "negotiation") return "確認合約與付款條件";
  return deal.stage === "won" ? "安排專案啟動" : "記錄流失原因";
}

export function dealHealth(deal: Deal, now = new Date()): { value: DealHealth; label: string; reason: string } {
  if (deal.health) {
    const preset = {
      healthy: { label: "進展正常", reason: "案件依計畫推進" },
      attention: { label: "需要關注", reason: "仍有未解異議或待辦" },
      risk: { label: "高風險", reason: "追蹤逾期或關鍵人未參與" },
    }[deal.health];
    return { value: deal.health, ...preset };
  }
  if (deal.stage === "won") return { value: "healthy", label: "已成交", reason: "案件已成功結案" };
  if (deal.stage === "lost") return { value: "risk", label: "已流失", reason: deal.objections[0] ?? "案件已結案" };
  const followUp = deal.nextFollowUp ? new Date(deal.nextFollowUp).getTime() : null;
  const overdue = followUp != null && followUp < now.getTime();
  if (overdue || (!deal.decisionMakerMet && ["proposal", "negotiation"].includes(deal.stage))) {
    return { value: "risk", label: "高風險", reason: overdue ? "追蹤日期已逾期" : "決策者尚未參與" };
  }
  if (deal.objections.length || !deal.nextFollowUp) {
    return { value: "attention", label: "需要關注", reason: deal.objections[0] ?? "尚未安排下次活動" };
  }
  return { value: "healthy", label: "進展正常", reason: "已有明確下一步與追蹤日期" };
}

export function weightedAmount(deal: Deal): number {
  return Math.round((deal.budget * dealProbability(deal)) / 100);
}
