import type { SimulationFeature } from "../contracts";
import { realism85Enabled } from "../realism";
import { drawDebt, repayDebt, resolveDebtReview, serviceDebtAtClose } from "./debt";
import { cancelFundraise, decideTermSheet, expireCapitalOffers, resolveEquityReview, startFundraise } from "./equity";
import { legacyCapitalCommand } from "./legacy";
import { boundedSeed, capitalPublic, type CapitalPrivateState, type CapitalPublicState } from "./model";

export { capitalPublic } from "./model";

function validateCapital(state: Parameters<NonNullable<SimulationFeature["validate"]>>[0]) {
  if (!realism85Enabled(state)) return;
  const publicState = capitalPublic(state); const debt = publicState.debt;
  if (![debt.limit, debt.balance, debt.accruedInterest, debt.apr, debt.monthlyPayment].every(Number.isFinite)) throw new Error("DEBT_NON_FINITE");
  if (debt.limit < 0 || debt.balance < 0 || debt.balance > debt.limit + 0.02 || debt.accruedInterest < 0) throw new Error("DEBT_BALANCE_INVALID");
  if (Math.abs(state.capital.debt - debt.balance) > 0.02) throw new Error("DEBT_STATE_MISMATCH");
  if (state.capital.dilution < 0 || state.capital.dilution > 100) throw new Error("DILUTION_INVALID");
  const offer = publicState.equity.offer;
  if (offer && (offer.amount <= 0 || offer.dilution <= 0 || offer.dilution > 100)) throw new Error("TERM_SHEET_INVALID");
}

export const capitalFeature: SimulationFeature = {
  id: "capital-and-governance", version: "1.0.0",
  dependencies: ["evidence", "finance-and-tax", "stakeholders-and-obligations"],
  initialize: ({ state, scenario }) => scenario.version === "2.1.0" ? {
    public: {
      mode: "scarce",
      debt: {
        id: null, status: "none", requestedAmount: 0, limit: 0, balance: 0, accruedInterest: 0, apr: 0,
        monthlyPayment: 0, applicationDay: null, maturityDay: null, nextPaymentDay: null, minCashCovenant: 0,
        maxDebtToMrr: 0, covenantBreaches: 0, delinquencyCount: 0, frozen: false, personalGuarantee: false, cooldownUntilDay: 0,
      },
      equity: { status: "none", offer: null, cooldownUntilDay: 0, attempts: 0, history: [] },
    } satisfies CapitalPublicState,
    private: {
      creditAppetite: boundedSeed(state.seed, 1, 0.72, 1.08),
      equityAppetite: boundedSeed(state.seed, 2, 0.68, 1.06),
      riskSpread: boundedSeed(state.seed, 3, 0.03, 0.11),
    } satisfies CapitalPrivateState,
  } : {},
  commands: {
    "capital.fundraise": ({ state, command, emit }) => {
      if (command.type !== "capital.fundraise") return;
      if (!realism85Enabled(state)) return legacyCapitalCommand(state, command, emit);
      if (command.payload.operation === "start") startFundraise(state, emit); else cancelFundraise(state, emit);
    },
    "capital.term_sheet": ({ state, command, emit }) => {
      if (command.type !== "capital.term_sheet") return;
      if (!realism85Enabled(state)) return legacyCapitalCommand(state, command, emit);
      return decideTermSheet(state, command, emit);
    },
    "capital.debt": ({ state, command, emit }) => {
      if (command.type !== "capital.debt") return;
      if (!realism85Enabled(state)) return legacyCapitalCommand(state, command, emit);
      if (command.payload.operation === "draw") return drawDebt(state, command.payload.amount, emit);
      return repayDebt(state, command.payload.amount, emit);
    },
  },
  effects: {
    "capital-and-governance.equity_review": ({ state, effect, emit }) => resolveEquityReview(state, effect, emit),
    "capital-and-governance.debt_review": ({ state, effect, emit }) => resolveDebtReview(state, effect, emit),
  },
  hooks: {
    after_scheduled_effects: ({ state, emit }) => { if (realism85Enabled(state)) expireCapitalOffers(state, emit); },
    after_financial_close: ({ state, emit }) => { if (realism85Enabled(state)) { expireCapitalOffers(state, emit); serviceDebtAtClose(state, emit); } },
    after_command: ({ state, emit }) => { if (realism85Enabled(state)) expireCapitalOffers(state, emit); },
  },
  validate: validateCapital,
};
