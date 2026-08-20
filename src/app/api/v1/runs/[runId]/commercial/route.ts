import { NextRequest, NextResponse } from "next/server";
import type {
  CommercialOpportunitiesPublicStateV10_3,
  ContractLifecyclePublicStateV10_3,
  CustomerOrganizationsPublicStateV10_3,
  ProcurementProcessesPublicStateV10_3,
} from "@sim/engine";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

const views = new Set(["organizations", "opportunities", "procurement", "contracts"]);

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request);
    const { runId } = await context.params;
    const view = request.nextUrl.searchParams.get("view") ?? "opportunities";
    if (!views.has(view)) throw new Error("INVALID_COMMERCIAL_VIEW");
    const run = await (await getStore()).getV10Run(user.id, runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    const organizations = run.state.features["customer-organizations"]?.public as CustomerOrganizationsPublicStateV10_3 | undefined;
    const opportunities = run.state.features["commercial-opportunities"]?.public as CommercialOpportunitiesPublicStateV10_3 | undefined;
    const procurement = run.state.features["procurement-processes"]?.public as ProcurementProcessesPublicStateV10_3 | undefined;
    const contracts = run.state.features["contract-lifecycle"]?.public as ContractLifecyclePublicStateV10_3 | undefined;
    if (!organizations || !opportunities || !procurement || !contracts) throw new Error("V10_3_FEATURE_NOT_AVAILABLE");
    const data = view === "organizations" ? organizations : view === "procurement" ? procurement : view === "contracts" ? contracts : opportunities;
    return NextResponse.json({ runId, version: run.stateVersion, view, data });
  } catch (error) {
    return errorResponse(error);
  }
}
