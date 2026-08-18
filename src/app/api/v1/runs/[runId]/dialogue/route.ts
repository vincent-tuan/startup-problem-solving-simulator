import { NextRequest, NextResponse } from "next/server";
import { dialogueSchema } from "@/server/api-schemas";
import { generateDialogue } from "@/server/ai/dialogue";
import { requireRequestUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { consumeRateLimit } from "@/server/rate-limit";
import { getStore } from "@/server/store";

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    assertSameOrigin(request); const user = await requireRequestUser(request); const { runId } = await context.params;
    await consumeRateLimit(`dialogue:${user.id}:${runId}`, { limit: 20, windowMs: 15 * 60_000, blockMs: 15 * 60_000 });
    const body = dialogueSchema.parse(await request.json()); const store = await getStore(); const run = await store.getRun(user.id, runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    if (((run.state as { schemaVersion?: number }).schemaVersion ?? 0) < 2) throw new Error("DIALOGUE_ENGINE_UNSUPPORTED");
    if ((await store.listDialogue(user.id, runId)).length >= 40) throw new Error("DIALOGUE_BUDGET_EXCEEDED");
    const turn = await generateDialogue(runId, user.id, run.state, body.interactionId, body.actorId, body.message, new Date());
    await store.saveDialogue(user.id, runId, turn);
    return NextResponse.json({ turn });
  } catch (error) { return errorResponse(error); }
}
