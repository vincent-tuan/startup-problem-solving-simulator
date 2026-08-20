import { z } from "zod";
import {
  accountingBalanceV10,
  assertLedgerV10,
  createEntityLedgerV10,
  postAccountingEntryV10,
  type EntityLedgerV10,
} from "./accounting-core";
import type { SimulationFeatureV10 } from "./contracts";
import type { DomainEventV10 } from "./types";

const expenseKindSchema = z.enum([
  "recruiting",
  "payroll",
  "benefits_tax",
  "equipment",
  "severance",
  "legal",
  "settlement",
  "compensation_change",
  "product",
  "sales_marketing",
  "vendor",
  "compliance",
  "interest",
  "tax",
]);

const legacyExpenseSchema = z.object({
  transactionId: z.string().min(3).max(180),
  kind: expenseKindSchema,
  amount: z.number().finite().nonnegative().max(100_000_000),
  memo: z.string().min(2).max(300),
  dueDay: z.number().int().nonnegative(),
}).strict();

export const economicTransactionSchemaV10_1 = z.discriminatedUnion("kind", [
  z.object({ transactionId: z.string(), kind: z.literal("expense"), category: expenseKindSchema, amount: z.number().finite().positive(), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("invoice_issued"), amount: z.number().finite().positive(), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("customer_payment"), amount: z.number().finite().positive(), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("deferred_revenue_received"), amount: z.number().finite().positive(), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("revenue_recognized"), amount: z.number().finite().positive(), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("debt_received"), amount: z.number().finite().positive(), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
  z.object({ transactionId: z.string(), kind: z.literal("equity_received"), amount: z.number().finite().positive(), memo: z.string(), dueDay: z.number().int().nonnegative() }).strict(),
]);
export type EconomicTransactionV10_1 = z.infer<typeof economicTransactionSchemaV10_1>;

const journalSchema = z.object({
  transactionId: z.string(),
  category: expenseKindSchema,
  amount: z.number().finite().nonnegative(),
  memo: z.string(),
  dueDay: z.number().int().nonnegative(),
  postedDay: z.number().int().nonnegative(),
  people: z.boolean(),
  settled: z.boolean(),
}).strict();

const recentSchema = z.object({
  kind: z.string(),
  amount: z.number().finite().nonnegative(),
  memo: z.string(),
  dueDay: z.number().int().nonnegative(),
  postedDay: z.number().int().nonnegative(),
}).strict();

export const financeTreasuryPublicStateSchemaV10_1 = z.object({
  cash: z.number().finite().nonnegative(),
  peoplePayable: z.number().finite().nonnegative(),
  overduePeoplePayable: z.number().finite().nonnegative(),
  monthlyPeopleCost: z.number().finite().nonnegative(),
  runwaySignal: z.enum(["healthy", "tight", "critical", "insolvent"]),
  recentPeopleTransactions: z.array(recentSchema).max(30),
  accountsReceivable: z.number().finite().nonnegative(),
  accountsPayable: z.number().finite().nonnegative(),
  deferredRevenue: z.number().finite().nonnegative(),
  debt: z.number().finite().nonnegative(),
  paidInCapital: z.number().finite().nonnegative(),
  recognizedRevenue: z.number().finite().nonnegative(),
  monthlyOperatingCost: z.number().finite().nonnegative(),
  recentTransactions: z.array(recentSchema).max(60),
}).strict();
export type FinanceTreasuryPublicStateV10_1 = z.infer<typeof financeTreasuryPublicStateSchemaV10_1>;

const privateStateSchema = z.object({
  ledger: z.object({
    entries: z.array(z.object({
      id: z.string(), day: z.number().int().nonnegative(), memo: z.string(),
      lines: z.array(z.object({ account: z.string(), debit: z.number().finite().nonnegative(), credit: z.number().finite().nonnegative() })).min(2),
    })).max(4_000),
    postedEntryIds: z.array(z.string()).max(10_000),
    carriedBalances: z.record(z.string(), z.number().finite()),
  }).strict(),
  recognizedTransactionIds: z.array(z.string()).max(4_000),
  journal: z.array(journalSchema).max(4_000),
  runRateCost: z.number().finite().nonnegative(),
}).strict();
export type FinanceTreasuryPrivateStateV10_1 = z.infer<typeof privateStateSchema>;

const configSchema = z.object({
  openingCash: z.number().finite().nonnegative().max(100_000_000).default(500),
}).default({ openingCash: 500 });

type State = {
  public: FinanceTreasuryPublicStateV10_1;
  private: FinanceTreasuryPrivateStateV10_1;
};

const round = (value: number): number => Math.round(value * 100) / 100;

function refresh(state: State, day: number): void {
  const ledger = state.private.ledger as EntityLedgerV10;
  state.public.cash = round(Math.max(0, accountingBalanceV10(ledger, "cash")));
  state.public.accountsReceivable = round(Math.max(0, accountingBalanceV10(ledger, "accounts_receivable")));
  state.public.accountsPayable = round(Math.max(0, -accountingBalanceV10(ledger, "accounts_payable")));
  state.public.deferredRevenue = round(Math.max(0, -accountingBalanceV10(ledger, "deferred_revenue")));
  state.public.debt = round(Math.max(0, -accountingBalanceV10(ledger, "debt")));
  state.public.paidInCapital = round(Math.max(0, -accountingBalanceV10(ledger, "paid_in_capital")));
  state.public.recognizedRevenue = round(Math.max(0, -accountingBalanceV10(ledger, "revenue")));
  const openPeople = state.private.journal.filter((entry) => entry.people && !entry.settled);
  state.public.peoplePayable = round(openPeople.reduce((sum, entry) => sum + entry.amount, 0));
  state.public.overduePeoplePayable = round(openPeople.filter((entry) => entry.dueDay <= day).reduce((sum, entry) => sum + entry.amount, 0));
  const monthlyCost = Math.max(1, state.public.monthlyOperatingCost, state.private.runRateCost);
  const runway = state.public.cash / monthlyCost;
  state.public.runwaySignal = state.public.overduePeoplePayable > 0
    ? "insolvent"
    : runway < 1 ? "critical" : runway < 3 ? "tight" : "healthy";
}

function postExpense(
  state: State,
  transaction: z.infer<typeof legacyExpenseSchema>,
  day: number,
  people: boolean,
): void {
  if (state.private.recognizedTransactionIds.includes(transaction.transactionId)) return;
  state.private.recognizedTransactionIds.push(transaction.transactionId);
  const availableCash = accountingBalanceV10(state.private.ledger as EntityLedgerV10, "cash");
  const immediate = transaction.dueDay <= day && availableCash >= transaction.amount;
  postAccountingEntryV10(state.private.ledger as EntityLedgerV10, {
    id: transaction.transactionId,
    day,
    memo: transaction.memo,
    lines: immediate
      ? [{ account: `expense:${transaction.kind}`, debit: transaction.amount, credit: 0 }, { account: "cash", debit: 0, credit: transaction.amount }]
      : [{ account: `expense:${transaction.kind}`, debit: transaction.amount, credit: 0 }, { account: "accounts_payable", debit: 0, credit: transaction.amount }],
  });
  state.private.journal.push({
    transactionId: transaction.transactionId,
    category: transaction.kind,
    amount: transaction.amount,
    memo: transaction.memo,
    dueDay: transaction.dueDay,
    postedDay: day,
    people,
    settled: immediate,
  });
  state.private.journal = state.private.journal.slice(-4_000);
  state.public.monthlyOperatingCost = round(state.public.monthlyOperatingCost + transaction.amount);
  if (people && ["payroll", "benefits_tax"].includes(transaction.kind)) {
    state.public.monthlyPeopleCost = round(state.public.monthlyPeopleCost + transaction.amount);
  }
  const recent = { kind: transaction.kind, amount: transaction.amount, memo: transaction.memo, dueDay: transaction.dueDay, postedDay: day };
  state.public.recentTransactions.push(recent);
  if (people) state.public.recentPeopleTransactions.push(recent);
  state.public.recentTransactions = state.public.recentTransactions.slice(-60);
  state.public.recentPeopleTransactions = state.public.recentPeopleTransactions.slice(-30);
  refresh(state, day);
}

function postGeneral(state: State, event: DomainEventV10): void {
  const transaction = economicTransactionSchemaV10_1.parse(event.payload);
  if (transaction.kind === "expense") {
    postExpense(state, { ...transaction, kind: transaction.category }, event.simulationDay, false);
    return;
  }
  if (state.private.recognizedTransactionIds.includes(transaction.transactionId)) return;
  state.private.recognizedTransactionIds.push(transaction.transactionId);
  const ledger = state.private.ledger as EntityLedgerV10;
  if (
    transaction.kind === "customer_payment" &&
    transaction.amount > accountingBalanceV10(ledger, "accounts_receivable") + 0.005
  ) throw new Error("CUSTOMER_PAYMENT_EXCEEDS_RECEIVABLE");
  if (
    transaction.kind === "revenue_recognized" &&
    transaction.amount > -accountingBalanceV10(ledger, "deferred_revenue") + 0.005
  ) throw new Error("REVENUE_RECOGNITION_EXCEEDS_DEFERRED");
  const lines = transaction.kind === "invoice_issued"
    ? [{ account: "accounts_receivable", debit: transaction.amount, credit: 0 }, { account: "revenue", debit: 0, credit: transaction.amount }]
    : transaction.kind === "customer_payment"
      ? [{ account: "cash", debit: transaction.amount, credit: 0 }, { account: "accounts_receivable", debit: 0, credit: transaction.amount }]
      : transaction.kind === "deferred_revenue_received"
        ? [{ account: "cash", debit: transaction.amount, credit: 0 }, { account: "deferred_revenue", debit: 0, credit: transaction.amount }]
        : transaction.kind === "revenue_recognized"
          ? [{ account: "deferred_revenue", debit: transaction.amount, credit: 0 }, { account: "revenue", debit: 0, credit: transaction.amount }]
          : transaction.kind === "debt_received"
            ? [{ account: "cash", debit: transaction.amount, credit: 0 }, { account: "debt", debit: 0, credit: transaction.amount }]
            : [{ account: "cash", debit: transaction.amount, credit: 0 }, { account: "paid_in_capital", debit: 0, credit: transaction.amount }];
  postAccountingEntryV10(ledger, { id: transaction.transactionId, day: event.simulationDay, memo: transaction.memo, lines });
  state.public.recentTransactions.push({ kind: transaction.kind, amount: transaction.amount, memo: transaction.memo, dueDay: transaction.dueDay, postedDay: event.simulationDay });
  state.public.recentTransactions = state.public.recentTransactions.slice(-60);
  refresh(state, event.simulationDay);
}

function settleDue(state: State, day: number): void {
  for (const entry of state.private.journal.filter((candidate) => !candidate.settled && candidate.dueDay <= day)) {
    const cash = accountingBalanceV10(state.private.ledger as EntityLedgerV10, "cash");
    if (cash < entry.amount) continue;
    postAccountingEntryV10(state.private.ledger as EntityLedgerV10, {
      id: `${entry.transactionId}:settlement`, day, memo: `Settle ${entry.memo}`,
      lines: [{ account: "accounts_payable", debit: entry.amount, credit: 0 }, { account: "cash", debit: 0, credit: entry.amount }],
    });
    entry.settled = true;
  }
  refresh(state, day);
}

export function createFinanceTreasuryFeatureV10_1(): SimulationFeatureV10<
  FinanceTreasuryPublicStateV10_1,
  FinanceTreasuryPrivateStateV10_1,
  z.infer<typeof configSchema>
> {
  return {
    id: "finance-and-treasury",
    version: "1.1.0",
    dependencies: [],
    compatibleEngineRange: ">=10.1.0 <11.0.0",
    configSchema,
    publicStateSchema: financeTreasuryPublicStateSchemaV10_1,
    privateStateSchema,
    initialize: ({ config }) => {
      const ledger = createEntityLedgerV10(config.openingCash, "player-company");
      const state: State = {
        public: {
          cash: config.openingCash, peoplePayable: 0, overduePeoplePayable: 0,
          monthlyPeopleCost: 0, runwaySignal: "healthy", recentPeopleTransactions: [],
          accountsReceivable: 0, accountsPayable: 0, deferredRevenue: 0, debt: 0,
          paidInCapital: config.openingCash, recognizedRevenue: 0,
          monthlyOperatingCost: 0, recentTransactions: [],
        },
        private: { ledger, recognizedTransactionIds: [], journal: [], runRateCost: 0 },
      };
      refresh(state, 0);
      return state;
    },
    commands: {},
    effects: {},
    queries: [{
      id: "finance-and-treasury.liquidity",
      resolve: ({ ownState }) => ({
        cash: ownState.public.cash,
        runwaySignal: ownState.public.runwaySignal,
        monthlyPeopleCost: ownState.public.monthlyPeopleCost,
        monthlyOperatingCost: ownState.public.monthlyOperatingCost,
      }),
    }],
    eventSubscriptions: [{
      id: "finance-v10-1-workforce-transactions",
      eventType: "workforce-and-organization.economic_transaction_requested",
      handle: (context, event) => postExpense(context.ownState, legacyExpenseSchema.parse(event.payload), event.simulationDay, true),
    }, {
      id: "finance-v10-1-employment-transactions",
      eventType: "employment-cases.economic_transaction_requested",
      handle: (context, event) => postExpense(context.ownState, legacyExpenseSchema.parse(event.payload), event.simulationDay, true),
    }, {
      id: "finance-v10-1-general-transactions",
      eventType: "economy.transaction_requested",
      handle: (context, event) => postGeneral(context.ownState, event),
    }],
    hooks: {
      after_period_close: (context) => {
        settleDue(context.ownState, context.kernel.simulationDay);
        context.ownState.private.runRateCost = context.ownState.public.monthlyOperatingCost;
        context.ownState.public.monthlyPeopleCost = 0;
        context.ownState.public.monthlyOperatingCost = 0;
        refresh(context.ownState, context.kernel.simulationDay);
      },
    },
    invariants: [{
      id: "finance-v10-1-double-entry-and-idempotency",
      check: ({ ownState }) => {
        assertLedgerV10(ownState.private.ledger as EntityLedgerV10);
        if (new Set(ownState.private.recognizedTransactionIds).size !== ownState.private.recognizedTransactionIds.length) {
          throw new Error("DUPLICATE_ECONOMIC_TRANSACTION");
        }
        if (ownState.public.cash < 0) throw new Error("NEGATIVE_CASH_BALANCE");
      },
    }],
    projectionPolicy: {
      schema: financeTreasuryPublicStateSchemaV10_1,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: ["ledger", "recognizedTransactionIds", "journal"],
    },
    snapshotPolicy: { mode: "period_close", maximumCommandsBetweenSnapshots: 30 },
    retentionPolicy: { maximumHeadBytes: 2_000_000, maximumMaterialRecords: 4_000, archiveClosedRecords: true },
  };
}
