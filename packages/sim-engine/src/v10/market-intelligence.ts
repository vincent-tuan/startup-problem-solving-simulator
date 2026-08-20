import { z } from "zod";
import type { MarketDossierVersion } from "../types";
import type { SimulationFeatureV10 } from "./contracts";
import { fictionalTwinTemplatesV10 } from "./competitor-content";
import type { PublicSourceFactV10 } from "./types";

const sourceFactSchema = z.object({
  id: z.string(),
  sourceType: z.literal("verified_public_fact"),
  subjectId: z.string(),
  kind: z.string(),
  statement: z.string(),
  title: z.string(),
  publisher: z.string(),
  url: z.string().url(),
  observedAt: z.string(),
  retrievedAt: z.string(),
}).strict();

const twinSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  baselineSubjectId: z.string(),
  disclaimer: z.string(),
  archetype: z.enum(["venture_startup", "bootstrapped_specialist", "scaled_saas", "platform_business_unit"]),
  doctrine: z.enum(["product_led", "price_disruptor", "service_led", "channel_led", "platform_defense", "capital_conservative"]),
  positioning: z.string(),
  targetSegments: z.array(z.string()),
  channels: z.array(z.string()),
  capabilitySignals: z.array(z.string()),
  sourceFacts: z.array(sourceFactSchema).max(20),
  calibrationVersion: z.literal("fictional-twins-v1"),
}).strict();

export const marketIntelligencePublicStateSchemaV10 = z.object({
  intelligenceVersion: z.literal("market-intelligence-v2"),
  dossierLabel: z.literal("verified_public_baseline"),
  fictionalTwins: z.array(twinSchema).length(4),
  supplementalFacts: z.array(sourceFactSchema).max(100),
  lastUpdatedDay: z.number().int().nonnegative(),
}).strict();
export type MarketIntelligencePublicStateV10 = z.infer<typeof marketIntelligencePublicStateSchemaV10>;

const privateStateSchema = z.object({
  appliedFactIds: z.array(z.string()).max(500),
}).strict();
type MarketIntelligencePrivateStateV10 = z.infer<typeof privateStateSchema>;

export function publicFactsFromMarketDossierV10(
  dossier: MarketDossierVersion,
): PublicSourceFactV10[] {
  return dossier.facts
    .filter((fact) => fact.status === "verified")
    .flatMap((fact) => fact.sourceIds.flatMap((sourceId) => {
      const source = dossier.sources.find((candidate) => candidate.id === sourceId);
      if (!source) return [];
      return [{
        id: `v10:${dossier.id}:${fact.id}:${source.id}`,
        sourceType: "verified_public_fact" as const,
        subjectId: fact.subjectId,
        kind: fact.kind,
        statement: fact.statement,
        title: source.title,
        publisher: source.publisher,
        url: source.url,
        observedAt: fact.observedAt,
        retrievedAt: source.retrievedAt,
      }];
    }))
    .slice(0, 100);
}

export function createMarketIntelligenceFeatureV10(): SimulationFeatureV10<
  MarketIntelligencePublicStateV10,
  MarketIntelligencePrivateStateV10,
  Record<string, never>
> {
  return {
    id: "market-intelligence",
    version: "2.0.0",
    dependencies: [{ id: "external-world", versionRange: "^1.0.0" }],
    compatibleEngineRange: ">=10.1.0 <11.0.0",
    configSchema: z.object({}).strict().default({}),
    publicStateSchema: marketIntelligencePublicStateSchemaV10,
    privateStateSchema,
    initialize: ({ kernel }) => ({
      public: {
        intelligenceVersion: "market-intelligence-v2",
        dossierLabel: "verified_public_baseline",
        fictionalTwins: fictionalTwinTemplatesV10(kernel.scenarioVersionId),
        supplementalFacts: [],
        lastUpdatedDay: kernel.simulationDay,
      },
      private: { appliedFactIds: [] },
    }),
    commands: {
      "system.market_dossier.apply_v10": (context) => {
        if (context.command.type !== "system.market_dossier.apply_v10") return;
        let added = 0;
        for (const factInput of context.command.payload.facts) {
          const fact = sourceFactSchema.parse(factInput);
          if (context.ownState.private.appliedFactIds.includes(fact.id)) continue;
          context.ownState.private.appliedFactIds.push(fact.id);
          context.ownState.public.supplementalFacts.push(fact);
          added += 1;
        }
        context.ownState.private.appliedFactIds = context.ownState.private.appliedFactIds.slice(-500);
        context.ownState.public.supplementalFacts = context.ownState.public.supplementalFacts.slice(-100);
        context.ownState.public.lastUpdatedDay = context.kernel.simulationDay;
        context.emit({
          type: "market-intelligence.dossier_applied",
          visibility: "public",
          sourceId: context.command.payload.dossierId,
          payload: {
            dossierId: context.command.payload.dossierId,
            factCount: added,
            provenance: "verified_public_fact",
          },
        });
        return { checkpointRequired: true };
      },
    },
    effects: {},
    queries: [{
      id: "market-intelligence.fictional-twins",
      resolve: ({ ownState }) => structuredClone(ownState.public.fictionalTwins),
    }, {
      id: "market-intelligence.public-signals",
      resolve: ({ ownState }) => structuredClone([
        ...ownState.public.fictionalTwins.flatMap((twin) => twin.sourceFacts),
        ...ownState.public.supplementalFacts,
      ]),
    }],
    eventSubscriptions: [{
      id: "market-intelligence-records-public-facts",
      eventType: "external-world.public_fact_recorded",
      handle: (context, event) => {
        const parsed = sourceFactSchema.parse(event.payload);
        if (context.ownState.private.appliedFactIds.includes(parsed.id)) return;
        context.ownState.private.appliedFactIds.push(parsed.id);
        context.ownState.public.supplementalFacts.push(parsed);
        context.ownState.public.supplementalFacts = context.ownState.public.supplementalFacts.slice(-100);
        context.ownState.public.lastUpdatedDay = context.kernel.simulationDay;
      },
    }],
    hooks: {},
    invariants: [{
      id: "market-intelligence-citation-integrity",
      check: ({ ownState }) => {
        const facts = [
          ...ownState.public.fictionalTwins.flatMap((twin) => twin.sourceFacts),
          ...ownState.public.supplementalFacts,
        ];
        if (facts.some((fact) => !fact.url || !fact.publisher || !fact.retrievedAt)) {
          throw new Error("MARKET_FACT_CITATION_MISSING");
        }
        if (new Set(ownState.private.appliedFactIds).size !== ownState.private.appliedFactIds.length) {
          throw new Error("MARKET_FACT_DUPLICATED");
        }
      },
    }],
    projectionPolicy: {
      schema: marketIntelligencePublicStateSchemaV10,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: ["appliedFactIds"],
    },
    snapshotPolicy: { mode: "period_close", maximumCommandsBetweenSnapshots: 30 },
    retentionPolicy: { maximumHeadBytes: 500_000, maximumMaterialRecords: 500, archiveClosedRecords: true },
  };
}
