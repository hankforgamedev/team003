"use client";

// 圖表元件：手刻 SVG/CSS，無第三方相依（離線保險＋視覺完全可控）。
// 色彩策略：漏斗前四階用單一藍色系深→淺（量體遞減），「成交」用保留的 good 綠（狀態色）；
// 兩系列比較固定 藍（品牌方/年約）× 橘（行銷公司/單次），色彩跟著實體走，不因篩選改色。

import { useState } from "react";
import { FunnelRow } from "@/lib/data/analytics";
import { STAGE_LABEL } from "@/lib/types";

const FUNNEL_COLORS = ["#16308f", "#2456e6", "#4d82f3", "#8fb3f9"];
const WON_COLOR = "#0e9f6e";

export function FunnelChart({ rows, highlightWorst }: { rows: FunnelRow[]; highlightWorst?: boolean }) {
  const max = rows[0]?.count || 1;
  let worstIdx = -1;
  if (highlightWorst) {
    let worst = 1;
    rows.forEach((r, i) => {
      if (i > 0 && r.conv < worst) {
        worst = r.conv;
        worstIdx = i;
      }
    });
  }
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => {
        const w = Math.max(0.14, r.count / max);
        const color = r.stage === "won" ? WON_COLOR : FUNNEL_COLORS[Math.min(i, FUNNEL_COLORS.length - 1)];
        const isWorst = i === worstIdx;
        return (
          <div key={r.stage} className="group flex items-center gap-3">
            <div className="w-16 shrink-0 text-right text-xs font-medium text-ink-2">{STAGE_LABEL[r.stage]}</div>
            <div className="relative h-9 flex-1">
              <div
                className="absolute left-1/2 top-0 flex h-full -translate-x-1/2 items-center justify-between rounded-[7px] px-3 text-white transition-all duration-500"
                style={{ width: `${w * 100}%`, background: color, minWidth: "120px" }}
              >
                <span className="num text-[13px] font-bold">{r.count.toLocaleString()}</span>
                <span className="num text-[11px] opacity-85">{(r.pct * 100).toFixed(1)}%</span>
              </div>
            </div>
            <div className="w-20 shrink-0 text-xs">
              {i > 0 ? (
                <span className={`num font-semibold ${isWorst ? "rounded-md bg-bad-soft px-1.5 py-0.5 text-bad" : "text-muted"}`}>
                  {(r.conv * 100).toFixed(1)}%
                  {isWorst && <span className="ml-1 font-medium">瓶頸</span>}
                </span>
              ) : (
                <span className="text-muted">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HBar({
  label,
  value,
  max,
  color = "#2456e6",
  fmt,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  fmt: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 shrink-0 truncate text-xs font-medium text-ink-2">{label}</div>
      <div className="h-5 flex-1 overflow-hidden rounded-md bg-[#eef1f8]">
        <div
          className="flex h-full items-center rounded-md pl-2 transition-all duration-500"
          style={{ width: `${Math.max(4, (value / (max || 1)) * 100)}%`, background: color }}
        />
      </div>
      <div className="num w-20 shrink-0 text-right text-xs font-semibold text-ink">{fmt(value)}</div>
    </div>
  );
}

export function TrendChart({
  data,
}: {
  data: { label: string; created: number; won: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 180;
  const P = { t: 14, r: 10, b: 26, l: 30 };
  const max = Math.max(...data.map((d) => d.created), 1);
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const path = (key: "created" | "won") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[key])}`).join(" ");

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="近六個月新增與成交趨勢">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={y(max * f)} y2={y(max * f)} stroke="#e4e9f4" strokeWidth="1" />
            <text x={P.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="#7484a2" className="num">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        <path d={path("created")} fill="none" stroke="#2456e6" strokeWidth="2" strokeLinecap="round" />
        <path d={path("won")} fill="none" stroke="#0e9f6e" strokeWidth="2" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={i}>
            <rect
              x={x(i) - 20}
              y={P.t}
              width="40"
              height={H - P.t - P.b}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            {hover === i && (
              <line x1={x(i)} x2={x(i)} y1={P.t} y2={H - P.b} stroke="#a9b6cf" strokeDasharray="3 3" />
            )}
            <circle cx={x(i)} cy={y(d.created)} r={hover === i ? 4.5 : 3} fill="#2456e6" stroke="#fff" strokeWidth="1.5" />
            <circle cx={x(i)} cy={y(d.won)} r={hover === i ? 4.5 : 3} fill="#0e9f6e" stroke="#fff" strokeWidth="1.5" />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#7484a2">
              {d.label}
            </text>
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs shadow-pop">
          <span className="font-semibold">{data[hover].label}</span>
          ｜新增 <span className="num font-semibold text-primary">{data[hover].created}</span>
          ｜成交 <span className="num font-semibold text-good">{data[hover].won}</span>
        </div>
      )}
      <div className="mt-1 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" /> 新增案件
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-good" /> 成交
        </span>
      </div>
    </div>
  );
}
