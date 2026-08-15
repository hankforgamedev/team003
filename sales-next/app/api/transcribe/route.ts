import { NextRequest, NextResponse } from "next/server";
import { hasKey, transcribe } from "@/lib/ai/openai";

export async function POST(req: NextRequest) {
  if (!hasKey()) return NextResponse.json({ demoMode: true });
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "缺少音檔" }, { status: 400 });
    const result = await transcribe(file);
    return NextResponse.json(result);
  } catch (e) {
    console.error("transcribe 失敗，回退 demo 模式", e);
    return NextResponse.json({ demoMode: true });
  }
}
