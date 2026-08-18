import { NextRequest, NextResponse } from "next/server";
import { issueRecoveryCode } from "@/server/auth/crypto";
import { requireRequestUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request); const user = await requireRequestUser(request); const now = new Date(); const recovery = issueRecoveryCode();
    await (await getStore()).rotateRecovery(user.id, recovery.lookupId, recovery.secretHash, now);
    return NextResponse.json({ recoveryCode: recovery.code });
  } catch (error) { return errorResponse(error); }
}
