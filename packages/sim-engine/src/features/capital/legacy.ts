import { postJournal } from "../../domains/finance";
import { round } from "../../kernel/math";
import { scheduleEffect } from "../../kernel/scheduler";
import type { SimulationCommand, SimulationState } from "../../types";
import type { DomainEmitter } from "../contracts";

type CapitalCommand = Extract<SimulationCommand, { type: "capital.fundraise" | "capital.term_sheet" | "capital.debt" }>;
export function legacyCapitalCommand(state: SimulationState, command: CapitalCommand, emit: DomainEmitter) {
  if (command.type === "capital.fundraise") {
    state.capital.fundraising = command.payload.operation === "start" ? "preparing" : "none";
    state.capital.investorPipeline = command.payload.operation === "start" ? Math.max(10, state.relationships.trust * 0.7) : 0;
    if (command.payload.operation === "start") scheduleEffect(state, "fundraise_progress", state.calendar.absoluteDay + 14, "capital");
    else state.scheduledEffects = state.scheduledEffects.filter((effect) => effect.type !== "fundraise_progress");
    emit("decision_recorded", "capital", `Fundraising ${command.payload.operation === "start" ? "started" : "cancelled"}; founder attention will be consumed before any cash appears.`);
    return { checkpoint: false };
  }
  if (command.type === "capital.term_sheet") {
    if (state.capital.fundraising !== "term_sheet") throw new Error("TERM_SHEET_NOT_AVAILABLE");
    if (command.payload.decision === "accept") {
      const amount = 100_000;
      postJournal(state, "Equity financing", command.commandId, [
        { account: "cash", debit: amount, credit: 0 }, { account: "share_capital", debit: 0, credit: amount },
      ]);
      state.capital.dilution += 18; state.capital.fundraising = "none";
      emit("finance_posted", "capital", "Accepted financing: $100,000 cash for 18% dilution.");
      return { checkpoint: true };
    }
    state.capital.fundraising = "none";
    emit("decision_recorded", "capital", "Rejected the term sheet and preserved ownership.");
    return { checkpoint: false };
  }
  const amount = command.payload.amount;
  if (command.payload.operation === "draw") {
    postJournal(state, "Debt draw", command.commandId, [
      { account: "cash", debit: amount, credit: 0 }, { account: "debt", debit: 0, credit: amount },
    ]);
    state.capital.debt += amount;
  } else {
    const paid = Math.min(amount, state.capital.debt, state.finance.companyCash);
    postJournal(state, "Debt repayment", command.commandId, [
      { account: "debt", debit: paid, credit: 0 }, { account: "cash", debit: 0, credit: paid },
    ]);
    state.capital.debt -= paid;
  }
  emit("finance_posted", "capital", `Debt ${command.payload.operation}: $${round(amount)}.`);
  return { checkpoint: false };
}
