"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useSales } from "@/lib/store";
import { Card, Chip, EmptyState, SectionTitle, StageBadge } from "@/components/ui";
import { pipelineSnapshots } from "@/lib/pipeline";

export default function MeetingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { meetings, hydrated } = useSales();
  const m = meetings.find((x) => x.id === id);

  if (!hydrated) return null;
  if (!m)
    return (
      <EmptyState
        title="找不到這場會議"
        action={
          <Link href="/meetings" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">
            回會議列表
          </Link>
        }
      />
    );

  const ex = m.extraction;
  const pipeline = m.pipeline ?? pipelineSnapshots("done");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/meetings" className="mb-2 flex w-fit items-center gap-1 text-xs font-semibold text-muted hover:text-primary">
          <ArrowLeft size={13} /> 會議紀錄
        </Link>
        <h1 className="text-xl font-black">{m.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {new Date(m.date).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" })}
          ｜{m.durationMin} 分鐘｜{m.attendees.join("、")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="max-h-[560px] overflow-hidden">
          <SectionTitle>逐字稿</SectionTitle>
          <div className="scroll-slim max-h-[480px] space-y-2.5 overflow-y-auto pr-2">
            {m.transcript.map((s, i) => (
              <div key={i} className="flex gap-2 text-[13px] leading-relaxed">
                <span className="num shrink-0 pt-0.5 text-[10px] text-muted">
                  {String(Math.floor(s.t / 60)).padStart(2, "0")}:{String(s.t % 60).padStart(2, "0")}
                </span>
                <span>
                  <b className={s.speaker.includes("星禾") || /^[張劉林陳黃]/.test(s.speaker) ? "text-primary" : ""}>
                    {s.speaker}
                  </b>
                  ：{s.text}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle right={ex && <StageBadge stage={ex.stage} />}>AI 摘要與 CRM 欄位</SectionTitle>
            <ul className="mb-3 space-y-1.5 text-[13px] text-ink-2">
              {m.summary.map((s, i) => (
                <li key={i}>・{s}</li>
              ))}
            </ul>
            {ex && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3 text-[13px]">
                <Field k="客戶" v={ex.company} />
                <Field k="窗口" v={`${ex.contact} ${ex.role}`} />
                <Field k="預算" v={ex.budget} />
                <Field k="時程" v={ex.timeline} />
                <Field k="部門" v={ex.contactDepartment} />
                <Field k="決策者" v={ex.decisionMaker} />
                <Field k="異議" v={ex.objections.join("、") || "—"} />
              </div>
            )}
            <div className="mt-3 flex gap-1.5">
              {ex?.customerType && <Chip tone="blue">{ex.customerType}</Chip>}
              {ex?.plan && <Chip tone="purple">{ex.plan}</Chip>}
            </div>
            {m.dealId && (
              <Link
                href={`/deals/${m.dealId}`}
                className="mt-4 block w-fit rounded-full bg-primary px-4 py-2 text-xs font-bold text-white"
              >
                查看 CRM 案件
              </Link>
            )}
          </Card>

          <Card>
            <SectionTitle>Pipeline 分析</SectionTitle>
            <div className="space-y-2">
              {pipeline.map((step, index) => (
                <div key={step.key} className="flex gap-2.5 rounded-lg bg-bg px-3 py-2">
                  <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold">{step.label}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted">{step.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            {ex?.meetingSummary && <p className="mt-3 text-xs leading-relaxed text-ink-2">{ex.meetingSummary}</p>}
          </Card>

          {m.nba && (
            <Card className="border-primary/25 bg-primary-soft/35">
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <Sparkles size={15} className="text-primary" /> Next Best Action
                </span>
              </SectionTitle>
              <ol className="space-y-2.5">
                {m.nba.actions.map((a, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px]">
                    <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <div className="font-semibold">
                        {a.title}
                        <span className="num ml-1.5 text-[11px] text-warn">{a.dueInDays} 天內</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted">{a.why}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-10 shrink-0 text-xs text-muted">{k}</span>
      <span className="min-w-0 font-medium">{v || "—"}</span>
    </div>
  );
}
