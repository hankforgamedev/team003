import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const LINE_SESSION_COOKIE = "sales-next-line-session";

export function lineIntegrationToken(): string | null {
  const value = process.env.SALES_NEXT_INTEGRATION_TOKEN?.trim();
  return value || null;
}

export function lineSessionValue(token = lineIntegrationToken()): string | null {
  if (!token) return null;
  return createHmac("sha256", token)
    .update("sales-next-line-session-v1", "utf8")
    .digest("base64url");
}

export function isValidLineAccessCode(candidate: string): boolean {
  const expected = lineIntegrationToken();
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

export function hasLineSession(request: NextRequest): boolean {
  const expected = lineSessionValue();
  const received = request.cookies.get(LINE_SESSION_COOKIE)?.value;
  return Boolean(expected && received && safeEqual(received, expected));
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
