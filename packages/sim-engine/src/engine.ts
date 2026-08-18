import { stateChecksum } from "./checksum";
import { random, randomBetween } from "./rng";
import { clone, clamp, finite, round } from "./kernel/math";
import { nextScheduledDay, processDueEffects, scheduleEffect, type DomainEmitter } from "./kernel/scheduler";
import { evaluateCausalEvent } from "./content/event-rules";
import { scenarioPhysics } from "./content/scenario-physics";
import { featureRegistry } from "./features";
import { completeResearch, decayEvidence } from "./domains/evidence";
import { journalCashBalance, monthlyBurn, postJournal, resetOpeningJournal, validateFinance } from "./domains/finance";
import { advanceAccount, disqualifyAccount, engageAccountStakeholder, negotiateContract, sourceAccount, updateMarketMetrics } from "./domains/market";
import { beginHiring } from "./domains/people";
import { completeProductWork, resolveIncident } from "./domains/product";
import {
  ENGINE_VERSION, runSetupSchema, scenarioDefinitionSchema, simulationCommandSchema,
  type EngineContext, type EngineResult, type EndingCode, type HistoryCategory, type HistoryEvent,
  type HistoryEventType, type RunSetup, type ScenarioDefinition, type SimulationAction,
  systemSimulationCommandSchema, type SimulationCommand, type SimulationStage, type SimulationState, type StateEffect,
  type SystemSimulationCommand,
} from "./types";

const difficultyFactor = { guided: 1.12, realistic: 1, brutal: 0.86 } as const;
const intensityFactor = { sustainable: 1, hard: 1.16, crunch: 1.32 } as const;
const intensityBurnout = { sustainable: 0.03, hard: 0.1, crunch: 0.2 } as const;
const ACTIONS: Record<"research" | "build" | "outreach" | "cut_tools" | "personal_injection" | "service_offer", { title: string; work: number; attention: number; cost: number }> = {
  research: { title: "Run a falsifiable research test", work: 4, attention: 18, cost: 0 },
  build: { title: "Ship a scoped product slice", work: 7, attention: 30, cost: 25 },
  outreach: { title: "Targeted stakeholder outreach", work: 4, attention: 20, cost: 8 },
  cut_tools: { title: "Cut non-essential fixed costs", work: 1, attention: 5, cost: 0 },
  personal_injection: { title: "Founder cash injection", work: 1, attention: 3, cost: 0 },
  service_offer: { title: "Sell a scoped diagnostic service", work: 5, attention: 24, cost: 5 },
};

function runwayValues(setup: RunSetup, scenario: ScenarioDefinition) {
  if (setup.personalRunway === "pressure") return { cash: scenario.initial.personalCash * 0.4, living: scenario.initial.livingCost * 0.8 };
  if (setup.personalRunway === "stable") return { cash: scenario.initial.personalCash * 2.4, living: scenario.initial.livingCost * 1.12 };
  return { cash: scenario.initial.personalCash, living: scenario.initial.livingCost };
}

function localTruth(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0 || 1;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return (value >>> 0) / 4_294_967_296;
}

export function createInitialState(scenarioInput: ScenarioDefinition, setupInput: RunSetup, context: EngineContext): SimulationState {
  const scenario = scenarioDefinitionSchema.parse(scenarioInput);
  const setup = runSetupSchema.parse(setupInput);
  const physics = scenarioPhysics(scenario);
  const runway = runwayValues(setup, scenario);
  const founderBonus = setup.founderArchetype === "builder" ? 6 : setup.founderArchetype === "seller" ? 3 : 4;
  const seed = (context.seed >>> 0) || 1;
  const segmentTruth = Object.fromEntries(physics.segments.map((segment, index) => {
    const fitNoise = localTruth(seed, index * 3) * 34 - 17;
    const priceNoise = 0.72 + localTruth(seed, index * 3 + 1) * 0.56;
    const churnNoise = localTruth(seed, index * 3 + 2) * 10 - 5;
    return [segment.id, { fit: round(clamp(segment.urgency + fitNoise)), actualWtp: round(segment.willingnessToPay * priceNoise), churnRisk: round(clamp(segment.baseMonthlyChurn * 100 + churnNoise, 1, 55)) }];
  }));
  const engineVersion = context.engineVersion || ENGINE_VERSION;
  const state: SimulationState = {
    schemaVersion: engineVersion.startsWith("9.") ? 3 : 2, engineVersion, scenarioId: scenario.id,
    scenarioVersion: `${scenario.id}@${scenario.version}`, seed, rng: { state: seed, draws: 0 }, createdAt: context.now,
    meta: { companyName: setup.companyName, founderArchetype: setup.founderArchetype, difficulty: setup.difficulty, personalRunway: setup.personalRunway, vertical: scenario.vertical, jurisdiction: physics.jurisdictionArchetype, architecture: scenario.architecture, strategy: scenario.strategy },
    status: "active", endingReason: null, endingCode: null, stage: "discovery", stageEnteredDay: 0, healthyWeeks: 0, decisionPoints: 0, maxDays: physics.maxDays,
    calendar: { absoluteDay: 0, month: 0, year: 2026 },
    finance: {
      companyCash: scenario.initial.companyCash, personalCash: round(runway.cash), personalDebt: 0, founderLoanBalance: 0,
      livingCost: round(runway.living), monthlyFixedCosts: scenario.initial.monthlyFixedCosts,
      reducibleFixedCosts: Math.min(scenario.initial.monthlyFixedCosts, scenario.initial.reducibleFixedCosts), monthlyFixedSavings: 0,
      pendingServiceRevenue: 0, mrr: 0, founderDraw: 0, accountsReceivable: 0, accountsPayable: 0, deferredRevenue: 0,
      recognizedRevenue: 0, payrollExpense: 0, taxReserve: 0, variableCosts: 0, journal: [],
    },
    founder: { energy: scenario.initial.founderEnergy, health: scenario.initial.founderHealth, burnout: scenario.initial.founderBurnout, attentionCapacity: 42 + founderBonus, stress: 22, learningVelocity: setup.founderArchetype === "expert" ? 62 : 52, allocation: { research: 35, product: 30, sales: 25, operations: 10 } },
    evidence: {
      problem: scenario.initial.problemEvidence, budget: scenario.initial.budgetEvidence, buyerClarity: scenario.initial.buyerClarity,
      quality: 6, diversity: 5, designHistory: [], ledger: [], claims: [
        { id: "claim_severity", label: "The problem is frequent and costly", confidence: 12, supportingWeight: 0, contradictingWeight: 0, sampleDiversity: 0, lastUpdatedDay: 0 },
        { id: "claim_workflow", label: "The workflow is repeatable", confidence: 10, supportingWeight: 0, contradictingWeight: 0, sampleDiversity: 0, lastUpdatedDay: 0 },
        { id: "claim_budget", label: "A reachable buyer will pay", confidence: 8, supportingWeight: 0, contradictingWeight: 0, sampleDiversity: 0, lastUpdatedDay: 0 },
        { id: "claim_buyer", label: "The buying path is understood", confidence: 8, supportingWeight: 0, contradictingWeight: 0, sampleDiversity: 0, lastUpdatedDay: 0 },
      ],
    },
    market: {
      segments: physics.segments.map((segment, index) => ({ ...segment, discovered: index === 0, fitSignal: index === 0 ? 8 : 0 })),
      accounts: [], cohorts: [], defaultPrice: physics.defaultPrice, pipelineValue: 0, winRate: 0, monthlyChurn: 0, supportLoad: 0,
    },
    product: {
      mvpProgress: scenario.initial.mvpProgress, quality: scenario.initial.productQuality, rework: 2, architecture: scenario.architecture,
      reliability: Math.max(8, scenario.initial.productQuality), usability: Math.max(8, scenario.initial.productQuality), security: scenario.id === "healthcare-operations" ? 4 : 10,
      compliance: scenario.id === "healthcare-operations" ? 3 : 15, technicalDebt: 4,
      capabilities: physics.capabilities.map((item) => ({ ...item, status: "backlog", progress: 0, quality: 0 })), incidents: [],
    },
    relationships: { trust: 8, openPromises: 0, overduePromises: 0 }, stakeholders: [
      { id: "stakeholder_vendor", name: "Critical technology vendor", role: "vendor", trust: 50, influence: 65, memory: [] },
    ], obligations: [],
    risks: [
      { id: "risk_market", domain: "market", title: "The initial segment may not support a repeatable business", likelihood: 42, impact: 62, exposure: 38, status: "latent" },
      { id: "risk_founder", domain: "founder", title: "Founder runway and health can fail independently of company cash", likelihood: 36, impact: 78, exposure: 30, status: "latent" },
      { id: "risk_scenario", domain: physics.pressureProfile === "compliance" ? "compliance" : physics.pressureProfile === "integration" ? "vendor" : "market", title: `${physics.pressureProfile} pressure can invalidate the operating plan`, likelihood: 32, impact: physics.pressureProfile === "compliance" ? 88 : 68, exposure: 28, status: "latent" },
    ],
    organization: { teamSize: 0, contractors: 0, activeInitiatives: [], members: [{ id: "member_founder", name: setup.companyName + " founder", role: "founder", employment: "founder", skill: 64, capacity: 42 + founderBonus, morale: 76, trust: 100, monthlyCost: 0, onboardingRemaining: 0 }], hiring: [] },
    capital: { fundraising: "none", debt: 0, investorPipeline: 0, dilution: 0, runwayExtensionMonths: 0 },
    problems: scenario.problems.map((problem, index) => ({
      id: `problem_${index + 1}`, key: problem.key, domain: problem.domain, title: problem.title, summary: problem.summary,
      severity: problem.severity, openedDay: 0, deadlineDay: problem.deadlineDay, status: "open",
      hypotheses: problem.hypotheses.map((label, hypothesisIndex) => ({ id: `problem_${index + 1}_hypothesis_${hypothesisIndex + 1}`, label, score: 20 })),
      workingHypothesisId: null, escalationCount: 0, drivers: [problem.domain, physics.pressureProfile], trajectory: "stable", resolutionProgress: 0,
    })),
    actions: [], assumptions: [
      { id: "assumption_problem", label: "The problem is frequent and costly", confidence: 18 },
      { id: "assumption_buyer", label: "A reachable economic buyer has budget", confidence: 12 },
      { id: "assumption_solution", label: "A narrow solution creates repeatable value", confidence: 16 },
      { id: "assumption_channel", label: "The founder can reach buyers with $500", confidence: 10 },
    ],
    pendingEvent: null, scheduledEffects: [], triggeredRuleIds: [], sequence: 0, externalInputRefs: [],
    hidden: { segmentTruth, scenarioPressure: physics.pressureProfile === "compliance" ? 72 : physics.pressureProfile === "support" ? 58 : 62, endingScores: {} },
  };
  if (state.schemaVersion === 3) featureRegistry.initialize(state, scenario);
  resetOpeningJournal(state, "Founder opening capital");
  return state;
}

function metrics(state: SimulationState): Record<string, string | number | boolean | null> {
  return {
    "finance.companyCash": round(state.finance.companyCash), "finance.personalCash": round(state.finance.personalCash),
    "finance.founderLoanBalance": round(state.finance.founderLoanBalance), "finance.accountsReceivable": round(state.finance.accountsReceivable),
    "finance.mrr": round(state.finance.mrr), "founder.energy": round(state.founder.energy), "founder.burnout": round(state.founder.burnout),
    "evidence.problem": round(state.evidence.problem), "evidence.budget": round(state.evidence.budget), "evidence.diversity": round(state.evidence.diversity),
    "product.mvpProgress": round(state.product.mvpProgress), "product.quality": round(state.product.quality), "product.technicalDebt": round(state.product.technicalDebt),
    "market.pipelineValue": round(state.market.pipelineValue), "relationships.trust": round(state.relationships.trust), status: state.status, stage: state.stage, day: state.calendar.absoluteDay,
  };
}

function diff(before: ReturnType<typeof metrics>, after: ReturnType<typeof metrics>): StateEffect[] {
  return Object.keys(after).flatMap((path) => before[path] === after[path] ? [] : [{ path, before: before[path], after: after[path] }]);
}

function actionQuality(state: SimulationState) {
  const active = state.actions.filter((action) => action.status === "active");
  const teamCapacity = state.organization.members.reduce((sum, member) => sum + (member.onboardingRemaining > 0 ? member.capacity * 0.35 : member.capacity), 0);
  const load = active.reduce((total, action) => total + action.attention, 0) / Math.max(1, teamCapacity);
  const allocationFor = (action: SimulationAction) => action.kind === "research" ? state.founder.allocation.research
    : ["build", "product"].includes(action.kind) ? state.founder.allocation.product
      : ["outreach", "sales", "service_offer", "experiment"].includes(action.kind) ? state.founder.allocation.sales : state.founder.allocation.operations;
  const allocationFit = active.length ? active.reduce((sum, action) => sum + allocationFor(action), 0) / active.length : state.founder.allocation.operations;
  const focusSpeed = clamp(0.72 + allocationFit / 45, 0.72, 1.55);
  const speed = (load <= 1 ? 1 : clamp(1 / load, 0.32, 1)) * focusSpeed;
  const quality = clamp((1 - Math.max(0, load - 0.85) * 0.32) * (1 - state.founder.burnout / 190) * clamp(0.82 + allocationFit / 140, 0.82, 1.25), 0.28, 1);
  return { active, load, speed, quality, allocationFit };
}

function spend(state: SimulationState, amount: number, sourceId: string, memo: string) {
  if (amount <= 0) return;
  if (state.finance.companyCash < amount) throw new Error("INSUFFICIENT_COMPANY_CASH");
  postJournal(state, memo, sourceId, [{ account: "operating_expense", debit: amount, credit: 0 }, { account: "cash", debit: 0, credit: amount }]);
}

function addAction(state: SimulationState, input: Omit<SimulationAction, "id" | "status" | "startedDay" | "executionWorkDone" | "executionQualityWeighted">) {
  spend(state, input.cashCost, `action_${state.sequence + 1}`, input.title);
  const action: SimulationAction = { ...input, id: `action_${state.sequence + 1}_${state.actions.length + 1}`, status: "active", startedDay: state.calendar.absoluteDay, executionWorkDone: 0, executionQualityWeighted: 0 };
  state.actions.unshift(action); return action;
}

function completeAction(state: SimulationState, action: SimulationAction, emit: DomainEmitter) {
  const quality = action.executionWorkDone > 0 ? action.executionQualityWeighted / action.executionWorkDone : 0.5;
  const factor = difficultyFactor[state.meta.difficulty];
  if (action.kind === "research") completeResearch(state, action, quality, factor, emit);
  else if (action.kind === "build" || action.kind === "product") completeProductWork(state, action, quality * factor, emit);
  else if (action.kind === "outreach" || action.kind === "sales") {
    const accepted = random(state) < clamp((state.evidence.problem + state.evidence.buyerClarity + 30) / 180 * quality, 0.08, 0.72);
    state.relationships.trust = clamp(state.relationships.trust + (accepted ? 6 : 1)); state.evidence.buyerClarity = clamp(state.evidence.buyerClarity + (accepted ? 3 : 0.5));
    action.result = accepted ? "A relevant stakeholder accepted the ask and clarified the buying path." : "No meeting was secured; the access attempt produced a weak signal.";
    emit("stakeholder_updated", "stakeholder", action.result, "system");
  } else if (action.kind === "cut_tools") {
    const cap = Math.max(0, Math.min(state.finance.monthlyFixedCosts, state.finance.reducibleFixedCosts));
    const before = clamp(state.finance.monthlyFixedSavings, 0, cap); state.finance.monthlyFixedSavings = Math.min(cap, before + randomBetween(state, 12, 35));
    action.result = state.finance.monthlyFixedSavings > before ? `Reduced monthly fixed commitments by $${round(state.finance.monthlyFixedSavings - before)}.` : "No additional non-essential fixed costs can be removed.";
    emit("finance_posted", "finance", action.result, "system");
  } else if (action.kind === "personal_injection") {
    const amount = Math.min(200, Math.max(0, state.finance.personalCash * 0.35)); state.finance.personalCash = round(state.finance.personalCash - amount);
    postJournal(state, "Founder cash injection", action.id, [{ account: "cash", debit: amount, credit: 0 }, { account: "founder_loan", debit: 0, credit: amount }]);
    action.result = `Founder injected $${round(amount)}; recorded as a company liability to the founder.`; emit("finance_posted", "finance", action.result, "system");
  } else if (action.kind === "service_offer" || action.kind === "experiment") {
    const truth = state.hidden.segmentTruth[action.targetId ?? state.market.segments[0]?.id];
    const success = random(state) < clamp(((truth?.fit ?? 45) + state.evidence.problem + state.evidence.budget) / 280 * quality, 0.08, 0.78);
    const revenue = success ? round(randomBetween(state, 90, 260)) : 0; state.finance.pendingServiceRevenue += revenue;
    state.evidence.budget = clamp(state.evidence.budget + (success ? 8 : 2));
    action.result = success ? `A scoped experiment generated a $${revenue} paid commitment.` : "The offer was declined; the objection improved budget evidence.";
    emit(success ? "finance_posted" : "evidence_recorded", success ? "finance" : "evidence", action.result, "system");
  }
}

function closeMonth(state: SimulationState, emit: DomainEmitter) {
  const savingsCap = Math.min(state.finance.monthlyFixedCosts, state.finance.reducibleFixedCosts);
  state.finance.monthlyFixedSavings = clamp(state.finance.monthlyFixedSavings, 0, savingsCap);
  const fixedExpense = Math.max(0, state.finance.monthlyFixedCosts - state.finance.monthlyFixedSavings);
  const payroll = state.organization.members.reduce((sum, member) => sum + member.monthlyCost, 0);
  const serviceRevenue = Math.max(0, state.finance.pendingServiceRevenue);
  if (serviceRevenue > 0) postJournal(state, "Cash service revenue", `month_${state.calendar.month + 1}`, [{ account: "cash", debit: serviceRevenue, credit: 0 }, { account: "revenue", debit: 0, credit: serviceRevenue }]);
  const recognized = Math.min(state.finance.deferredRevenue, Math.max(0, state.finance.mrr));
  if (recognized > 0) postJournal(state, "Monthly subscription revenue recognized", `month_${state.calendar.month + 1}`, [{ account: "deferred_revenue", debit: recognized, credit: 0 }, { account: "revenue", debit: 0, credit: recognized }]);
  const variable = round(state.finance.mrr * scenarioVariableRate(state));
  const companyOutflow = fixedExpense + payroll + variable + state.finance.founderDraw;
  if (companyOutflow > 0) postJournal(state, "Monthly operating close", `month_${state.calendar.month + 1}`, [
    { account: "operating_expense", debit: fixedExpense + state.finance.founderDraw, credit: 0 },
    { account: "payroll_expense", debit: payroll, credit: 0 }, { account: "variable_cost", debit: variable, credit: 0 },
    { account: "cash", debit: 0, credit: companyOutflow },
  ]);
  state.finance.personalCash = round(state.finance.personalCash + state.finance.founderDraw - state.finance.livingCost);
  state.finance.pendingServiceRevenue = 0; state.finance.payrollExpense = 0; state.finance.variableCosts = 0;
  if (state.finance.personalCash < 0) state.finance.personalDebt = Math.max(state.finance.personalDebt, round(-state.finance.personalCash));
  state.calendar.month += 1;
  for (const cohort of state.market.cohorts) cohort.grossMargin = cohort.currentMrr > 0 ? round(clamp((cohort.currentMrr - variable) / cohort.currentMrr, 0, 1), 3) : 0;
  emit("month_closed", "finance", `Month ${state.calendar.month} closed: recognized revenue $${round(serviceRevenue + recognized)}, operating cash outflow $${round(companyOutflow)}.`, "system");
}

function scenarioVariableRate(state: SimulationState) {
  return state.scenarioId === "ai-workflow-automation" ? 0.28 : state.scenarioId === "local-services-saas" ? 0.14 : 0.19;
}

function updateProblems(state: SimulationState, emit: DomainEmitter) {
  for (const problem of state.problems.filter((item) => item.status === "open")) {
    const score = problem.domain === "evidence" ? (state.evidence.problem + state.evidence.budget + state.evidence.buyerClarity) / 3
      : problem.domain === "finance" ? clamp(state.finance.companyCash / Math.max(1, monthlyBurn(state)) * 16)
        : problem.domain === "product" ? (state.product.quality + state.product.reliability + state.product.usability - state.product.technicalDebt) / 3
          : problem.domain === "people" ? (state.relationships.trust + state.founder.energy + 100 - state.founder.burnout) / 3
            : (state.evidence.quality + state.market.winRate * 100 + state.relationships.trust) / 3;
    problem.resolutionProgress = round(clamp(score));
    problem.trajectory = score >= 62 ? "improving" : state.calendar.absoluteDay >= problem.deadlineDay ? "worsening" : "stable";
    if (score >= 72 && problem.escalationCount <= 2) {
      problem.status = "resolved"; problem.resolution = `Causal drivers improved beyond ${round(score)}/100.`;
      emit("problem_resolved", "problem", `${problem.title} resolved through accumulated operating evidence.`, "system");
    } else if (problem.deadlineDay <= state.calendar.absoluteDay) {
      problem.escalationCount += 1; problem.severity = clamp(problem.severity + 1, 1, 5); problem.deadlineDay += Math.max(7, 16 - problem.severity * 2);
      emit("problem_escalated", "problem", `${problem.title} escalated to severity ${problem.severity}; its causal drivers remain unresolved.`, "system");
    }
  }
}

const stageOrder: SimulationStage[] = ["discovery", "validation", "pilot", "productization", "repeatability"];
function updateStageAndEnding(state: SimulationState, elapsedDays: number, emit: DomainEmitter) {
  const customers = state.market.accounts.filter((account) => account.stage === "customer").length;
  let target: SimulationStage = "discovery";
  if (state.evidence.problem >= 30 && state.evidence.buyerClarity >= 20) target = "validation";
  if (customers >= 1 || state.market.accounts.some((account) => ["pilot", "negotiation"].includes(account.stage))) target = "pilot";
  if (customers >= 2 && state.product.capabilities.some((capability) => capability.status === "released")) target = "productization";
  if (customers >= 4 && state.finance.mrr > 0 && state.market.monthlyChurn < 0.16) target = "repeatability";
  if (stageOrder.indexOf(target) > stageOrder.indexOf(state.stage)) {
    state.stage = target; state.stageEnteredDay = state.calendar.absoluteDay; emit("stage_changed", "system", `Campaign advanced to ${target}.`, "system");
  }
  const healthy = customers >= 5 && state.finance.mrr >= state.market.defaultPrice * 4 && state.market.monthlyChurn <= 0.1 && state.evidence.problem >= 55 && state.evidence.budget >= 50 && state.product.quality >= 45;
  state.healthyWeeks = healthy ? state.healthyWeeks + Math.floor(elapsedDays / 7) : Math.max(0, state.healthyWeeks - 1);
  if (state.status !== "active") return;
  let ending: EndingCode | null = null; let reason = "";
  if (state.finance.companyCash < 0) { ending = "insolvency"; reason = "The company became insolvent after recognized obligations exceeded available cash."; }
  else if (state.finance.personalCash < -state.finance.livingCost * 0.35) { ending = "founder_collapse"; reason = "The founder ran out of personal runway."; }
  else if (state.founder.health < 15 || state.founder.burnout >= 96) { ending = "founder_collapse"; reason = "Founder health made continued execution unsafe."; }
  else if (state.risks.some((risk) => risk.domain === "compliance" && risk.status === "realized" && risk.exposure >= 85)) { ending = "regulatory_failure"; reason = "A compliance exposure made the operating path non-viable."; }
  else if (state.relationships.trust <= 4 && state.market.accounts.filter((account) => account.stage === "lost").length >= 3) { ending = "trust_failure"; reason = "Repeated broken commitments exhausted stakeholder trust."; }
  else if (state.healthyWeeks >= 8 && state.stage === "repeatability") { ending = "pmf"; reason = "Repeatable acquisition, retention, margin, evidence, and operating health held for eight weeks."; }
  else if (state.calendar.absoluteDay >= state.maxDays) {
    if (customers >= 3 && state.finance.mrr >= monthlyBurn(state) * 0.7) { ending = "sustainable_niche"; reason = "The company reached a sustainable niche without broad PMF."; }
    else { ending = "time_limit"; reason = "The 18-month campaign ended without a repeatable operating model."; }
  }
  if (ending) {
    state.endingCode = ending; state.endingReason = reason; state.status = ending === "pmf" ? "won" : "ended";
    emit("ending_reached", "system", reason, "system"); emit("run_ended", "system", reason, "system");
  }
}

function advance(state: SimulationState, maxDays: number, emit: DomainEmitter) {
  if (state.pendingEvent) throw new Error("EVENT_DECISION_REQUIRED");
  const diagnostics = actionQuality(state);
  const dayInMonth = state.calendar.absoluteDay % 30; const monthDays = dayInMonth === 0 ? 30 : 30 - dayInMonth;
  const completionDays = diagnostics.active.length ? Math.max(1, Math.ceil(Math.min(...diagnostics.active.map((action) => action.remainingWork)) / diagnostics.speed)) : Number.POSITIVE_INFINITY;
  const deadlineDays = state.problems.filter((problem) => problem.status === "open").map((problem) => Math.max(1, problem.deadlineDay - state.calendar.absoluteDay));
  const scheduledDays = Math.max(1, nextScheduledDay(state) - state.calendar.absoluteDay);
  let delta = Math.min(maxDays, monthDays, completionDays, scheduledDays, ...deadlineDays);
  if (!Number.isFinite(delta)) delta = Math.min(maxDays, monthDays);
  for (const action of diagnostics.active) {
    const work = Math.min(action.remainingWork, delta * diagnostics.speed); action.remainingWork = Math.max(0, action.remainingWork - work);
    action.executionWorkDone += work; action.executionQualityWeighted += diagnostics.quality * work;
    state.founder.burnout = clamp(state.founder.burnout + delta * (Math.max(0, diagnostics.load - 1) * 0.2 + intensityBurnout[action.intensity]));
  }
  state.founder.energy = clamp(state.founder.energy - Math.max(0, diagnostics.load - 0.8) * delta * 0.4 + (diagnostics.load < 0.6 ? delta * 0.15 : 0));
  state.founder.stress = clamp(state.founder.stress + Math.max(0, diagnostics.load - 0.9) * delta * 0.5 - (diagnostics.load < 0.7 ? delta * 0.12 : 0));
  state.founder.burnout = clamp(state.founder.burnout - (diagnostics.load < 0.65 ? delta * 0.08 : 0));
  state.founder.health = clamp(state.founder.health - Math.max(0, state.founder.stress - 72) * delta * 0.004 + (state.founder.stress < 38 ? delta * 0.025 : 0));
  state.calendar.absoluteDay += delta; state.decisionPoints += 1;
  for (const member of state.organization.members) member.onboardingRemaining = Math.max(0, member.onboardingRemaining - delta);
  for (const member of state.organization.members.filter((item) => item.employment !== "founder")) member.morale = clamp(member.morale - Math.max(0, diagnostics.load - 1) * delta * 0.8 + (diagnostics.load < 0.75 ? delta * 0.1 : 0));
  for (const action of diagnostics.active.filter((item) => item.remainingWork <= 0.0001)) {
    action.status = "completed"; action.completedDay = state.calendar.absoluteDay; completeAction(state, action, emit);
    emit("action_completed", "action", `${action.title} completed: ${action.result ?? "Outcome recorded."}`, "system");
  }
  processDueEffects(state, emit, state.schemaVersion === 3 ? (effect) => featureRegistry.dispatchEffect(state, effect, emit) : undefined);
  if (state.schemaVersion === 3) featureRegistry.runLifecycle(state, "after_scheduled_effects", delta, emit);
  else { decayEvidence(state); updateMarketMetrics(state); }
  updateProblems(state, emit);
  if (state.calendar.absoluteDay % 30 === 0) {
    closeMonth(state, emit);
    if (state.schemaVersion === 3) featureRegistry.runLifecycle(state, "after_financial_close", delta, emit);
  }
  if (state.schemaVersion !== 3) updateMarketMetrics(state);
  updateStageAndEnding(state, delta, emit);
  if (state.status === "active") {
    const event = evaluateCausalEvent(state); if (event) {
      state.pendingEvent = event;
      if (["reliability", "vendor"].includes(event.pressure) && !state.product.incidents.some((incident) => incident.status === "open")) {
        const incident = { id: `incident_${state.product.incidents.length + 1}`, openedDay: state.calendar.absoluteDay, severity: event.pressure === "reliability" ? 3 : 2, type: event.pressure === "vendor" ? "vendor" as const : "reliability" as const, status: "open" as const, accountIds: state.market.accounts.filter((account) => account.stage === "customer").map((account) => account.id) };
        state.product.incidents.push(incident); emit("incident_opened", "product", `${incident.type} incident opened from accumulated causal pressure.`, "system");
      }
      emit("external_event_generated", "system", `${event.title}: ${event.summary}`, "system");
    }
  }
}

function respondToEvent(state: SimulationState, choiceIndex: number, emit: DomainEmitter) {
  const event = state.pendingEvent; if (!event) throw new Error("EVENT_NOT_FOUND");
  const choice = event.choices[choiceIndex]; if (!choice) throw new Error("EVENT_CHOICE_NOT_FOUND");
  if (choice.intentId === "narrow_scope") { state.product.rework = clamp(state.product.rework - 6); state.market.pipelineValue = Math.max(0, state.market.pipelineValue * 0.92); }
  else if (choice.intentId === "gather_evidence") { state.evidence.quality = clamp(state.evidence.quality + 3); state.founder.energy = clamp(state.founder.energy - 2); }
  else if (choice.intentId === "accept_overload") { state.founder.burnout = clamp(state.founder.burnout + 9); state.product.technicalDebt = clamp(state.product.technicalDebt + 5); }
  else if (choice.intentId === "transparent_update") { state.relationships.trust = clamp(state.relationships.trust + 5); }
  else if (choice.intentId === "renegotiate") { state.relationships.trust = clamp(state.relationships.trust + 2); state.obligations.push({ id: `obligation_${state.obligations.length + 1}`, title: `Renegotiated commitment from ${event.title}`, ownerId: "member_founder", dueDay: state.calendar.absoluteDay + 14, status: "open", severity: 2, dependencyIds: [] }); state.relationships.openPromises += 1; const obligation = state.obligations.at(-1)!; scheduleEffect(state, "obligation_due", obligation.dueDay, obligation.id); }
  else if (choice.intentId === "delay") { state.relationships.trust = clamp(state.relationships.trust - 4); state.risks[0].exposure = clamp(state.risks[0].exposure + 8); }
  else if (choice.intentId === "collect_cash") { state.evidence.budget = clamp(state.evidence.budget + 2); state.relationships.trust = clamp(state.relationships.trust - 1); }
  else if (choice.intentId === "cut_cost") { state.finance.monthlyFixedSavings = Math.min(state.finance.reducibleFixedCosts, state.finance.monthlyFixedSavings + 10); }
  else if (choice.intentId === "bridge_capital") { const amount = Math.min(120, Math.max(0, state.finance.personalCash * 0.2)); state.finance.personalCash -= amount; postJournal(state, "Founder bridge capital", event.id, [{ account: "cash", debit: amount, credit: 0 }, { account: "founder_loan", debit: 0, credit: amount }]); }
  else if (choice.intentId === "mitigate_risk") { const cost = Math.min(40, Math.max(0, state.finance.companyCash)); spend(state, cost, event.id, "Risk mitigation"); state.product.security = clamp(state.product.security + 6); state.product.compliance = clamp(state.product.compliance + 6); }
  else if (choice.intentId === "seek_partner") { state.relationships.trust = clamp(state.relationships.trust + 3); state.organization.contractors += 1; }
  else if (choice.intentId === "accept_risk") { const risk = state.risks.find((item) => item.status === "latent") ?? state.risks[0]; risk.status = "open"; risk.exposure = clamp(risk.exposure + 12); scheduleEffect(state, "risk_check", state.calendar.absoluteDay + 14, risk.id); }
  const actor = state.stakeholders.find((item) => item.id === event.actorId); if (actor) { actor.memory.push(`${choice.label} on day ${state.calendar.absoluteDay}`); actor.trust = clamp(actor.trust + (choice.intentId === "transparent_update" ? 5 : choice.intentId === "delay" ? -5 : 1)); actor.memory = actor.memory.slice(-20); }
  state.pendingEvent = null; emit("decision_recorded", event.pressure === "cash" ? "finance" : "risk", `${choice.label}: ${choice.tradeoff}`);
}

function validateState(state: SimulationState) {
  if (state.schemaVersion === 3) featureRegistry.validate(state);
  else validateFinance(state);
  finite(state.founder.energy, "founder.energy"); finite(state.evidence.problem, "evidence.problem"); finite(state.product.quality, "product.quality");
  if (state.evidence.diversity < 0 || state.finance.monthlyFixedSavings > Math.min(state.finance.monthlyFixedCosts, state.finance.reducibleFixedCosts) + 0.01) throw new Error("STATE_INVARIANT_VIOLATION");
}

export function applyCommand(stateInput: SimulationState, commandInput: SimulationCommand, context: EngineContext): EngineResult {
  const command = simulationCommandSchema.parse(commandInput);
  if (stateInput.status !== "active") throw new Error("RUN_NOT_ACTIVE");
  if (stateInput.engineVersion !== context.engineVersion || stateInput.scenarioVersion !== context.scenarioVersion) throw new Error("ENGINE_CONTEXT_MISMATCH");
  if (stateInput.schemaVersion === 3 && stateInput.features?.public.competitors?.pendingTurn) throw new Error("AGENT_TURN_PENDING");
  const state = clone(stateInput);
  // Unit fixtures and legacy adapters may intentionally replace the opening cash before the first command.
  if (state.sequence === 0 && Math.abs(journalCashBalance(state) - state.finance.companyCash) > 0.02) resetOpeningJournal(state, "Reconciled opening fixture balance");
  const before = metrics(state); const created: HistoryEvent[] = []; let checkpoint = false;
  const emit: DomainEmitter = (type: HistoryEventType, category: HistoryCategory, summary: string, actor: HistoryEvent["actor"] = "player") => {
    state.sequence += 1; created.push({ id: `${command.commandId}:${created.length + 1}`, sequence: state.sequence, commandId: command.commandId, type, category, actor, simulationDay: state.calendar.absoluteDay, summary, effects: [], engineVersion: context.engineVersion, createdAt: context.now });
  };

  const featureResult = state.schemaVersion === 3 ? featureRegistry.dispatch(state, command, emit) : { handled: false, checkpoint: false };
  checkpoint ||= featureResult.checkpoint;
  if (!featureResult.handled) switch (command.type) {
    case "planning.update": state.finance.founderDraw = Math.min(command.payload.value, Math.max(0, state.finance.companyCash)); emit("decision_recorded", "finance", `Founder draw set to $${round(state.finance.founderDraw)} per month.`); break;
    case "planning.capacity.allocate": state.founder.allocation = command.payload; emit("decision_recorded", "people", `Capacity allocated: research ${command.payload.research}%, product ${command.payload.product}%, sales ${command.payload.sales}%, operations ${command.payload.operations}%.`); break;
    case "problem.hypothesis.set": { const problem = state.problems.find((item) => item.id === command.payload.problemId); if (!problem?.hypotheses.some((item) => item.id === command.payload.hypothesisId)) throw new Error("HYPOTHESIS_NOT_FOUND"); problem.workingHypothesisId = command.payload.hypothesisId; emit("decision_recorded", "problem", `Working hypothesis updated for ${problem.title}.`); break; }
    case "problem.action.commit": { const problem = state.problems.find((item) => item.id === command.payload.problemId && item.status === "open"); if (!problem) throw new Error("PROBLEM_NOT_FOUND"); if (command.payload.kind === "research" && !command.payload.researchDesign) throw new Error("RESEARCH_DESIGN_REQUIRED"); const definition = ACTIONS[command.payload.kind]; const action = addAction(state, { problemId: problem.id, kind: command.payload.kind, title: definition.title, intensity: command.payload.intensity, remainingWork: definition.work, requiredWork: definition.work, attention: definition.attention * intensityFactor[command.payload.intensity], cashCost: definition.cost, researchDesign: command.payload.researchDesign, cancellationCost: definition.cost }); if (command.payload.kind === "personal_injection") checkpoint = true; emit("action_committed", "action", `${action.title} committed against ${problem.title}.`); break; }
    case "research.run": { const problem = state.problems.find((item) => item.id === command.payload.problemId && item.status === "open"); if (!problem) throw new Error("PROBLEM_NOT_FOUND"); if (!state.market.segments.some((item) => item.id === command.payload.segmentId)) throw new Error("SEGMENT_NOT_FOUND"); const action = addAction(state, { problemId: problem.id, kind: "research", title: `Research ${command.payload.design.question} in ${command.payload.segmentId}`, intensity: command.payload.intensity, remainingWork: 3 + Math.ceil(command.payload.design.count / 6), requiredWork: 3 + Math.ceil(command.payload.design.count / 6), attention: 18 * intensityFactor[command.payload.intensity], cashCost: 0, researchDesign: command.payload.design, targetId: command.payload.segmentId }); emit("action_committed", "evidence", `${action.title} committed with provenance tracking.`); break; }
    case "experiment.start": { const problem = state.problems.find((item) => item.id === command.payload.problemId && item.status === "open"); if (!problem) throw new Error("PROBLEM_NOT_FOUND"); const action = addAction(state, { problemId: problem.id, kind: "experiment", title: `${command.payload.kind.replaceAll("_", " ")} experiment`, intensity: "sustainable", remainingWork: command.payload.kind === "paid_pilot" ? 8 : 5, requiredWork: command.payload.kind === "paid_pilot" ? 8 : 5, attention: 24, cashCost: command.payload.budget, targetId: command.payload.segmentId, cancellationCost: command.payload.budget * 0.3 }); emit("action_committed", "evidence", `${action.title} started; outcome was sampled and will be revealed at completion.`); break; }
    case "account.manage": if (command.payload.operation === "source") sourceAccount(state, command.payload.segmentId ?? state.market.segments[0]?.id, emit); else if (command.payload.operation === "advance") advanceAccount(state, command.payload.accountId ?? "", emit); else disqualifyAccount(state, command.payload.accountId ?? "", emit); break;
    case "account.engage_stakeholder": engageAccountStakeholder(state, command.payload.accountId, command.payload.stakeholderId, command.payload.intent, emit); break;
    case "contract.negotiate": negotiateContract(state, command.payload.accountId, command.payload.price, command.payload.contractMonths, command.payload.discountForPrepay, { paymentTermsDays: command.payload.paymentTermsDays, onboardingMode: command.payload.onboardingMode, supportSlaHours: command.payload.supportSlaHours, dataTerms: command.payload.dataTerms }, emit); checkpoint = true; break;
    case "product.plan": { const capability = state.product.capabilities.find((item) => item.id === command.payload.capabilityId && item.status === "backlog"); if (!capability) throw new Error("CAPABILITY_NOT_AVAILABLE"); const approach = command.payload.approach; capability.status = "building"; const work = capability.effort * (approach === "prototype" ? 0.65 : approach === "accept_debt" ? 0.45 : 1); const action = addAction(state, { problemId: state.problems.find((item) => item.domain === "product" && item.status === "open")?.id ?? state.problems[0]?.id ?? "product", kind: "product", title: `${capability.label} · ${approach.replaceAll("_", " ")}`, intensity: command.payload.intensity, remainingWork: work, requiredWork: work, attention: 28 * intensityFactor[command.payload.intensity], cashCost: approach === "production" ? 35 : 10, targetId: capability.id, dependencies: capability.dependencies, cancellationCost: 8 }); if (approach === "accept_debt") state.product.technicalDebt = clamp(state.product.technicalDebt + 12); emit("action_committed", "product", `${action.title} entered the capability graph.`); break; }
    case "incident.handle": resolveIncident(state, command.payload.incidentId, command.payload.response, emit); break;
    case "people.engage": beginHiring(state, command.payload.operation, command.payload.role, command.payload.budget, emit); break;
    case "finance.manage": { const amount = round(command.payload.amount); if (command.payload.operation === "cut_cost") { const beforeSavings = state.finance.monthlyFixedSavings; state.finance.monthlyFixedSavings = Math.min(state.finance.reducibleFixedCosts, state.finance.monthlyFixedSavings + amount); const actual = round(state.finance.monthlyFixedSavings - beforeSavings); emit("finance_posted", "finance", `Reduced verified monthly commitments by $${actual} within the reducible cap.`); } else if (command.payload.operation === "founder_injection") { if (state.finance.personalCash < amount) throw new Error("INSUFFICIENT_PERSONAL_CASH"); state.finance.personalCash -= amount; postJournal(state, "Founder injection", command.commandId, [{ account: "cash", debit: amount, credit: 0 }, { account: "founder_loan", debit: 0, credit: amount }]); checkpoint = true; emit("finance_posted", "finance", `Founder injected $${amount}; founder-loan liability increased equally.`); } else if (command.payload.operation === "reserve_tax") { postJournal(state, "Tax reserve recognized", command.commandId, [{ account: "tax_expense", debit: amount, credit: 0 }, { account: "tax_reserve", debit: 0, credit: amount }]); emit("finance_posted", "finance", `Recognized a $${amount} tax reserve without treating it as free cash.`); } else { const collected = Math.min(amount, state.finance.accountsReceivable); if (collected <= 0) throw new Error("NO_RECEIVABLE_TO_COLLECT"); postJournal(state, "Invoice collection", command.payload.sourceId ?? command.commandId, [{ account: "cash", debit: collected, credit: 0 }, { account: "accounts_receivable", debit: 0, credit: collected }]); emit("payment_received", "finance", `Collected $${round(collected)} from accounts receivable.`); } break; }
    case "obligation.manage": { const obligation = state.obligations.find((item) => item.id === command.payload.obligationId && item.status === "open"); if (!obligation) throw new Error("OBLIGATION_NOT_FOUND"); if (command.payload.operation === "fulfill") { obligation.status = "fulfilled"; state.relationships.trust = clamp(state.relationships.trust + obligation.severity * 2); state.relationships.openPromises = Math.max(0, state.relationships.openPromises - 1); } else if (command.payload.operation === "renegotiate") { obligation.status = "renegotiated"; obligation.dueDay += 10; state.relationships.trust = clamp(state.relationships.trust - 1); state.relationships.openPromises = Math.max(0, state.relationships.openPromises - 1); } else { obligation.status = "missed"; state.relationships.overduePromises += 1; state.relationships.openPromises = Math.max(0, state.relationships.openPromises - 1); state.relationships.trust = clamp(state.relationships.trust - obligation.severity * 4); } emit("obligation_updated", "stakeholder", `${obligation.title}: ${obligation.status}.`); break; }
    case "problem.action.cancel": { const action = state.actions.find((item) => item.id === command.payload.actionId && item.status === "active"); if (!action) throw new Error("ACTION_NOT_FOUND"); action.status = "cancelled"; const capability = state.product.capabilities.find((item) => item.id === action.targetId && item.status === "building"); if (capability) capability.status = "backlog"; emit("action_cancelled", "action", `${action.title} was cancelled; sunk cost was not refunded.`); break; }
    case "problem.assumption.adjust": { const assumption = state.assumptions.find((item) => item.id === command.payload.assumptionId); if (!assumption) throw new Error("ASSUMPTION_NOT_FOUND"); assumption.confidence = clamp(assumption.confidence + command.payload.delta); emit("decision_recorded", "evidence", `${assumption.label} confidence changed to ${round(assumption.confidence)}%.`); break; }
    case "operations.advance": advance(state, 30, emit); checkpoint = state.calendar.absoluteDay % 30 === 0 || state.status !== "active"; break;
    case "operations.advance_to_decision": advance(state, command.payload.maxDays, emit); checkpoint = state.calendar.absoluteDay % 30 === 0 || state.status !== "active"; break;
    case "event.respond": respondToEvent(state, command.payload.choiceIndex, emit); break;
    case "organization.hire": for (let index = 0; index < command.payload.count; index += 1) beginHiring(state, "hire", command.payload.role, 1_200, emit); break;
    case "organization.layoff": { const removable = state.organization.members.filter((member) => member.employment === "employee").slice(0, command.payload.count); state.organization.members = state.organization.members.filter((member) => !removable.includes(member)); state.organization.teamSize = Math.max(0, state.organization.teamSize - removable.length); state.relationships.trust = clamp(state.relationships.trust - removable.length * 6); emit("hiring_updated", "people", `Laid off ${removable.length} team member(s); trust consequences recorded.`); checkpoint = true; break; }
    case "organization.contractor": if (command.payload.operation === "hire") beginHiring(state, "contract", "operations", 600, emit); else { const contractor = state.organization.members.find((member) => member.employment === "contractor"); if (contractor) state.organization.members = state.organization.members.filter((member) => member.id !== contractor.id); state.organization.contractors = Math.max(0, state.organization.contractors - 1); emit("hiring_updated", "people", "Contractor engagement ended; handoff risk remains."); } break;
    case "organization.initiative": if (command.payload.operation === "start") { if (!state.organization.activeInitiatives.includes(command.payload.initiative)) state.organization.activeInitiatives.push(command.payload.initiative); spend(state, 15, command.commandId, `${command.payload.initiative} initiative`); } else state.organization.activeInitiatives = state.organization.activeInitiatives.filter((item) => item !== command.payload.initiative); emit("decision_recorded", "people", `${command.payload.initiative} initiative ${command.payload.operation === "start" ? "started" : "cancelled"}.`); break;
    case "capital.fundraise": state.capital.fundraising = command.payload.operation === "start" ? "preparing" : "none"; state.capital.investorPipeline = command.payload.operation === "start" ? Math.max(10, state.relationships.trust * 0.7) : 0; if (command.payload.operation === "start") scheduleEffect(state, "fundraise_progress", state.calendar.absoluteDay + 14, "capital"); else state.scheduledEffects = state.scheduledEffects.filter((effect) => effect.type !== "fundraise_progress"); emit("decision_recorded", "capital", `Fundraising ${command.payload.operation === "start" ? "started" : "cancelled"}; founder attention will be consumed before any cash appears.`); break;
    case "capital.term_sheet": if (state.capital.fundraising !== "term_sheet") throw new Error("TERM_SHEET_NOT_AVAILABLE"); else if (command.payload.decision === "accept") { const amount = 100_000; postJournal(state, "Equity financing", command.commandId, [{ account: "cash", debit: amount, credit: 0 }, { account: "share_capital", debit: 0, credit: amount }]); state.capital.dilution += 18; state.capital.fundraising = "none"; checkpoint = true; emit("finance_posted", "capital", "Accepted financing: $100,000 cash for 18% dilution."); } else { state.capital.fundraising = "none"; emit("decision_recorded", "capital", "Rejected the term sheet and preserved ownership."); } break;
    case "capital.debt": { const amount = command.payload.amount; if (command.payload.operation === "draw") { postJournal(state, "Debt draw", command.commandId, [{ account: "cash", debit: amount, credit: 0 }, { account: "debt", debit: 0, credit: amount }]); state.capital.debt += amount; } else { const paid = Math.min(amount, state.capital.debt, state.finance.companyCash); postJournal(state, "Debt repayment", command.commandId, [{ account: "debt", debit: paid, credit: 0 }, { account: "cash", debit: 0, credit: paid }]); state.capital.debt -= paid; } emit("finance_posted", "capital", `Debt ${command.payload.operation}: $${round(amount)}.`); break; }
    case "strategy.architecture.change": state.product.architecture = command.payload.architecture; state.meta.architecture = command.payload.architecture; state.product.rework = clamp(state.product.rework + 18); state.product.technicalDebt = clamp(state.product.technicalDebt + 8); checkpoint = true; emit("decision_recorded", "product", `Architecture changed to ${command.payload.architecture}; migration rework and dependency risk recorded.`); break;
    case "strategy.pivot": state.meta.strategy = command.payload.strategy; state.evidence.problem *= 0.72; state.evidence.budget *= 0.6; state.evidence.buyerClarity *= 0.62; state.evidence.claims.forEach((claim) => { claim.confidence *= 0.65; }); checkpoint = true; emit("decision_recorded", "problem", `Strategy pivoted to ${command.payload.strategy}; market-specific evidence lost relevance.`); break;
    case "competitor.respond": throw new Error("FEATURE_NOT_ENABLED:competitors");
    case "strategy.exit": state.endingCode = command.payload.ending; state.endingReason = command.payload.ending === "acqui_hire" ? "The founder accepted an acqui-hire path that preserved the team but ended the independent company." : "The founder chose a controlled shutdown before obligations became unmanageable."; state.status = "ended"; checkpoint = true; emit("ending_reached", "system", state.endingReason, "player"); emit("run_ended", "system", state.endingReason, "system"); break;
  }
  if (state.schemaVersion === 3) featureRegistry.runLifecycle(state, "after_command", 0, emit);
  else updateMarketMetrics(state);
  validateState(state);
  const effects = diff(before, metrics(state)); if (created.length) created.at(-1)!.effects = effects;
  return { state, events: created, checksum: stateChecksum(state), checkpoint };
}

/**
 * Applies a trusted internal input that has already been persisted by the world
 * workflow. Client routes never accept this command union.
 */
export function applySystemCommand(stateInput: SimulationState, commandInput: SystemSimulationCommand, context: EngineContext): EngineResult {
  const command = systemSimulationCommandSchema.parse(commandInput);
  if (stateInput.status !== "active") throw new Error("RUN_NOT_ACTIVE");
  if (stateInput.schemaVersion !== 3) throw new Error("SYSTEM_COMMAND_REQUIRES_V9");
  if (stateInput.engineVersion !== context.engineVersion || stateInput.scenarioVersion !== context.scenarioVersion) throw new Error("ENGINE_CONTEXT_MISMATCH");
  const state = clone(stateInput);
  const before = metrics(state); const created: HistoryEvent[] = [];
  const emit: DomainEmitter = (type, category, summary, actor = "system") => {
    state.sequence += 1;
    created.push({ id: `${command.commandId}:${created.length + 1}`, sequence: state.sequence, commandId: command.commandId, type, category, actor, simulationDay: state.calendar.absoluteDay, summary, effects: [], engineVersion: context.engineVersion, createdAt: context.now });
  };
  const result = featureRegistry.dispatch(state, command, emit);
  if (!result.handled) throw new Error(`SYSTEM_COMMAND_UNHANDLED:${command.type}`);
  featureRegistry.runLifecycle(state, "after_command", 0, emit);
  validateState(state);
  const effects = diff(before, metrics(state));
  if (created.length) created.at(-1)!.effects = effects;
  return { state, events: created, checksum: stateChecksum(state), checkpoint: result.checkpoint };
}
