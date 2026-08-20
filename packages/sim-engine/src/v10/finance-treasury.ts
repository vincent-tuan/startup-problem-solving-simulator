import { z } from "zod";
import type { DomainEventV10 } from "./types";
import type { SimulationFeatureV10 } from "./contracts";

const transactionSchema = z.object({
  transactionId: z.string().min(3).max(180),
  kind: z.enum([
    "recruiting",
    "payroll",
    "benefits_tax",
    "equipment",
    "severance",
    "legal",
    "settlement",
    "compensation_change",
  ]),
  amount: z.number().finite().nonnegative().max(100_000_000),
  memo: z.string().min(2).max(300),
  dueDay: z.number().int().nonnegative(),
});
export type WorkforceEconomicTransactionV10 = z.infer<typeof transactionSchema>;

const journalEntrySchema = transactionSchema.extend({
  postedDay: z.number().int().nonnegative(),
});
const publicStateSchema = z.object({
  cash: z.number().finite(),
  peoplePayable: z.number().finite().nonnegative(),
  overduePeoplePayable: z.number().finite().nonnegative(),
  monthlyPeopleCost: z.number().finite().nonnegative(),
  runwaySignal: z.enum(["healthy", "tight", "critical", "insolvent"]),
  recentPeopleTransactions: z
    .array(journalEntrySchema.omit({ transactionId: true }))
    .max(30),
});
export type FinanceTreasuryPublicStateV10 = z.infer<typeof publicStateSchema>;

const privateStateSchema = z.object({
  openingCash: z.number().finite().nonnegative(),
  recognizedTransactionIds: z.array(z.string()).max(2_000),
  settledTransactionIds: z.array(z.string()).max(2_000),
  journal: z.array(journalEntrySchema).max(2_000),
});
export type FinanceTreasuryPrivateStateV10 = z.infer<typeof privateStateSchema>;

const configSchema = z
  .object({
    openingCash: z
      .number()
      .finite()
      .nonnegative()
      .max(100_000_000)
      .default(500),
  })
  .default({ openingCash: 500 });

function runwaySignal(
  cash: number,
  monthlyPeopleCost: number,
  overduePeoplePayable: number,
): FinanceTreasuryPublicStateV10["runwaySignal"] {
  if (cash < 0 || overduePeoplePayable > 0) return "insolvent";
  const runway = monthlyPeopleCost > 0 ? cash / monthlyPeopleCost : 99;
  if (runway < 1) return "critical";
  if (runway < 3) return "tight";
  return "healthy";
}

function reconcilePayables(
  state: {
    public: FinanceTreasuryPublicStateV10;
    private: FinanceTreasuryPrivateStateV10;
  },
  simulationDay: number,
): void {
  const unsettled = state.private.journal.filter(
    (entry) =>
      !state.private.settledTransactionIds.includes(entry.transactionId),
  );
  state.public.peoplePayable = unsettled.reduce(
    (sum, entry) => sum + entry.amount,
    0,
  );
  state.public.overduePeoplePayable = unsettled
    .filter((entry) => entry.dueDay <= simulationDay)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function postTransaction(
  state: {
    public: FinanceTreasuryPublicStateV10;
    private: FinanceTreasuryPrivateStateV10;
  },
  event: DomainEventV10,
): void {
  const transaction = transactionSchema.parse(event.payload);
  if (
    state.private.recognizedTransactionIds.includes(transaction.transactionId)
  )
    return;
  state.private.recognizedTransactionIds.push(transaction.transactionId);
  const entry = { ...transaction, postedDay: event.simulationDay };
  state.private.journal.push(entry);
  state.private.journal = state.private.journal.slice(-2_000);
  if (transaction.dueDay <= event.simulationDay) {
    if (state.public.cash >= transaction.amount) {
      state.public.cash -= transaction.amount;
      state.private.settledTransactionIds.push(transaction.transactionId);
    }
  }
  if (transaction.kind === "payroll" || transaction.kind === "benefits_tax") {
    state.public.monthlyPeopleCost += transaction.amount;
  }
  state.public.recentPeopleTransactions.push({
    kind: transaction.kind,
    amount: transaction.amount,
    memo: transaction.memo,
    dueDay: transaction.dueDay,
    postedDay: event.simulationDay,
  });
  state.public.recentPeopleTransactions =
    state.public.recentPeopleTransactions.slice(-30);
  reconcilePayables(state, event.simulationDay);
  state.public.runwaySignal = runwaySignal(
    state.public.cash,
    state.public.monthlyPeopleCost,
    state.public.overduePeoplePayable,
  );
}

export function createFinanceTreasuryFeatureV10(): SimulationFeatureV10<
  FinanceTreasuryPublicStateV10,
  FinanceTreasuryPrivateStateV10,
  z.infer<typeof configSchema>
> {
  return {
    id: "finance-and-treasury",
    version: "1.0.0",
    dependencies: [],
    compatibleEngineRange: ">=10.0.0 <11.0.0",
    configSchema,
    publicStateSchema,
    privateStateSchema,
    initialize: ({ config }) => ({
      public: {
        cash: config.openingCash,
        peoplePayable: 0,
        overduePeoplePayable: 0,
        monthlyPeopleCost: 0,
        runwaySignal: "healthy",
        recentPeopleTransactions: [],
      },
      private: {
        openingCash: config.openingCash,
        recognizedTransactionIds: [],
        settledTransactionIds: [],
        journal: [],
      },
    }),
    commands: {},
    effects: {},
    queries: [
      {
        id: "finance-and-treasury.liquidity",
        resolve: ({ ownState }) => ({
          cash: ownState.public.cash,
          runwaySignal: ownState.public.runwaySignal,
          monthlyPeopleCost: ownState.public.monthlyPeopleCost,
        }),
      },
    ],
    eventSubscriptions: [
      {
        id: "finance-posts-workforce-transactions",
        eventType: "workforce-and-organization.economic_transaction_requested",
        handle: (context, event) => postTransaction(context.ownState, event),
      },
      {
        id: "finance-posts-employment-case-transactions",
        eventType: "employment-cases.economic_transaction_requested",
        handle: (context, event) => postTransaction(context.ownState, event),
      },
    ],
    hooks: {
      after_period_close: (context) => {
        const due = context.ownState.private.journal.filter(
          (entry) =>
            entry.dueDay <= context.kernel.simulationDay &&
            !context.ownState.private.settledTransactionIds.includes(
              entry.transactionId,
            ),
        );
        for (const entry of due) {
          if (context.ownState.public.cash < entry.amount) continue;
          context.ownState.public.cash -= entry.amount;
          context.ownState.private.settledTransactionIds.push(
            entry.transactionId,
          );
        }
        reconcilePayables(context.ownState, context.kernel.simulationDay);
        context.ownState.public.monthlyPeopleCost = 0;
        context.ownState.public.runwaySignal = runwaySignal(
          context.ownState.public.cash,
          Math.max(
            1,
            due.reduce((sum, entry) => sum + entry.amount, 0),
          ),
          context.ownState.public.overduePeoplePayable,
        );
      },
    },
    invariants: [
      {
        id: "finance-workforce-transaction-idempotency",
        check: ({ ownState }) => {
          const ids = ownState.private.recognizedTransactionIds;
          if (new Set(ids).size !== ids.length)
            throw new Error("DUPLICATE_ECONOMIC_TRANSACTION");
          const settled = ownState.private.settledTransactionIds;
          if (
            new Set(settled).size !== settled.length ||
            settled.some((id) => !ids.includes(id))
          ) {
            throw new Error("INVALID_SETTLED_ECONOMIC_TRANSACTION");
          }
        },
      },
      {
        id: "finance-workforce-values-finite",
        check: ({ ownState }) => {
          for (const value of [
            ownState.public.cash,
            ownState.public.peoplePayable,
            ownState.public.overduePeoplePayable,
            ownState.public.monthlyPeopleCost,
          ]) {
            if (!Number.isFinite(value))
              throw new Error("NON_FINITE_FINANCE_VALUE");
          }
          if (ownState.public.cash < 0)
            throw new Error("NEGATIVE_CASH_BALANCE");
        },
      },
    ],
    projectionPolicy: {
      schema: publicStateSchema,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: [
        "journal",
        "recognizedTransactionIds",
        "settledTransactionIds",
        "private",
      ],
    },
    snapshotPolicy: {
      mode: "period_close",
      maximumCommandsBetweenSnapshots: 50,
    },
    retentionPolicy: {
      maximumHeadBytes: 1_000_000,
      maximumMaterialRecords: 2_000,
      archiveClosedRecords: true,
    },
  };
}
