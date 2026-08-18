import { z } from "zod";
import { stateChecksum } from "../checksum";
import { marketSeedForScenario } from "../content/market-dossiers";
import { postJournal } from "../domains/finance";
import { clamp, round } from "../kernel/math";
import { random } from "../rng";
import { scheduleEffect } from "../kernel/scheduler";
import type {
  AgentDecision, AgentDecisionEnvelope, CompetitorActionId, CompetitorPrivateState, CompetitorPublicState,
  CompetitorResponseId, MarketDossierVersion, MarketIntelligencePublicState, SimulationState,
} from "../types";
import type { DomainEmitter, SimulationFeature } from "./contracts";

const actionIds = [
  "hold_position", "change_pricing", "reposition", "launch_capability", "add_integration",
  "bundle_services", "target_segment", "channel_partnership", "increase_sales_pressure", "exit_segment",
] as const;

const timestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp");
const sourceSchema = z.object({ id: z.string(), title: z.string(), publisher: z.string(), url: z.url(), retrievedAt: timestampSchema, primary: z.boolean() });
const factSchema = z.object({
  id: z.string(), subjectId: z.string(), kind: z.enum(["pricing", "capability", "positioning", "channel", "partnership", "funding", "availability"]),
  statement: z.string(), value: z.union([z.string(), z.number()]).optional(), unit: z.string().optional(), observedAt: timestampSchema, confidence: z.number().min(0).max(100),
  sourceIds: z.array(z.string()).min(1), status: z.enum(["verified", "quarantined"]),
});
export const marketDossierSchema = z.object({ id: z.string(), scenarioId: z.string(), capturedAt: timestampSchema, contentHash: z.string(), sources: z.array(sourceSchema), facts: z.array(factSchema) });
const profileSchema = z.object({
  id: z.string(), publicName: z.string(), website: z.url(), category: z.enum(["direct", "platform", "substitute"]), positioning: z.string(),
  priceAnchor: z.number().nullable(), targetSegments: z.array(z.string()), channels: z.array(z.string()), capabilitySignals: z.array(z.string()),
});
const moveSchema = z.object({
  id: z.string(), competitorId: z.string(), actionId: z.enum(actionIds), simulationDay: z.number(), status: z.enum(["announced", "active", "expired"]),
  publicSummary: z.string(), impact: z.object({ pricePressure: z.number(), substitutionRisk: z.number(), channelPressure: z.number(), trustPressure: z.number() }),
  provider: z.enum(["openai", "authored"]), sourceFactIds: z.array(z.string()), playerResponse: z.enum(["differentiate", "match_price", "niche_down", "accelerate", "partner", "ignore"]).optional(), respondedDay: z.number().optional(),
});
const pendingSchema = z.object({ id: z.string(), actorId: z.string(), actorType: z.enum(["competitor", "stakeholder"]), createdSimulationDay: z.number(), allowedActionIds: z.array(z.enum(actionIds)), worldInputHash: z.string(), status: z.literal("pending"), turnKind: z.enum(["regular", "deep"]) });
export const marketIntelligencePublicSchema = z.object({ dossier: marketDossierSchema, lastAppliedAt: z.string(), dynamicWorld: z.boolean() });
export const competitorPublicSchema = z.object({ profiles: z.array(profileSchema), moves: z.array(moveSchema), pendingTurn: pendingSchema.nullable(), nextTurnDay: z.number(), regularTurnsUsed: z.number().int(), deepTurnsUsed: z.number().int() });
export const competitorPrivateSchema = z.object({ policies: z.record(z.string(), z.object({ resourceEnvelope: z.number(), executionVelocity: z.number(), riskTolerance: z.number(), cooldownUntilDay: z.number(), perceivedPlayerSignal: z.number() })) });

export function competitorPublic(state: SimulationState): CompetitorPublicState {
  const value = state.features?.public.competitors;
  if (!value) throw new Error("COMPETITOR_FEATURE_STATE_MISSING");
  competitorPublicSchema.parse(value);
  return value;
}

function competitorPrivate(state: SimulationState): CompetitorPrivateState {
  const value = state.features?.private.competitors;
  if (!value) throw new Error("COMPETITOR_FEATURE_STATE_MISSING");
  competitorPrivateSchema.parse(value);
  return value;
}

export function marketIntelligencePublic(state: SimulationState): MarketIntelligencePublicState {
  const value = state.features?.public["market-intelligence"];
  if (!value) throw new Error("MARKET_INTELLIGENCE_STATE_MISSING");
  marketIntelligencePublicSchema.parse(value);
  return value;
}

function boundedSeed(seed: number, index: number, low: number, high: number) {
  let value = (seed ^ Math.imul(index + 11, 0x9e3779b9)) >>> 0 || 1;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return round(low + ((value >>> 0) / 4_294_967_296) * (high - low));
}

function eligibleActions(state: SimulationState, competitorId: string): CompetitorActionId[] {
  const profile = competitorPublic(state).profiles.find((item) => item.id === competitorId);
  const policy = competitorPrivate(state).policies[competitorId];
  const actions: CompetitorActionId[] = ["hold_position", "reposition", "target_segment", "increase_sales_pressure"];
  if (profile?.priceAnchor !== null) actions.push("change_pricing");
  if ((policy?.resourceEnvelope ?? 0) >= 45) actions.push("launch_capability", "bundle_services");
  if (profile?.capabilitySignals.some((item) => /integrat|API|FHIR|sync/i.test(item))) actions.push("add_integration");
  if (profile?.channels.length) actions.push("channel_partnership");
  if (state.stage === "repeatability") actions.push("exit_segment");
  return [...new Set(actions)];
}

export function buildAgentDecisionEnvelope(state: SimulationState): AgentDecisionEnvelope {
  const publicState = competitorPublic(state); const pending = publicState.pendingTurn;
  if (!pending) throw new Error("AGENT_TURN_NOT_PENDING");
  const profile = publicState.profiles.find((item) => item.id === pending.actorId);
  if (!profile) throw new Error("COMPETITOR_NOT_FOUND");
  const intel = marketIntelligencePublic(state);
  const released = state.product.capabilities.filter((item) => item.status === "released").map((item) => item.label);
  return {
    turnId: pending.id, actor: { id: profile.id, name: profile.publicName, role: `competitor:${profile.category}` },
    observedFacts: intel.dossier.facts.filter((item) => item.status === "verified" && item.subjectId === profile.id),
    memory: [
      ...publicState.moves.filter((item) => item.competitorId === profile.id).slice(-5).map((item) => item.publicSummary),
      `Observable player positioning: ${state.meta.strategy}`,
      `Observable player list-price signal: $${round(state.market.defaultPrice)}`,
      `Observable player releases: ${released.length ? released.join(", ") : "none"}`,
    ],
    allowedActionIds: pending.allowedActionIds,
    constraints: ["Choose one allowed strategic action", "Use only observed public facts", "Do not claim this simulated move happened in the real world", "Do not assign numeric effects"],
    worldInputHash: pending.worldInputHash, turnKind: pending.turnKind,
  };
}

function createPendingTurn(state: SimulationState, emit: DomainEmitter) {
  const publicState = competitorPublic(state); const privateState = competitorPrivate(state);
  if (publicState.pendingTurn || (publicState.regularTurnsUsed >= 24 && publicState.deepTurnsUsed >= 4) || state.calendar.absoluteDay < publicState.nextTurnDay || state.status !== "active") return;
  const available = publicState.profiles.filter((profile) => (privateState.policies[profile.id]?.cooldownUntilDay ?? 0) <= state.calendar.absoluteDay);
  if (!available.length) { publicState.nextTurnDay += 7; return; }
  const competitor = available[(state.decisionPoints + state.seed) % available.length];
  const allowed = eligibleActions(state, competitor.id);
  const turnKind = publicState.deepTurnsUsed < Math.floor(publicState.regularTurnsUsed / 6) && publicState.deepTurnsUsed < 4 ? "deep" as const : "regular" as const;
  const worldInputHash = stateChecksum({
    day: state.calendar.absoluteDay, stage: state.stage, actorId: competitor.id, allowed, turnKind,
    visible: { customers: state.market.accounts.filter((item) => item.stage === "customer").length, price: state.market.defaultPrice, releasedCapabilities: state.product.capabilities.filter((item) => item.status === "released").map((item) => item.id) },
    dossier: marketIntelligencePublic(state).dossier.contentHash,
  });
  publicState.pendingTurn = { id: `agent_${state.calendar.absoluteDay}_${publicState.regularTurnsUsed + publicState.deepTurnsUsed + 1}`, actorId: competitor.id, actorType: "competitor", createdSimulationDay: state.calendar.absoluteDay, allowedActionIds: allowed, worldInputHash, status: "pending", turnKind };
  emit("agent_turn_requested", "competition", `${competitor.publicName} is evaluating a simulated strategic response from observable market signals.`, "system");
}

function activateMove(state: SimulationState, moveId: string, emit: DomainEmitter) {
  const publicState = competitorPublic(state);
  const move = publicState.moves.find((item) => item.id === moveId);
  if (move?.status === "announced") {
      move.status = "active";
      for (const account of state.market.accounts.filter((item) => !["lost", "churned"].includes(item.stage))) {
        account.blockerRisk = clamp(account.blockerRisk + move.impact.substitutionRisk * 0.22);
        account.expectedValue = round(Math.max(1, account.expectedValue * (1 - move.impact.pricePressure / 500)));
        account.trust = clamp(account.trust - move.impact.trustPressure * 0.08);
      }
      for (const segment of state.market.segments) segment.responseRate = clamp(segment.responseRate * (1 - move.impact.channelPressure / 600), 0.005, 1);
      emit("competitor_move_announced", "competition", `${move.publicSummary} Its bounded market effects are now active.`, "system");
  }
}

function expireMoves(state: SimulationState) {
  for (const move of competitorPublic(state).moves) if (move.status === "active" && state.calendar.absoluteDay >= move.simulationDay + 90) move.status = "expired";
}

const baseImpact: Record<CompetitorActionId, CompetitorPublicState["moves"][number]["impact"]> = {
  hold_position: { pricePressure: 0, substitutionRisk: 2, channelPressure: 0, trustPressure: 0 },
  change_pricing: { pricePressure: 18, substitutionRisk: 8, channelPressure: 2, trustPressure: 0 },
  reposition: { pricePressure: 2, substitutionRisk: 14, channelPressure: 4, trustPressure: 4 },
  launch_capability: { pricePressure: 3, substitutionRisk: 19, channelPressure: 3, trustPressure: 5 },
  add_integration: { pricePressure: 2, substitutionRisk: 13, channelPressure: 6, trustPressure: 3 },
  bundle_services: { pricePressure: 12, substitutionRisk: 11, channelPressure: 3, trustPressure: 2 },
  target_segment: { pricePressure: 4, substitutionRisk: 13, channelPressure: 10, trustPressure: 4 },
  channel_partnership: { pricePressure: 2, substitutionRisk: 8, channelPressure: 18, trustPressure: 3 },
  increase_sales_pressure: { pricePressure: 6, substitutionRisk: 8, channelPressure: 14, trustPressure: 7 },
  exit_segment: { pricePressure: -5, substitutionRisk: -8, channelPressure: -4, trustPressure: 0 },
};

function applyAgentDecision(state: SimulationState, turnId: string, decision: AgentDecision, provider: "openai" | "authored", externalInputId: string, inputHash: string, emit: DomainEmitter) {
  if (state.externalInputRefs?.some((item) => item.id === externalInputId)) return;
  const publicState = competitorPublic(state); const pending = publicState.pendingTurn;
  if (!pending || pending.id !== turnId) throw new Error("AGENT_TURN_NOT_PENDING");
  if (pending.worldInputHash !== inputHash) throw new Error("AGENT_INPUT_STALE");
  if (!pending.allowedActionIds.includes(decision.selectedActionId)) throw new Error("AGENT_ACTION_FORBIDDEN");
  const intel = marketIntelligencePublic(state);
  const validSources = new Set(intel.dossier.sources.map((item) => item.id));
  if (decision.citedSourceIds.some((id) => !validSources.has(id))) throw new Error("AGENT_SOURCE_FORBIDDEN");
  const profile = publicState.profiles.find((item) => item.id === pending.actorId);
  if (!profile) throw new Error("COMPETITOR_NOT_FOUND");
  const policy = competitorPrivate(state).policies[profile.id];
  const execution = clamp(0.65 + (policy?.executionVelocity ?? 50) / 180 + random(state) * 0.18, 0.65, 1.28);
  const impact = Object.fromEntries(Object.entries(baseImpact[decision.selectedActionId]).map(([key, value]) => [key, round(value * execution)])) as typeof baseImpact[CompetitorActionId];
  const move: CompetitorPublicState["moves"][number] = {
    id: `move_${state.sequence + 1}_${publicState.moves.length + 1}`, competitorId: profile.id, actionId: decision.selectedActionId,
    simulationDay: state.calendar.absoluteDay, status: "announced", publicSummary: `SIMULATED: ${profile.publicName} chose ${decision.selectedActionId.replaceAll("_", " ")}. ${decision.publicRationale}`,
    impact, provider, sourceFactIds: decision.citedSourceIds,
  };
  publicState.moves.push(move); scheduleEffect(state, "competitors.activate_move", state.calendar.absoluteDay + 7, move.id);
  publicState.pendingTurn = null;
  if (pending.turnKind === "deep") publicState.deepTurnsUsed += 1; else publicState.regularTurnsUsed += 1;
  publicState.nextTurnDay = state.calendar.absoluteDay + 28 + Math.floor(random(state) * 22);
  if (policy) { policy.cooldownUntilDay = publicState.nextTurnDay; policy.perceivedPlayerSignal = clamp(policy.perceivedPlayerSignal + 4); }
  state.externalInputRefs ??= [];
  state.externalInputRefs.push({ id: externalInputId, kind: "agent_decision", inputHash, effectiveSimulationDay: state.calendar.absoluteDay });
  emit("competitor_move_announced", "competition", `SIMULATED competitor move recorded for ${profile.publicName}; consequences are delayed and bounded by capacity.`, "ai");
}

function respond(state: SimulationState, competitorId: string, response: CompetitorResponseId, emit: DomainEmitter) {
  const publicState = competitorPublic(state); const profile = publicState.profiles.find((item) => item.id === competitorId);
  if (!profile) throw new Error("COMPETITOR_NOT_FOUND");
  const move = [...publicState.moves].reverse().find((item) => item.competitorId === competitorId && item.status !== "expired");
  if (!move) throw new Error("COMPETITOR_MOVE_NOT_FOUND");
  if (move.playerResponse) throw new Error("COMPETITOR_MOVE_ALREADY_ANSWERED");
  let reduction = 0;
  if (response === "differentiate") { state.evidence.buyerClarity = clamp(state.evidence.buyerClarity + 3); state.founder.energy = clamp(state.founder.energy - 2); reduction = 0.35; }
  else if (response === "match_price") { state.market.defaultPrice = round(Math.max(1, state.market.defaultPrice * 0.9)); state.evidence.budget = clamp(state.evidence.budget + 1); reduction = 0.45; }
  else if (response === "niche_down") { state.evidence.problem = clamp(state.evidence.problem - 4); state.evidence.buyerClarity = clamp(state.evidence.buyerClarity + 5); reduction = 0.52; }
  else if (response === "accelerate") { state.founder.burnout = clamp(state.founder.burnout + 6); state.product.technicalDebt = clamp(state.product.technicalDebt + 5); reduction = 0.5; }
  else if (response === "partner") {
    if (state.finance.companyCash < 35) throw new Error("INSUFFICIENT_COMPANY_CASH");
    postJournal(state, "Competitive channel partnership", `competitor_response_${move.id}`, [{ account: "operating_expense", debit: 35, credit: 0 }, { account: "cash", debit: 0, credit: 35 }]);
    state.relationships.trust = clamp(state.relationships.trust + 2); reduction = 0.58;
  }
  if (reduction > 0) for (const key of Object.keys(move.impact) as Array<keyof typeof move.impact>) move.impact[key] = round(move.impact[key] * (1 - reduction));
  move.playerResponse = response; move.respondedDay = state.calendar.absoluteDay;
  emit("competitor_response_committed", "competition", `${response.replaceAll("_", " ")} committed against the simulated ${profile.publicName} move; trade-offs are now in state.`);
}

export const marketIntelligenceFeature: SimulationFeature = {
  id: "market-intelligence", version: "1.0.0", dependencies: [], publicStateSchema: marketIntelligencePublicSchema,
  initialize: ({ state }) => {
    const { dossier } = marketSeedForScenario(state.scenarioId);
    return { public: { dossier, lastAppliedAt: dossier.capturedAt, dynamicWorld: true } satisfies MarketIntelligencePublicState };
  },
  commands: {
    "system.market_dossier.apply": ({ state, command, emit }) => {
      if (command.type !== "system.market_dossier.apply") return;
      if (state.externalInputRefs?.some((item) => item.id === command.payload.externalInputId)) return;
      const dossier = marketDossierSchema.parse(command.payload.dossier) as MarketDossierVersion;
      if (dossier.scenarioId !== state.scenarioId) throw new Error("DOSSIER_SCENARIO_MISMATCH");
      const sourceIds = new Set(dossier.sources.map((item) => item.id));
      if (dossier.facts.some((item) => item.status === "verified" && item.sourceIds.some((id) => !sourceIds.has(id)))) throw new Error("DOSSIER_CITATION_MISSING");
      state.features!.public["market-intelligence"] = { dossier, lastAppliedAt: command.payload.dossier.capturedAt, dynamicWorld: true } satisfies MarketIntelligencePublicState;
      state.externalInputRefs ??= [];
      state.externalInputRefs.push({ id: command.payload.externalInputId, kind: "market_dossier", inputHash: command.payload.inputHash, effectiveSimulationDay: state.calendar.absoluteDay });
      emit("market_intelligence_updated", "intelligence", `Applied verified market dossier ${dossier.id}; public facts remain distinct from simulated behavior.`, "system");
      return { checkpoint: true };
    },
  },
};

export const competitorFeature: SimulationFeature = {
  id: "competitors", version: "1.0.0", dependencies: ["market-intelligence", "market", "customers-and-sales", "product-and-technology"],
  publicStateSchema: competitorPublicSchema, privateStateSchema: competitorPrivateSchema,
  initialize: ({ state }) => {
    const { profiles } = marketSeedForScenario(state.scenarioId);
    const policies = Object.fromEntries(profiles.map((profile, index) => [profile.id, {
      resourceEnvelope: boundedSeed(state.seed, index * 5, 35, 92), executionVelocity: boundedSeed(state.seed, index * 5 + 1, 35, 88),
      riskTolerance: boundedSeed(state.seed, index * 5 + 2, 20, 84), cooldownUntilDay: 21 + index * 3, perceivedPlayerSignal: 8,
    }]));
    return { public: { profiles, moves: [], pendingTurn: null, nextTurnDay: 21, regularTurnsUsed: 0, deepTurnsUsed: 0 } satisfies CompetitorPublicState, private: { policies } satisfies CompetitorPrivateState };
  },
  commands: {
    "competitor.respond": ({ state, command, emit }) => { if (command.type === "competitor.respond") respond(state, command.payload.competitorId, command.payload.response, emit); },
    "system.agent_decision.apply": ({ state, command, emit }) => {
      if (command.type !== "system.agent_decision.apply") return;
      applyAgentDecision(state, command.payload.turnId, command.payload.decision, command.payload.provider, command.payload.externalInputId, command.payload.inputHash, emit);
      return { checkpoint: true };
    },
  },
  effects: {
    "competitors.activate_move": ({ state, effect, emit }) => activateMove(state, effect.sourceId, emit),
  },
  hooks: {
    after_scheduled_effects: ({ state, emit }) => { expireMoves(state); createPendingTurn(state, emit); },
  },
  validate: (state) => {
    const publicState = competitorPublic(state); const ids = new Set(publicState.profiles.map((item) => item.id));
    if (publicState.moves.some((item) => !ids.has(item.competitorId))) throw new Error("COMPETITOR_MOVE_ORPHANED");
    if (publicState.regularTurnsUsed > 24 || publicState.deepTurnsUsed > 4) throw new Error("AGENT_TURN_BUDGET_EXCEEDED");
  },
};
