import { monthlyBurn, postJournal } from "../../domains/finance";
import { clamp, round } from "../../kernel/math";
import { scheduleEffect } from "../../kernel/scheduler";
import type { ScheduledEffect, SimulationCommand, SimulationState } from "../../types";
import type { DomainEmitter } from "../contracts";
import { capitalPrivate, capitalPublic, complianceExposure, customerConcentration, stageEquityCap, type EquityOffer } from "./model";

export function startFundraise(state: SimulationState, emit: DomainEmitter) {
  const equity = capitalPublic(state).equity;
  if (equity.status !== "none") throw new Error("FUNDRAISE_ALREADY_ACTIVE");
  if (state.calendar.absoluteDay < equity.cooldownUntilDay) throw new Error("CAPITAL_MARKET_COOLDOWN");
  equity.status = "preparing"; equity.offer = null; equity.attempts += 1;
  state.capital.fundraising = "preparing";
  state.capital.investorPipeline = Math.max(8, state.relationships.trust * 0.55 + state.evidence.quality * 0.25);
  state.founder.energy = clamp(state.founder.energy - 4); state.founder.stress = clamp(state.founder.stress + 3);
  scheduleEffect(state, "capital-and-governance.equity_review", state.calendar.absoluteDay + 14, "equity", { phase: "preparing" });
  emit("decision_recorded", "capital", "Fundraising preparation started; no capital exists until sourcing and diligence produce a time-limited offer.");
}

export function cancelFundraise(state: SimulationState, emit: DomainEmitter) {
  const equity = capitalPublic(state).equity;
  if (equity.status === "none") throw new Error("FUNDRAISE_NOT_ACTIVE");
  equity.status = "none"; equity.offer = null;
  equity.cooldownUntilDay = Math.max(equity.cooldownUntilDay, state.calendar.absoluteDay + 21);
  state.capital.fundraising = "none"; state.capital.investorPipeline = 0;
  state.scheduledEffects = state.scheduledEffects.filter((effect) => effect.type !== "capital-and-governance.equity_review");
  state.founder.energy = clamp(state.founder.energy - 2);
  emit("decision_recorded", "capital", "Fundraising was stopped; investor relationships enter a cooldown instead of resetting instantly.");
}

function equityReadiness(state: SimulationState) {
  const customers = state.market.accounts.filter((account) => account.stage === "customer").length;
  const runway = monthlyBurn(state) <= 0 ? 18 : state.finance.companyCash / Math.max(1, monthlyBurn(state));
  return clamp(
    state.evidence.quality * 0.2 + state.evidence.budget * 0.22 + state.relationships.trust * 0.14
      + state.product.quality * 0.12 + Math.min(24, customers * 5) + Math.min(24, state.finance.mrr / 250)
      + Math.min(8, runway) - customerConcentration(state) * 16 - complianceExposure(state) * 0.16,
    0, 100,
  );
}

export function resolveEquityReview(state: SimulationState, effect: ScheduledEffect, emit: DomainEmitter) {
  const publicState = capitalPublic(state); const privateState = capitalPrivate(state); const equity = publicState.equity;
  if (equity.status === "preparing") {
    equity.status = "diligence"; state.capital.fundraising = "diligence";
    state.capital.investorPipeline = clamp(state.capital.investorPipeline + 18);
    state.founder.energy = clamp(state.founder.energy - 3); state.founder.stress = clamp(state.founder.stress + 2);
    scheduleEffect(state, "capital-and-governance.equity_review", state.calendar.absoluteDay + 21, "equity", { phase: "diligence" });
    emit("decision_recorded", "capital", "The raise entered diligence; evidence, concentration, risk, and runway now determine whether an offer survives.", "system");
    return;
  }
  if (equity.status !== "diligence") return;
  const readiness = equityReadiness(state);
  const approvalChance = readiness < 30 ? 0 : clamp((readiness - 20) / 80 * privateState.equityAppetite, 0, 0.82);
  if (effect.sampledOutcome >= approvalChance) {
    equity.status = "none"; equity.cooldownUntilDay = state.calendar.absoluteDay + 90;
    state.capital.fundraising = "none"; state.capital.investorPipeline = 0; state.founder.energy = clamp(state.founder.energy - 8);
    emit("decision_recorded", "capital", "Diligence ended without a term sheet; the market enters a 90-day cooldown.", "system");
    return;
  }
  const recentlyRaised = equity.history.filter((item) => item.kind === "equity" && item.day >= state.calendar.absoluteDay - 180)
    .reduce((sum, item) => sum + item.amount, 0);
  const amount = 100_000; const dilution = 18;
  if (stageEquityCap(state) - recentlyRaised < amount) {
    equity.status = "none"; equity.cooldownUntilDay = state.calendar.absoluteDay + 120;
    state.capital.fundraising = "none"; state.capital.investorPipeline = 0;
    emit("decision_recorded", "capital", "Investor capacity for this stage was exhausted; no new term sheet was available.", "system");
    return;
  }
  const investorType: EquityOffer["investorType"] = state.stage === "discovery" ? "angel"
    : state.stage === "validation" ? "accelerator" : state.stage === "pilot" ? "seed_fund" : "strategic";
  equity.offer = { amount, dilution, expiresDay: state.calendar.absoluteDay + 14, investorType, liquidationPreference: 1 };
  equity.status = "term_sheet"; state.capital.fundraising = "term_sheet";
  emit("decision_recorded", "capital", `A ${investorType.replaceAll("_", " ")} offered $${amount} for ${dilution}% dilution; the offer expires in 14 days.`, "system");
}

export function decideTermSheet(state: SimulationState, command: Extract<SimulationCommand, { type: "capital.term_sheet" }>, emit: DomainEmitter) {
  const equity = capitalPublic(state).equity; const offer = equity.offer;
  if (equity.status !== "term_sheet" || !offer) throw new Error("TERM_SHEET_NOT_AVAILABLE");
  if (state.calendar.absoluteDay > offer.expiresDay) throw new Error("TERM_SHEET_EXPIRED");
  if (command.payload.decision === "accept") {
    if (state.capital.dilution + offer.dilution >= 100) throw new Error("CAPITAL_STRUCTURE_EXHAUSTED");
    postJournal(state, "Equity financing", command.commandId, [
      { account: "cash", debit: offer.amount, credit: 0 }, { account: "share_capital", debit: 0, credit: offer.amount },
    ]);
    state.capital.dilution = round(state.capital.dilution + offer.dilution, 2);
    state.capital.runwayExtensionMonths = round(state.capital.runwayExtensionMonths + offer.amount / Math.max(1, monthlyBurn(state)), 2);
    equity.history.push({ day: state.calendar.absoluteDay, kind: "equity", amount: offer.amount });
    equity.cooldownUntilDay = state.calendar.absoluteDay + 180; equity.status = "none"; equity.offer = null;
    state.capital.fundraising = "none"; state.capital.investorPipeline = 0;
    emit("finance_posted", "capital", `Accepted $${offer.amount} of equity financing for ${offer.dilution}% dilution and a 1x liquidation preference.`);
    return { checkpoint: true };
  }
  equity.status = "none"; equity.offer = null; equity.cooldownUntilDay = state.calendar.absoluteDay + 60;
  state.capital.fundraising = "none"; state.capital.investorPipeline = 0;
  emit("decision_recorded", "capital", "Rejected the term sheet; the investor market enters a 60-day cooldown.");
  return { checkpoint: false };
}

export function expireCapitalOffers(state: SimulationState, emit: DomainEmitter) {
  const equity = capitalPublic(state).equity;
  if (equity.status === "term_sheet" && equity.offer && state.calendar.absoluteDay > equity.offer.expiresDay) {
    equity.status = "none"; equity.offer = null; equity.cooldownUntilDay = state.calendar.absoluteDay + 90;
    state.capital.fundraising = "none"; state.capital.investorPipeline = 0;
    emit("decision_recorded", "capital", "The term sheet expired; investor capacity moved elsewhere and entered cooldown.", "system");
  }
}
