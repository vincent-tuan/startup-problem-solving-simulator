import { NextRequest, NextResponse } from "next/server";
import type { EmploymentCasesPublicStateV10, FounderManagementPublicStateV10, WorkforcePublicStateV10 } from "@sim/engine";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

const views = new Set(["team", "hiring", "management", "cases"]);

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request);
    const { runId } = await context.params;
    const view = request.nextUrl.searchParams.get("view") ?? "team";
    if (!views.has(view)) throw new Error("INVALID_WORKFORCE_VIEW");
    const cursor = Math.max(0, Number(request.nextUrl.searchParams.get("cursor") ?? 0) || 0);
    const run = await (await getStore()).getV10Run(user.id, runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    const workforce = run.state.features["workforce-and-organization"].public as WorkforcePublicStateV10;
    const management = run.state.features["founder-and-management"].public as FounderManagementPublicStateV10;
    const cases = run.state.features["employment-cases"].public as EmploymentCasesPublicStateV10;
    const payload = view === "hiring"
      ? { openRoles: workforce.openRoles, candidates: workforce.candidates.slice(cursor, cursor + 25), nextCursor: workforce.candidates.length > cursor + 25 ? cursor + 25 : null }
      : view === "management"
        ? { employees: workforce.employees, policies: workforce.policies, signals: workforce.signals.slice(-50), management }
        : view === "cases"
          ? { cases: cases.cases.slice(cursor, cursor + 25), nextCursor: cases.cases.length > cursor + 25 ? cursor + 25 : null, disclaimer: cases.disclaimer }
          : { employees: workforce.employees, openRoles: workforce.openRoles, signals: workforce.signals.slice(-50), cultureSignal: workforce.cultureSignal };
    return NextResponse.json({ runId, version: run.stateVersion, view, data: payload });
  } catch (error) {
    return errorResponse(error);
  }
}
