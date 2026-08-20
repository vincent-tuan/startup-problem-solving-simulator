import { NextRequest, NextResponse } from "next/server";
import type { CommercialCasesPublicStateV10_2, EmploymentCasesPublicStateV10 } from "@sim/engine";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

const views = new Set(["commercial", "employment"]);

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId } = await context.params;
    const view = request.nextUrl.searchParams.get("view") ?? "commercial";
    if (!views.has(view)) throw new Error("INVALID_CASE_VIEW");
    const run = await (await getStore()).getV10Run(user.id, runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    const commercial = run.state.features["commercial-cases"]?.public as CommercialCasesPublicStateV10_2 | undefined;
    const employment = run.state.features["employment-cases"]?.public as EmploymentCasesPublicStateV10 | undefined;
    if (!commercial || !employment) throw new Error("V10_2_FEATURE_NOT_AVAILABLE");
    return NextResponse.json({ runId, version: run.stateVersion, view, data: view === "commercial" ? commercial : employment });
  } catch (error) { return errorResponse(error); }
}
