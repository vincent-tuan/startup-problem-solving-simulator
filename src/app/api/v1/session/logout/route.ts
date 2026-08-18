import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, SESSION_COOKIE } from "@/server/auth/cookie";
import { hashSessionToken } from "@/server/auth/crypto";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request); const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) await (await getStore()).revokeSession(hashSessionToken(token), new Date());
    const response = NextResponse.json({ ok: true }); clearSessionCookie(response); return response;
  } catch (error) { return errorResponse(error); }
}
