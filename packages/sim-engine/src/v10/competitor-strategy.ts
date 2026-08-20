import { z } from "zod";
import { stateChecksum } from "../checksum";
import type { CompetitorDecisionViewV10 } from "./competitor-organizations";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";
import type { CompetitiveMarketPublicStateV10 } from "./competitive-market";
import {
  competitorDecisionEnvelopeSchemaV10,
  competitorInitiativeKindSchemaV10,
  competitorStrategicPlanSchemaV10,
  hasDependencyCycleV10,
  type CompetitorDecisionEnvelopeV10,
  type CompetitorInitiativeKindV10,
  type CompetitorStrategicPlanV10,
} from "./strategy-grammar";
import type { PublicSourceFactV10, SimulationStateV10 } from "./types";

const pendingPublicSchema = z.object({
  turnId: z.string(), firmId: z.string(), requestedDay: z.number().int().nonnegative(), status: z.literal("pending"),
}).strict();
const planSummarySchema = z.object({
  planningCycleId: z.string(), firmId: z.string(), committedDay: z.number().int().nonnegative(),
  objectives: z.array(z.string()).max(3), initiativeKinds: z.array(competitorInitiativeKindSchemaV10).max(4),
  provider: z.enum(["openai", "authored"]), publicRationale: z.string(),
}).strict();

export const competitorStrategyPublicStateSchemaV10 = z.object({
  strategyVersion: z.literal("competitor-strategy-v1"),
  pendingTurn: pendingPublicSchema.nullable(),
  recentPlans: z.array(planSummarySchema).max(32),
  completedPlanningCycles: z.number().int().nonnegative().max(32),
  aiBudget: z.object({ used: z.number().int().nonnegative().max(32), maximum: z.literal(32) }),
}).strict();
export type CompetitorStrategyPublicStateV10 = z.infer<typeof competitorStrategyPublicStateSchemaV10>;

const privateStateSchema = z.object({
  nextPlanningDay: z.record(z.string(), z.number().int().nonnegative()),
  lastEarlyReviewDay: z.record(z.string(), z.number().int()),
  pendingEnvelope: competitorDecisionEnvelopeSchemaV10.nullable(),
  appliedExternalInputIds: z.array(z.string()).max(100),
  planTape: z.array(competitorStrategicPlanSchemaV10).max(32),
}).strict();
export type CompetitorStrategyPrivateStateV10 = z.infer<typeof privateStateSchema>;

const configSchema = z.object({
  minimumCycleDays: z.number().int().min(30).max(120).default(60),
  maximumCycleDays: z.number().int().min(45).max(180).default(90),
  maximumAiTurns: z.literal(32).default(32),
}).refine((value) => value.maximumCycleDays >= value.minimumCycleDays).default({ minimumCycleDays: 60, maximumCycleDays: 90, maximumAiTurns: 32 });

const round = (value: number): number => Math.round(value * 100) / 100;

function buildEnvelope(
  context: FeatureRuntimeContextV10<CompetitorStrategyPublicStateV10, CompetitorStrategyPrivateStateV10>,
  firmId: string,
): CompetitorDecisionEnvelopeV10 {
  const view = context.query("competitor-organizations.decision-view", { firmId }) as CompetitorDecisionViewV10;
  const market = context.query("competitive-market.public-observation") as CompetitiveMarketPublicStateV10;
  const facts = context.query("market-intelligence.public-signals") as PublicSourceFactV10[];
  const planningCycleId = `${firmId}:board:${context.ownState.public.completedPlanningCycles + 1}`;
  const turnId = `${planningCycleId}:day:${context.kernel.simulationDay}`;
  const observedSignals = [
    ...facts.filter((fact) => fact.subjectId === firmId).slice(-12).map((fact) => ({
      id: fact.id, kind: fact.kind, statement: fact.statement, confidence: 92, provenance: "verified_public_fact",
    })),
    ...market.signals.slice(-20).map((signal) => ({
      id: signal.id, kind: signal.kind, statement: signal.summary, confidence: 60, provenance: signal.provenance,
    })),
  ];
  const cashCeiling = round(Math.max(0, view.cash - view.reservedCash));
  const envelope = {
    turnId, planningCycleId, firmId, simulationDay: context.kernel.simulationDay,
    syntheticInternalState: {
      lifecycle: view.lifecycle, doctrine: view.doctrine, cash: view.cash, monthlyRevenue: view.monthlyRevenue,
      monthlyBurn: view.monthlyBurn, reservedCash: view.reservedCash, teamCapacity: view.teamCapacity,
      productGaps: view.productGaps, pipelineByStage: view.pipelineByStage,
    },
    observedSignals,
    memory: view.memory,
    constraints: [
      "This company and all private numbers are synthetic simulation state.",
      "Choose one to four initiatives; every target must appear in feasibleTargets.",
      "Total cash and capacity commitments must remain inside resourceCeilings.",
      "Do not use unobserved player state or describe simulated behavior as real-world behavior.",
      "A financing initiative does not create cash until the market allocates capital.",
    ],
    feasibleTargets: view.feasibleTargets,
    initiativeKinds: [...competitorInitiativeKindSchemaV10.options],
    resourceCeilings: { cash: cashCeiling, executiveAttention: 100, teamCapacity: view.teamCapacity },
    worldInputHash: "",
    promptVersion: "competitor-board-v10.1.0",
  } satisfies CompetitorDecisionEnvelopeV10;
  envelope.worldInputHash = stateChecksum({ ...envelope, worldInputHash: "" });
  return competitorDecisionEnvelopeSchemaV10.parse(envelope);
}

function validateAgainstEnvelope(planInput: unknown, envelope: CompetitorDecisionEnvelopeV10): CompetitorStrategicPlanV10 {
  const plan = competitorStrategicPlanSchemaV10.parse(planInput);
  if (plan.firmId !== envelope.firmId || plan.planningCycleId !== envelope.planningCycleId) throw new Error("COMPETITOR_PLAN_TURN_MISMATCH");
  if (hasDependencyCycleV10(plan)) throw new Error("COMPETITOR_PLAN_DEPENDENCY_CYCLE");
  const allowedKinds = new Set(envelope.initiativeKinds);
  const targets = new Set(envelope.feasibleTargets.map((target) => `${target.kind}:${target.id}`));
  if (plan.initiatives.some((initiative) => !allowedKinds.has(initiative.kind))) throw new Error("COMPETITOR_PLAN_KIND_FORBIDDEN");
  if (plan.initiatives.some((initiative) => !targets.has(`${initiative.target.kind}:${initiative.target.id}`))) throw new Error("COMPETITOR_PLAN_TARGET_FORBIDDEN");
  if (plan.initiatives.some((initiative) => initiative.reviewDay < envelope.simulationDay || initiative.reviewDay > envelope.simulationDay + plan.horizonDays)) throw new Error("COMPETITOR_PLAN_REVIEW_DAY_INVALID");
  if (plan.initiatives.reduce((sum, initiative) => sum + initiative.cashLimit, 0) > envelope.resourceCeilings.cash + 0.005) throw new Error("COMPETITOR_PLAN_OVERSPEND");
  if (plan.initiatives.reduce((sum, initiative) => sum + initiative.executiveAttention, 0) > envelope.resourceCeilings.executiveAttention + 0.005) throw new Error("COMPETITOR_PLAN_EXECUTIVE_OVERLOAD");
  const capacity = new Map<string, number>();
  for (const initiative of plan.initiatives) for (const [teamId, requested] of Object.entries(initiative.teamCapacity)) capacity.set(teamId, (capacity.get(teamId) ?? 0) + requested);
  for (const [teamId, requested] of capacity) if (requested > (envelope.resourceCeilings.teamCapacity[teamId] ?? -1) + 0.005) throw new Error("COMPETITOR_PLAN_TEAM_OVERLOAD");
  return plan;
}

function chooseTeam(envelope: CompetitorDecisionEnvelopeV10, preferred: string): string {
  return Object.keys(envelope.resourceCeilings.teamCapacity).find((id) => id.endsWith(`:${preferred}`)) ?? Object.keys(envelope.resourceCeilings.teamCapacity)[0];
}

export function generateAuthoredCompetitorPlanV10(envelopeInput: CompetitorDecisionEnvelopeV10): CompetitorStrategicPlanV10 {
  const envelope = competitorDecisionEnvelopeSchemaV10.parse(envelopeInput);
  const state = envelope.syntheticInternalState;
  const netBurn = Math.max(1, state.monthlyBurn - state.monthlyRevenue);
  const runway = (state.cash - state.reservedCash) / netBurn;
  const productTarget = envelope.feasibleTargets.find((target) => target.kind === "capability" && state.productGaps.includes(target.id));
  const segmentTarget = envelope.feasibleTargets.find((target) => target.kind === "segment");
  const firmTarget = envelope.feasibleTargets.find((target) => target.kind === "firm")!;
  let kind: CompetitorInitiativeKindV10;
  let target: { kind: string; id: string };
  let objective: "survive" | "validate" | "grow" | "defend" | "fund";
  let team: string;
  if (runway < 2.25) {
    kind = "cost_restructure"; target = firmTarget; objective = "survive"; team = chooseTeam(envelope, "operations");
  } else if (
    runway < 4 &&
    state.doctrine !== "capital_conservative" &&
    envelope.feasibleTargets.some((candidate) => candidate.kind === "capital")
  ) {
    kind = "capital_raise";
    target = envelope.feasibleTargets.find((candidate) => candidate.kind === "capital")!;
    objective = "fund";
    team = chooseTeam(envelope, "operations");
  } else if (productTarget) {
    kind = "capability_build"; target = productTarget; objective = "grow"; team = chooseTeam(envelope, "product");
  } else if ((state.pipelineByStage.qualified ?? 0) + (state.pipelineByStage.pilot ?? 0) < 3) {
    kind = "sales_campaign"; target = segmentTarget ?? firmTarget; objective = "validate"; team = chooseTeam(envelope, "sales");
  } else {
    kind = "segment_defend"; target = segmentTarget ?? firmTarget; objective = "defend"; team = chooseTeam(envelope, "sales");
  }
  const capacity = Math.max(0, Math.min(envelope.resourceCeilings.teamCapacity[team] ?? 0, (envelope.resourceCeilings.teamCapacity[team] ?? 0) * 0.45));
  const cashLimit = round(Math.min(envelope.resourceCeilings.cash * 0.28, Math.max(0, state.monthlyBurn * 0.55)));
  const initiativeId = `${envelope.planningCycleId}:initiative:1`;
  return competitorStrategicPlanSchemaV10.parse({
    planningCycleId: envelope.planningCycleId, firmId: envelope.firmId, horizonDays: 75,
    objectives: [objective], allocations: [{ function: kind.includes("capability") ? "product" : kind.includes("sales") || kind.includes("segment") ? "sales" : "capital", ceilingPercent: 45 }],
    initiatives: [{
      id: initiativeId, kind, target, cashLimit, teamCapacity: { [team]: round(capacity) }, executiveAttention: 24,
      dependencyIds: [], reviewDay: envelope.simulationDay + 45,
      stopConditions: [{ metric: "cash", operator: "lt", threshold: round(Math.max(0, state.monthlyBurn * 0.75)) }],
    }],
    publicRationale: `SIMULATED: ${envelope.firmId} committed a bounded ${objective} plan based on its synthetic runway, product gaps, pipeline and observed market conditions.`,
  });
}

function applyPlan(
  context: FeatureRuntimeContextV10<CompetitorStrategyPublicStateV10, CompetitorStrategyPrivateStateV10> & { command: import("./types").EngineCommandV10 },
  config: z.infer<typeof configSchema>,
): void {
  if (context.command.type !== "system.competitor_plan.apply" && context.command.type !== "system.competitor_plan_fallback") return;
  const pending = context.ownState.private.pendingEnvelope;
  if (!pending || pending.turnId !== context.command.payload.turnId) throw new Error("COMPETITOR_TURN_NOT_PENDING");
  if (pending.worldInputHash !== context.command.payload.inputHash) throw new Error("COMPETITOR_TURN_STALE");
  if (context.ownState.private.appliedExternalInputIds.includes(context.command.payload.externalInputId)) return;
  const plan = validateAgainstEnvelope(context.command.payload.plan, pending);
  context.emit({ type: "competitor-strategy.plan_committed", sourceId: plan.planningCycleId, payload: plan });
  context.emit({
    type: "competitor-strategy.plan_publicly_observed",
    visibility: "public",
    sourceId: plan.planningCycleId,
    payload: { firmId: plan.firmId, objectives: plan.objectives, initiativeKinds: plan.initiatives.map((item) => item.kind), publicRationale: plan.publicRationale, provider: context.command.payload.provider },
  });
  context.ownState.public.recentPlans.push({
    planningCycleId: plan.planningCycleId, firmId: plan.firmId, committedDay: context.kernel.simulationDay,
    objectives: plan.objectives, initiativeKinds: plan.initiatives.map((item) => item.kind),
    provider: context.command.payload.provider, publicRationale: plan.publicRationale,
  });
  context.ownState.public.recentPlans = context.ownState.public.recentPlans.slice(-32);
  context.ownState.public.completedPlanningCycles += 1;
  if (context.command.payload.provider === "openai") context.ownState.public.aiBudget.used += 1;
  context.ownState.private.planTape.push(structuredClone(plan));
  context.ownState.private.appliedExternalInputIds.push(context.command.payload.externalInputId);
  context.ownState.private.nextPlanningDay[plan.firmId] = context.kernel.simulationDay + config.minimumCycleDays + Math.floor(context.rng.nextFloat() * (config.maximumCycleDays - config.minimumCycleDays + 1));
  context.ownState.private.pendingEnvelope = null;
  context.ownState.public.pendingTurn = null;
  context.resolveExternalTurn(pending.turnId);
}

export function createCompetitorStrategyFeatureV10(): SimulationFeatureV10<
  CompetitorStrategyPublicStateV10,
  CompetitorStrategyPrivateStateV10,
  z.infer<typeof configSchema>
> {
  const parsedConfig = configSchema.parse({});
  return {
    id: "competitor-strategy", version: "1.0.0",
    dependencies: [
      { id: "market-intelligence", versionRange: "^2.0.0" },
      { id: "competitive-market", versionRange: "^1.0.0" },
      { id: "competitor-organizations", versionRange: "^1.0.0" },
    ],
    compatibleEngineRange: ">=10.1.0 <11.0.0",
    configSchema, publicStateSchema: competitorStrategyPublicStateSchemaV10, privateStateSchema,
    initialize: ({ query }) => {
      const firmIds = query("competitor-organizations.firm-ids") as string[];
      return {
        public: { strategyVersion: "competitor-strategy-v1", pendingTurn: null, recentPlans: [], completedPlanningCycles: 0, aiBudget: { used: 0, maximum: 32 } },
        private: {
          nextPlanningDay: Object.fromEntries(firmIds.map((firmId, index) => [firmId, 14 + index * 7])),
          lastEarlyReviewDay: Object.fromEntries(firmIds.map((firmId) => [firmId, -21])),
          pendingEnvelope: null,
          appliedExternalInputIds: [],
          planTape: [],
        },
      };
    },
    commands: {
      "system.competitor_plan.apply": (context) => { applyPlan(context, parsedConfig); return { checkpointRequired: true }; },
      "system.competitor_plan_fallback": (context) => { applyPlan(context, parsedConfig); return { checkpointRequired: true }; },
    },
    effects: {},
    queries: [{
      id: "competitor-strategy.pending-envelope",
      resolve: ({ ownState }) => structuredClone(ownState.private.pendingEnvelope),
    }],
    eventSubscriptions: [{
      id: "competitor-strategy-material-review",
      eventType: "competitor-organizations.material_shock",
      handle: (context, event) => {
        const parsed = z.object({ firmId: z.string(), trigger: z.string() }).parse(event.payload);
        const lastReview = context.ownState.private.lastEarlyReviewDay[parsed.firmId] ?? -21;
        if (context.kernel.simulationDay - lastReview < 21) return;
        context.ownState.private.lastEarlyReviewDay[parsed.firmId] = context.kernel.simulationDay;
        context.ownState.private.nextPlanningDay[parsed.firmId] = Math.min(
          context.ownState.private.nextPlanningDay[parsed.firmId] ?? Number.MAX_SAFE_INTEGER,
          context.kernel.simulationDay,
        );
      },
    }],
    hooks: {
      after_scheduled_effects: (context) => {
        if (context.ownState.private.pendingEnvelope || context.ownState.public.completedPlanningCycles >= 32) return;
        const dueCandidates = Object.entries(context.ownState.private.nextPlanningDay)
          .filter(([, day]) => day <= context.kernel.simulationDay)
          .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));
        const due = dueCandidates.find(([firmId]) => {
          const view = context.query("competitor-organizations.decision-view", { firmId }) as CompetitorDecisionViewV10;
          const plannable = ["active", "distressed", "restructuring"].includes(view.lifecycle);
          if (!plannable) delete context.ownState.private.nextPlanningDay[firmId];
          return plannable;
        });
        if (!due) return;
        const envelope = buildEnvelope(context, due[0]);
        context.ownState.private.pendingEnvelope = envelope;
        context.ownState.public.pendingTurn = { turnId: envelope.turnId, firmId: envelope.firmId, requestedDay: context.kernel.simulationDay, status: "pending" };
        context.requestExternalTurn(envelope.turnId);
        context.emit({
          type: "competitor-strategy.plan_requested", visibility: "public", sourceId: envelope.turnId,
          payload: { firmId: envelope.firmId, turnId: envelope.turnId, requestedDay: context.kernel.simulationDay },
        });
      },
    },
    invariants: [{
      id: "competitor-strategy-turn-and-budget",
      check: ({ ownState, kernel }) => {
        if (ownState.public.completedPlanningCycles > 32 || ownState.public.aiBudget.used > 32) throw new Error("COMPETITOR_STRATEGY_BUDGET_EXCEEDED");
        if (Boolean(ownState.private.pendingEnvelope) !== Boolean(ownState.public.pendingTurn)) throw new Error("COMPETITOR_PENDING_TURN_MISMATCH");
        if (ownState.private.pendingEnvelope && !kernel.pendingCriticalTurnIds.includes(ownState.private.pendingEnvelope.turnId)) throw new Error("COMPETITOR_KERNEL_TURN_MISSING");
        if (new Set(ownState.private.appliedExternalInputIds).size !== ownState.private.appliedExternalInputIds.length) throw new Error("COMPETITOR_EXTERNAL_INPUT_DUPLICATED");
      },
    }],
    projectionPolicy: {
      schema: competitorStrategyPublicStateSchemaV10,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: ["pendingEnvelope", "worldInputHash", "planTape", "syntheticInternalState", "resourceCeilings"],
    },
    snapshotPolicy: { mode: "every_material_command", maximumCommandsBetweenSnapshots: 10 },
    retentionPolicy: { maximumHeadBytes: 1_000_000, maximumMaterialRecords: 200, archiveClosedRecords: true },
  };
}

export function pendingCompetitorDecisionEnvelopeV10(state: SimulationStateV10): CompetitorDecisionEnvelopeV10 | null {
  const head = state.features["competitor-strategy"];
  if (!head) return null;
  const parsed = privateStateSchema.parse(head.private);
  return parsed.pendingEnvelope ? structuredClone(parsed.pendingEnvelope) : null;
}

export function validateCompetitorPlanV10(
  plan: unknown,
  envelope: CompetitorDecisionEnvelopeV10,
): CompetitorStrategicPlanV10 {
  return validateAgainstEnvelope(plan, competitorDecisionEnvelopeSchemaV10.parse(envelope));
}
