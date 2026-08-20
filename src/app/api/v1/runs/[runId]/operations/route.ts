import { NextRequest, NextResponse } from "next/server";
import type { CommercialObligationsPublicStateV10_2, DeliveryServicePublicStateV10_2 } from "@sim/engine";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

const views = new Set(["delivery", "obligations"]);

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId } = await context.params;
    const view = request.nextUrl.searchParams.get("view") ?? "delivery";
    if (!views.has(view)) throw new Error("INVALID_OPERATIONS_VIEW");
    const run = await (await getStore()).getV10Run(user.id, runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    const delivery = run.state.features["delivery-and-service"]?.public as DeliveryServicePublicStateV10_2 | undefined;
    const obligations = run.state.features["commercial-obligations"]?.public as CommercialObligationsPublicStateV10_2 | undefined;
    if (!delivery || !obligations) throw new Error("V10_2_FEATURE_NOT_AVAILABLE");
    return NextResponse.json({ runId, version: run.stateVersion, view, data: view === "delivery" ? delivery : obligations });
  } catch (error) { return errorResponse(error); }
}
