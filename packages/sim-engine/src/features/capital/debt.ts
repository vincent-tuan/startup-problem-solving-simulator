import { monthlyBurn, postJournal } from "../../domains/finance";
import { clamp, round } from "../../kernel/math";
import { scheduleEffect } from "../../kernel/scheduler";
import type { ScheduledEffect, SimulationState } from "../../types";
import type { DomainEmitter } from "../contracts";
import { capitalPrivate, capitalPublic, complianceExposure, customerConcentration, stageDebtCap, type DebtFacility } from "./model";

function startDebtApplication(state: SimulationState, requestedAmount: number, emit: DomainEmitter) {
  const debt = capitalPublic(state).debt;
  if (debt.status === "pending") throw new Error("DEBT_APPLICATION_PENDING");
  if (state.calendar.absoluteDay < debt.cooldownUntilDay) throw new Error("CREDIT_MARKET_COOLDOWN");
  debt.id = `facility_${state.calendar.absoluteDay}_${state.sequence + 1}`;
  debt.status = "pending"; debt.requestedAmount = round(requestedAmount); debt.applicationDay = state.calendar.absoluteDay;
  debt.limit = 0; debt.balance = 0; debt.accruedInterest = 0; debt.frozen = false; debt.covenantBreaches = 0; debt.delinquencyCount = 0;
  state.founder.energy = clamp(state.founder.energy - 1.5); state.founder.stress = clamp(state.founder.stress + 1);
  scheduleEffect(state, "capital-and-governance.debt_review", state.calendar.absoluteDay + 7, debt.id, { requestedAmount: debt.requestedAmount });
  emit("decision_recorded", "capital", `Applied for a $${round(requestedAmount)} debt facility; underwriting resolves after seven days and may approve a smaller limit.`);
}

export function resolveDebtReview(state: SimulationState, effect: ScheduledEffect, emit: DomainEmitter) {
  const privateState = capitalPrivate(state); const debt = capitalPublic(state).debt;
  if (debt.status !== "pending" || debt.id !== effect.sourceId) return;
  const customers = state.market.accounts.filter((account) => account.stage === "customer").length;
  const concentration = customerConcentration(state); const risk = complianceExposure(state);
  const guaranteeCapacity = state.finance.personalCash >= state.finance.livingCost * 3;
  const baseCapacity = 400 + state.finance.mrr * 4 + customers * 350 + Math.max(0, state.finance.companyCash) * 0.35 + state.evidence.budget * 15;
  const riskMultiplier = clamp(1 + state.evidence.quality / 260 - state.market.monthlyChurn * 0.8 - concentration * 0.25 - risk / 250, 0.2, 1.05);
  const capacity = Math.floor(Math.min(debt.requestedAmount, stageDebtCap(state), baseCapacity * riskMultiplier) / 100) * 100;
  const eligible = capacity >= 500 && (state.finance.mrr > 0 || customers > 0 || (guaranteeCapacity && state.evidence.budget >= 15));
  const approvalChance = clamp((0.16 + state.evidence.budget / 180 + state.evidence.quality / 260 + customers * 0.07
    + Math.min(0.2, state.finance.mrr / 10_000) - state.market.monthlyChurn * 0.65 - concentration * 0.18 - risk / 320)
    * privateState.creditAppetite, 0.03, 0.88);
  if (!eligible || effect.sampledOutcome >= approvalChance) {
    debt.status = "rejected"; debt.cooldownUntilDay = state.calendar.absoluteDay + 60; debt.requestedAmount = 0;
    emit("decision_recorded", "capital", "The debt application was declined; lender capacity remains unavailable for 60 days.", "system");
    return;
  }
  const apr = clamp(0.12 + privateState.riskSpread + (state.finance.mrr <= 0 ? 0.08 : 0)
    + state.market.monthlyChurn * 0.22 + concentration * 0.06 + risk / 800, 0.1, 0.38);
  const termMonths = state.stage === "repeatability" ? 24 : 12;
  debt.status = "available"; debt.limit = capacity; debt.apr = round(apr, 4); debt.monthlyPayment = 0;
  debt.maturityDay = state.calendar.absoluteDay + termMonths * 30; debt.nextPaymentDay = null;
  debt.minCashCovenant = round(Math.max(50, monthlyBurn(state) * 0.5)); debt.maxDebtToMrr = state.finance.mrr > 0 ? 6 : 0;
  debt.personalGuarantee = state.stage !== "repeatability"; debt.requestedAmount = 0;
  emit("decision_recorded", "capital", `Lender approved a $${capacity} facility at ${round(apr * 100, 2)}% APR with minimum-cash and leverage covenants.`, "system");
}

export function drawDebt(state: SimulationState, amount: number, emit: DomainEmitter) {
  const publicState = capitalPublic(state); const debt = publicState.debt;
  if (["none", "rejected", "closed"].includes(debt.status)) {
    startDebtApplication(state, amount, emit); return { checkpoint: false };
  }
  if (debt.status === "pending") throw new Error("DEBT_APPLICATION_PENDING");
  if (debt.status === "frozen" || debt.status === "defaulted" || debt.frozen) throw new Error("DEBT_FACILITY_FROZEN");
  if (!debt.limit || !["available", "active"].includes(debt.status)) throw new Error("DEBT_FACILITY_NOT_AVAILABLE");
  const available = round(Math.max(0, debt.limit - debt.balance));
  if (amount > available + 0.02) throw new Error("DEBT_LIMIT_EXCEEDED");
  const fee = round(amount * 0.01); const proceeds = round(amount - fee);
  postJournal(state, "Debt facility draw", debt.id ?? "debt_facility", [
    { account: "cash", debit: proceeds, credit: 0 }, { account: "financing_fee", debit: fee, credit: 0 },
    { account: "debt", debit: 0, credit: amount },
  ]);
  debt.balance = round(debt.balance + amount); debt.status = "active";
  const months = Math.max(1, Math.ceil(((debt.maturityDay ?? state.calendar.absoluteDay + 360) - state.calendar.absoluteDay) / 30));
  debt.monthlyPayment = round(debt.balance / months + debt.balance * debt.apr / 12); debt.nextPaymentDay ??= state.calendar.absoluteDay + 30;
  state.capital.debt = debt.balance; publicState.equity.history.push({ day: state.calendar.absoluteDay, kind: "debt", amount });
  emit("finance_posted", "capital", `Drew $${round(amount)} from the approved facility; $${fee} was charged at origination and debt service, covenants, and maturity remain active.`);
  return { checkpoint: true };
}

export function repayDebt(state: SimulationState, amount: number, emit: DomainEmitter) {
  const debt = capitalPublic(state).debt; const wasDefaulted = debt.status === "defaulted";
  const totalDue = round(debt.balance + debt.accruedInterest);
  if (totalDue <= 0) throw new Error("NO_DEBT_TO_REPAY");
  const payment = round(Math.min(amount, totalDue, state.finance.companyCash));
  if (payment <= 0) throw new Error("INSUFFICIENT_COMPANY_CASH");
  const interestPaid = round(Math.min(payment, debt.accruedInterest)); const principalPaid = round(payment - interestPaid);
  postJournal(state, "Debt facility repayment", debt.id ?? "debt_facility", [
    ...(interestPaid > 0 ? [{ account: "interest_payable", debit: interestPaid, credit: 0 }] : []),
    ...(principalPaid > 0 ? [{ account: "debt", debit: principalPaid, credit: 0 }] : []),
    { account: "cash", debit: 0, credit: payment },
  ]);
  debt.accruedInterest = round(Math.max(0, debt.accruedInterest - interestPaid));
  debt.balance = round(Math.max(0, debt.balance - principalPaid)); state.capital.debt = debt.balance;
  if (debt.balance <= 0.02 && debt.accruedInterest <= 0.02) {
    debt.balance = 0; debt.accruedInterest = 0;
    debt.status = wasDefaulted ? "closed" : state.calendar.absoluteDay < (debt.maturityDay ?? 0) ? "available" : "closed";
    debt.frozen = wasDefaulted;
  }
  emit("finance_posted", "capital", `Repaid $${payment}: $${interestPaid} interest and $${principalPaid} principal.`);
  return { checkpoint: true };
}

function defaultFacility(state: SimulationState, debt: DebtFacility, reason: string, emit: DomainEmitter) {
  if (debt.status === "defaulted") return;
  debt.status = "defaulted"; debt.frozen = true;
  if (debt.personalGuarantee) state.finance.personalDebt = round(state.finance.personalDebt + debt.balance * 0.25);
  state.relationships.trust = clamp(state.relationships.trust - 15);
  const riskItem = state.risks.find((risk) => risk.domain === "founder") ?? state.risks[0];
  if (riskItem) { riskItem.status = "realized"; riskItem.exposure = clamp(riskItem.exposure + 30); }
  emit("risk_updated", "capital", `Debt facility defaulted: ${reason}. Draws are frozen and guarantee exposure was recorded.`, "system");
}

export function serviceDebtAtClose(state: SimulationState, emit: DomainEmitter) {
  const debt = capitalPublic(state).debt;
  if (debt.status === "available" && debt.maturityDay !== null && state.calendar.absoluteDay >= debt.maturityDay) {
    debt.status = "closed"; debt.frozen = true; return;
  }
  if (!["active", "frozen"].includes(debt.status) || debt.balance <= 0) return;
  const interest = round(debt.balance * debt.apr / 12);
  if (interest > 0) {
    postJournal(state, "Monthly debt interest accrued", debt.id ?? "debt_facility", [
      { account: "interest_expense", debit: interest, credit: 0 }, { account: "interest_payable", debit: 0, credit: interest },
    ]);
    debt.accruedInterest = round(debt.accruedInterest + interest);
  }
  if (debt.nextPaymentDay !== null && state.calendar.absoluteDay >= debt.nextPaymentDay) {
    const due = round(Math.min(debt.balance + debt.accruedInterest, Math.max(debt.monthlyPayment, debt.accruedInterest)));
    if (state.finance.companyCash >= due && due > 0) {
      repayDebt(state, due, emit); debt.delinquencyCount = 0; debt.nextPaymentDay += 30;
      if (debt.balance <= 0) return;
    } else {
      debt.delinquencyCount += 1; debt.frozen = true; debt.status = "frozen"; debt.nextPaymentDay += 15;
      state.relationships.trust = clamp(state.relationships.trust - 3);
      emit("risk_updated", "capital", `Debt payment of $${due} was missed; the facility is frozen pending cure.`, "system");
    }
  }
  const leverageBreach = debt.maxDebtToMrr > 0 && debt.balance / Math.max(1, state.finance.mrr) > debt.maxDebtToMrr;
  const noRevenueOverdraw = debt.maxDebtToMrr === 0 && debt.balance > debt.limit * 0.75;
  const cashBreach = state.finance.companyCash < debt.minCashCovenant;
  if (leverageBreach || noRevenueOverdraw || cashBreach) {
    debt.covenantBreaches += 1; debt.frozen = true; debt.status = "frozen";
    if (debt.covenantBreaches === 2) debt.apr = round(clamp(debt.apr + 0.03, 0, 0.45), 4);
    emit("risk_updated", "capital", `Debt covenant breach ${debt.covenantBreaches}: ${cashBreach ? "minimum cash" : "leverage"} threshold failed.`, "system");
  } else if (debt.covenantBreaches > 0 && debt.delinquencyCount === 0) {
    debt.covenantBreaches = Math.max(0, debt.covenantBreaches - 1);
    if (debt.covenantBreaches === 0) { debt.frozen = false; debt.status = "active"; }
  }
  if (debt.delinquencyCount >= 2) defaultFacility(state, debt, "two scheduled payments were missed", emit);
  else if (debt.covenantBreaches >= 3) defaultFacility(state, debt, "three covenant tests failed", emit);
  else if (debt.maturityDay !== null && state.calendar.absoluteDay >= debt.maturityDay && debt.balance > 0) {
    defaultFacility(state, debt, "the balloon balance remained unpaid at maturity", emit);
  }
}
