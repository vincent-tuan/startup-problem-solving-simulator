import { z } from "zod";
import {
  accountingBalanceV10,
  assertLedgerV10,
  createEntityLedgerV10,
  postAccountingEntryV10,
  type EntityLedgerV10,
} from "./accounting-core";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";
import type { DomainEventV10 } from "./types";

const money = z.number().finite().nonnegative().max(100_000_000);
const expenseCategory = z.enum([
  "recruiting", "payroll", "benefits_tax", "equipment", "severance", "legal",
  "settlement", "compensation_change", "product", "sales_marketing", "vendor",
  "compliance", "interest", "tax", "collections", "service_credit", "bad_debt",
]);

const workforceExpenseSchema = z.object({
  transactionId: z.string(), kind: expenseCategory, amount: money,
  memo: z.string(), dueDay: z.number().int().nonnegative(),
}).strict();

export const economicTransactionSchemaV10_2 = z.discriminatedUnion("kind", [
  z.object({ transactionId: z.string(), kind: z.literal("expense"), category: expenseCategory, amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("invoice_issued"), invoiceId: z.string(), accountId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("customer_payment"), invoiceId: z.string(), accountId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("credit_note"), invoiceId: z.string(), accountId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("receivable_write_off"), invoiceId: z.string(), accountId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("receivable_allowance"), invoiceId: z.string(), accountId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("revenue_recognized"), invoiceId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("debt_received"), facilityId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("debt_principal_repaid"), facilityId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("equity_received"), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("legal_reserve"), caseId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("case_settlement"), caseId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("insurance_recovery"), caseId: z.string(), amount: money.refine((value) => value > 0), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
]);
export type EconomicTransactionV10_2 = z.infer<typeof economicTransactionSchemaV10_2>;

const invoiceSchema = z.object({
  id: z.string(), accountId: z.string(), issuedDay: z.number().int().nonnegative(),
  dueDay: z.number().int().nonnegative(), originalAmount: money, openBalance: money,
  disputedAmount: money, allowance: money,
  status: z.enum(["open", "partial", "overdue", "disputed", "paid", "written_off", "credited"]),
}).strict();
export type TreasuryInvoiceV10_2 = z.infer<typeof invoiceSchema>;

const recentSchema = z.object({
  kind: z.string(), amount: money, memo: z.string(), postedDay: z.number().int().nonnegative(),
}).strict();

export const financeTreasuryPublicStateSchemaV10_2 = z.object({
  cash: money,
  accountsReceivable: money,
  netAccountsReceivable: money,
  accountsPayable: money,
  deferredRevenue: money,
  debt: money,
  paidInCapital: money,
  recognizedRevenue: money,
  legalReserve: money,
  monthlyPeopleCost: money,
  monthlyOperatingCost: money,
  peoplePayable: money,
  overduePeoplePayable: money,
  runwaySignal: z.enum(["healthy", "tight", "critical", "insolvent"]),
  arAging: z.object({ current: money, days1To30: money, days31To60: money, days61To90: money, days90Plus: money }).strict(),
  cashForecast: z.object({ optimistic: z.number().finite(), base: z.number().finite(), downside: z.number().finite(), horizonDays: z.literal(90) }).strict(),
  invoices: z.array(invoiceSchema).max(500),
  recentTransactions: z.array(recentSchema).max(80),
  recentPeopleTransactions: z.array(recentSchema).max(30),
}).strict();
export type FinanceTreasuryPublicStateV10_2 = z.infer<typeof financeTreasuryPublicStateSchemaV10_2>;

const payableSchema = z.object({
  id: z.string(), amount: money, dueDay: z.number().int().nonnegative(), people: z.boolean(), settled: z.boolean(), memo: z.string(),
}).strict();
const privateStateSchema = z.object({
  ledger: z.object({
    entries: z.array(z.object({ id: z.string(), day: z.number().int().nonnegative(), memo: z.string(), lines: z.array(z.object({ account: z.string(), debit: money, credit: money })).min(2) })).max(8_000),
    postedEntryIds: z.array(z.string()).max(16_000), carriedBalances: z.record(z.string(), z.number().finite()),
  }).strict(),
  recognizedTransactionIds: z.array(z.string()).max(8_000),
  payables: z.array(payableSchema).max(2_000),
  legalReserves: z.record(z.string(), money),
  runRateCost: money,
}).strict();
export type FinanceTreasuryPrivateStateV10_2 = z.infer<typeof privateStateSchema>;

const configSchema = z.object({ openingCash: money.default(500) }).default({ openingCash: 500 });
type State = { public: FinanceTreasuryPublicStateV10_2; private: FinanceTreasuryPrivateStateV10_2 };
type Context = FeatureRuntimeContextV10<FinanceTreasuryPublicStateV10_2, FinanceTreasuryPrivateStateV10_2>;
const round = (value: number): number => Math.round(value * 100) / 100;

function balance(state: State, account: string): number {
  return accountingBalanceV10(state.private.ledger as EntityLedgerV10, account);
}

function refresh(state: State, day: number): void {
  state.public.cash = round(Math.max(0, balance(state, "cash")));
  state.public.accountsReceivable = round(Math.max(0, balance(state, "accounts_receivable")));
  const allowance = Math.max(0, -balance(state, "allowance_for_doubtful_accounts"));
  state.public.netAccountsReceivable = round(Math.max(0, state.public.accountsReceivable - allowance));
  state.public.accountsPayable = round(Math.max(0, -balance(state, "accounts_payable")));
  state.public.deferredRevenue = round(Math.max(0, -balance(state, "deferred_revenue")));
  state.public.debt = round(Math.max(0, -balance(state, "debt")));
  state.public.paidInCapital = round(Math.max(0, -balance(state, "paid_in_capital")));
  state.public.recognizedRevenue = round(Math.max(0, -balance(state, "revenue")));
  state.public.legalReserve = round(Math.max(0, -balance(state, "legal_reserve")));
  const openPeople = state.private.payables.filter((item) => item.people && !item.settled);
  state.public.peoplePayable = round(openPeople.reduce((sum, item) => sum + item.amount, 0));
  state.public.overduePeoplePayable = round(openPeople.filter((item) => item.dueDay <= day).reduce((sum, item) => sum + item.amount, 0));
  const aging = { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 };
  for (const invoice of state.public.invoices.filter((item) => item.openBalance > 0)) {
    const age = day - invoice.dueDay;
    if (age <= 0) aging.current += invoice.openBalance;
    else if (age <= 30) aging.days1To30 += invoice.openBalance;
    else if (age <= 60) aging.days31To60 += invoice.openBalance;
    else if (age <= 90) aging.days61To90 += invoice.openBalance;
    else aging.days90Plus += invoice.openBalance;
    if (age > 0 && invoice.status === "open") invoice.status = "overdue";
  }
  state.public.arAging = Object.fromEntries(Object.entries(aging).map(([key, value]) => [key, round(value)])) as typeof state.public.arAging;
  const collectible = aging.current * 0.9 + aging.days1To30 * 0.65 + aging.days31To60 * 0.35 + aging.days61To90 * 0.15;
  const committed = state.public.monthlyOperatingCost * 3 + state.public.accountsPayable;
  state.public.cashForecast = {
    optimistic: round(state.public.cash + state.public.accountsReceivable * 0.95 - committed),
    base: round(state.public.cash + collectible - committed),
    downside: round(state.public.cash + aging.current * 0.45 + aging.days1To30 * 0.15 - committed - state.public.legalReserve),
    horizonDays: 90,
  };
  const monthlyCost = Math.max(1, state.private.runRateCost, state.public.monthlyOperatingCost);
  const runway = state.public.cash / monthlyCost;
  state.public.runwaySignal = state.public.overduePeoplePayable > 0 ? "insolvent" : runway < 1 ? "critical" : runway < 3 ? "tight" : "healthy";
}

function remember(state: State, kind: string, amount: number, memo: string, day: number, people = false): void {
  const item = { kind, amount: round(amount), memo, postedDay: day };
  state.public.recentTransactions.push(item);
  state.public.recentTransactions = state.public.recentTransactions.slice(-80);
  if (people) {
    state.public.recentPeopleTransactions.push(item);
    state.public.recentPeopleTransactions = state.public.recentPeopleTransactions.slice(-30);
  }
}

function postExpense(state: State, transaction: z.infer<typeof workforceExpenseSchema>, day: number, people: boolean): void {
  if (state.private.recognizedTransactionIds.includes(transaction.transactionId)) return;
  state.private.recognizedTransactionIds.push(transaction.transactionId);
  const immediate = transaction.dueDay <= day && state.public.cash >= transaction.amount;
  postAccountingEntryV10(state.private.ledger as EntityLedgerV10, {
    id: transaction.transactionId, day, memo: transaction.memo,
    lines: immediate
      ? [{ account: `expense:${transaction.kind}`, debit: transaction.amount, credit: 0 }, { account: "cash", debit: 0, credit: transaction.amount }]
      : [{ account: `expense:${transaction.kind}`, debit: transaction.amount, credit: 0 }, { account: "accounts_payable", debit: 0, credit: transaction.amount }],
  });
  if (!immediate) state.private.payables.push({ id: transaction.transactionId, amount: transaction.amount, dueDay: transaction.dueDay, people, settled: false, memo: transaction.memo });
  state.public.monthlyOperatingCost = round(state.public.monthlyOperatingCost + transaction.amount);
  if (people && ["payroll", "benefits_tax"].includes(transaction.kind)) state.public.monthlyPeopleCost = round(state.public.monthlyPeopleCost + transaction.amount);
  remember(state, transaction.kind, transaction.amount, transaction.memo, day, people);
  refresh(state, day);
}

function invoice(state: State, invoiceId: string): TreasuryInvoiceV10_2 {
  const found = state.public.invoices.find((item) => item.id === invoiceId);
  if (!found) throw new Error(`TREASURY_INVOICE_NOT_FOUND:${invoiceId}`);
  return found;
}

function postGeneral(state: State, event: DomainEventV10): void {
  const transaction = economicTransactionSchemaV10_2.parse(event.payload);
  if (transaction.kind === "expense") {
    postExpense(state, { ...transaction, kind: transaction.category }, event.simulationDay, false);
    return;
  }
  if (state.private.recognizedTransactionIds.includes(transaction.transactionId)) return;
  state.private.recognizedTransactionIds.push(transaction.transactionId);
  const ledger = state.private.ledger as EntityLedgerV10;
  const day = event.simulationDay;
  let lines: Array<{ account: string; debit: number; credit: number }>;
  if (transaction.kind === "invoice_issued") {
    if (state.public.invoices.some((item) => item.id === transaction.invoiceId)) throw new Error("DUPLICATE_INVOICE_ID");
    state.public.invoices.push({ id: transaction.invoiceId, accountId: transaction.accountId, issuedDay: day, dueDay: transaction.dueDay, originalAmount: transaction.amount, openBalance: transaction.amount, disputedAmount: 0, allowance: 0, status: "open" });
    lines = [{ account: "accounts_receivable", debit: transaction.amount, credit: 0 }, { account: "deferred_revenue", debit: 0, credit: transaction.amount }];
  } else if (transaction.kind === "customer_payment") {
    const item = invoice(state, transaction.invoiceId);
    if (transaction.amount > item.openBalance + 0.005) throw new Error("CUSTOMER_PAYMENT_EXCEEDS_INVOICE");
    item.openBalance = round(item.openBalance - transaction.amount);
    item.status = item.openBalance <= 0 ? "paid" : "partial";
    lines = [{ account: "cash", debit: transaction.amount, credit: 0 }, { account: "accounts_receivable", debit: 0, credit: transaction.amount }];
  } else if (transaction.kind === "credit_note" || transaction.kind === "receivable_write_off") {
    const item = invoice(state, transaction.invoiceId);
    if (transaction.amount > item.openBalance + 0.005) throw new Error("RECEIVABLE_REDUCTION_EXCEEDS_INVOICE");
    item.openBalance = round(item.openBalance - transaction.amount);
    item.status = transaction.kind === "credit_note" ? "credited" : "written_off";
    const debitAccount = transaction.kind === "credit_note" ? "expense:service_credit" : "expense:bad_debt";
    lines = [{ account: debitAccount, debit: transaction.amount, credit: 0 }, { account: "accounts_receivable", debit: 0, credit: transaction.amount }];
  } else if (transaction.kind === "receivable_allowance") {
    const item = invoice(state, transaction.invoiceId);
    const additional = Math.max(0, Math.min(transaction.amount, item.openBalance) - item.allowance);
    if (additional <= 0) return;
    item.allowance = round(item.allowance + additional);
    lines = [{ account: "expense:bad_debt", debit: additional, credit: 0 }, { account: "allowance_for_doubtful_accounts", debit: 0, credit: additional }];
  } else if (transaction.kind === "revenue_recognized") {
    if (transaction.amount > state.public.deferredRevenue + 0.005) throw new Error("REVENUE_RECOGNITION_EXCEEDS_DEFERRED");
    lines = [{ account: "deferred_revenue", debit: transaction.amount, credit: 0 }, { account: "revenue", debit: 0, credit: transaction.amount }];
  } else if (transaction.kind === "debt_received") {
    lines = [{ account: "cash", debit: transaction.amount, credit: 0 }, { account: "debt", debit: 0, credit: transaction.amount }];
  } else if (transaction.kind === "debt_principal_repaid") {
    if (transaction.amount > state.public.cash + 0.005 || transaction.amount > state.public.debt + 0.005) throw new Error("INVALID_DEBT_REPAYMENT");
    lines = [{ account: "debt", debit: transaction.amount, credit: 0 }, { account: "cash", debit: 0, credit: transaction.amount }];
  } else if (transaction.kind === "equity_received") {
    lines = [{ account: "cash", debit: transaction.amount, credit: 0 }, { account: "paid_in_capital", debit: 0, credit: transaction.amount }];
  } else if (transaction.kind === "legal_reserve") {
    const existing = state.private.legalReserves[transaction.caseId] ?? 0;
    const additional = Math.max(0, transaction.amount - existing);
    if (additional <= 0) return;
    state.private.legalReserves[transaction.caseId] = round(existing + additional);
    lines = [{ account: "expense:legal", debit: additional, credit: 0 }, { account: "legal_reserve", debit: 0, credit: additional }];
  } else if (transaction.kind === "case_settlement") {
    const reserved = state.private.legalReserves[transaction.caseId] ?? 0;
    const applied = Math.min(reserved, transaction.amount);
    const excess = transaction.amount - applied;
    const cash = state.public.cash;
    const immediate = cash >= transaction.amount;
    lines = [
      ...(applied > 0 ? [{ account: "legal_reserve", debit: applied, credit: 0 }] : []),
      ...(excess > 0 ? [{ account: "expense:settlement", debit: excess, credit: 0 }] : []),
      { account: immediate ? "cash" : "accounts_payable", debit: 0, credit: transaction.amount },
    ];
    state.private.legalReserves[transaction.caseId] = round(reserved - applied);
    if (!immediate) state.private.payables.push({ id: transaction.transactionId, amount: transaction.amount, dueDay: transaction.dueDay, people: false, settled: false, memo: transaction.memo });
  } else {
    lines = [{ account: "cash", debit: transaction.amount, credit: 0 }, { account: "insurance_recovery_income", debit: 0, credit: transaction.amount }];
  }
  postAccountingEntryV10(ledger, { id: transaction.transactionId, day, memo: transaction.memo, lines });
  remember(state, transaction.kind, transaction.amount, transaction.memo, day);
  state.public.invoices = state.public.invoices.slice(-500);
  refresh(state, day);
}

function markInvoiceDisputed(state: State, event: DomainEventV10): void {
  const payload = z.object({ invoiceId: z.string(), disputedAmount: money }).parse(event.payload);
  const item = invoice(state, payload.invoiceId);
  item.disputedAmount = round(Math.min(item.openBalance, payload.disputedAmount));
  item.status = "disputed";
  refresh(state, event.simulationDay);
}

function settlePayables(state: State, day: number): void {
  for (const item of state.private.payables.filter((candidate) => !candidate.settled && candidate.dueDay <= day)) {
    if (state.public.cash < item.amount) continue;
    postAccountingEntryV10(state.private.ledger as EntityLedgerV10, { id: `${item.id}:settled`, day, memo: `Settle ${item.memo}`, lines: [{ account: "accounts_payable", debit: item.amount, credit: 0 }, { account: "cash", debit: 0, credit: item.amount }] });
    item.settled = true;
    refresh(state, day);
  }
}

export function createFinanceTreasuryFeatureV10_2(options: { procurement?: boolean } = {}): SimulationFeatureV10<FinanceTreasuryPublicStateV10_2, FinanceTreasuryPrivateStateV10_2, z.infer<typeof configSchema>> {
  return {
    id: "finance-and-treasury", version: options.procurement ? "1.3.0" : "1.2.0", dependencies: [], compatibleEngineRange: ">=10.2.0 <11.0.0",
    configSchema, publicStateSchema: financeTreasuryPublicStateSchemaV10_2, privateStateSchema,
    initialize: ({ config }) => {
      const ledger = createEntityLedgerV10(config.openingCash, "player-company");
      const state: State = {
        public: {
          cash: config.openingCash, accountsReceivable: 0, netAccountsReceivable: 0, accountsPayable: 0,
          deferredRevenue: 0, debt: 0, paidInCapital: config.openingCash, recognizedRevenue: 0, legalReserve: 0,
          monthlyPeopleCost: 0, monthlyOperatingCost: 0, peoplePayable: 0, overduePeoplePayable: 0,
          runwaySignal: "healthy", arAging: { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 },
          cashForecast: { optimistic: config.openingCash, base: config.openingCash, downside: config.openingCash, horizonDays: 90 },
          invoices: [], recentTransactions: [], recentPeopleTransactions: [],
        },
        private: { ledger, recognizedTransactionIds: [], payables: [], legalReserves: {}, runRateCost: 0 },
      };
      refresh(state, 0);
      return state;
    },
    commands: {}, effects: {},
    queries: [{
      id: "finance-and-treasury.liquidity",
      resolve: ({ ownState }) => ({ cash: ownState.public.cash, runwaySignal: ownState.public.runwaySignal, monthlyPeopleCost: ownState.public.monthlyPeopleCost, monthlyOperatingCost: ownState.public.monthlyOperatingCost }),
    }, {
      id: "finance-and-treasury.invoice",
      resolve: ({ ownState }, input) => structuredClone(ownState.public.invoices.find((item) => item.id === (input as { invoiceId?: string } | undefined)?.invoiceId) ?? null),
    }, {
      id: "finance-and-treasury.covenant-base",
      resolve: ({ ownState }) => ({
        cash: ownState.public.cash, debt: ownState.public.debt, recurringRevenue: ownState.public.recognizedRevenue,
        monthlyBurn: Math.max(ownState.public.monthlyOperatingCost, ownState.private.runRateCost),
        eligibleReceivables: round(ownState.public.invoices.filter((item) => item.openBalance > 0 && item.disputedAmount === 0 && !["written_off", "credited"].includes(item.status)).reduce((sum, item) => sum + item.openBalance * (item.status === "overdue" ? 0.5 : 0.85), 0)),
      }),
    }, {
      id: "finance-and-treasury.account-invoices",
      resolve: ({ ownState }, input) => structuredClone(ownState.public.invoices.filter((item) => item.accountId === (input as { accountId?: string } | undefined)?.accountId).sort((left, right) => right.issuedDay - left.issuedDay)),
    }],
    eventSubscriptions: [{
      id: "finance-v10-2-workforce-transactions", eventType: "workforce-and-organization.economic_transaction_requested",
      handle: (context, event) => postExpense(context.ownState, workforceExpenseSchema.parse(event.payload), event.simulationDay, true),
    }, {
      id: "finance-v10-2-employment-transactions", eventType: "employment-cases.economic_transaction_requested",
      handle: (context, event) => postExpense(context.ownState, workforceExpenseSchema.parse(event.payload), event.simulationDay, true),
    }, {
      id: "finance-v10-2-customer-transactions", eventType: "customers-and-revenue.economic_transaction_requested",
      handle: (context, event) => postGeneral(context.ownState, event),
    }, {
      id: "finance-v10-2-delivery-transactions", eventType: "delivery-and-service.economic_transaction_requested",
      handle: (context, event) => postGeneral(context.ownState, event),
    }, {
      id: "finance-v10-2-credit-transactions", eventType: "credit-and-covenants.economic_transaction_requested",
      handle: (context, event) => postGeneral(context.ownState, event),
    }, {
      id: "finance-v10-2-commercial-case-transactions", eventType: "commercial-cases.economic_transaction_requested",
      handle: (context, event) => postGeneral(context.ownState, event),
    }, {
      id: "finance-v10-2-invoice-disputes", eventType: "customers-and-revenue.invoice_disputed",
      handle: (context, event) => markInvoiceDisputed(context.ownState, event),
    }, {
      id: "finance-v10-2-general-transactions", eventType: "economy.transaction_requested",
      handle: (context, event) => postGeneral(context.ownState, event),
    }, ...(options.procurement ? [{
      id: "finance-v10-3-procurement-transactions", eventType: "procurement-processes.economic_transaction_requested" as const,
      handle: (context: Context, event: DomainEventV10) => postGeneral(context.ownState, event),
    }] : [])],
    hooks: {
      after_accounting_close: (context) => {
        settlePayables(context.ownState, context.kernel.simulationDay);
        context.ownState.private.runRateCost = Math.max(context.ownState.public.monthlyOperatingCost, context.ownState.private.runRateCost * 0.85);
        context.ownState.public.monthlyPeopleCost = 0;
        context.ownState.public.monthlyOperatingCost = 0;
        refresh(context.ownState, context.kernel.simulationDay);
      },
    },
    invariants: [{
      id: "finance-v10-2-ledger-invoices-and-idempotency",
      check: ({ ownState }) => {
        assertLedgerV10(ownState.private.ledger as EntityLedgerV10);
        if (new Set(ownState.private.recognizedTransactionIds).size !== ownState.private.recognizedTransactionIds.length) throw new Error("DUPLICATE_ECONOMIC_TRANSACTION");
        if (new Set(ownState.public.invoices.map((item) => item.id)).size !== ownState.public.invoices.length) throw new Error("DUPLICATE_INVOICE_ID");
        for (const item of ownState.public.invoices) if (item.openBalance > item.originalAmount + 0.005 || item.openBalance < 0) throw new Error("INVALID_INVOICE_BALANCE");
        const subledger = round(ownState.public.invoices.reduce((sum, item) => sum + item.openBalance, 0));
        if (Math.abs(subledger - ownState.public.accountsReceivable) > 0.02) throw new Error(`AR_SUBLEDGER_MISMATCH:${subledger}:${ownState.public.accountsReceivable}`);
      },
    }],
    projectionPolicy: { schema: financeTreasuryPublicStateSchemaV10_2, project: ({ publicState }) => structuredClone(publicState), denyKeys: ["ledger", "recognizedTransactionIds", "legalReserves", "runRateCost"] },
    snapshotPolicy: { mode: "period_close", maximumCommandsBetweenSnapshots: 30 },
    retentionPolicy: { maximumHeadBytes: 3_000_000, maximumMaterialRecords: 8_000, archiveClosedRecords: true },
  };
}
