"use client";

import { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Stage, STAGE_LABEL } from "@/lib/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-bold text-ink">{children}</h2>
      {right}
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  deltaGoodWhenUp = true,
  hint,
  className = "",
}: {
  label: string;
  value: string;
  delta?: number | null; // 相對變化，例如 0.18 = +18%
  deltaGoodWhenUp?: boolean;
  hint?: string;
  className?: string;
}) {
  const up = (delta ?? 0) >= 0;
  const good = delta == null ? null : up === deltaGoodWhenUp;
  return (
    <div className={`card p-4.5 ${className}`}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="num mt-1.5 text-[26px] font-bold leading-none text-ink">{value}</div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {delta != null && (
          <span
            className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
              good ? "bg-good-soft text-good" : "bg-bad-soft text-bad"
            }`}
          >
            {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(delta * 100).toFixed(0)}%
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
    </div>
  );
}

const STAGE_STYLE: Record<Stage, string> = {
  lead: "bg-bg text-muted",
  meeting: "bg-[#e8e8e8] text-ink-2",
  proposal: "bg-primary-soft text-primary",
  negotiation: "bg-warn-soft text-warn",
  won: "bg-good-soft text-good",
  lost: "bg-bad-soft text-bad",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STAGE_STYLE[stage]}`}>
      {STAGE_LABEL[stage]}
    </span>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "purple" | "warn";
  className?: string;
}) {
  const cls = {
    neutral: "bg-bg text-ink-2",
    blue: "bg-primary-soft text-primary",
    purple: "bg-primary-soft text-primary",
    warn: "bg-warn-soft text-warn",
  }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls} ${className}`}>{children}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="text-[15px] font-bold text-ink">{title}</div>
      {hint && <div className="max-w-sm text-sm text-muted">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
