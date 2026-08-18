import { postJournal } from "../domains/finance";
import { advanceAccount, disqualifyAccount, sourceAccount } from "../domains/market";
import { clamp, round } from "../kernel/math";
import { scheduleEffect } from "../kernel/scheduler";
import { random } from "../rng";
import type { ScheduledEffect, SimulationState } from "../types";
import type { DomainEmitter, SimulationFeature } from "./contracts";
import { realism85Enabled } from "./realism";

type SegmentReachState = {
  reachableAccounts: number;
  contactedAccounts: number;
  responsiveAccounts: number;
  campaignsRun: number;
  reputation: number;
  saturation: number;
  nextAvailableDay: number;
};

type MarketingPublicState = {
  mode: "scarce";
  segments: Record<string, SegmentReachState>;
};

export function marketingPublic(state: SimulationState): MarketingPublicState {
  const value = state.features?.public["marketing-and-channels"];
  if (!value) throw new Error("MARKETING_FEATURE_STATE_MISSING");
  return value as MarketingPublicState;
}

function scheduleOutreach(state: SimulationState, segmentId: string, emit: DomainEmitter) {
  const segment = state.market.segments.find((item) => item.id === segmentId);
  if (!segment) throw new Error("SEGMENT_NOT_FOUND");
  const publicState = marketingPublic(state);
  const reach = publicState.segments[segmentId];
  if (!reach) throw new Error("SEGMENT_REACH_STATE_MISSING");
  if (state.scheduledEffects.some((effect) => effect.type === "marketing-and-channels.outreach_response" && effect.sourceId === segmentId)) {
    throw new Error("OUTREACH_CAMPAIGN_PENDING");
  }
  if (state.calendar.absoluteDay < reach.nextAvailableDay) throw new Error("OUTREACH_COOLDOWN");
  const remaining = Math.max(0, reach.reachableAccounts - reach.contactedAccounts);
  if (remaining <= 0) throw new Error("SEGMENT_REACH_EXHAUSTED");

  const strategyBase = state.meta.strategy === "enterprise" ? 4 : state.meta.strategy === "design_partner" ? 5 : 7;
  const learningBonus = Math.floor((state.evidence.problem + state.evidence.buyerClarity) / 45);
  const batchSize = Math.max(1, Math.min(remaining, strategyBase + learningBonus));
  const costPerContact = state.meta.strategy === "enterprise" ? 2.4 : state.meta.strategy === "design_partner" ? 1.7 : 1.1;
  const cost = round(batchSize * costPerContact);
  if (state.finance.companyCash < cost) throw new Error("INSUFFICIENT_COMPANY_CASH");
  postJournal(state, "Targeted account sourcing", `outreach_${segmentId}_${reach.campaignsRun + 1}`, [
    { account: "marketing_expense", debit: cost, credit: 0 },
    { account: "cash", debit: 0, credit: cost },
  ]);

  reach.contactedAccounts += batchSize;
  reach.campaignsRun += 1;
  reach.saturation = round(reach.contactedAccounts / Math.max(1, reach.reachableAccounts) * 100, 2);
  reach.nextAvailableDay = state.calendar.absoluteDay + 3;
  state.founder.energy = clamp(state.founder.energy - 1 - batchSize * 0.08);
  state.founder.stress = clamp(state.founder.stress + 0.8 + batchSize * 0.04);

  const delay = 3 + Math.floor(random(state) * 5);
  scheduleEffect(state, "marketing-and-channels.outreach_response", state.calendar.absoluteDay + delay, segmentId, {
    segmentId,
    batchSize,
  });
  emit("decision_recorded", "customer", `Contacted ${batchSize} finite accounts in ${segment.label}; responses will arrive after ${delay} days.`);
}

function resolveOutreach(state: SimulationState, effect: ScheduledEffect, emit: DomainEmitter) {
  const publicState = marketingPublic(state);
  const segmentId = String(effect.payload.segmentId ?? effect.sourceId);
  const batchSize = Number(effect.payload.batchSize ?? 0);
  const segment = state.market.segments.find((item) => item.id === segmentId);
  const reach = publicState.segments[segmentId];
  if (!segment || !reach || batchSize <= 0) return;

  const saturationMultiplier = clamp(1 - reach.saturation / 125, 0.18, 1);
  const reputationMultiplier = clamp((reach.reputation + state.relationships.trust) / 100, 0.45, 1.25);
  const evidenceMultiplier = clamp(0.65 + (state.evidence.problem + state.evidence.buyerClarity) / 220, 0.55, 1.35);
  const strategyMultiplier = state.meta.strategy === "enterprise" && segment.switchingFriction >= 60 ? 1.08
    : state.meta.strategy === "design_partner" && segment.adoptionRisk >= 55 ? 1.05 : 1;
  const effectiveResponseRate = clamp(segment.responseRate * saturationMultiplier * reputationMultiplier * evidenceMultiplier * strategyMultiplier, 0.005, 0.8);
  const expectedResponses = batchSize * effectiveResponseRate;
  const certainResponses = Math.floor(expectedResponses);
  const fractionalResponse = expectedResponses - certainResponses;
  const responseCount = Math.min(1, batchSize, certainResponses + (effect.sampledOutcome < fractionalResponse ? 1 : 0));

  reach.responsiveAccounts += responseCount;
  reach.reputation = clamp(reach.reputation + (responseCount > 0 ? 1.5 + responseCount : -1.5));
  for (let index = 0; index < responseCount; index += 1) sourceAccount(state, segmentId, emit);
  if (responseCount === 0) {
    emit("decision_recorded", "customer", `${segment.label} outreach produced no responsive account; ${reach.contactedAccounts}/${reach.reachableAccounts} reachable accounts have now been contacted.`, "system");
  } else {
    emit("decision_recorded", "customer", `${responseCount}/${batchSize} contacted accounts became reachable leads; saturation is now ${round(reach.saturation)}%.`, "system");
  }
}

function validateMarketing(state: SimulationState) {
  if (!realism85Enabled(state)) return;
  const publicState = marketingPublic(state);
  for (const [segmentId, reach] of Object.entries(publicState.segments)) {
    if (!Number.isFinite(reach.contactedAccounts) || reach.contactedAccounts < 0 || reach.contactedAccounts > reach.reachableAccounts) {
      throw new Error(`MARKETING_REACH_INVALID:${segmentId}`);
    }
    if (reach.responsiveAccounts < 0 || reach.responsiveAccounts > reach.contactedAccounts) throw new Error(`MARKETING_RESPONSE_INVALID:${segmentId}`);
    if (reach.saturation < 0 || reach.saturation > 100.01) throw new Error(`MARKETING_SATURATION_INVALID:${segmentId}`);
  }
}

export const marketingFeature: SimulationFeature = {
  id: "marketing-and-channels",
  version: "1.0.0",
  dependencies: ["customers-and-sales", "finance-and-tax"],
  initialize: ({ scenario }) => scenario.version === "2.1.0" ? {
    public: {
      mode: "scarce",
      segments: Object.fromEntries((scenario.simulation?.segments ?? []).map((segment) => [segment.id, {
        reachableAccounts: segment.reachableAccounts,
        contactedAccounts: 0,
        responsiveAccounts: 0,
        campaignsRun: 0,
        reputation: 50,
        saturation: 0,
        nextAvailableDay: 0,
      }])),
    } satisfies MarketingPublicState,
  } : {},
  commands: {
    "account.manage": ({ state, command, emit }) => {
      if (command.type !== "account.manage") return;
      if (command.payload.operation === "advance") return advanceAccount(state, command.payload.accountId ?? "", emit);
      if (command.payload.operation === "disqualify") return disqualifyAccount(state, command.payload.accountId ?? "", emit);
      const segmentId = command.payload.segmentId ?? state.market.segments[0]?.id;
      if (!segmentId) throw new Error("SEGMENT_NOT_FOUND");
      if (!realism85Enabled(state)) return sourceAccount(state, segmentId, emit);
      scheduleOutreach(state, segmentId, emit);
    },
  },
  effects: {
    "marketing-and-channels.outreach_response": ({ state, effect, emit }) => resolveOutreach(state, effect, emit),
  },
  validate: validateMarketing,
};
