import { NextRequest, NextResponse } from "next/server";
import { hasLineSession, lineIntegrationToken } from "@/lib/integrations/line-auth";
import { readLineRecords } from "@/lib/integrations/line-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!lineIntegrationToken()) {
    return NextResponse.json({ error: "LINE 整合尚未完成伺服器設定" }, { status: 503 });
  }
  if (!hasLineSession(request)) {
    return NextResponse.json({ error: "請先在設定頁連接 LINE 整合" }, { status: 401 });
  }

  try {
    return NextResponse.json(await readLineRecords());
  } catch (error) {
    console.error("LINE records failed", error);
    return NextResponse.json(
      { error: "無法讀取 LINE 客戶資料，請稍後重試" },
      { status: 502 }
    );
  }
}
