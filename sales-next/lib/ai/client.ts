"use client";

// 前端 AI 呼叫層：優先走 server API（真 AI），任何失敗（無 key／斷網／逾時）都無縫回退 Demo 引擎。
// 這就是「Demo 當天零風險」的保險絲。

import { AiProvider, MeetingExtraction, NBAResult, Deal, TranscriptSegment } from "@/lib/types";
import { heuristicExtract } from "@/lib/ai/demo-engine";
import { runNbaRules } from "@/lib/ai/nba-rules";
import { normalizeExtraction } from "@/lib/pipeline";
import { DEFAULT_AI_PROVIDER } from "@/lib/ai/provider-config";

async function post<T>(url: string, body: BodyInit | object, timeoutMs = 60000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const init: RequestInit = { method: "POST", signal: ctrl.signal };
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.demoMode) return null;
    return data as T;
  } catch {
    return null;
  }
}

export async function checkAiLive(provider: AiProvider = DEFAULT_AI_PROVIDER): Promise<boolean> {
  try {
    const res = await fetch(`/api/health?provider=${provider}`);
    const data = await res.json();
    return Boolean(data.aiLive);
  } catch {
    return false;
  }
}

export async function aiTranscribe(file: File): Promise<{ segments: TranscriptSegment[]; live: boolean } | null> {
  const data = await post<{ segments: { t: number; text: string }[] }>("/api/transcribe", fileForm(file), 180000);
  if (data?.segments?.length) {
    return { segments: data.segments.map((s) => ({ t: s.t, speaker: "語音", text: s.text })), live: true };
  }
  return null; // 錄音/上傳沒有離線備援（無法憑空轉寫），由 UI 引導改用示範會議
}

function fileForm(file: File): FormData {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
}

export async function aiExtract(
  transcript: string,
  provider: AiProvider = DEFAULT_AI_PROVIDER,
): Promise<{ extraction: MeetingExtraction; live: boolean }> {
  const data = await post<{ extraction: MeetingExtraction }>("/api/extract", { transcript, provider });
  if (data?.extraction) {
    const e = data.extraction;
    return {
      extraction: normalizeExtraction(
        {
          ...e,
          objections: e.objections ?? [],
          nextActions: e.nextActions ?? [],
        },
        transcript
      ),
      live: true,
    };
  }
  return { extraction: normalizeExtraction(heuristicExtract(transcript), transcript), live: false };
}

export async function aiNba(
  extraction: MeetingExtraction,
  allDeals: Deal[],
  transcriptSummary?: string,
  provider: AiProvider = DEFAULT_AI_PROVIDER,
): Promise<NBAResult> {
  const ruleResult = runNbaRules(extraction, allDeals);
  const data = await post<{ result: { actions: NBAResult["actions"]; reasoning?: string[] } }>("/api/nba", {
    extraction,
    ruleResult,
    transcriptSummary,
    provider,
  });
  if (data?.result?.actions?.length) {
    return {
      actions: data.result.actions.slice(0, 4),
      reasoning: data.result.reasoning?.length ? data.result.reasoning : ruleResult.reasoning,
      aiMode: "rules+llm",
    };
  }
  return ruleResult;
}

// 知識庫問答已改由 @sales-next/knowledge-base 模組處理，
// 走 /api/kb-ask（Settings provider），失敗自動降級成內建抽取式回答。
