import { NextRequest, NextResponse } from "next/server";
import type { CustomersRevenuePublicStateV10_2, FinanceTreasuryPublicStateV10_2 } from "@sim/engine";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

const views = new Set(["accounts", "contracts", "cohorts"]);

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId } = await context.params;
    const view = request.nextUrl.searchParams.get("view") ?? "accounts";
    if (!views.has(view)) throw new Error("INVALID_CUSTOMER_VIEW");
    const run = await (await getStore()).getV10Run(user.id, runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    const customers = run.state.features["customers-and-revenue"]?.public as CustomersRevenuePublicStateV10_2 | undefined;
    const finance = run.state.features["finance-and-treasury"]?.public as FinanceTreasuryPublicStateV10_2 | undefined;
    if (!customers || !finance) throw new Error("V10_2_FEATURE_NOT_AVAILABLE");
    const data = view === "cohorts" ? { cohorts: customers.cohorts, revenueSignal: customers.revenueSignal }
      : view === "contracts" ? { contracts: customers.accounts.map((item) => ({ accountId: item.id, accountName: item.name, monthlyPrice: item.monthlyPrice, paymentTermsDays: item.paymentTermsDays, serviceLevel: item.serviceLevel, nextRenewalDay: item.nextRenewalDay })), invoices: finance.invoices }
        : { accounts: customers.accounts, paymentRecords: customers.paymentRecords, concentrationSignal: customers.concentrationSignal, revenueSignal: customers.revenueSignal };
    return NextResponse.json({ runId, version: run.stateVersion, view, data });
  } catch (error) { return errorResponse(error); }
}
