import { stateChecksum } from "./checksum";
import { random, randomBetween } from "./rng";
import {
  ENGINE_VERSION, runSetupSchema, scenarioDefinitionSchema, simulationCommandSchema,
  type EngineContext, type EngineResult, type EvidenceItem, type HistoryEvent,
  type HistoryEventType, type RunSetup, type ScenarioDefinition, type SimulationAction,
  type SimulationCommand, type SimulationState, type StateEffect,
} from "./types";

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number, places = 2) => Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places;
const clone = <T>(value: T): T => structuredClone(value);

const ACTIONS: Record<SimulationAction["kind"], { title: string; work: number; attention: number; cost: number }> = {
  research: { title: "Run a falsifiable research test", work: 4, attention: 18, cost: 0 },
  build: { title: "Ship a scoped product slice", work: 7, attention: 30, cost: 25 },
  outreach: { title: "Targeted stakeholder outreach", work: 4, attention: 20, cost: 8 },
  cut_tools: { title: "Cut non-essential fixed costs", work: 1, attention: 5, cost: 0 },
  personal_injection: { title: "Founder cash injection", work: 1, attention: 3, cost: 0 },
  service_offer: { title: "Sell a scoped diagnostic service", work: 5, attention: 24, cost: 5 },
};

const difficultyFactor = { guided: 1.12, realistic: 1, brutal: 0.86 } as const;
const intensityFactor = { sustainable: 1, hard: 1.16, crunch: 1.32 } as const;
const intensityBurnout = { sustainable: 0.03, hard: 0.1, crunch: 0.2 } as const;

function runwayValues(setup: RunSetup, scenario: ScenarioDefinition) {
  if (setup.personalRunway === "pressure") return { cash: scenario.initial.personalCash * 0.4, living: scenario.initial.livingCost * 0.8 };
  if (setup.personalRunway === "stable") return { cash: scenario.initial.personalCash * 2.4, living: scenario.initial.livingCost * 1.12 };
  return { cash: scenario.initial.personalCash, living: scenario.initial.livingCost };
}
export function createInitialState(
  scenarioInput: ScenarioDefinition,
  setupInput: RunSetup,
  context: EngineContext,
): SimulationState {
  const scenario = scenarioDefinitionSchema.parse(scenarioInput);
  const setup = runSetupSchema.parse(setupInput);
  const runway = runwayValues(setup, scenario);
  const founderBonus = setup.founderArchetype === "builder" ? 6 : setup.founderArchetype === "seller" ? 3 : 4;
  const seed = (context.seed >>> 0) || 1;
  return {
    schemaVersion: 1,
    engineVersion: context.engineVersion || ENGINE_VERSION,
    scenarioId: scenario.id,
    scenarioVersion: `${scenario.id}@${scenario.version}`,
    seed,
    rng: { state: seed, draws: 0 },
    createdAt: context.now,
    meta: {
      companyName: setup.companyName,
      founderArchetype: setup.founderArchetype,
      difficulty: setup.difficulty,
      personalRunway: setup.personalRunway,
      vertical: scenario.vertical,
      jurisdiction: scenario.jurisdiction,
      architecture: scenario.architecture,
      strategy: scenario.strategy,
    },
    status: "active",
    endingReason: null,
    calendar: { absoluteDay: 0, month: 0, year: 2026 },
    finance: {
      companyCash: scenario.initial.companyCash,
      personalCash: round(runway.cash),
      personalDebt: 0,
      founderLoanBalance: 0,
      livingCost: round(runway.living),
      monthlyFixedCosts: scenario.initial.monthlyFixedCosts,
      reducibleFixedCosts: Math.min(scenario.initial.monthlyFixedCosts, scenario.initial.reducibleFixedCosts),
      monthlyFixedSavings: 0,
      pendingServiceRevenue: 0,
      mrr: 0,
      founderDraw: 0,
    },
    founder: {
      energy: scenario.initial.founderEnergy,
      health: scenario.initial.founderHealth,
      burnout: scenario.initial.founderBurnout,
      attentionCapacity: 42 + founderBonus,
    },
    evidence: {
      problem: scenario.initial.problemEvidence,
      budget: scenario.initial.budgetEvidence,
      buyerClarity: scenario.initial.buyerClarity,
      quality: 6,
      diversity: 5,
      designHistory: [],
      ledger: [],
    },
    product: {
      mvpProgress: scenario.initial.mvpProgress,
      quality: scenario.initial.productQuality,
      rework: 2,
      architecture: scenario.architecture,
    },
    relationships: { trust: 8, openPromises: 0, overduePromises: 0 },
    organization: { teamSize: 0, contractors: 0, activeInitiatives: [] },
    capital: { fundraising: "none", debt: 0 },
    problems: scenario.problems.map((problem, index) => ({
      id: `problem_${index + 1}`,
      key: problem.key,
      domain: problem.domain,
      title: problem.title,
      summary: problem.summary,
      severity: problem.severity,
      openedDay: 0,
      deadlineDay: problem.deadlineDay,
      status: "open",
      hypotheses: problem.hypotheses.map((label, hypothesisIndex) => ({
        id: `problem_${index + 1}_hypothesis_${hypothesisIndex + 1}`, label, score: 20,
      })),
      workingHypothesisId: null,
      escalationCount: 0,
    })),
    actions: [],
    assumptions: [
      { id: "assumption_problem", label: "The problem is frequent and costly", confidence: 18 },
      { id: "assumption_buyer", label: "A reachable economic buyer has budget", confidence: 12 },
      { id: "assumption_solution", label: "A narrow solution creates repeatable value", confidence: 16 },
      { id: "assumption_channel", label: "The founder can reach buyers with $500", confidence: 10 },
    ],
    pendingEvent: null,
    sequence: 0,
  };
}

function metrics(state: SimulationState): Record<string, string | number | boolean | null> {
  return {
    "finance.companyCash": round(state.finance.companyCash),
    "finance.personalCash": round(state.finance.personalCash),
    "finance.founderLoanBalance": round(state.finance.founderLoanBalance),
    "finance.monthlyFixedSavings": round(state.finance.monthlyFixedSavings),
    "finance.mrr": round(state.finance.mrr),
    "founder.energy": round(state.founder.energy),
    "founder.burnout": round(state.founder.burnout),
    "evidence.problem": round(state.evidence.problem),
    "evidence.budget": round(state.evidence.budget),
    "evidence.diversity": round(state.evidence.diversity),
    "product.mvpProgress": round(state.product.mvpProgress),
    "product.rework": round(state.product.rework),
    "relationships.trust": round(state.relationships.trust),
    status: state.status,
    day: state.calendar.absoluteDay,
  };
}

function diff(before: ReturnType<typeof metrics>, after: ReturnType<typeof metrics>): StateEffect[] {
  return Object.keys(after).flatMap((path) => before[path] === after[path] ? [] : [{ path, before: before[path], after: after[path] }]);
}

function actionQuality(state: SimulationState) {
  const active = state.actions.filter((action) => action.status === "active");
  const load = active.reduce((total, action) => total + action.attention, 0) / Math.max(1, state.founder.attentionCapacity);
  const speed = load <= 1 ? 1 : clamp(1 / load, 0.32, 1);
  const quality = clamp((1 - Math.max(0, load - 0.85) * 0.32) * (1 - state.founder.burnout / 190), 0.28, 1);
  return { active, load, speed, quality };
}

function evidenceItem(state: SimulationState, action: SimulationAction, summary: string, direction: EvidenceItem["direction"], quality: number) {
  state.evidence.ledger.unshift({
    id: `evidence_${state.sequence}_${state.evidence.ledger.length + 1}`,
    day: state.calendar.absoluteDay,
    kind: action.kind,
    summary,
    direction,
    quality: round(quality * 100),
    problemId: action.problemId,
  });
  state.evidence.ledger = state.evidence.ledger.slice(0, 240);
}

function applyCompletedAction(state: SimulationState, action: SimulationAction, emit: (type: HistoryEventType, category: HistoryEvent["category"], summary: string, actor?: HistoryEvent["actor"]) => void) {
  const quality = action.executionWorkDone > 0 ? action.executionQualityWeighted / action.executionWorkDone : 0.5;
  const factor = difficultyFactor[state.meta.difficulty];
  if (action.kind === "research") {
    const design = action.researchDesign ?? { question: "severity", sample: "cold_targeted", method: "interview", count: 4 };
    const accessFactor = design.sample === "existing_users" ? 0.88 : design.sample === "warm_network" ? 0.76 : design.sample === "cold_targeted" ? 0.62 : 0.38;
    const usable = Array.from({ length: design.count }).filter(() => random(state) < accessFactor * quality * factor).length;
    const key = `${design.sample}:${design.method}`;
    if (usable === 0) {
      const summary = `0/${design.count} usable units. Access was recorded, but target evidence did not increase.`;
      action.result = summary;
      evidenceItem(state, action, summary, "neutral", quality);
      emit("evidence_recorded", "evidence", summary);
      return;
    }
    const gain = usable * quality * factor * (design.method === "observation" ? 1.45 : design.method === "proposal" ? 1.25 : 1);
    if (design.question === "budget") state.evidence.budget = clamp(state.evidence.budget + gain);
    else if (design.question === "buyer") state.evidence.buyerClarity = clamp(state.evidence.buyerClarity + gain);
    else state.evidence.problem = clamp(state.evidence.problem + gain);
    state.evidence.quality = clamp(state.evidence.quality + gain * 0.5);
    if (!state.evidence.designHistory.includes(key)) {
      state.evidence.designHistory.push(key);
      state.evidence.diversity = clamp(state.evidence.diversity + 4);
    }
    const summary = `${usable}/${design.count} usable units increased ${design.question} evidence.`;
    action.result = summary;
    evidenceItem(state, action, summary, random(state) > 0.2 ? "positive" : "negative", quality);
    emit("evidence_recorded", "evidence", summary);
  } else if (action.kind === "build") {
    const progress = randomBetween(state, 5, 11) * quality * factor;
    state.product.mvpProgress = clamp(state.product.mvpProgress + progress);
    state.product.quality = clamp(state.product.quality + progress * 0.35);
    state.product.rework = clamp(state.product.rework + Math.max(0, 0.72 - quality) * 10);
    action.result = `Product progress +${round(progress, 1)} points; quality reflected execution load.`;
  } else if (action.kind === "outreach") {
    const accepted = random(state) < clamp((state.evidence.problem + state.evidence.buyerClarity + 30) / 180 * quality, 0.08, 0.72);
    state.relationships.trust = clamp(state.relationships.trust + (accepted ? 6 : 1));
    state.evidence.buyerClarity = clamp(state.evidence.buyerClarity + (accepted ? 3 : 0.5));
    action.result = accepted ? "A relevant stakeholder accepted the ask and clarified the buying path." : "No meeting was secured; the access attempt produced a weak signal.";
    emit("stakeholder_updated", "stakeholder", action.result);
  } else if (action.kind === "cut_tools") {
    const cap = Math.max(0, Math.min(state.finance.monthlyFixedCosts, state.finance.reducibleFixedCosts));
    const before = clamp(state.finance.monthlyFixedSavings, 0, cap);
    state.finance.monthlyFixedSavings = Math.min(cap, before + randomBetween(state, 12, 35));
    action.result = state.finance.monthlyFixedSavings > before
      ? `Reduced monthly fixed commitments by $${round(state.finance.monthlyFixedSavings - before)}.`
      : "No additional non-essential fixed costs can be removed.";
    emit("finance_posted", "finance", action.result);
  } else if (action.kind === "personal_injection") {
    const amount = Math.min(200, Math.max(0, state.finance.personalCash * 0.35));
    state.finance.personalCash -= amount;
    state.finance.companyCash += amount;
    state.finance.founderLoanBalance += amount;
    action.result = `Founder injected $${round(amount)}; recorded as a company liability to the founder.`;
    emit("finance_posted", "finance", action.result);
  } else {
    const success = random(state) < clamp((state.evidence.problem + state.evidence.budget + 40) / 180 * quality, 0.08, 0.76);
    const revenue = success ? round(randomBetween(state, 90, 260)) : 0;
    state.finance.pendingServiceRevenue += revenue;
    state.evidence.budget = clamp(state.evidence.budget + (success ? 8 : 2));
    action.result = success ? `A scoped service generated a $${revenue} commitment.` : "The service offer was declined; the objection improved budget evidence.";
    emit(success ? "finance_posted" : "evidence_recorded", success ? "finance" : "evidence", action.result);
  }
}

function closeMonth(state: SimulationState, emit: (type: HistoryEventType, category: HistoryEvent["category"], summary: string, actor?: HistoryEvent["actor"]) => void) {
  const savingsCap = Math.min(state.finance.monthlyFixedCosts, state.finance.reducibleFixedCosts);
  state.finance.monthlyFixedSavings = clamp(state.finance.monthlyFixedSavings, 0, savingsCap);
  const fixedExpense = Math.max(0, state.finance.monthlyFixedCosts - state.finance.monthlyFixedSavings);
  const revenue = Math.max(0, state.finance.pendingServiceRevenue) + Math.max(0, state.finance.mrr);
  state.finance.companyCash += revenue - fixedExpense - state.finance.founderDraw;
  state.finance.personalCash += state.finance.founderDraw - state.finance.livingCost;
  state.finance.pendingServiceRevenue = 0;
  if (state.finance.personalCash < 0) state.finance.personalDebt = Math.max(state.finance.personalDebt, -state.finance.personalCash);
  state.calendar.month += 1;
  emit("month_closed", "finance", `Month ${state.calendar.month} closed: revenue $${round(revenue)}, fixed expense $${round(fixedExpense)}.`);
  if (state.finance.companyCash < 0) {
    state.status = "ended";
    state.endingReason = "The company became insolvent.";
  } else if (state.finance.personalCash < -state.finance.livingCost * 0.35) {
    state.status = "ended";
    state.endingReason = "The founder ran out of personal runway.";
  }
  if (state.status === "ended") emit("run_ended", "system", state.endingReason ?? "Run ended.", "system");
}

export function applyCommand(stateInput: SimulationState, commandInput: SimulationCommand, context: EngineContext): EngineResult {
  const command = simulationCommandSchema.parse(commandInput);
  if (stateInput.status !== "active") throw new Error("RUN_NOT_ACTIVE");
  if (stateInput.engineVersion !== context.engineVersion || stateInput.scenarioVersion !== context.scenarioVersion) throw new Error("ENGINE_CONTEXT_MISMATCH");
  const state = clone(stateInput);
  const before = metrics(state);
  const created: HistoryEvent[] = [];
  let checkpoint = false;
  const emit = (type: HistoryEventType, category: HistoryEvent["category"], summary: string, actor: HistoryEvent["actor"] = "player") => {
    state.sequence += 1;
    created.push({
      id: `${command.commandId}:${created.length + 1}`,
      sequence: state.sequence,
      commandId: command.commandId,
      type, category, actor,
      simulationDay: state.calendar.absoluteDay,
      summary,
      effects: [],
      engineVersion: context.engineVersion,
      createdAt: context.now,
    });
  };

  switch (command.type) {
    case "planning.update":
      state.finance.founderDraw = Math.min(command.payload.value, Math.max(0, state.finance.companyCash));
      emit("decision_recorded", "finance", `Founder draw set to $${round(state.finance.founderDraw)} per month.`);
      break;
    case "problem.hypothesis.set": { const problem = state.problems.find((item) => item.id === command.payload.problemId);
      if (!problem?.hypotheses.some((item) => item.id === command.payload.hypothesisId)) throw new Error("HYPOTHESIS_NOT_FOUND");
      problem.workingHypothesisId = command.payload.hypothesisId;
      emit("decision_recorded", "problem", `Working hypothesis updated for ${problem.title}.`); break; }
    case "problem.action.commit": { const problem = state.problems.find((item) => item.id === command.payload.problemId && item.status === "open");
      if (!problem) throw new Error("PROBLEM_NOT_FOUND");
      if (command.payload.kind === "research" && !command.payload.researchDesign) throw new Error("RESEARCH_DESIGN_REQUIRED");
      const definition = ACTIONS[command.payload.kind];
      if (state.finance.companyCash < definition.cost) throw new Error("INSUFFICIENT_COMPANY_CASH");
      state.finance.companyCash -= definition.cost;
      const action: SimulationAction = {
        id: `action_${state.sequence + 1}_${state.actions.length + 1}`, problemId: problem.id,
        kind: command.payload.kind, title: definition.title, status: "active", intensity: command.payload.intensity,
        startedDay: state.calendar.absoluteDay, remainingWork: definition.work, requiredWork: definition.work,
        attention: definition.attention * intensityFactor[command.payload.intensity], cashCost: definition.cost,
        executionWorkDone: 0, executionQualityWeighted: 0, researchDesign: command.payload.researchDesign,
      };
      state.actions.unshift(action);
      if (command.payload.kind === "personal_injection") checkpoint = true;
      emit("action_committed", "action", `${action.title} committed against ${problem.title}.`); break; }
    case "problem.action.cancel": { const action = state.actions.find((item) => item.id === command.payload.actionId && item.status === "active");
      if (!action) throw new Error("ACTION_NOT_FOUND"); action.status = "cancelled";
      emit("action_cancelled", "action", `${action.title} was cancelled; sunk cost was not refunded.`); break; }
    case "problem.assumption.adjust": { const assumption = state.assumptions.find((item) => item.id === command.payload.assumptionId);
      if (!assumption) throw new Error("ASSUMPTION_NOT_FOUND"); assumption.confidence = clamp(assumption.confidence + command.payload.delta);
      emit("decision_recorded", "evidence", `${assumption.label} confidence changed to ${round(assumption.confidence)}%.`); break; }
    case "operations.advance": { if (state.pendingEvent) throw new Error("EVENT_DECISION_REQUIRED");
      const diagnostics = actionQuality(state);
      const dayInMonth = state.calendar.absoluteDay % 30;
      const monthDays = dayInMonth === 0 ? 30 : 30 - dayInMonth;
      const completionDays = diagnostics.active.length ? Math.max(1, Math.ceil(Math.min(...diagnostics.active.map((action) => action.remainingWork)) / diagnostics.speed)) : Number.POSITIVE_INFINITY;
      const deadlineDays = state.problems.filter((problem) => problem.status === "open").map((problem) => Math.max(1, problem.deadlineDay - state.calendar.absoluteDay));
      let delta = Math.min(monthDays, completionDays, ...deadlineDays);
      if (!Number.isFinite(delta)) delta = monthDays;
      for (const action of diagnostics.active) {
        const work = Math.min(action.remainingWork, delta * diagnostics.speed);
        action.remainingWork = Math.max(0, action.remainingWork - work);
        action.executionWorkDone += work;
        action.executionQualityWeighted += diagnostics.quality * work;
        state.founder.burnout = clamp(state.founder.burnout + delta * (Math.max(0, diagnostics.load - 1) * 0.2 + intensityBurnout[action.intensity]));
      }
      state.founder.energy = clamp(state.founder.energy - Math.max(0, diagnostics.load - 0.8) * delta * 0.4);
      state.calendar.absoluteDay += delta;
      for (const action of diagnostics.active.filter((item) => item.remainingWork <= 0.0001)) {
        action.status = "completed"; action.completedDay = state.calendar.absoluteDay;
        applyCompletedAction(state, action, emit);
        emit("action_completed", "action", `${action.title} completed: ${action.result ?? "Outcome recorded."}`, "system");
      }
      for (const problem of state.problems.filter((item) => item.status === "open" && item.deadlineDay <= state.calendar.absoluteDay)) {
        problem.escalationCount += 1; problem.severity = clamp(problem.severity + 1, 1, 5);
        problem.deadlineDay += Math.max(4, 9 - problem.severity);
        emit("problem_escalated", "problem", `${problem.title} escalated to severity ${problem.severity}.`, "system");
      }
      if (state.calendar.absoluteDay % 30 === 0) { closeMonth(state, emit); checkpoint = true; }
      if (!state.pendingEvent && state.status === "active" && random(state) < 0.16 * (state.meta.difficulty === "brutal" ? 1.3 : state.meta.difficulty === "guided" ? 0.75 : 1)) {
        state.pendingEvent = { id: `event_${state.sequence + 1}`, title: "A key stakeholder questions the current direction", choices: ["Share evidence and narrow scope", "Promise a broad roadmap", "Delay the response"] };
        emit("external_event_generated", "system", state.pendingEvent.title, "system");
      }
      break; }
    case "event.respond": { if (!state.pendingEvent?.choices[command.payload.choiceIndex]) throw new Error("EVENT_CHOICE_NOT_FOUND");
      const choice = state.pendingEvent.choices[command.payload.choiceIndex];
      if (command.payload.choiceIndex === 0) { state.relationships.trust = clamp(state.relationships.trust + 5); state.evidence.buyerClarity = clamp(state.evidence.buyerClarity + 2); }
      else if (command.payload.choiceIndex === 1) { state.relationships.openPromises += 1; state.product.rework = clamp(state.product.rework + 5); }
      else { state.relationships.trust = clamp(state.relationships.trust - 3); }
      state.pendingEvent = null; emit("decision_recorded", "stakeholder", `External event response: ${choice}.`); break; }
    case "organization.hire": { const cost = command.payload.count * 2_000; if (state.finance.companyCash < cost) throw new Error("INSUFFICIENT_COMPANY_CASH");
      state.finance.companyCash -= cost; state.organization.teamSize += command.payload.count; state.finance.monthlyFixedCosts += command.payload.count * 1_000;
      emit("finance_posted", "finance", `Hired ${command.payload.count} ${command.payload.role} team member(s).`); break; }
    case "organization.layoff": { const count = Math.min(command.payload.count, state.organization.teamSize); state.organization.teamSize -= count;
      state.finance.monthlyFixedCosts = Math.max(0, state.finance.monthlyFixedCosts - count * 1_000); state.relationships.trust = clamp(state.relationships.trust - count * 2);
      checkpoint = true; emit("decision_recorded", "stakeholder", `Laid off ${count} team member(s).`); break; }
    case "organization.contractor": state.organization.contractors = Math.max(0, state.organization.contractors + (command.payload.operation === "hire" ? 1 : -1));
      emit("decision_recorded", "action", `${command.payload.operation === "hire" ? "Hired" : "Cancelled"} a contractor.`); break;
    case "organization.initiative": { const list = state.organization.activeInitiatives; const index = list.indexOf(command.payload.initiative);
      if (command.payload.operation === "start" && index < 0) list.push(command.payload.initiative);
      if (command.payload.operation === "cancel" && index >= 0) list.splice(index, 1);
      emit("decision_recorded", "action", `${command.payload.operation} initiative: ${command.payload.initiative}.`); break; }
    case "capital.fundraise": state.capital.fundraising = command.payload.operation === "start" ? "preparing" : "none";
      emit("decision_recorded", "finance", `Fundraising ${command.payload.operation === "start" ? "started" : "cancelled"}.`); break;
    case "capital.term_sheet": { if (command.payload.decision === "accept") { state.finance.companyCash += 100_000; state.capital.fundraising = "none"; }
      else state.capital.fundraising = "none"; checkpoint = true;
      emit("finance_posted", "finance", `Term sheet ${command.payload.decision}ed.`); break; }
    case "capital.debt": { const amount = command.payload.operation === "draw" ? command.payload.amount : -Math.min(command.payload.amount, state.capital.debt, state.finance.companyCash);
      state.capital.debt += amount; state.finance.companyCash += amount; checkpoint = true;
      emit("finance_posted", "finance", `${command.payload.operation === "draw" ? "Drew" : "Repaid"} $${round(Math.abs(amount))} debt.`); break; }
    case "strategy.architecture.change": state.product.architecture = command.payload.architecture; state.meta.architecture = command.payload.architecture; state.product.rework = clamp(state.product.rework + 8); checkpoint = true;
      emit("decision_recorded", "action", `Architecture changed to ${command.payload.architecture}; migration rework increased.`); break;
    case "strategy.pivot": state.meta.strategy = command.payload.strategy; state.evidence.problem *= 0.55; state.evidence.budget *= 0.45; state.product.rework = clamp(state.product.rework + 12); checkpoint = true;
      emit("decision_recorded", "problem", `Strategy pivoted to ${command.payload.strategy}; market evidence was partially reset.`); break;
  }

  const effects = diff(before, metrics(state));
  if (created.length === 0) emit("decision_recorded", "system", `Command ${command.type} applied.`);
  created.forEach((event) => { event.effects = effects; });
  return { state, events: created, checksum: stateChecksum(state), checkpoint: checkpoint || state.status !== "active" };
}
