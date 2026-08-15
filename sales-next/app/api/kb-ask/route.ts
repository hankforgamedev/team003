// 知識庫問答的 server 端：依 Settings 選擇 AWS Bedrock 或 OpenAI GPT。
// 沒設 provider 需要的環境變數 → 回 501，team003 的 ask() 會自動降級成
// 抽取式原文回答（附出處仍在）。

import { NextResponse } from "next/server";
import type { Citation } from "@sales-next/knowledge-base";
import {
  completeKnowledgeAnswer,
  getAiProviderFromRequest,
  getAiProviderHealth,
} from "@/lib/ai/llm";

export const runtime = "nodejs";

const SYSTEM = `你是 Sales Next 的企業知識庫問答引擎。你只能根據使用者提供的知識庫片段回答。
規則：
- 使用繁體中文。
- 不要編造片段沒有提到的內容。
- 回答要短、清楚、可執行。
- 保留來源編號，例如 [1]、[2]。`;

export async function POST(req: Request) {
  let body: { question?: string; context?: Citation[]; provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const question = body.question?.trim();
  const context = body.context ?? [];
  if (!question) return NextResponse.json({ error: "missing question" }, { status: 400 });

  const provider = getAiProviderFromRequest(body.provider);
  const health = getAiProviderHealth(provider);
  if (!health.live) {
    return NextResponse.json(
      { error: `${health.label} 未設定：${health.reason}，改用內建抽取式回答` },
      { status: 501 },
    );
  }

  try {
    const text = await completeKnowledgeAnswer(provider, question, context, SYSTEM);
    return NextResponse.json({ text, provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
