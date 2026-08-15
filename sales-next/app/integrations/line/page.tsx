"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Inbox,
  MessageCircleMore,
  RefreshCw,
  Search,
  Sparkles,
  UserRoundSearch,
} from "lucide-react";
import { Card, Chip, EmptyState, SectionTitle } from "@/components/ui";
import { useSales } from "@/lib/store";
import { dealIdForLineCustomer, meetingIdForLineRecord } from "@/lib/integrations/line-client";
import type { LineIntegrationRecord, LineRecordsResponse } from "@/lib/integrations/line-types";

type Filter = "all" | "assigned" | "unassigned";

export default function LineIntegrationPage() {
  const syncLineRecords = useSales((state) => state.syncLineRecords);
  const lineLastSyncedAt = useSales((state) => state.lineLastSyncedAt);
  const [payload, setPayload] = useState<LineRecordsResponse | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/line/records", { cache: "no-store" });
      if (response.status === 401) {
        setLocked(true);
        setPayload(null);
        return;
      }
      const result = (await response.json()) as LineRecordsResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "無法載入 LINE 資料");
      setLocked(false);
      setPayload(result);
      syncLineRecords(result.records);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "無法載入 LINE 資料");
    } finally {
      setLoading(false);
    }
  }, [syncLineRecords]);

  useEffect(() => {
    void load();
  }, [load]);

  const customers = useMemo(() => groupCustomers(payload?.records ?? []), [payload]);
  const filtered = customers.filter((customer) => {
    if (filter === "assigned" && !customer.assigned) return false;
    if (filter === "unassigned" && customer.assigned) return false;
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    return [customer.company, customer.latest.crm.contactName, customer.latest.transcript]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });
  const selected = filtered.find((customer) => customer.customerKey === selectedKey) ?? filtered[0] ?? null;

  if (locked) {
    return (
      <EmptyState
        title="LINE 客戶整合尚未解鎖"
        hint="先到設定頁輸入內部整合存取碼，避免客戶對話與 CRM 資料公開在網路上。"
        action={<Link href="/settings" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">前往設定</Link>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black"><MessageCircleMore size={21} className="text-primary" /> LINE 客戶</h1>
          <p className="mt-0.5 text-sm text-muted">查看真實 LINE 對話，辨識公司後自動同步案件、會議與知識庫</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink-2 hover:border-primary/40 hover:text-primary disabled:opacity-50">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 重新同步
        </button>
      </div>

      {payload && (
        <Card className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-black text-good">
              <CheckCircle2 size={17} /> {payload.status.accountName} 已連接
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span><b className="text-ink">{payload.status.customerCount}</b> 位客戶</span>
              <span><b className="text-ink">{payload.status.recordCount}</b> 則對話</span>
              <span><b className={payload.status.unassignedCount ? "text-warn" : "text-ink"}>{payload.status.unassignedCount}</b> 位待辨識</span>
              <span>網頁同步：{lineLastSyncedAt ? formatDateTime(lineLastSyncedAt) : "剛剛"}</span>
            </div>
          </div>
        </Card>
      )}

      {error && <div className="rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{error}</div>}

      <div className="grid min-h-[620px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col p-0">
          <div className="border-b border-line p-4">
            <label className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3">
              <Search size={14} className="text-muted" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋公司或對話" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" />
            </label>
            <div className="mt-3 flex gap-1.5">
              {(["all", "assigned", "unassigned"] as Filter[]).map((value) => (
                <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === value ? "bg-primary text-white" : "bg-bg text-muted"}`}>
                  {{ all: "全部", assigned: "已歸檔", unassigned: "待辨識" }[value]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading && !payload ? (
              <div className="py-16 text-center text-sm text-muted">正在讀取 LINE 對話…</div>
            ) : filtered.length ? filtered.map((customer) => (
              <button
                key={customer.customerKey}
                onClick={() => setSelectedKey(customer.customerKey)}
                className={`mb-1 w-full rounded-xl border px-3 py-3 text-left transition ${selected?.customerKey === customer.customerKey ? "border-primary/30 bg-primary-soft" : "border-transparent hover:bg-bg"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-ink">{customer.company}</div>
                    <div className="mt-0.5 truncate text-xs text-muted">{preview(customer.latest.transcript)}</div>
                  </div>
                  {!customer.assigned && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-bold text-warn">待辨識</span>}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                  <span>{customer.records.length} 則訊息</span><span>{formatDateTime(customer.latest.receivedAt)}</span>
                </div>
              </button>
            )) : <div className="py-16 text-center text-sm text-muted">沒有符合條件的客戶</div>}
          </div>
        </Card>

        {selected ? <CustomerWorkspace customer={selected} onAssigned={load} /> : (
          <Card className="flex items-center justify-center"><div className="text-center text-muted"><Inbox size={28} className="mx-auto mb-2" /><p className="text-sm">選擇一位 LINE 客戶</p></div></Card>
        )}
      </div>
    </div>
  );
}

interface CustomerGroup {
  customerKey: string;
  company: string;
  assigned: boolean;
  latest: LineIntegrationRecord;
  records: LineIntegrationRecord[];
}

function CustomerWorkspace({ customer, onAssigned }: { customer: CustomerGroup; onAssigned: () => Promise<void> }) {
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const record = customer.latest;

  async function assign() {
    setSaving(true);
    setError("");
    const response = await fetch("/api/integrations/line/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerKey: customer.customerKey, company }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error || "歸檔失敗");
      setSaving(false);
      return;
    }
    setCompany("");
    setSaving(false);
    await onAssigned();
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black">{customer.company}</h2>
              <Chip tone={customer.assigned ? "blue" : "warn"}>{customer.assigned ? "已歸檔" : "待辨識"}</Chip>
            </div>
            <p className="mt-1 text-xs text-muted">最近訊息 {formatDateTime(record.receivedAt)} · 共 {customer.records.length} 則紀錄</p>
          </div>
          {customer.assigned && (
            <div className="flex gap-2">
              <Link href={`/deals/${dealIdForLineCustomer(record)}`} className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-white"><FolderKanban size={13} /> 查看案件</Link>
              <Link href={`/meetings/${meetingIdForLineRecord(record)}`} className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-xs font-bold text-ink-2">逐字稿 <ArrowRight size={13} /></Link>
            </div>
          )}
        </div>

        {!customer.assigned && (
          <div className="mt-4 rounded-xl border border-warn/25 bg-warn-soft p-4">
            <div className="flex items-center gap-1.5 text-sm font-black"><UserRoundSearch size={15} className="text-warn" /> 這是新客戶，請指定公司名稱</div>
            <p className="mt-1 text-xs text-muted">歸檔後資料會移至 customers/公司名/line，並自動出現在案件與知識庫。</p>
            <div className="mt-3 flex gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3"><Building2 size={14} className="text-muted" /><input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：王氏科技" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></label>
              <button onClick={() => void assign()} disabled={!company.trim() || saving} className="rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? "處理中…" : "確認歸檔"}</button>
            </div>
            {error && <p className="mt-2 text-xs font-medium text-bad">{error}</p>}
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle><span className="flex items-center gap-1.5"><Sparkles size={15} className="text-primary" /> AI CRM 摘要</span></SectionTitle>
          <dl className="space-y-3 text-sm">
            <CrmRow label="需求" value={record.crm.need} />
            <CrmRow label="預算" value={record.crm.budget} />
            <CrmRow label="階段" value={record.crm.stage} />
            <CrmRow label="時程" value={record.crm.timeline} />
            <CrmRow label="下一步" value={record.crm.nextAction} />
            <CrmRow label="決策者" value={record.crm.decisionMaker} />
          </dl>
        </Card>
        <Card>
          <SectionTitle><span className="flex items-center gap-1.5"><MessageCircleMore size={15} className="text-primary" /> 最近對話</span></SectionTitle>
          <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
            {customer.records.map((item) => (
              <div key={item.id} className="rounded-xl bg-bg px-3.5 py-3">
                <div className="mb-1.5 flex items-center gap-1 text-[11px] text-muted"><Clock3 size={11} /> {formatDateTime(item.receivedAt)}</div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{item.transcript || "（無逐字稿內容）"}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CrmRow({ label, value }: { label: string; value: string | null }) {
  return <div className="grid grid-cols-[68px_1fr] gap-3 border-b border-line/70 pb-2.5 last:border-0 last:pb-0"><dt className="text-xs font-bold text-muted">{label}</dt><dd className="text-[13px] leading-relaxed text-ink-2">{value || "尚未抽取"}</dd></div>;
}

function groupCustomers(records: LineIntegrationRecord[]): CustomerGroup[] {
  const grouped = new Map<string, LineIntegrationRecord[]>();
  records.forEach((record) => grouped.set(record.customerKey, [...(grouped.get(record.customerKey) ?? []), record]));
  return Array.from(grouped.entries()).map(([customerKey, items]) => {
    const sorted = [...items].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return { customerKey, company: sorted[0]!.company, assigned: sorted[0]!.assigned, latest: sorted[0]!, records: sorted };
  }).sort((a, b) => b.latest.receivedAt.localeCompare(a.latest.receivedAt));
}

function preview(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 58) || "尚無文字內容";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間未知";
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
