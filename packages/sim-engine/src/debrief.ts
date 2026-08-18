import type { DebriefReport, HistoryEvent, SimulationState } from "./types";
import { clamp, round } from "./kernel/math";
import { monthlyBurn } from "./domains/finance";

export function createDebrief(runId: string, state: SimulationState, events: HistoryEvent[]): DebriefReport {
  if (state.status === "active" || !state.endingCode || !state.endingReason) throw new Error("DEBRIEF_NOT_AVAILABLE");
  const completed = state.actions.filter((action) => action.status === "completed");
  const executionQuality = completed.length ? completed.reduce((sum, action) => sum + action.executionQualityWeighted / Math.max(0.01, action.executionWorkDone), 0) / completed.length * 100 : 0;
  const customerTruth = clamp((state.evidence.problem + state.evidence.budget + state.evidence.buyerClarity + state.evidence.diversity) / 4);
  const resilience = clamp(state.finance.companyCash / Math.max(1, monthlyBurn(state)) * 18 + (state.finance.mrr > 0 ? 18 : 0));
  const sustainability = clamp((state.founder.energy + state.founder.health + 100 - state.founder.burnout + 100 - state.founder.stress) / 4);
  const missedSignals: string[] = [];
  if (state.evidence.diversity < 35) missedSignals.push("Research stayed inside too few independent sample clusters.");
  if (state.finance.accountsReceivable > state.finance.companyCash) missedSignals.push("Booked revenue was mistaken for available cash while receivables accumulated.");
  if (state.product.technicalDebt > 55) missedSignals.push("Architecture and delivery shortcuts compounded into material technical debt.");
  if (state.relationships.overduePromises > 0) missedSignals.push("Overdue promises warned that trust was becoming an operating constraint.");
  if (state.market.accounts.filter((account) => account.stage === "lost").length > 4) missedSignals.push("Repeated losses contained segment, buyer-access, or value signals that were not acted on quickly.");
  const strengths: string[] = [];
  if (customerTruth >= 60) strengths.push("Built a diverse, behavior-based evidence base.");
  if (state.market.accounts.filter((account) => account.stage === "customer").length >= 3) strengths.push("Converted learning into multiple customer commitments.");
  if (sustainability >= 60) strengths.push("Protected enough founder capacity to keep strategic options open.");
  if (state.product.technicalDebt < 30) strengths.push("Kept product debt proportionate to commercial evidence.");
  const counterfactuals = [
    state.evidence.budget < 45 ? "A paid proposal experiment earlier in the campaign could have separated enthusiasm from budget." : "Testing a second independent acquisition path could have challenged the repeatability assumption.",
    state.product.technicalDebt > 45 ? "Narrowing scope before the largest build commitment would have reduced rework and incident exposure." : "A deliberate production-quality capability could have supported higher-value accounts.",
    state.relationships.trust < 45 ? "Renegotiating obligations before their deadlines would have protected stakeholder trust." : "The trust reserve could have been used for a more ambitious pilot or negotiation.",
  ];
  return {
    runId, endingCode: state.endingCode, endingReason: state.endingReason, daysElapsed: state.calendar.absoluteDay, stageReached: state.stage,
    scores: { customerTruth: round(customerTruth), financialResilience: round(resilience), executionQuality: round(clamp(executionQuality)), stakeholderTrust: round(state.relationships.trust), founderSustainability: round(sustainability) },
    causalChain: events.filter((event) => ["problem_escalated", "problem_resolved", "contract_signed", "customer_churned", "incident_opened", "risk_updated", "stage_changed", "ending_reached"].includes(event.type)).slice(-30).map((event) => ({ day: event.simulationDay, eventType: event.type, summary: event.summary })),
    missedSignals, strengths, counterfactuals,
    hiddenTruth: state.market.segments.map((segment) => ({ segment: segment.label, ...state.hidden.segmentTruth[segment.id] })),
  };
}
