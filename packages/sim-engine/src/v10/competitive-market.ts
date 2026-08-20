import { z } from "zod";
import type { FictionalTwinTemplateV10 } from "./competitor-content";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";

const resourceTypeSchema = z.enum(["account", "talent", "channel", "vendor", "capital"]);
export type CompetitiveResourceTypeV10 = z.infer<typeof resourceTypeSchema>;

const marketBidSchema = z.object({
  id: z.string(),
  firmId: z.string(),
  resourceId: z.string(),
  resourceType: resourceTypeSchema,
  submittedDay: z.number().int().nonnegative(),
  offerFit: z.number().min(0).max(1),
  proof: z.number().min(0).max(1),
  coverage: z.number().min(0).max(1),
  trust: z.number().min(0).max(1),
  implementationCapacity: z.number().min(0).max(1),
  economicCommitment: z.number().finite().nonnegative(),
}).strict();
export type CompetitiveMarketBidV10 = z.infer<typeof marketBidSchema>;

const opportunitySchema = z.object({
  id: z.string(),
  segmentId: z.string(),
  budgetBand: z.enum(["micro", "small", "mid", "enterprise"]),
  switchingFriction: z.enum(["low", "material", "high"]),
  multiVendor: z.boolean(),
  status: z.enum(["open", "contested", "allocated"]),
  visibleWinnerId: z.string().nullable(),
  considerationSetSize: z.number().int().min(1).max(5),
}).strict();

const marketSignalSchema = z.object({
  id: z.string(),
  day: z.number().int().nonnegative(),
  kind: z.enum(["account", "talent", "channel", "vendor", "capital"]),
  summary: z.string(),
  provenance: z.literal("simulated_observation"),
}).strict();

export const competitiveMarketPublicStateSchemaV10 = z.object({
  marketVersion: z.literal("competitive-market-v1"),
  opportunities: z.array(opportunitySchema).max(120),
  availability: z.record(resourceTypeSchema, z.enum(["scarce", "tight", "available"])),
  signals: z.array(marketSignalSchema).max(120),
  lastClearingDay: z.number().int().nonnegative(),
}).strict();
export type CompetitiveMarketPublicStateV10 = z.infer<typeof competitiveMarketPublicStateSchemaV10>;

const resourceSchema = z.object({
  id: z.string(),
  type: resourceTypeSchema,
  label: z.string(),
  status: z.enum(["open", "allocated"]),
  allocationFirmId: z.string().nullable(),
  considerationFirmIds: z.array(z.string()).min(1).max(5),
  renewsDay: z.number().int().nonnegative().nullable(),
}).strict();

const privateStateSchema = z.object({
  resources: z.array(resourceSchema).max(240),
  pendingBids: z.array(marketBidSchema).max(500),
  processedBidIds: z.array(z.string()).max(2_000),
  nextSignalId: z.number().int().positive(),
  nextResourceSequence: z.number().int().positive(),
  nextClearingDay: z.number().int().positive(),
}).strict();
type CompetitiveMarketPrivateStateV10 = z.infer<typeof privateStateSchema>;

const configSchema = z.object({
  accountOpportunities: z.number().int().min(12).max(120).default(24),
  talentSlots: z.number().int().min(4).max(60).default(12),
  channelSlots: z.number().int().min(2).max(30).default(8),
  vendorSlots: z.number().int().min(2).max(30).default(10),
  capitalSlots: z.number().int().min(1).max(20).default(4),
}).default({ accountOpportunities: 24, talentSlots: 12, channelSlots: 8, vendorSlots: 10, capitalSlots: 4 });

function availability(open: number, total: number): "scarce" | "tight" | "available" {
  const ratio = total ? open / total : 0;
  return ratio < 0.2 ? "scarce" : ratio < 0.5 ? "tight" : "available";
}

function refreshProjection(
  publicState: CompetitiveMarketPublicStateV10,
  privateState: CompetitiveMarketPrivateStateV10,
): void {
  for (const type of resourceTypeSchema.options) {
    const resources = privateState.resources.filter((item) => item.type === type);
    publicState.availability[type] = availability(resources.filter((item) => item.status === "open").length, resources.length);
  }
  for (const opportunity of publicState.opportunities) {
    const resource = privateState.resources.find((item) => item.id === opportunity.id);
    if (!resource) continue;
    opportunity.status = resource.status === "allocated"
      ? "allocated"
      : privateState.pendingBids.some((bid) => bid.resourceId === opportunity.id) ? "contested" : "open";
    opportunity.visibleWinnerId = resource.allocationFirmId;
  }
}

function scoreBid(bid: CompetitiveMarketBidV10, random: number): number {
  const quality = bid.offerFit * 0.26 + bid.proof * 0.2 + bid.coverage * 0.17 +
    bid.trust * 0.16 + bid.implementationCapacity * 0.21;
  const commitment = Math.min(0.12, Math.log10(1 + bid.economicCommitment) / 60);
  return quality + commitment + (random - 0.5) * 0.09;
}

function resolveMarket(
  context: FeatureRuntimeContextV10<CompetitiveMarketPublicStateV10, CompetitiveMarketPrivateStateV10>,
): void {
  const state = context.ownState;
  for (const resource of state.private.resources) {
    if (
      resource.type !== "account" &&
      resource.status === "allocated" &&
      resource.renewsDay !== null &&
      resource.renewsDay <= context.kernel.simulationDay
    ) {
      resource.status = "open";
      resource.allocationFirmId = null;
      resource.renewsDay = null;
    }
  }
  const grouped = new Map<string, CompetitiveMarketBidV10[]>();
  for (const bid of state.private.pendingBids) {
    if (state.private.processedBidIds.includes(bid.id)) continue;
    const values = grouped.get(bid.resourceId) ?? [];
    values.push(bid);
    grouped.set(bid.resourceId, values);
  }
  for (const [resourceId, bids] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const resource = state.private.resources.find((item) => item.id === resourceId);
    if (!resource || resource.status !== "open") continue;
    const ranked = bids.map((bid) => ({ bid, score: scoreBid(bid, context.rng.nextFloat()) }))
      .sort((left, right) => right.score - left.score || left.bid.id.localeCompare(right.bid.id));
    const winner = ranked[0]?.bid;
    if (!winner) continue;
    resource.status = "allocated";
    resource.allocationFirmId = winner.firmId;
    resource.renewsDay = resource.type === "account" ? null : context.kernel.simulationDay + 90;
    context.emit({
      type: "competitive-market.resource_allocated",
      sourceId: resource.id,
      payload: { resourceId: resource.id, resourceType: resource.type, firmId: winner.firmId, economicCommitment: winner.economicCommitment },
    });
    for (const losing of bids.filter((bid) => bid.id !== winner.id)) {
      context.emit({
        type: "competitive-market.resource_denied",
        sourceId: resource.id,
        payload: { resourceId: resource.id, resourceType: resource.type, firmId: losing.firmId },
      });
    }
    state.public.signals.push({
      id: `market-signal-${state.private.nextSignalId++}`,
      day: context.kernel.simulationDay,
      kind: resource.type,
      summary: resource.type === "account"
        ? `A contested ${resource.label} opportunity selected a supplier after comparing implementation risk and commercial proof.`
        : `${resource.label} capacity was allocated in the simulated market.`,
      provenance: "simulated_observation",
    });
  }
  const processed = state.private.pendingBids.map((bid) => bid.id);
  state.private.processedBidIds.push(...processed);
  state.private.processedBidIds = state.private.processedBidIds.slice(-2_000);
  state.private.pendingBids = [];
  const openAccounts = state.private.resources.filter(
    (resource) => resource.type === "account" && resource.status === "open",
  ).length;
  const existingAccounts = state.private.resources.filter(
    (resource) => resource.type === "account",
  ).length;
  if (openAccounts < 6 && existingAccounts < 120) {
    const segments = [...new Set(state.public.opportunities.map((item) => item.segmentId))];
    const additions = Math.min(4, 120 - existingAccounts);
    for (let index = 0; index < additions; index += 1) {
      const sequence = state.private.nextResourceSequence++;
      const id = `market-account-${sequence}`;
      const firmIds = [...new Set(state.private.resources.flatMap((item) => item.considerationFirmIds))].sort();
      const opportunity = {
        id,
        segmentId: segments[sequence % Math.max(1, segments.length)] ?? "general",
        budgetBand: (["micro", "small", "mid", "enterprise"] as const)[sequence % 4],
        switchingFriction: (["low", "material", "high"] as const)[sequence % 3],
        multiVendor: false,
        status: "open" as const,
        visibleWinnerId: null,
        considerationSetSize: Math.min(4, firmIds.length),
      };
      state.public.opportunities.push(opportunity);
      state.private.resources.push({
        id,
        type: "account",
        label: `${opportunity.segmentId} account`,
        status: "open",
        allocationFirmId: null,
        considerationFirmIds: firmIds.slice(0, 4),
        renewsDay: null,
      });
    }
  }
  state.public.signals = state.public.signals.slice(-120);
  state.public.lastClearingDay = context.kernel.simulationDay;
  refreshProjection(state.public, state.private);
}

export function createCompetitiveMarketFeatureV10(): SimulationFeatureV10<
  CompetitiveMarketPublicStateV10,
  CompetitiveMarketPrivateStateV10,
  z.infer<typeof configSchema>
> {
  return {
    id: "competitive-market",
    version: "1.0.0",
    dependencies: [
      { id: "external-world", versionRange: "^1.0.0" },
      { id: "market-intelligence", versionRange: "^2.0.0" },
    ],
    compatibleEngineRange: ">=10.1.0 <11.0.0",
    configSchema,
    publicStateSchema: competitiveMarketPublicStateSchemaV10,
    privateStateSchema,
    initialize: ({ kernel, config, query, schedule }) => {
      const twins = query("market-intelligence.fictional-twins") as FictionalTwinTemplateV10[];
      const segments = [...new Set(twins.flatMap((twin) => twin.targetSegments))];
      const firmIds = twins.map((twin) => twin.id);
      const opportunities = Array.from({ length: config.accountOpportunities }, (_, index) => {
        const segmentId = segments[index % Math.max(1, segments.length)] ?? "general";
        const natural = twins.filter((twin) => twin.targetSegments.includes(segmentId)).map((twin) => twin.id);
        const considerationFirmIds = [...new Set([
          ...natural,
          firmIds[index % firmIds.length],
          firmIds[(index + 1) % firmIds.length],
        ])].slice(0, 4);
        return {
          id: `market-account-${index + 1}`,
          segmentId,
          budgetBand: (["micro", "small", "mid", "enterprise"] as const)[index % 4],
          switchingFriction: (["low", "material", "high"] as const)[index % 3],
          multiVendor: false,
          status: "open" as const,
          visibleWinnerId: null,
          considerationSetSize: considerationFirmIds.length,
          considerationFirmIds,
        };
      });
      const resources = [
        ...opportunities.map(({ considerationFirmIds, ...item }) => ({ id: item.id, type: "account" as const, label: `${item.segmentId} account`, status: "open" as const, allocationFirmId: null, considerationFirmIds, renewsDay: null })),
        ...Array.from({ length: config.talentSlots }, (_, index) => ({ id: `talent-slot-${index + 1}`, type: "talent" as const, label: "specialist hiring slot", status: "open" as const, allocationFirmId: null, considerationFirmIds: firmIds, renewsDay: null })),
        ...Array.from({ length: config.channelSlots }, (_, index) => ({ id: `channel-slot-${index + 1}`, type: "channel" as const, label: "channel partner capacity", status: "open" as const, allocationFirmId: null, considerationFirmIds: firmIds, renewsDay: null })),
        ...Array.from({ length: config.vendorSlots }, (_, index) => ({ id: `vendor-slot-${index + 1}`, type: "vendor" as const, label: "implementation vendor capacity", status: "open" as const, allocationFirmId: null, considerationFirmIds: firmIds, renewsDay: null })),
        ...Array.from({ length: config.capitalSlots }, (_, index) => ({ id: `capital-slot-${index + 1}`, type: "capital" as const, label: "investor allocation", status: "open" as const, allocationFirmId: null, considerationFirmIds: firmIds, renewsDay: null })),
      ];
      const publicOpportunities = opportunities.map((opportunity) => ({
        id: opportunity.id,
        segmentId: opportunity.segmentId,
        budgetBand: opportunity.budgetBand,
        switchingFriction: opportunity.switchingFriction,
        multiVendor: opportunity.multiVendor,
        status: opportunity.status,
        visibleWinnerId: opportunity.visibleWinnerId,
        considerationSetSize: opportunity.considerationSetSize,
      }));
      schedule({ type: "competitive-market.clearing_tick", dueDay: kernel.simulationDay + 7, sourceId: "market-clock", payload: {} });
      return {
        public: {
          marketVersion: "competitive-market-v1",
          opportunities: publicOpportunities,
          availability: { account: "available", talent: "available", channel: "available", vendor: "available", capital: "available" },
          signals: [],
          lastClearingDay: kernel.simulationDay,
        },
        private: {
          resources,
          pendingBids: [],
          processedBidIds: [],
          nextSignalId: 1,
          nextResourceSequence: config.accountOpportunities + 1,
          nextClearingDay: kernel.simulationDay + 7,
        },
      };
    },
    commands: {},
    effects: {
      "competitive-market.clearing_tick": (context) => {
        resolveMarket(context);
        for (const resource of context.ownState.private.resources) {
          if (resource.status === "allocated" && resource.renewsDay !== null && resource.renewsDay <= context.kernel.simulationDay) {
            resource.status = "open";
            resource.allocationFirmId = null;
            resource.renewsDay = null;
          }
        }
        context.ownState.private.nextClearingDay = context.kernel.simulationDay + 7;
        context.schedule({ type: "competitive-market.clearing_tick", dueDay: context.kernel.simulationDay + 7, sourceId: "market-clock", payload: {} });
        refreshProjection(context.ownState.public, context.ownState.private);
      },
    },
    queries: [{
      id: "competitive-market.available-resources",
      resolve: ({ ownState }, input) => {
        const request = z.object({ type: resourceTypeSchema, firmId: z.string().optional() }).parse(input);
        const type = request.type;
        return structuredClone(
          ownState.private.resources
            .filter((item) => item.type === type && item.status === "open" && (!request.firmId || item.considerationFirmIds.includes(request.firmId)))
            .map((item) => {
              const opportunity = type === "account"
                ? ownState.public.opportunities.find((candidate) => candidate.id === item.id)
                : undefined;
              return opportunity ? { ...item, ...opportunity } : item;
            }),
        );
      },
    }, {
      id: "competitive-market.public-observation",
      resolve: ({ ownState }) => structuredClone(ownState.public),
    }],
    eventSubscriptions: [{
      id: "competitive-market-accepts-firm-bids",
      eventType: "competitor-organizations.market_bid_submitted",
      handle: (context, event) => {
        const bid = marketBidSchema.parse(event.payload);
        if (context.ownState.private.processedBidIds.includes(bid.id) || context.ownState.private.pendingBids.some((item) => item.id === bid.id)) return;
        const resource = context.ownState.private.resources.find((item) => item.id === bid.resourceId && item.type === bid.resourceType);
        if (!resource || resource.status !== "open") return;
        context.ownState.private.pendingBids.push(bid);
        refreshProjection(context.ownState.public, context.ownState.private);
      },
    }],
    hooks: {},
    invariants: [{
      id: "competitive-market-resource-conservation",
      check: ({ ownState }) => {
        const ids = ownState.private.resources.map((resource) => resource.id);
        if (new Set(ids).size !== ids.length) throw new Error("MARKET_RESOURCE_DUPLICATED");
        if (ownState.private.pendingBids.some((bid) => !ids.includes(bid.resourceId))) throw new Error("MARKET_BID_RESOURCE_MISSING");
        const allocatedAccounts = ownState.private.resources.filter((item) => item.type === "account" && item.status === "allocated");
        if (allocatedAccounts.some((item) => !item.allocationFirmId)) throw new Error("MARKET_ALLOCATION_OWNER_MISSING");
      },
    }],
    projectionPolicy: {
      schema: competitiveMarketPublicStateSchemaV10,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: ["pendingBids", "processedBidIds", "economicCommitment", "score"],
    },
    snapshotPolicy: { mode: "adaptive", maximumCommandsBetweenSnapshots: 20 },
    retentionPolicy: { maximumHeadBytes: 1_000_000, maximumMaterialRecords: 2_000, archiveClosedRecords: true },
  };
}
