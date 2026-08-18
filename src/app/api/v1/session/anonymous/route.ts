import { NextRequest, NextResponse } from "next/server";
import { anonymousSessionSchema } from "@/server/api-schemas";
import { issueRecoveryCode, issueSession } from "@/server/auth/crypto";
import { setSessionCookie } from "@/server/auth/cookie";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = anonymousSessionSchema.parse(await request.json());
    const now = new Date(); const session = issueSession(now); const recovery = issueRecoveryCode();
    const user = await (await getStore()).createIdentity({
      displayName: body.displayName, contactEmail: body.email,
      session: { tokenHash: session.tokenHash, expiresAt: session.expiresAt },
      recovery: { lookupId: recovery.lookupId, secretHash: recovery.secretHash }, now,
    });
    const response = NextResponse.json({ user, recoveryCode: recovery.code }, { status: 201 });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) { return errorResponse(error); }
}
