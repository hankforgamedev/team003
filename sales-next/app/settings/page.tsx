"use client";

import { useState } from "react";
import { CheckCircle2, Cpu, Database, KeyRound, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { useSales } from "@/lib/store";
import { AI_PROVIDER_OPTIONS, aiProviderLabel } from "@/lib/ai/provider-config";
import { Card, SectionTitle } from "@/components/ui";
import type { AiProvider } from "@/lib/types";
import { LineConnectionCard } from "@/components/LineConnectionCard";

export default function SettingsPage() {
  const { aiProvider, setAiProvider, aiLive, resetDemo, deals, meetings } = useSales();
  const providerLabel = aiProviderLabel(aiProvider);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  function chooseAiProvider(provider: AiProvider) {
    if (typeof setAiProvider === "function") {
      setAiProvider(provider);
      return;
    }
    useSales.setState({ aiProvider: provider, aiLive: null });
  }

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
        <div className="grid gap-2 sm:grid-cols-2">
          {AI_PROVIDER_OPTIONS.map((option) => {
            const active = option.value === aiProvider;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseAiProvider(option.value)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-line bg-bg text-ink-2 hover:border-primary/40"
                }`}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-black">
                  {option.label}
                  {active && <CheckCircle2 size={16} />}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-2">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-start gap-3 rounded-xl bg-bg px-4 py-3">
          <span className={`h-2.5 w-2.5 rounded-full ${aiLive ? "bg-good" : "bg-amber-400"}`} />
          <div className="text-sm">
            <b>
              {aiLive === null
                ? `${providerLabel} 檢查中`
                : aiLive
                  ? `${providerLabel} 已連線`
                  : `${providerLabel} 尚未完成設定`}
            </b>
            <div className="mt-0.5 text-xs text-muted">
              CRM 抽取、Next Best Action 與知識庫問答會使用目前選取的 provider；語音轉寫仍使用 OpenAI Whisper。
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-line bg-bg px-4 py-3 text-xs leading-relaxed text-muted">
          <div className="mb-1 flex items-center gap-1.5 font-bold text-ink-2">
            <KeyRound size={13} className="text-primary" /> 環境變數放在 .env.local
          </div>
          <p>
            預設 provider 是 AWS Bedrock。Bedrock 請設定 BEDROCK_AWS_REGION/AWS_REGION 與 AWS 憑證；
            切到 OpenAI GPT 時請設定 OPENAI_API_KEY。這些 key 只放 server 端，不會寫進瀏覽器。
          </p>
        </div>
      </Card>

      <LineConnectionCard />

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
            <b>API Key 不進前端：</b>Bedrock / OpenAI 憑證只讀取 server 環境變數；瀏覽器只保存目前選用哪個 provider。
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
