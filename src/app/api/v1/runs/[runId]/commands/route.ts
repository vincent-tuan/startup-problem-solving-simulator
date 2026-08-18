import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { start } from "workflow/api";
import { commandRequestSchema } from "@/server/api-schemas";
import { requireRequestUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse } from "@/server/http";
import { getStore } from "@/server/store";
import type { SimulationCommand } from "@sim/engine";
import { recordMetric } from "@/server/telemetry";
import { resolveCompetitorTurnWorkflow } from "@/workflows/startup-world";

export const maxDuration = 10;

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const started=performance.now();
  try {
    assertSameOrigin(request); const user = await requireRequestUser(request); const { runId } = await context.params;
    const body = commandRequestSchema.parse(await request.json());
    const store = await getStore();
    const result = await store.executeCommand(user.id, runId, { ...body, type: body.type as SimulationCommand["type"] }, new Date());
    if (result.state.features?.public.competitors?.pendingTurn) {
      try { await start(resolveCompetitorTurnWorkflow, [user.id, runId, new Date().toISOString()]); }
      catch (workflowError) {
        recordMetric("agent_turn.workflow_start_failed", { runId, code: workflowError instanceof Error ? workflowError.message : "unknown" });
        after(async () => { try { await store.resolvePendingAgentTurn(user.id, runId, new Date()); } catch (error) { recordMetric("agent_turn.failed", { runId, code: error instanceof Error ? error.message : "unknown" }); } });
      }
    }
    recordMetric("command.accepted",{runId,commandId:body.commandId,type:body.type,durationMs:Math.round(performance.now()-started),version:result.version});
    return NextResponse.json(result);
  } catch (error) { recordMetric("command.rejected",{durationMs:Math.round(performance.now()-started),code:error instanceof Error?error.message:"unknown"});return errorResponse(error); }
}
