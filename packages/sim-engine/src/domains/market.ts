import type { CustomerAccount, HistoryEvent, SimulationState } from "../types";
import { clamp, round } from "../kernel/math";
import { random, randomBetween } from "../rng";
import { postJournal } from "./finance";
import { scheduleEffect } from "../kernel/scheduler";

type Emit = (type: HistoryEvent["type"], category: HistoryEvent["category"], summary: string, actor?: HistoryEvent["actor"]) => void;

export function updateMarketMetrics(state: SimulationState) {
  const activePipeline = state.market.accounts.filter((account) => ["qualified", "pilot", "negotiation"].includes(account.stage));
  state.market.pipelineValue = round(activePipeline.reduce((sum, account) => sum + account.expectedValue, 0));
  const decided = state.market.accounts.filter((account) => ["customer", "lost", "churned"].includes(account.stage));
  state.market.winRate = decided.length ? round(state.market.accounts.filter((account) => account.stage === "customer").length / decided.length, 3) : 0;
  const customers = state.market.accounts.filter((account) => account.stage === "customer");
  state.market.supportLoad = round(customers.reduce((sum, account) => sum + account.supportHours, 0));
  const churned = state.market.accounts.filter((account) => account.stage === "churned").length;
  state.market.monthlyChurn = customers.length + churned ? round(churned / (customers.length + churned), 3) : 0;
  for (const cohort of state.market.cohorts) {
    cohort.retainedAccounts = cohort.accountIds.filter((id) => state.market.accounts.find((account) => account.id === id)?.stage === "customer").length;
    cohort.churnedAccounts = cohort.accountIds.length - cohort.retainedAccounts;
    cohort.currentMrr = round(cohort.accountIds.reduce((sum, id) => {
      const account = state.market.accounts.find((item) => item.id === id);
      return sum + (account?.stage === "customer" ? account.offeredPrice ?? 0 : 0);
    }, 0));
  }
}

export function sourceAccount(state: SimulationState, segmentId: string, emit: Emit) {
  const segment = state.market.segments.find((item) => item.id === segmentId);
  if (!segment) throw new Error("SEGMENT_NOT_FOUND");
  const id = `account_${state.market.accounts.length + 1}`;
  const truth = state.hidden.segmentTruth[segmentId];
  const account: CustomerAccount = {
    id, name: `${segment.label} ${state.market.accounts.filter((item) => item.segmentId === segmentId).length + 1}`, segmentId, stage: "lead",
    createdDay: state.calendar.absoluteDay, stageEnteredDay: state.calendar.absoluteDay,
    championStrength: round(randomBetween(state, 22, 72)), buyerAccess: round(randomBetween(state, 12, 65)), blockerRisk: round(randomBetween(state, 25, 78)),
    trust: 24, expectedValue: round((truth?.actualWtp ?? segment.willingnessToPay) * (0.65 + random(state) * 0.7)), offeredPrice: null,
    contractMonths: 1, collectionDelayDays: segment.budgetCycleDays, supportHours: 0,
    knownStakeholderIds: [`stakeholder_${id}_champion`, `stakeholder_${id}_user`], committeeCoverage: 40,
    valueCase: round(randomBetween(state, 8, 22)), riskClearance: round(randomBetween(state, 4, 16)),
    implementationReadiness: round(randomBetween(state, 8, 20)), procurementProgress: 0, negotiationRound: 0,
  };
  state.market.accounts.push(account);
  state.stakeholders.push(
    { id: `stakeholder_${id}_champion`, name: `${segment.label} operations champion`, role: "champion", accountId: id, trust: account.trust, influence: round(randomBetween(state, 42, 76)), memory: ["Introduced the problem to the founder"], discovered: true },
    { id: `stakeholder_${id}_user`, name: `${segment.label} workflow user`, role: "user", accountId: id, trust: round(randomBetween(state, 22, 48)), influence: round(randomBetween(state, 18, 46)), memory: [], discovered: true },
    { id: `stakeholder_${id}_buyer`, name: `${segment.label} economic buyer`, role: "buyer", accountId: id, trust: round(randomBetween(state, 12, 34)), influence: round(randomBetween(state, 68, 92)), memory: [], discovered: false },
    { id: `stakeholder_${id}_blocker`, name: `${segment.label} risk owner`, role: "blocker", accountId: id, trust: round(randomBetween(state, 8, 30)), influence: round(randomBetween(state, 55, 88)), memory: [], discovered: false },
    { id: `stakeholder_${id}_approver`, name: `${segment.label} final approver`, role: "approver", accountId: id, trust: round(randomBetween(state, 8, 28)), influence: round(randomBetween(state, 72, 96)), memory: [], discovered: false },
  );
  scheduleEffect(state, "account_followup", state.calendar.absoluteDay + 4 + Math.floor(random(state) * 8), id, { intent: "initial_response", stakeholderId: `stakeholder_${id}_champion` });
  emit("account_sourced", "customer", `Sourced ${account.name}; buyer access and urgency remain uncertain.`);
  updateMarketMetrics(state);
}

export function advanceAccount(state: SimulationState, accountId: string, emit: Emit) {
  const account = state.market.accounts.find((item) => item.id === accountId && !["lost", "customer", "churned"].includes(item.stage));
  if (!account) throw new Error("ACCOUNT_NOT_ACTIONABLE");
  if (state.scheduledEffects.some((effect) => effect.type === "account_followup" && effect.sourceId === account.id)) throw new Error("ACCOUNT_FOLLOWUP_PENDING");
  account.trust = clamp(account.trust + 2);
  scheduleEffect(state, "account_followup", state.calendar.absoluteDay + 3 + Math.floor(random(state) * 6), account.id, { intent: "next_step" });
  emit("decision_recorded", "customer", `Committed follow-up capacity to ${account.name}; outcome will arrive later.`);
}

export function engageAccountStakeholder(state: SimulationState, accountId: string, stakeholderId: string | undefined, intent: "map_committee" | "user_discovery" | "build_champion" | "prove_roi" | "risk_review" | "procurement", emit: Emit) {
  const account = state.market.accounts.find((item) => item.id === accountId && !["lost", "customer", "churned"].includes(item.stage));
  if (!account) throw new Error("ACCOUNT_NOT_ACTIONABLE");
  if (state.scheduledEffects.some((effect) => effect.type === "account_followup" && effect.sourceId === account.id)) throw new Error("ACCOUNT_FOLLOWUP_PENDING");
  const stakeholders = state.stakeholders.filter((item) => item.accountId === account.id);
  const preferredRole = intent === "user_discovery" ? "user" : intent === "build_champion" ? "champion" : intent === "prove_roi" ? "buyer" : intent === "risk_review" ? "blocker" : intent === "procurement" ? "approver" : undefined;
  const stakeholder = stakeholders.find((item) => item.id === stakeholderId) ?? stakeholders.find((item) => item.role === preferredRole) ?? stakeholders.find((item) => item.discovered);
  if (!stakeholder) throw new Error("STAKEHOLDER_NOT_FOUND");
  scheduleEffect(state, "account_followup", state.calendar.absoluteDay + 3 + Math.floor(random(state) * 7), account.id, { intent, stakeholderId: stakeholder.id });
  emit("decision_recorded", "stakeholder", `${intent.replaceAll("_", " ")} scheduled with ${stakeholder.name}; the response is delayed.`);
}

export function disqualifyAccount(state: SimulationState, accountId: string, emit: Emit) {
  const account = state.market.accounts.find((item) => item.id === accountId && !["lost", "customer", "churned"].includes(item.stage));
  if (!account) throw new Error("ACCOUNT_NOT_ACTIONABLE");
  account.stage = "lost"; account.lossReason = "Founder disqualified the opportunity";
  emit("account_stage_changed", "customer", `${account.name} was deliberately disqualified to protect focus.`);
  updateMarketMetrics(state);
}

export function negotiateContract(state: SimulationState, accountId: string, price: number, contractMonths: number, prepay: boolean, terms: { paymentTermsDays: 0 | 15 | 30 | 60; onboardingMode: "self_serve" | "guided" | "custom"; supportSlaHours: 8 | 24 | 72; dataTerms: "standard" | "dpa" | "enterprise" }, emit: Emit) {
  const account = state.market.accounts.find((item) => item.id === accountId && item.stage === "negotiation");
  if (!account) throw new Error("ACCOUNT_NOT_IN_NEGOTIATION");
  const truth = state.hidden.segmentTruth[account.segmentId];
  const productReadiness = (state.product.reliability + state.product.usability + state.product.compliance) / 3;
  const priceFit = clamp(1 - Math.max(0, price - (truth?.actualWtp ?? account.expectedValue)) / Math.max(1, price), 0.05, 1);
  const onboardingAppeal = terms.onboardingMode === "custom" ? 0.1 : terms.onboardingMode === "guided" ? 0.05 : -0.03;
  const termAppeal = terms.paymentTermsDays === 60 ? 0.08 : terms.paymentTermsDays === 30 ? 0.04 : terms.paymentTermsDays === 0 ? -0.05 : 0;
  const riskFit = terms.dataTerms === "enterprise" ? state.product.security / 800 + state.product.compliance / 800 : terms.dataTerms === "dpa" ? state.product.compliance / 1_000 : 0.03;
  const procurementFit = (account.procurementProgress ?? 0) / 500 + (account.committeeCoverage ?? 0) / 800;
  const winProbability = clamp(priceFit * 0.32 + account.trust / 320 + account.championStrength / 550 + productReadiness / 700 - account.blockerRisk / 650 + onboardingAppeal + termAppeal + riskFit + procurementFit, 0.04, 0.9);
  account.offeredPrice = round(price); account.contractMonths = contractMonths;
  account.negotiationRound = (account.negotiationRound ?? 0) + 1;
  if (random(state) >= winProbability) {
    account.stage = "lost"; account.lossReason = priceFit < 0.55 ? "Price exceeded demonstrated value" : productReadiness < 40 ? "Product readiness failed diligence" : "Internal buying risk";
    state.evidence.budget = clamp(state.evidence.budget + 2); emit("account_stage_changed", "customer", `${account.name} declined: ${account.lossReason}.`); updateMarketMetrics(state); return;
  }
  account.stage = "customer"; account.stageEnteredDay = state.calendar.absoluteDay;
  const onboardingLoad = terms.onboardingMode === "custom" ? 14 : terms.onboardingMode === "guided" ? 7 : 2;
  const slaLoad = terms.supportSlaHours === 8 ? 8 : terms.supportSlaHours === 24 ? 4 : 1;
  account.supportHours = round(2 + account.blockerRisk / 18 + onboardingLoad + slaLoad);
  const discountPercent = prepay ? 8 : 0; const monthlyPrice = prepay ? round(price * 0.92) : round(price);
  account.offeredPrice = monthlyPrice; state.finance.mrr = round(state.finance.mrr + monthlyPrice);
  account.collectionDelayDays = terms.paymentTermsDays;
  account.dealTerms = { ...terms, discountPercent };
  const invoice = prepay ? monthlyPrice * contractMonths : monthlyPrice;
  postJournal(state, `Invoice issued to ${account.name}`, account.id, [{ account: "accounts_receivable", debit: invoice, credit: 0 }, { account: "deferred_revenue", debit: 0, credit: invoice }]);
  const cohortId = `cohort_${Math.floor(state.calendar.absoluteDay / 30)}`; account.cohortId = cohortId;
  let cohort = state.market.cohorts.find((item) => item.id === cohortId);
  if (!cohort) { cohort = { id: cohortId, startedDay: state.calendar.absoluteDay, accountIds: [], startingMrr: 0, currentMrr: 0, retainedAccounts: 0, churnedAccounts: 0, grossMargin: 0 }; state.market.cohorts.push(cohort); }
  cohort.accountIds.push(account.id); cohort.startingMrr = round(cohort.startingMrr + monthlyPrice); cohort.currentMrr = round(cohort.currentMrr + monthlyPrice);
  scheduleEffect(state, "payment_received", state.calendar.absoluteDay + Math.max(1, account.collectionDelayDays), account.id, { amount: invoice });
  if (!prepay && contractMonths > 1) scheduleEffect(state, "invoice_due", state.calendar.absoluteDay + 30, account.id, { amount: monthlyPrice, monthsRemaining: contractMonths - 1 });
  scheduleEffect(state, "contract_renewal", state.calendar.absoluteDay + contractMonths * 30, account.id, { amount: monthlyPrice, renewalMonths: 3 });
  scheduleEffect(state, "churn_check", state.calendar.absoluteDay + 30, account.id);
  state.evidence.budget = clamp(state.evidence.budget + 10); state.relationships.trust = clamp(state.relationships.trust + 4);
  const onboardingObligation = { id: `obligation_onboarding_${account.id}`, title: `${terms.onboardingMode.replaceAll("_", " ")} onboarding for ${account.name}`, ownerId: "member_founder", stakeholderId: account.knownStakeholderIds?.[0], dueDay: state.calendar.absoluteDay + (terms.onboardingMode === "custom" ? 21 : 14), status: "open" as const, severity: terms.onboardingMode === "custom" ? 4 : 2, dependencyIds: [] };
  state.obligations.push(onboardingObligation); state.relationships.openPromises += 1; scheduleEffect(state, "obligation_due", onboardingObligation.dueDay, onboardingObligation.id);
  emit("contract_signed", "customer", `${account.name} signed at $${monthlyPrice}/month for ${contractMonths} month${contractMonths === 1 ? "" : "s"}.`);
  emit("invoice_issued", "finance", `Issued a $${round(invoice)} invoice; cash remains uncollected until payment.`);
  updateMarketMetrics(state);
}
