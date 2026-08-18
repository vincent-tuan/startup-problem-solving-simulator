import { NextRequest, NextResponse } from "next/server";
import { recoverySchema } from "@/server/api-schemas";
import { hashRateLimitKey, issueRecoveryCode, issueSession, parseRecoveryCode } from "@/server/auth/crypto";
import { setSessionCookie } from "@/server/auth/cookie";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { consumeRateLimit } from "@/server/rate-limit";
import { getStore } from "@/server/store";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = recoverySchema.parse(await request.json());
    const parsed = parseRecoveryCode(body.recoveryCode);
    if (!parsed) throw new Error("INVALID_RECOVERY_CODE");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    await consumeRateLimit(`recover:${hashRateLimitKey(`${ip}:${parsed.lookupId}`)}`);
    const now = new Date(); const session = issueSession(now); const replacement = issueRecoveryCode();
    const user = await (await getStore()).recoverIdentity({
      ...parsed, session: { tokenHash: session.tokenHash, expiresAt: session.expiresAt },
      replacement: { lookupId: replacement.lookupId, secretHash: replacement.secretHash }, now,
    });
    const response = NextResponse.json({ user, recoveryCode: replacement.code });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) { return errorResponse(error); }
}
