"use client";

// 銷售漏斗：整體漏斗＋瓶頸判定＋依方案/客群的分組漏斗比較（顧問方法論 Step 2 的產品化）

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useSales } from "@/lib/store";
import { bottleneck, funnel, fmtPct } from "@/lib/data/analytics";
import { Card, SectionTitle } from "@/components/ui";
import { FunnelChart } from "@/components/charts";
import { CustomerType, PlanType, STAGE_LABEL } from "@/lib/types";

type Dim = "all" | "plan" | "type";

export default function FunnelPage() {
  const { deals } = useSales();
  const [dim, setDim] = useState<Dim>("all");

  const all = funnel(deals);
  const bn = bottleneck(all);
  const planOptions = Array.from(new Set(deals.map((d) => d.plan))) as PlanType[];
  const typeOptions = Array.from(new Set(deals.map((d) => d.customerType))) as CustomerType[];

  const groups =
    dim === "plan"
      ? planOptions.map((p) => ({
          label: p,
          rows: funnel(deals.filter((d) => d.plan === p)),
        }))
      : dim === "type"
        ? typeOptions.map((t) => ({
            label: t,
            rows: funnel(deals.filter((d) => d.customerType === t)),
          }))
        : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">銷售漏斗</h1>
          <p className="mt-0.5 text-sm text-muted">各階段轉換率與瓶頸，全部由案件資料即時計算</p>
        </div>
        <div className="flex rounded-full border border-line bg-surface p-1 text-xs font-medium">
          {(
            [
              ["all", "整體"],
              ["type", "依客戶類型"],
              ["plan", "依方案"],
            ] as [Dim, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setDim(k)}
              className={`rounded-full px-3.5 py-1.5 transition ${
                dim === k ? "bg-primary text-white" : "text-ink-2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 瓶頸警示 */}
      <div className="flex items-start gap-3 rounded-2xl border border-bad/20 bg-bad-soft px-5 py-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-bad" />
        <div className="text-sm leading-relaxed">
          <b>
            主要瓶頸：「{STAGE_LABEL[bn.from]} → {STAGE_LABEL[bn.to]}」轉換率僅{" "}
            <span className="num">{fmtPct(bn.conv)}</span>
          </b>
          <div className="mt-0.5 text-xs text-ink-2">
            建議優先優化此階段：檢視此階段停留超過 14 天的案件、決策者是否已參與、提案內容是否對準客戶異議。
          </div>
        </div>
      </div>

      {dim === "all" ? (
        <Card>
          <SectionTitle>整體漏斗（近 6 個月，共 {deals.length.toLocaleString()} 筆案件）</SectionTitle>
          <FunnelChart rows={all} highlightWorst />
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 text-center text-xs sm:grid-cols-4">
            {all.slice(1).map((r, i) => (
              <div key={r.stage} className="rounded-xl bg-bg px-2 py-2.5">
                <div className="text-muted">
                  {STAGE_LABEL[all[i].stage]} → {STAGE_LABEL[r.stage]}
                </div>
                <div className="num mt-1 text-base font-bold">{fmtPct(r.conv)}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => {
            const gbn = bottleneck(g.rows);
            return (
              <Card key={g.label}>
                <SectionTitle
                  right={
                    <span className="text-xs text-muted">
                      整體成交 <b className="num text-ink">{fmtPct(g.rows[4]?.pct ?? 0)}</b>
                    </span>
                  }
                >
                  {g.label}
                </SectionTitle>
                <FunnelChart rows={g.rows} />
                <div className="mt-3 rounded-lg bg-bg px-3 py-2 text-xs text-ink-2">
                  瓶頸：{STAGE_LABEL[gbn.from]} → {STAGE_LABEL[gbn.to]}（
                  <span className="num">{fmtPct(gbn.conv)}</span>）
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
