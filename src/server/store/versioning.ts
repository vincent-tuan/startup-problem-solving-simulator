import "server-only";
import {
  applyCommand as applyV8Command, applyV7Command, createDebrief, projectState, simulationCommandSchema, v7SimulationCommandSchema,
  type ClientSimulationState, type DebriefReport, type EngineContext, type EngineResult, type HistoryEvent, type SimulationState, type V7SimulationState,
} from "@sim/engine";

export function isV7State(state: unknown): state is V7SimulationState {
  return Boolean(state && typeof state === "object" && (state as { schemaVersion?: number }).schemaVersion === 1);
}

function range(value: number, uncertainty: number) {
  return { low: Math.max(0, value * (1 - uncertainty)), expected: Math.max(0, value), high: Math.max(0, value * (1 + uncertainty)), confidence: "low" as const };
}

/**
 * Read projection only: the canonical v7 snapshot is never rewritten. This lets an
 * old campaign use the current shell while commands continue through its frozen engine.
 */
function projectV7State(state: V7SimulationState): ClientSimulationState {
  const burn = Math.max(0, state.finance.monthlyFixedCosts - state.finance.monthlyFixedSavings + state.finance.founderDraw - state.finance.mrr);
  const runway = burn ? state.finance.companyCash / burn : 24;
  const quality = Math.max(0, Math.min(100, (state.evidence.problem + state.evidence.budget + state.evidence.buyerClarity) / 3));
  const pendingEvent = state.pendingEvent ? {
    id: state.pendingEvent.id, ruleId: "v7_authored_event", title: state.pendingEvent.title,
    summary: "This event is replayed by the frozen v7 engine.", pressure: "legacy", revealableClueIds: [],
    choices: state.pendingEvent.choices.map((label, index) => ({ id: `v7_choice_${index}`, label, intentId: `v7_choice_${index}`, tradeoff: "Resolved by the original v7 rules." })),
  } : null;
  return {
    schemaVersion: 2, engineVersion: state.engineVersion, scenarioId: state.scenarioId, scenarioVersion: state.scenarioVersion,
    seed: state.seed, rng: structuredClone(state.rng), createdAt: state.createdAt, meta: structuredClone(state.meta),
    status: state.status, endingReason: state.endingReason, endingCode: state.status === "won" ? "pmf" : state.status === "ended" ? "time_limit" : null,
    stage: state.status === "won" ? "repeatability" : state.finance.mrr > 0 ? "pilot" : state.product.mvpProgress >= 45 ? "validation" : "discovery",
    stageEnteredDay: 0, healthyWeeks: 0, decisionPoints: state.sequence, maxDays: 540, calendar: structuredClone(state.calendar),
    finance: {
      ...structuredClone(state.finance), accountsReceivable: 0, accountsPayable: 0, deferredRevenue: 0,
      recognizedRevenue: state.finance.mrr, payrollExpense: 0, taxReserve: 0, variableCosts: 0,
      journal: [{ id: "v7_projection_opening", day: 0, memo: "V7 projected opening balance", sourceId: "v7", lines: [{ account: "cash", debit: state.finance.companyCash, credit: 0 }, { account: "legacy_equity", debit: 0, credit: state.finance.companyCash }] }],
    },
    founder: { ...structuredClone(state.founder), stress: state.founder.burnout, learningVelocity: 50, allocation: { research: 25, product: 25, sales: 25, operations: 25 } },
    evidence: {
      ...structuredClone(state.evidence),
      claims: [
        { id: "v7_problem", label: "Problem matters", confidence: state.evidence.problem, supportingWeight: state.evidence.problem, contradictingWeight: 0, sampleDiversity: state.evidence.diversity, lastUpdatedDay: state.calendar.absoluteDay },
        { id: "v7_budget", label: "Buyer will pay", confidence: state.evidence.budget, supportingWeight: state.evidence.budget, contradictingWeight: 0, sampleDiversity: state.evidence.diversity, lastUpdatedDay: state.calendar.absoluteDay },
      ],
    },
    market: { segments: [{ id: "v7_market", label: "V7 target market", urgency: 50, willingnessToPay: Math.max(1, state.finance.mrr), switchingFriction: 50, budgetCycleDays: 30, adoptionRisk: 50, reachableAccounts: 100, responseRate: 0.08, baseMonthlyChurn: 0.08, discovered: true, fitSignal: state.evidence.problem }], accounts: [], cohorts: [], defaultPrice: Math.max(1, state.finance.mrr), pipelineValue: 0, winRate: 0, monthlyChurn: 0, supportLoad: 0 },
    product: { ...structuredClone(state.product), reliability: state.product.quality, usability: state.product.quality, security: 25, compliance: 20, technicalDebt: state.product.rework, capabilities: [{ id: "v7_mvp", label: "V7 MVP", kind: "core", dependencies: [], status: state.product.mvpProgress >= 100 ? "released" : "backlog", progress: state.product.mvpProgress, quality: state.product.quality, effort: 10 }], incidents: [] },
    relationships: structuredClone(state.relationships), stakeholders: [{ id: "v7_stakeholder", name: "V7 stakeholder", role: "buyer", trust: state.relationships.trust, influence: 50, memory: [] }], obligations: [], risks: [],
    organization: { ...structuredClone(state.organization), members: [{ id: "v7_founder", name: "Founder", role: "founder", employment: "founder", skill: 60, capacity: state.founder.attentionCapacity, morale: state.founder.energy, trust: 100, monthlyCost: state.finance.founderDraw, onboardingRemaining: 0 }], hiring: [] },
    capital: { ...structuredClone(state.capital), fundraising: state.capital.fundraising, investorPipeline: state.capital.fundraising === "none" ? 0 : 30, dilution: 0, runwayExtensionMonths: 0 },
    problems: structuredClone(state.problems), actions: structuredClone(state.actions).map((action) => ({ ...action, researchDesign: undefined })), assumptions: structuredClone(state.assumptions),
    pendingEvent, scheduledEffects: [], triggeredRuleIds: [], sequence: state.sequence, legacy: state.legacy,
    forecasts: { runwayMonths: range(runway, 0.45), nextMonthCash: range(state.finance.companyCash - burn, 0.25), pipelineRevenue: range(0, 0.6), pmfReadiness: range(quality, 0.35) },
  };
}

export function projectVersionedState(state: SimulationState): ClientSimulationState {
  return isV7State(state) ? projectV7State(state) : projectState(state);
}

export function applyVersionedCommand(state: SimulationState, request: { commandId: string; type: string; payload: unknown }, context: EngineContext): EngineResult {
  if (isV7State(state)) {
    const command = v7SimulationCommandSchema.parse(request);
    return applyV7Command(state, command, context) as unknown as EngineResult;
  }
  const command = simulationCommandSchema.parse(request);
  return applyV8Command(state, command, context);
}

export function createVersionedDebrief(runId: string, state: SimulationState, events: HistoryEvent[]): DebriefReport {
  if (!isV7State(state as unknown)) return createDebrief(runId, state, events);
  const legacy = state as unknown as V7SimulationState;
  if (legacy.status === "active") throw new Error("DEBRIEF_NOT_AVAILABLE");
  return {
    runId, endingCode: legacy.status === "won" ? "pmf" : "time_limit", endingReason: legacy.endingReason ?? "The frozen v7 campaign ended.",
    daysElapsed: legacy.calendar.absoluteDay, stageReached: legacy.status === "won" ? "repeatability" : legacy.finance.mrr > 0 ? "pilot" : "validation",
    scores: { customerTruth: legacy.evidence.problem, financialResilience: Math.min(100, legacy.finance.companyCash / 10), executionQuality: legacy.product.quality, stakeholderTrust: legacy.relationships.trust, founderSustainability: Math.max(0, 100 - legacy.founder.burnout) },
    causalChain: events.slice(-30).map((event) => ({ day: event.simulationDay, eventType: event.type, summary: event.summary })),
    missedSignals: ["V7 did not record the hidden-state evidence needed for a v8 counterfactual audit."],
    strengths: legacy.status === "won" ? ["The campaign reached the original v7 success condition."] : [],
    counterfactuals: ["Start a new v8 campaign to evaluate account, cohort, ledger, obligation, and delayed-risk counterfactuals."],
    hiddenTruth: [],
  };
}
