"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, MessageCircleMore, UserRoundSearch } from "lucide-react";
import { Card } from "@/components/ui";
import type { LineIntegrationStatus } from "@/lib/integrations/line-types";

export function LineDashboardCard() {
  const [status, setStatus] = useState<LineIntegrationStatus | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/line/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as LineIntegrationStatus;
        if (!cancelled) {
          setLocked(response.status === 401);
          setStatus(payload);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="rise rise-1 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <MessageCircleMore size={19} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black">LINE 客戶動態</h2>
              {status?.connected && <span className="flex items-center gap-1 text-[11px] font-bold text-good"><CheckCircle2 size={12} /> 已連接</span>}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              {locked ? "輸入整合存取碼後即可查看真實 LINE 客戶資料" : status?.connected ? `最近同步：${status.lastMessageAt ? formatDateTime(status.lastMessageAt) : "尚無訊息"}` : "LINE 整合尚未連接"}
            </p>
          </div>
        </div>

        {status?.connected ? (
          <div className="flex flex-wrap items-center gap-5">
            <Metric label="客戶" value={status.customerCount} />
            <Metric label="對話" value={status.recordCount} />
            <div className="flex items-center gap-2">
              <UserRoundSearch size={15} className={status.unassignedCount ? "text-warn" : "text-muted"} />
              <Metric label="待辨識" value={status.unassignedCount} warn={status.unassignedCount > 0} />
            </div>
            <Link href="/integrations/line" className="flex items-center gap-1 text-xs font-bold text-primary">查看客戶匣 <ArrowRight size={13} /></Link>
          </div>
        ) : (
          <Link href="/settings" className="flex items-center gap-1 rounded-full border border-primary/30 px-3.5 py-2 text-xs font-bold text-primary">前往連接 <ArrowRight size={13} /></Link>
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return <div className="text-right"><div className="text-[10px] text-muted">{label}</div><div className={`num text-base font-black ${warn ? "text-warn" : "text-ink"}`}>{value}</div></div>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
