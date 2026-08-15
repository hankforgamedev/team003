import { NextRequest, NextResponse } from "next/server";
import { hasLineSession, lineIntegrationToken } from "@/lib/integrations/line-auth";
import { readLineStatus } from "@/lib/integrations/line-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!lineIntegrationToken()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      requiresAccessCode: false,
      accountName: "Sales Next 測試",
      customerCount: 0,
      recordCount: 0,
      unassignedCount: 0,
      lastMessageAt: null,
    });
  }
  if (!hasLineSession(request)) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        requiresAccessCode: true,
        accountName: "Sales Next 測試",
        customerCount: 0,
        recordCount: 0,
        unassignedCount: 0,
        lastMessageAt: null,
      },
      { status: 401 }
    );
  }

  try {
    return NextResponse.json(await readLineStatus());
  } catch (error) {
    console.error("LINE status failed", error);
    return NextResponse.json(
      { error: "無法讀取 LINE Pipeline，請檢查 AWS 權限與 S3 設定" },
      { status: 502 }
    );
  }
}
