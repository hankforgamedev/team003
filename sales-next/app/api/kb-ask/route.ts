// 知識庫問答的 server 端：暫時改走 OpenAI GPT API。
// 沒設 OPENAI_API_KEY → 回 501，client provider 會丟 error，
// team003 的 ask() 會自動降級成抽取式原文回答（附出處仍在）。

import { NextResponse } from "next/server";
import { buildPrompt, type Citation } from "@sales-next/knowledge-base";
import { chatText, hasKey } from "@/lib/ai/openai";

export const runtime = "nodejs";

const SYSTEM = `你是 Sales Next 的企業知識庫問答引擎。你只能根據使用者提供的知識庫片段回答。
規則：
- 使用繁體中文。
- 不要編造片段沒有提到的內容。
- 回答要短、清楚、可執行。
- 保留來源編號，例如 [1]、[2]。`;

export async function POST(req: Request) {
  if (!hasKey()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY 未設定，改用內建抽取式回答" },
      { status: 501 },
    );
  }

  let body: { question?: string; context?: Citation[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const question = body.question?.trim();
  const context = body.context ?? [];
  if (!question) return NextResponse.json({ error: "missing question" }, { status: 400 });

  try {
    const text = await chatText(SYSTEM, buildPrompt(question, context));
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
