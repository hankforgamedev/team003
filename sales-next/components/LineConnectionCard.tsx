"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, KeyRound, LogOut, MessageCircleMore, RefreshCw } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import type { LineIntegrationStatus } from "@/lib/integrations/line-types";

const emptyStatus: LineIntegrationStatus = {
  configured: true,
  connected: false,
  requiresAccessCode: true,
  accountName: "Sales Next 測試",
  customerCount: 0,
  recordCount: 0,
  unassignedCount: 0,
  lastMessageAt: null,
};

export function LineConnectionCard() {
  const [status, setStatus] = useState<LineIntegrationStatus>(emptyStatus);
  const [accessCode, setAccessCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStatus() {
    setLoading(true);
    try {
      const response = await fetch("/api/integrations/line/status", { cache: "no-store" });
      const payload = (await response.json()) as LineIntegrationStatus & { error?: string };
      setStatus({ ...emptyStatus, ...payload });
      if (response.status !== 401 && !response.ok) setError(payload.error || "無法讀取 LINE 狀態");
      else setError("");
    } catch {
      setError("無法連接 LINE 整合服務");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function connect() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/integrations/line/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error || "連接失敗");
      setLoading(false);
      return;
    }
    setAccessCode("");
    await loadStatus();
  }

  async function disconnect() {
    await fetch("/api/integrations/line/connect", { method: "DELETE" });
    setStatus(emptyStatus);
  }

  return (
    <Card>
      <SectionTitle
        right={status.connected ? (
          <button onClick={() => void disconnect()} className="flex items-center gap-1 text-xs font-bold text-muted hover:text-ink">
            <LogOut size={13} /> 登出整合
          </button>
        ) : undefined}
      >
        <span className="flex items-center gap-1.5">
          <MessageCircleMore size={15} className="text-primary" /> LINE 客戶整合
        </span>
      </SectionTitle>

      {!status.configured ? (
        <div className="rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-ink-2">
          <b>伺服器尚未啟用</b>
          <p className="mt-1 text-xs text-muted">請先在部署環境設定 LINE 整合存取碼與 AWS S3 權限。</p>
        </div>
      ) : status.connected ? (
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-good">
            <CheckCircle2 size={17} /> {status.accountName} 已連接
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ["客戶", status.customerCount],
              ["對話", status.recordCount],
              ["待辨識", status.unassignedCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-bg px-3 py-2.5">
                <div className="text-[11px] text-muted">{label}</div>
                <div className="num mt-0.5 text-lg font-black">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href="/integrations/line" className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-white">
              開啟 LINE 客戶匣
            </Link>
            <button onClick={() => void loadStatus()} className="flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-xs font-bold text-ink-2 hover:text-primary">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 更新狀態
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[13px] leading-relaxed text-ink-2">
            輸入內部整合存取碼後，即可在網頁查看 LINE 對話、辨識客戶，並自動同步至案件與知識庫。
          </p>
          <div className="mt-3 flex gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-bg px-3">
              <KeyRound size={14} className="shrink-0 text-muted" />
              <input
                type="password"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && accessCode && void connect()}
                placeholder="整合存取碼"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
              />
            </label>
            <button disabled={!accessCode || loading} onClick={() => void connect()} className="rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-50">
              連接
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs font-medium text-bad">{error}</p>}
    </Card>
  );
}
