import { NextRequest, NextResponse } from "next/server";
import type { CreditCovenantsPublicStateV10_2, FinanceTreasuryPublicStateV10_2 } from "@sim/engine";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

const views = new Set(["ar", "cash", "facilities", "covenants"]);

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId } = await context.params;
    const view = request.nextUrl.searchParams.get("view") ?? "cash";
    if (!views.has(view)) throw new Error("INVALID_TREASURY_VIEW");
    const run = await (await getStore()).getV10Run(user.id, runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    const finance = run.state.features["finance-and-treasury"]?.public as FinanceTreasuryPublicStateV10_2 | undefined;
    const credit = run.state.features["credit-and-covenants"]?.public as CreditCovenantsPublicStateV10_2 | undefined;
    if (!finance || !credit) throw new Error("V10_2_FEATURE_NOT_AVAILABLE");
    const data = view === "ar" ? { accountsReceivable: finance.accountsReceivable, netAccountsReceivable: finance.netAccountsReceivable, arAging: finance.arAging, invoices: finance.invoices }
      : view === "facilities" ? { lenders: credit.lenders, facilities: credit.facilities }
        : view === "covenants" ? { covenantSignal: credit.covenantSignal, nextDeadlineDay: credit.nextDeadlineDay, facilities: credit.facilities, notices: credit.notices }
          : { cash: finance.cash, accountsPayable: finance.accountsPayable, debt: finance.debt, legalReserve: finance.legalReserve, runwaySignal: finance.runwaySignal, cashForecast: finance.cashForecast, recentTransactions: finance.recentTransactions };
    return NextResponse.json({ runId, version: run.stateVersion, view, data });
  } catch (error) { return errorResponse(error); }
}
