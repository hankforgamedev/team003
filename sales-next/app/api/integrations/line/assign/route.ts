import { NextRequest, NextResponse } from "next/server";
import { hasLineSession } from "@/lib/integrations/line-auth";
import { assignLineCustomer } from "@/lib/integrations/line-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!hasLineSession(request)) {
    return NextResponse.json({ error: "LINE 整合未連接" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    customerKey?: unknown;
    company?: unknown;
  };
  const customerKey = typeof body.customerKey === "string" ? body.customerKey : "";
  const company = typeof body.company === "string" ? body.company : "";
  try {
    return NextResponse.json(await assignLineCustomer(customerKey, company));
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法完成客戶歸檔";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
