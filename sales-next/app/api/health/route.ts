import { NextRequest, NextResponse } from "next/server";
import { getAiProviderFromRequest, getAiProviderHealth } from "@/lib/ai/llm";
import { hasKey as hasOpenAiKey } from "@/lib/ai/openai";

export async function GET(req: NextRequest) {
  const provider = getAiProviderFromRequest(req.nextUrl.searchParams.get("provider"));
  const health = getAiProviderHealth(provider);
  return NextResponse.json({
    aiLive: health.live,
    provider: health.provider,
    label: health.label,
    model: health.model,
    reason: health.reason,
    transcriptionLive: hasOpenAiKey(),
  });
}
