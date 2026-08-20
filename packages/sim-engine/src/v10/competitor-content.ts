import { marketSeedForScenario } from "../content/market-dossiers";
import type { PublicSourceFactV10 } from "./types";

export type CompetitorArchetypeV10 =
  | "venture_startup"
  | "bootstrapped_specialist"
  | "scaled_saas"
  | "platform_business_unit";

export type CompetitorDoctrineV10 =
  | "product_led"
  | "price_disruptor"
  | "service_led"
  | "channel_led"
  | "platform_defense"
  | "capital_conservative";

export type FictionalTwinTemplateV10 = {
  id: string;
  displayName: string;
  baselineSubjectId: string;
  disclaimer: string;
  archetype: CompetitorArchetypeV10;
  doctrine: CompetitorDoctrineV10;
  positioning: string;
  targetSegments: string[];
  channels: string[];
  capabilitySignals: string[];
  sourceFacts: PublicSourceFactV10[];
  calibrationVersion: "fictional-twins-v1";
};

const identities: Record<string, Array<Pick<FictionalTwinTemplateV10,
  "id" | "displayName" | "archetype" | "doctrine"
>>> = {
  "ai-workflow-automation": [
    { id: "relay-forge", displayName: "RelayForge", archetype: "scaled_saas", doctrine: "platform_defense" },
    { id: "canvas-flow", displayName: "CanvasFlow", archetype: "venture_startup", doctrine: "product_led" },
    { id: "northstar-automate", displayName: "Northstar Automate Unit", archetype: "platform_business_unit", doctrine: "channel_led" },
    { id: "node-pilot", displayName: "NodePilot", archetype: "bootstrapped_specialist", doctrine: "price_disruptor" },
  ],
  "local-services-saas": [
    { id: "field-nest", displayName: "FieldNest", archetype: "scaled_saas", doctrine: "service_led" },
    { id: "crew-ledger", displayName: "CrewLedger", archetype: "venture_startup", doctrine: "price_disruptor" },
    { id: "service-orbit", displayName: "ServiceOrbit Unit", archetype: "platform_business_unit", doctrine: "platform_defense" },
    { id: "book-square", displayName: "BookSquare", archetype: "bootstrapped_specialist", doctrine: "channel_led" },
  ],
  "healthcare-operations": [
    { id: "care-weave", displayName: "CareWeave Unit", archetype: "platform_business_unit", doctrine: "platform_defense" },
    { id: "clinical-orbit", displayName: "ClinicalOrbit Unit", archetype: "platform_business_unit", doctrine: "channel_led" },
    { id: "practice-bridge", displayName: "PracticeBridge", archetype: "scaled_saas", doctrine: "service_led" },
    { id: "sync-health-ops", displayName: "SyncHealth Ops", archetype: "venture_startup", doctrine: "product_led" },
  ],
};

function scenarioId(versionId: string): string {
  return versionId.split("@")[0];
}

export function fictionalTwinTemplatesV10(
  scenarioVersionId: string,
): FictionalTwinTemplateV10[] {
  const id = scenarioId(scenarioVersionId);
  const seed = marketSeedForScenario(id);
  const twinIdentities = identities[id] ?? identities["ai-workflow-automation"];
  return twinIdentities.map((identity, index) => {
    const profile = seed.profiles[index];
    const sourceFacts = seed.dossier.facts
      .filter((fact) => fact.subjectId === profile.id && fact.status === "verified")
      .flatMap((fact): PublicSourceFactV10[] => fact.sourceIds.flatMap((sourceId) => {
        const source = seed.dossier.sources.find((item) => item.id === sourceId);
        if (!source) return [];
        return [{
          id: `${identity.id}:${fact.id}:${sourceId}`,
          sourceType: "verified_public_fact",
          subjectId: identity.id,
          kind: fact.kind,
          statement: fact.statement,
          title: source.title,
          publisher: source.publisher,
          url: source.url,
          observedAt: fact.observedAt,
          retrievedAt: source.retrievedAt,
        }];
      }));
    return {
      ...identity,
      baselineSubjectId: profile.id,
      disclaimer: `A fictional simulated business unit informed by cited public market facts about ${profile.publicName}; it does not represent that company's private state or real behavior.`,
      positioning: profile.positioning,
      targetSegments: [...profile.targetSegments],
      channels: [...profile.channels],
      capabilitySignals: [...profile.capabilitySignals],
      sourceFacts,
      calibrationVersion: "fictional-twins-v1",
    };
  });
}
