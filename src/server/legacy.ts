import { z } from "zod";
import {
  V8_ENGINE_VERSION, createInitialState, resetOpeningJournal, stateChecksum, type HistoryEvent, type SimulationAction,
  type SimulationProblem, type SimulationState,
} from "@sim/engine";
import { getScenario, scenarioVersionId } from "@/content/scenarios";

const legacySchema = z.object({
  version: z.string().min(1),
  rng: z.number().int().nonnegative().optional(),
  createdAt: z.string().optional(),
  cash: z.number().finite(),
  meta: z.object({
    companyName: z.string().optional(), vertical: z.string().optional(), difficulty: z.string().optional(),
    founder: z.string().optional(), runway: z.string().optional(), jurisdiction: z.string().optional(),
    architecture: z.string().optional(), strategy: z.string().optional(),
  }).passthrough(),
  history: z.array(z.unknown()).max(200),
  calendar: z.object({ month: z.number().optional(), year: z.number().optional(), elapsed: z.number().optional() }).passthrough().optional(),
  bootstrap: z.object({
    personalCash: z.number().optional(), personalDebt: z.number().optional(), founderLoanBalance: z.number().optional(),
    livingCost: z.number().optional(), energy: z.number().optional(), health: z.number().optional(), burnout: z.number().optional(),
    problemEvidence: z.number().optional(), mvpProgress: z.number().optional(),
    research: z.object({
      budgetEvidence: z.number().optional(), buyerClarity: z.number().optional(), evidenceQuality: z.number().optional(),
      evidenceDiversity: z.number().optional(), designHistory: z.array(z.string()).max(100).optional(),
    }).passthrough().optional(),
    productSystem: z.object({ reworkBacklog: z.number().optional(), architecture: z.string().optional() }).passthrough().optional(),
  }).passthrough(),
  product: z.object({ ux: z.number().optional(), reliability: z.number().optional() }).passthrough().optional(),
  game: z.object({ status: z.string().optional(), reason: z.string().optional() }).passthrough().optional(),
  problemOps: z.object({
    absoluteDay: z.number().int().nonnegative().optional(),
    monthlyFixedSavings: z.number().optional(), monthlyServiceRevenue: z.number().optional(), personalIncomeMonthly: z.number().optional(),
    problems: z.array(z.unknown()).max(100).optional(), actions: z.array(z.unknown()).max(300).optional(),
    evidence: z.array(z.unknown()).max(300).optional(), decisions: z.array(z.unknown()).max(500).optional(),
  }).passthrough().optional(),
}).passthrough();

function inspect(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error("LEGACY_SAVE_TOO_DEEP");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("LEGACY_SAVE_NON_FINITE_NUMBER");
  if (typeof value === "string" && value.length > 20_000) throw new Error("LEGACY_SAVE_STRING_TOO_LONG");
  if (Array.isArray(value)) {
    if (value.length > 2_000) throw new Error("LEGACY_SAVE_ARRAY_TOO_LARGE");
    value.forEach((item) => inspect(item, depth + 1));
  } else if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > 2_000) throw new Error("LEGACY_SAVE_OBJECT_TOO_LARGE");
    entries.forEach(([, item]) => inspect(item, depth + 1));
  }
}

const clean = (value: unknown, fallback: string, max = 180) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || fallback
  : fallback;
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function migrateLegacySave(input: unknown, now: Date): { state: SimulationState; events: HistoryEvent[]; checksum: string } {
  inspect(input);
  const legacy = legacySchema.parse(input);
  if (!legacy.version.startsWith("6")) throw new Error("UNSUPPORTED_LEGACY_VERSION");
  const scenario = getScenario("legacy-v6-free-setup");
  if (!scenario) throw new Error("LEGACY_SCENARIO_MISSING");
  const difficulty = legacy.meta.difficulty === "operator" ? "guided" : legacy.meta.difficulty === "brutal" ? "brutal" : "realistic";
  const founder = ["builder", "seller", "expert", "community"].includes(legacy.meta.founder ?? "")
    ? legacy.meta.founder as "builder" | "seller" | "expert" | "community" : "builder";
  const runway = ["pressure", "standard", "stable"].includes(legacy.meta.runway ?? "")
    ? legacy.meta.runway as "pressure" | "standard" | "stable" : "standard";
  const seed = (legacy.rng ?? 1) >>> 0 || 1;
  const state = createInitialState(scenario, {
    companyName: clean(legacy.meta.companyName, "Imported v6 startup", 42),
    founderArchetype: founder, difficulty, personalRunway: runway,
  }, { seed, now: legacy.createdAt ?? now.toISOString(), engineVersion: V8_ENGINE_VERSION, scenarioVersion: scenarioVersionId(scenario) });

  state.rng = { state: seed, draws: 0 };
  state.meta.vertical = clean(legacy.meta.vertical, "legacy", 50);
  state.meta.jurisdiction = clean(legacy.meta.jurisdiction, "legacy", 50);
  state.meta.architecture = clean(legacy.meta.architecture ?? legacy.bootstrap.productSystem?.architecture, "legacy", 50);
  state.meta.strategy = clean(legacy.meta.strategy, "legacy", 50);
  state.calendar.absoluteDay = finite(legacy.problemOps?.absoluteDay, finite(legacy.calendar?.elapsed, 0));
  state.calendar.month = Math.max(0, finite(legacy.calendar?.month, 0));
  state.calendar.year = Math.max(2020, finite(legacy.calendar?.year, 2026));
  state.finance.companyCash = legacy.cash;
  state.finance.personalCash = finite(legacy.bootstrap.personalCash, state.finance.personalCash);
  state.finance.personalDebt = Math.max(0, finite(legacy.bootstrap.personalDebt, 0));
  state.finance.founderLoanBalance = Math.max(0, finite(legacy.bootstrap.founderLoanBalance, 0));
  state.finance.livingCost = Math.max(0, finite(legacy.bootstrap.livingCost, state.finance.livingCost));
  state.finance.monthlyFixedSavings = Math.max(0, finite(legacy.problemOps?.monthlyFixedSavings, 0));
  state.finance.pendingServiceRevenue = Math.max(0, finite(legacy.problemOps?.monthlyServiceRevenue, 0));
  state.founder.energy = clamp(finite(legacy.bootstrap.energy, state.founder.energy));
  state.founder.health = clamp(finite(legacy.bootstrap.health, state.founder.health));
  state.founder.burnout = clamp(finite(legacy.bootstrap.burnout, state.founder.burnout));
  state.evidence.problem = clamp(finite(legacy.bootstrap.problemEvidence, state.evidence.problem));
  state.evidence.budget = clamp(finite(legacy.bootstrap.research?.budgetEvidence, state.evidence.budget));
  state.evidence.buyerClarity = clamp(finite(legacy.bootstrap.research?.buyerClarity, state.evidence.buyerClarity));
  state.evidence.quality = clamp(finite(legacy.bootstrap.research?.evidenceQuality, state.evidence.quality));
  state.evidence.diversity = clamp(finite(legacy.bootstrap.research?.evidenceDiversity, state.evidence.diversity));
  state.evidence.designHistory = legacy.bootstrap.research?.designHistory?.slice(0, 100) ?? [];
  state.product.mvpProgress = clamp(finite(legacy.bootstrap.mvpProgress, state.product.mvpProgress));
  state.product.quality = clamp((finite(legacy.product?.ux, 5) + finite(legacy.product?.reliability, 10)) / 2);
  state.product.rework = clamp(finite(legacy.bootstrap.productSystem?.reworkBacklog, state.product.rework));

  const sourceProblems = legacy.problemOps?.problems ?? [];
  if (sourceProblems.length) {
    state.problems = sourceProblems.map((raw, index): SimulationProblem => {
      const item = raw as Record<string, unknown>;
      const hypotheses = Array.isArray(item.hypotheses) ? item.hypotheses : [];
      return {
        id: clean(item.id, `legacy_problem_${index + 1}`, 100), key: clean(item.type, `legacy-${index + 1}`, 80),
        domain: ["evidence", "finance", "product", "people", "strategy", "external"].includes(String(item.domain)) ? item.domain as SimulationProblem["domain"] : "external",
        title: clean(item.title, `Imported problem ${index + 1}`), summary: clean(item.summary, "Imported from v6.", 500),
        severity: clamp(finite(item.severity, 2), 1, 5), openedDay: finite(item.openedDay, 0), deadlineDay: finite(item.deadlineDay, state.calendar.absoluteDay + 10),
        status: item.status === "resolved" ? "resolved" : "open",
        hypotheses: hypotheses.slice(0, 8).map((entry, hypothesisIndex) => {
          const hypothesis = entry as Record<string, unknown>;
          return { id: clean(hypothesis.id, `legacy_hypothesis_${index}_${hypothesisIndex}`), label: clean(hypothesis.label, `Hypothesis ${hypothesisIndex + 1}`), score: clamp(finite(hypothesis.score, 20)) };
        }).concat(hypotheses.length ? [] : [{ id: `legacy_hypothesis_${index}`, label: "Imported working assumption", score: 20 }]),
        workingHypothesisId: typeof item.workingHypothesis === "string" ? item.workingHypothesis : null,
        escalationCount: Math.max(0, finite(item.escalations, 0)), resolution: typeof item.resolution === "string" ? clean(item.resolution, "Resolved") : undefined,
      };
    });
  }

  state.actions = (legacy.problemOps?.actions ?? []).slice(0, 280).map((raw, index): SimulationAction => {
    const item = raw as Record<string, unknown>;
    const sourceKind = String(item.effect ?? item.actionId ?? "research");
    const kind: SimulationAction["kind"] = sourceKind.includes("cut_tool") ? "cut_tools" : sourceKind.includes("personal_injection") ? "personal_injection" : sourceKind.includes("outreach") || sourceKind.includes("relationship") ? "outreach" : sourceKind.includes("product") || sourceKind.includes("build") ? "build" : sourceKind.includes("service") || sourceKind.includes("pilot") ? "service_offer" : "research";
    return {
      id: clean(item.id, `legacy_action_${index}`), problemId: clean(item.problemId, state.problems[0]?.id ?? "problem_1"), kind,
      title: clean(item.title, `Imported action ${index + 1}`), status: item.status === "completed" ? "completed" : item.status === "cancelled" ? "cancelled" : "active",
      intensity: item.intensity === "hard" || item.intensity === "crunch" ? item.intensity : "sustainable",
      startedDay: finite(item.startedDay, state.calendar.absoluteDay), remainingWork: Math.max(0, finite(item.remainingWork, 1)),
      requiredWork: Math.max(0.01, finite(item.baseDays, finite(item.estimatedDays, 1))), attention: Math.max(0, finite(item.executionAttentionWeighted, 12)),
      cashCost: Math.max(0, finite(item.cashCost, 0)), executionWorkDone: Math.max(0, finite(item.executionWorkDone, 0)),
      executionQualityWeighted: Math.max(0, finite(item.executionQualityWeighted, 0)), result: typeof item.result === "string" ? clean(item.result, "Imported outcome", 500) : undefined,
      completedDay: typeof item.completedDay === "number" ? item.completedDay : undefined,
    };
  });

  const decisions = [...(legacy.problemOps?.decisions ?? [])].reverse().slice(-500);
  const events: HistoryEvent[] = decisions.map((raw, index) => {
    const item = raw as Record<string, unknown>;
    return {
      id: `legacy:${index + 1}`, sequence: index + 1, commandId: null, type: "decision_recorded",
      category: String(item.type).includes("finance") || String(item.type).includes("month") ? "finance" : String(item.type).includes("evidence") ? "evidence" : "system",
      actor: "player", simulationDay: finite(item.day, state.calendar.absoluteDay), summary: clean(item.text, "Imported v6 decision", 500),
      effects: [], engineVersion: "6.0.0", createdAt: now.toISOString(),
    };
  });
  events.push({
    id: `legacy:imported:${events.length + 1}`, sequence: events.length + 1, commandId: null,
    type: "legacy_imported", category: "system", actor: "system", simulationDay: state.calendar.absoluteDay,
    summary: `Imported simulator ${legacy.version} save. Historical events are display-only.`, effects: [], engineVersion: V8_ENGINE_VERSION, createdAt: now.toISOString(),
  });
  state.sequence = events.length;
  state.legacy = { sourceVersion: legacy.version, sourceState: input };
  state.status = legacy.game?.status === "ended" ? "ended" : "active";
  state.endingReason = state.status === "ended" ? clean(legacy.game?.reason, "Legacy run ended.") : null;
  state.endingCode = state.status === "ended" ? "time_limit" : null;
  resetOpeningJournal(state, "Imported v6 opening balance");
  return { state, events, checksum: stateChecksum(state) };
}
