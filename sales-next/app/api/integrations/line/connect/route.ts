import { NextRequest, NextResponse } from "next/server";
import {
  LINE_SESSION_COOKIE,
  isValidLineAccessCode,
  lineIntegrationToken,
  lineSessionValue,
} from "@/lib/integrations/line-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!lineIntegrationToken()) {
    return NextResponse.json({ error: "LINE 整合尚未完成伺服器設定" }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { accessCode?: unknown };
  const accessCode = typeof body.accessCode === "string" ? body.accessCode : "";
  if (!isValidLineAccessCode(accessCode)) {
    return NextResponse.json({ error: "整合存取碼錯誤" }, { status: 401 });
  }

  const response = NextResponse.json({ connected: true });
  response.cookies.set(LINE_SESSION_COOKIE, lineSessionValue()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ connected: false });
  response.cookies.set(LINE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
