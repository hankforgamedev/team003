import { NextRequest, NextResponse } from "next/server";
import { chatJSON, hasKey } from "@/lib/ai/openai";

const SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          why: { type: "string" },
          dueInDays: { type: "number" },
        },
        required: ["title", "detail", "why", "dueInDays"],
      },
    },
    reasoning: { type: "array", items: { type: "string" } },
  },
  required: ["actions"],
} as const;

const SYSTEM = `你是 B2B 銷售顧問。根據會議抽取結果與「規則引擎的初步建議」，產出最終的 Next Best Action 清單（最多 4 條，繁體中文）。
原則：
- 以規則引擎的建議為基礎（那些是顧問方法論＋自家歷史資料），你負責讓行動更具體、更貼合這場會議的細節
- 每條 action 的 why 必須保留資料依據（規則引擎給的數字要保留）
- dueInDays 是建議完成天數，依緊急度排序
- 不要發明會議中沒有的事實`;

export async function POST(req: NextRequest) {
  if (!hasKey()) return NextResponse.json({ demoMode: true });
  try {
    const { extraction, ruleResult, transcriptSummary } = await req.json();
    const result = await chatJSON(
      SYSTEM,
      `會議抽取結果：\n${JSON.stringify(extraction, null, 2)}\n\n規則引擎初步建議：\n${JSON.stringify(ruleResult, null, 2)}\n\n會議摘要：\n${transcriptSummary ?? ""}`,
      "nba_result",
      SCHEMA
    );
    return NextResponse.json({ result });
  } catch (e) {
    console.error("nba 失敗，回退 demo 模式", e);
    return NextResponse.json({ demoMode: true });
  }
}
