"use client";

import Link from "next/link";
import { Activity, ArrowRight, CircleAlert, FolderKanban, Mic, Sparkles } from "lucide-react";
import { useSales } from "@/lib/store";
import { bottleneck, fmtNT, fmtPct, funnel } from "@/lib/data/analytics";
import { dealHealth } from "@/lib/crm";
import { STAGE_LABEL } from "@/lib/types";

export function WorkspaceAnalysisStrip() {
  const { deals, meetings } = useSales();
  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const analyzedMeetings = meetings.filter((m) => m.extraction).length;
  const riskDeals = openDeals.filter((d) => dealHealth(d).value === "risk");
  const rows = funnel(deals);
  const bn = rows.length ? bottleneck(rows) : null;
  const latest = meetings[0];
  const latestCompany = latest?.extraction?.company || latest?.title || "尚無會議";
  const pipelineValue = openDeals.reduce((sum, deal) => sum + deal.budget, 0);

  return (
    <div className="border-b-2 border-ink/15 bg-surface px-4 py-2.5 md:px-8">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 text-xs text-ink lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 font-bold text-white">
            <Activity size={13} /> Pipeline 分析
          </span>
          <span className="flex items-center gap-1.5">
            <Mic size={13} className="text-primary" />
            最新：<b className="max-w-[220px] truncate text-ink">{latestCompany}</b>
          </span>
          <span className="flex items-center gap-1.5">
            <FolderKanban size={13} className="text-primary" />
            進行中 {openDeals.length} 筆，{fmtNT(pipelineValue)}
          </span>
          <span className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-primary" />
            已分析 {analyzedMeetings}/{meetings.length} 場
          </span>
          {riskDeals.length > 0 && (
            <span className="flex items-center gap-1.5 font-bold text-primary">
              <CircleAlert size={13} />
              {riskDeals.length} 筆需處理
            </span>
          )}
        </div>
        <Link href="/funnel" className="flex w-fit shrink-0 items-center gap-1 font-bold text-primary">
          {bn
            ? `瓶頸：${STAGE_LABEL[bn.from]} → ${STAGE_LABEL[bn.to]} ${fmtPct(bn.conv)}`
            : "查看漏斗"}
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
