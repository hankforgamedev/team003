"use client";

import { useState } from "react";
import { Cpu, Database, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { useSales } from "@/lib/store";
import { Card, SectionTitle } from "@/components/ui";

export default function SettingsPage() {
  const { aiLive, resetDemo, deals, meetings } = useSales();
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  async function runReset() {
    setResetting(true);
    await resetDemo();
    setResetting(false);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2500);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-black">設定</h1>
        <p className="mt-0.5 text-sm text-muted">AI 引擎、資料隱私與示範資料管理</p>
      </div>

      <Card>
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <Cpu size={15} className="text-primary" /> AI 引擎
          </span>
        </SectionTitle>
        <div className="flex items-center gap-3 rounded-xl bg-bg px-4 py-3">
          <span className={`h-2.5 w-2.5 rounded-full ${aiLive ? "bg-good" : "bg-amber-400"}`} />
          <div className="text-sm">
            <b>{aiLive ? "OpenAI 已連線" : "Demo 模式（內建引擎）"}</b>
            <div className="mt-0.5 text-xs text-muted">
              {aiLive
                ? "語音轉寫（Whisper）、CRM 抽取、NBA 與知識庫問答都走 OpenAI GPT"
                : "所有功能可用；部署時設定 OPENAI_API_KEY 環境變數即可升級為真 AI"}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          目前測試版先把原本的 AWS Bedrock 知識庫問答切到 OpenAI GPT API；之後要切回
          Bedrock 或 Azure OpenAI，只需要換 server provider，產品端不需改動。
        </p>
      </Card>

      <Card>
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={15} className="text-primary" /> 資料與隱私
          </span>
        </SectionTitle>
        <ul className="space-y-2.5 text-[13px] leading-relaxed text-ink-2">
          <li>
            <b>錄音告知：</b>每次錄音前產品都會提示告知話術——臺灣個資法要求向與會者完成蒐集告知，同意後才開始。
          </li>
          <li>
            <b>AI 不拿你的資料訓練：</b>透過 OpenAI API 處理的內容，依其政策不會用於模型訓練，僅短期保留作濫用防護。
          </li>
          <li>
            <b>資料主權：</b>會議與案件資料屬於企業客戶；支援隨時匯出與刪除（示範版資料僅存於你的瀏覽器）。
          </li>
          <li>
            <b>企業方案路線：</b>SSO、稽核紀錄、指定資料存放區域（規劃中）。
          </li>
        </ul>
      </Card>

      <Card>
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <Smartphone size={15} className="text-primary" /> 手機使用（PWA）
          </span>
        </SectionTitle>
        <p className="text-[13px] leading-relaxed text-ink-2">
          手機瀏覽器開啟本站 → 分享選單 →「加入主畫面」，即可像獨立 App 一樣使用，錄音功能照常運作。
        </p>
      </Card>

      <Card>
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <Database size={15} className="text-primary" /> 示範資料
          </span>
        </SectionTitle>
        <p className="text-[13px] text-ink-2">
          目前工作區：{deals.length.toLocaleString()} 筆案件、{meetings.length} 場會議（預設為 30 筆跨部門聯動資料）。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => void runReset()}
            disabled={resetting}
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink-2 transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            <RefreshCw size={13} className={resetting ? "animate-spin" : ""} />
            {resetDone ? "已重設 30 筆！" : "一鍵重設 30 筆預設資料"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          這會清空目前瀏覽器工作區與知識庫，回到 30 筆跨部門完整資料。
        </p>
      </Card>
    </div>
  );
}
