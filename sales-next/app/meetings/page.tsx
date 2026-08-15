"use client";

import Link from "next/link";
import { Mic, Plus } from "lucide-react";
import { useSales } from "@/lib/store";
import { Card, Chip, EmptyState } from "@/components/ui";

export default function MeetingsPage() {
  const { meetings } = useSales();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-black">會議紀錄</h1>
          <p className="mt-0.5 text-sm text-muted">每一場會議都自動變成結構化的銷售資料</p>
        </div>
        <Link
          href="/meetings/new"
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition hover:brightness-110"
        >
          <Plus size={15} /> 新會議
        </Link>
      </div>

      {meetings.length === 0 ? (
        <EmptyState
          title="還沒有會議紀錄"
          hint="開始第一場會議，AI 會自動產生逐字稿並建立 CRM 案件。"
          action={
            <Link href="/meetings/new" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">
              開始新會議
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {meetings.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`}>
              <Card className="h-full transition hover:border-primary/40 hover:shadow-pop">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold">{m.title}</div>
                    <div className="mt-1 text-xs text-muted">
                      {new Date(m.date).toLocaleDateString("zh-TW", { month: "long", day: "numeric" })}
                      ｜{m.durationMin} 分鐘｜{m.attendees.length} 位與會者
                    </div>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Mic size={16} />
                  </span>
                </div>
                <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
                  {m.summary.slice(0, 2).map((s, i) => (
                    <li key={i} className="truncate">
                      ・{s}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.extraction?.customerType && <Chip tone="blue">{m.extraction.customerType}</Chip>}
                  {m.extraction?.plan && <Chip tone="purple">{m.extraction.plan}</Chip>}
                  {m.extraction?.contactDepartment && <Chip>{m.extraction.contactDepartment}</Chip>}
                  {m.nba && <Chip tone="warn">{m.nba.actions.length} 項建議行動</Chip>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
