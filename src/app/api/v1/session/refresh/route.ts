import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, setSessionCookie } from "@/server/auth/cookie";
import { hashSessionToken, issueSession } from "@/server/auth/crypto";
import { requireRequestUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request); const user = await requireRequestUser(request); const current = request.cookies.get(SESSION_COOKIE)?.value;
    if (!current) throw new Error("UNAUTHORIZED");
    const now = new Date(); const replacement = issueSession(now);
    const rotated = await (await getStore()).refreshSession(user.id, hashSessionToken(current), { tokenHash: replacement.tokenHash, expiresAt: replacement.expiresAt }, now);
    const response = NextResponse.json({ rotated });
    if (rotated) setSessionCookie(response, replacement.token, replacement.expiresAt);
    return response;
  } catch (error) { return errorResponse(error); }
}
