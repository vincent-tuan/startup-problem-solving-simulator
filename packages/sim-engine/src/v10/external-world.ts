import { z } from "zod";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";
import type { PublicSourceFactV10 } from "./types";

export const macroRegimeSchemaV10 = z.enum([
  "expansion",
  "tightening",
  "slowdown",
  "recession",
  "credit_stress",
  "recovery",
  "sector_shock",
]);
export type MacroRegimeV10 = z.infer<typeof macroRegimeSchemaV10>;

export const externalFactorKeySchemaV10 = z.enum([
  "demand",
  "customerLiquidity",
  "collectionDelay",
  "churnPressure",
  "wagePressure",
  "talentAvailability",
  "interestRate",
  "fxVolatility",
  "vendorInflation",
  "investorRiskAppetite",
  "valuationMultiple",
  "regulatoryEnforcement",
  "procurementDelay",
  "competitorDistress",
  "platformPolicyRisk",
  "cyberThreat",
  "reputationVolatility",
  "supplyChainStress",
]);
export type ExternalFactorKeyV10 = z.infer<typeof externalFactorKeySchemaV10>;

const externalFactorsSchemaV10 = z.object({
  demand: z.number().min(-3).max(3),
  customerLiquidity: z.number().min(-3).max(3),
  collectionDelay: z.number().min(-3).max(3),
  churnPressure: z.number().min(-3).max(3),
  wagePressure: z.number().min(-3).max(3),
  talentAvailability: z.number().min(-3).max(3),
  interestRate: z.number().min(-3).max(3),
  fxVolatility: z.number().min(-3).max(3),
  vendorInflation: z.number().min(-3).max(3),
  investorRiskAppetite: z.number().min(-3).max(3),
  valuationMultiple: z.number().min(-3).max(3),
  regulatoryEnforcement: z.number().min(-3).max(3),
  procurementDelay: z.number().min(-3).max(3),
  competitorDistress: z.number().min(-3).max(3),
  platformPolicyRisk: z.number().min(-3).max(3),
  cyberThreat: z.number().min(-3).max(3),
  reputationVolatility: z.number().min(-3).max(3),
  supplyChainStress: z.number().min(-3).max(3),
});
export type ExternalFactorsV10 = z.infer<typeof externalFactorsSchemaV10>;

const publicFactSchemaV10 = z.object({
  id: z.string().min(3).max(160),
  sourceType: z.literal("verified_public_fact"),
  subjectId: z.string().min(1).max(160),
  kind: z.string().min(1).max(80),
  statement: z.string().min(3).max(1200),
  title: z.string().min(1).max(300),
  publisher: z.string().min(1).max(160),
  url: z.string().url().max(2048),
  observedAt: z.string().min(10).max(64),
  retrievedAt: z.string().min(10).max(64),
});

const indicatorSchemaV10 = z.object({
  key: externalFactorKeySchemaV10,
  direction: z.enum(["down", "flat", "up"]),
  magnitude: z.enum(["mild", "material", "severe"]),
  provenance: z.literal("simulated_world_observation"),
});

export const externalWorldPublicStateSchemaV10 = z.object({
  worldVersion: z.literal("external-world-v1"),
  observation: z.object({
    simulationDay: z.number().int().nonnegative(),
    label: z.literal("simulated_macro_regime"),
    observedRegime: macroRegimeSchemaV10.or(z.literal("uncertain")),
    indicators: z.array(indicatorSchemaV10).max(18),
  }),
  publicFacts: z.array(publicFactSchemaV10).max(100),
  lastExternalInputRef: z.string().max(200).nullable(),
});
export type ExternalWorldPublicStateV10 = z.infer<typeof externalWorldPublicStateSchemaV10>;

const defaultSensitivity = Object.fromEntries(
  externalFactorKeySchemaV10.options.map((key: ExternalFactorKeyV10) => [key, 1]),
) as Record<ExternalFactorKeyV10, number>;

export const externalWorldConfigSchemaV10 = z.object({
  observationLagDays: z.number().int().min(0).max(180).default(14),
  scenarioSensitivity: z.record(externalFactorKeySchemaV10, z.number().min(0).max(2.5)).default(defaultSensitivity),
}).default({
  observationLagDays: 14,
  scenarioSensitivity: defaultSensitivity,
});
export type ExternalWorldConfigV10 = z.infer<typeof externalWorldConfigSchemaV10>;

export const externalWorldPrivateStateSchemaV10 = z.object({
  regime: macroRegimeSchemaV10,
  regimeEnteredDay: z.number().int().nonnegative(),
  nextObservationDay: z.number().int().positive(),
  factors: externalFactorsSchemaV10,
  config: externalWorldConfigSchemaV10,
  history: z.array(z.object({
    day: z.number().int().nonnegative(),
    from: macroRegimeSchemaV10,
    to: macroRegimeSchemaV10,
    factors: externalFactorsSchemaV10,
  })).max(36),
});
export type ExternalWorldPrivateStateV10 = z.infer<typeof externalWorldPrivateStateSchemaV10>;

export type ExternalWorldDomainMultipliersV10 = {
  regime: MacroRegimeV10;
  demand: number;
  customerLiquidity: number;
  collectionDelay: number;
  churnPressure: number;
  wagePressure: number;
  talentAvailability: number;
  interestCost: number;
  fxVolatility: number;
  vendorCost: number;
  fundingAvailability: number;
  valuation: number;
  regulatoryPressure: number;
  procurementDelay: number;
  competitorDistress: number;
  platformRisk: number;
  cyberIncidentPressure: number;
  reputationVolatility: number;
  supplyChainDelay: number;
};

const FACTOR_KEYS = externalFactorKeySchemaV10.options as readonly ExternalFactorKeyV10[];

const ZERO_FACTORS: ExternalFactorsV10 = {
  demand: 0,
  customerLiquidity: 0,
  collectionDelay: 0,
  churnPressure: 0,
  wagePressure: 0,
  talentAvailability: 0,
  interestRate: 0,
  fxVolatility: 0,
  vendorInflation: 0,
  investorRiskAppetite: 0,
  valuationMultiple: 0,
  regulatoryEnforcement: 0,
  procurementDelay: 0,
  competitorDistress: 0,
  platformPolicyRisk: 0,
  cyberThreat: 0,
  reputationVolatility: 0,
  supplyChainStress: 0,
};

const TARGETS: Record<MacroRegimeV10, ExternalFactorsV10> = {
  expansion: {
    demand: 1.1, customerLiquidity: 0.9, collectionDelay: -0.7, churnPressure: -0.6,
    wagePressure: 1, talentAvailability: -0.7, interestRate: -0.2, fxVolatility: -0.4,
    vendorInflation: 0.5, investorRiskAppetite: 1.2, valuationMultiple: 1.1,
    regulatoryEnforcement: -0.2, procurementDelay: -0.5, competitorDistress: -0.7,
    platformPolicyRisk: -0.2, cyberThreat: 0.1, reputationVolatility: -0.3, supplyChainStress: -0.4,
  },
  tightening: {
    demand: 0.2, customerLiquidity: -0.2, collectionDelay: 0.3, churnPressure: 0.2,
    wagePressure: 0.4, talentAvailability: 0.1, interestRate: 1.3, fxVolatility: 0.5,
    vendorInflation: 0.5, investorRiskAppetite: -0.8, valuationMultiple: -0.8,
    regulatoryEnforcement: 0.2, procurementDelay: 0.4, competitorDistress: 0.2,
    platformPolicyRisk: 0.1, cyberThreat: 0.2, reputationVolatility: 0.3, supplyChainStress: 0.2,
  },
  slowdown: {
    demand: -0.7, customerLiquidity: -0.7, collectionDelay: 0.8, churnPressure: 0.7,
    wagePressure: -0.2, talentAvailability: 0.7, interestRate: 0.5, fxVolatility: 0.6,
    vendorInflation: 0.2, investorRiskAppetite: -0.9, valuationMultiple: -0.8,
    regulatoryEnforcement: 0.1, procurementDelay: 0.9, competitorDistress: 0.8,
    platformPolicyRisk: 0.2, cyberThreat: 0.3, reputationVolatility: 0.5, supplyChainStress: 0.3,
  },
  recession: {
    demand: -1.5, customerLiquidity: -1.5, collectionDelay: 1.5, churnPressure: 1.4,
    wagePressure: -0.9, talentAvailability: 1.3, interestRate: 0.1, fxVolatility: 1.1,
    vendorInflation: -0.2, investorRiskAppetite: -1.5, valuationMultiple: -1.4,
    regulatoryEnforcement: 0.2, procurementDelay: 1.5, competitorDistress: 1.6,
    platformPolicyRisk: 0.4, cyberThreat: 0.5, reputationVolatility: 0.9, supplyChainStress: 0.7,
  },
  credit_stress: {
    demand: -1.1, customerLiquidity: -1.8, collectionDelay: 1.8, churnPressure: 1.1,
    wagePressure: -0.6, talentAvailability: 1, interestRate: 1.8, fxVolatility: 1.6,
    vendorInflation: 0.1, investorRiskAppetite: -1.9, valuationMultiple: -1.7,
    regulatoryEnforcement: 0.5, procurementDelay: 1.4, competitorDistress: 1.8,
    platformPolicyRisk: 0.5, cyberThreat: 0.6, reputationVolatility: 1.1, supplyChainStress: 0.8,
  },
  recovery: {
    demand: 0.6, customerLiquidity: 0.3, collectionDelay: -0.1, churnPressure: -0.2,
    wagePressure: 0.2, talentAvailability: 0.3, interestRate: -0.4, fxVolatility: 0.1,
    vendorInflation: 0.2, investorRiskAppetite: 0.5, valuationMultiple: 0.4,
    regulatoryEnforcement: 0, procurementDelay: 0.1, competitorDistress: 0.3,
    platformPolicyRisk: 0, cyberThreat: 0.2, reputationVolatility: 0.1, supplyChainStress: 0.1,
  },
  sector_shock: {
    demand: -0.8, customerLiquidity: -0.4, collectionDelay: 0.6, churnPressure: 0.9,
    wagePressure: -0.1, talentAvailability: 0.5, interestRate: 0.2, fxVolatility: 0.8,
    vendorInflation: 0.8, investorRiskAppetite: -1.1, valuationMultiple: -1,
    regulatoryEnforcement: 1.2, procurementDelay: 1.1, competitorDistress: 1,
    platformPolicyRisk: 1.4, cyberThreat: 1.1, reputationVolatility: 1.3, supplyChainStress: 1.1,
  },
};

const TRANSITIONS: Record<MacroRegimeV10, Record<MacroRegimeV10, number>> = {
  expansion: { expansion: 70, tightening: 11, slowdown: 7, recession: 1, credit_stress: 1, recovery: 6, sector_shock: 4 },
  tightening: { expansion: 12, tightening: 54, slowdown: 17, recession: 4, credit_stress: 5, recovery: 5, sector_shock: 3 },
  slowdown: { expansion: 4, tightening: 10, slowdown: 52, recession: 13, credit_stress: 7, recovery: 10, sector_shock: 4 },
  recession: { expansion: 1, tightening: 2, slowdown: 14, recession: 51, credit_stress: 12, recovery: 17, sector_shock: 3 },
  credit_stress: { expansion: 1, tightening: 3, slowdown: 10, recession: 18, credit_stress: 50, recovery: 14, sector_shock: 4 },
  recovery: { expansion: 22, tightening: 7, slowdown: 8, recession: 2, credit_stress: 2, recovery: 55, sector_shock: 4 },
  sector_shock: { expansion: 4, tightening: 5, slowdown: 14, recession: 10, credit_stress: 8, recovery: 13, sector_shock: 46 },
};

const COMMON_LOADINGS: Record<ExternalFactorKeyV10, number> = {
  demand: 0.8,
  customerLiquidity: 0.8,
  collectionDelay: -0.75,
  churnPressure: -0.7,
  wagePressure: 0.45,
  talentAvailability: -0.45,
  interestRate: -0.3,
  fxVolatility: -0.55,
  vendorInflation: 0.35,
  investorRiskAppetite: 0.8,
  valuationMultiple: 0.8,
  regulatoryEnforcement: -0.15,
  procurementDelay: -0.65,
  competitorDistress: -0.7,
  platformPolicyRisk: -0.25,
  cyberThreat: -0.2,
  reputationVolatility: -0.45,
  supplyChainStress: -0.4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rounded(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function indicator(value: number): { direction: "down" | "flat" | "up"; magnitude: "mild" | "material" | "severe" } {
  const absolute = Math.abs(value);
  return {
    direction: absolute < 0.2 ? "flat" : value > 0 ? "up" : "down",
    magnitude: absolute < 0.75 ? "mild" : absolute < 1.5 ? "material" : "severe",
  };
}

function multipliers(privateState: ExternalWorldPrivateStateV10): ExternalWorldDomainMultipliersV10 {
  const factor = privateState.factors;
  return {
    regime: privateState.regime,
    demand: clamp(1 + factor.demand * 0.18, 0.45, 1.55),
    customerLiquidity: clamp(1 + factor.customerLiquidity * 0.2, 0.35, 1.6),
    collectionDelay: clamp(1 + factor.collectionDelay * 0.28, 0.55, 2.2),
    churnPressure: clamp(1 + factor.churnPressure * 0.24, 0.55, 1.9),
    wagePressure: clamp(1 + factor.wagePressure * 0.18, 0.55, 1.65),
    talentAvailability: clamp(1 + factor.talentAvailability * 0.2, 0.45, 1.7),
    interestCost: clamp(1 + factor.interestRate * 0.3, 0.35, 2.2),
    fxVolatility: clamp(1 + factor.fxVolatility * 0.28, 0.5, 2.1),
    vendorCost: clamp(1 + factor.vendorInflation * 0.2, 0.6, 1.75),
    fundingAvailability: clamp(1 + factor.investorRiskAppetite * 0.3, 0.2, 1.8),
    valuation: clamp(1 + factor.valuationMultiple * 0.28, 0.25, 1.8),
    regulatoryPressure: clamp(1 + factor.regulatoryEnforcement * 0.25, 0.55, 2),
    procurementDelay: clamp(1 + factor.procurementDelay * 0.25, 0.55, 2),
    competitorDistress: clamp(1 + factor.competitorDistress * 0.24, 0.5, 1.9),
    platformRisk: clamp(1 + factor.platformPolicyRisk * 0.24, 0.5, 1.9),
    cyberIncidentPressure: clamp(1 + factor.cyberThreat * 0.25, 0.5, 2),
    reputationVolatility: clamp(1 + factor.reputationVolatility * 0.24, 0.5, 1.9),
    supplyChainDelay: clamp(1 + factor.supplyChainStress * 0.25, 0.55, 2),
  };
}

function publishObservation(
  context: FeatureRuntimeContextV10<ExternalWorldPublicStateV10, ExternalWorldPrivateStateV10>,
): void {
  const { public: publicState, private: privateState } = context.ownState;
  publicState.observation = {
    simulationDay: context.kernel.simulationDay,
    label: "simulated_macro_regime",
    observedRegime: privateState.regime,
    indicators: FACTOR_KEYS.map((key) => ({
      key,
      ...indicator(privateState.factors[key]),
      provenance: "simulated_world_observation" as const,
    })),
  };
  context.emit({
    type: "external-world.observation_published",
    visibility: "public",
    sourceId: `macro-observation-${context.kernel.simulationDay}`,
    payload: structuredClone(publicState.observation),
  });
}

function advanceExternalWorld(
  context: FeatureRuntimeContextV10<ExternalWorldPublicStateV10, ExternalWorldPrivateStateV10>,
  elapsedDays: number,
  config: ExternalWorldConfigV10,
): void {
  const privateState = context.ownState.private;
  let remaining = elapsedDays;
  while (remaining > 0) {
    const stepDays = Math.min(30, remaining);
    remaining -= stepDays;
    const from = privateState.regime;
    const stayBoost = Math.max(0, 30 - stepDays) * 2.2;
    const transitionWeights = { ...TRANSITIONS[from], [from]: TRANSITIONS[from][from] + stayBoost };
    const next = context.rng.categorical(transitionWeights);
    const commonShock = context.rng.normal(0, Math.sqrt(stepDays / 30) * 0.18);
    const target = TARGETS[next];
    const reversion = Math.exp(-stepDays / 105);
    const nextFactors = { ...privateState.factors };
    for (const key of FACTOR_KEYS) {
      const sensitivity = config.scenarioSensitivity[key] ?? 1;
      const idiosyncratic = context.rng.normal(0, 0.08 * Math.sqrt(stepDays / 30));
      const correlatedShock = commonShock * COMMON_LOADINGS[key] + idiosyncratic;
      nextFactors[key] = rounded(clamp(
        privateState.factors[key] * reversion
          + target[key] * sensitivity * (1 - reversion)
          + correlatedShock,
        -3,
        3,
      ));
    }
    privateState.factors = nextFactors;
    privateState.regime = next;
    if (next !== from) {
      privateState.regimeEnteredDay = context.kernel.simulationDay;
      context.emit({
        type: "external-world.regime_changed",
        visibility: "internal",
        sourceId: `macro-transition-${context.kernel.simulationDay}`,
        payload: { from, to: next, sampledAtDay: context.kernel.simulationDay },
      });
    }
    privateState.history.push({
      day: context.kernel.simulationDay,
      from,
      to: next,
      factors: structuredClone(nextFactors),
    });
    privateState.history = privateState.history.slice(-36);
  }

  if (context.kernel.simulationDay >= privateState.nextObservationDay) {
    publishObservation(context);
    privateState.nextObservationDay = context.kernel.simulationDay + Math.max(1, config.observationLagDays || 30);
  }
}

export function createExternalWorldFeatureV10(
  rawConfig?: ExternalWorldConfigV10,
): SimulationFeatureV10<ExternalWorldPublicStateV10, ExternalWorldPrivateStateV10, ExternalWorldConfigV10> {
  const defaultConfig = externalWorldConfigSchemaV10.parse(rawConfig);
  const featureConfigSchema = externalWorldConfigSchemaV10.default(defaultConfig);
  return {
    id: "external-world",
    version: "1.0.0",
    dependencies: [],
    compatibleEngineRange: ">=10.0.0 <11.0.0",
    configSchema: featureConfigSchema,
    publicStateSchema: externalWorldPublicStateSchemaV10,
    privateStateSchema: externalWorldPrivateStateSchemaV10,
    initialize: ({ kernel, config }) => ({
      public: {
        worldVersion: "external-world-v1",
        observation: {
          simulationDay: kernel.simulationDay,
          label: "simulated_macro_regime",
          observedRegime: "uncertain",
          indicators: [],
        },
        publicFacts: [],
        lastExternalInputRef: null,
      },
      private: {
        regime: "recovery",
        regimeEnteredDay: kernel.simulationDay,
        nextObservationDay: kernel.simulationDay + Math.max(1, config.observationLagDays),
        factors: structuredClone(ZERO_FACTORS),
        config: structuredClone(config),
        history: [],
      },
    }),
    commands: {
      "external_world.record_public_fact": (context) => {
        if (context.command.type !== "external_world.record_public_fact") return;
        if (context.command.actor !== "system") throw new Error("SYSTEM_COMMAND_REQUIRED");
        const fact = publicFactSchemaV10.parse(context.command.payload.fact) as PublicSourceFactV10;
        const current = context.ownState.public.publicFacts;
        const existing = current.findIndex((item: PublicSourceFactV10) => item.id === fact.id);
        if (existing >= 0) current[existing] = fact;
        else current.push(fact);
        context.ownState.public.publicFacts = current.slice(-100);
        context.ownState.public.lastExternalInputRef = context.command.payload.externalInputRef;
        context.emit({
          type: "external-world.public_fact_recorded",
          visibility: "public",
          sourceId: fact.id,
          payload: fact,
        });
      },
    },
    effects: {},
    queries: [
      {
        id: "external-world.domain-factors",
        resolve: ({ ownState }) => multipliers(ownState.private),
      },
      {
        id: "external-world.public-observation",
        resolve: ({ ownState }) => structuredClone(ownState.public.observation),
      },
    ],
    eventSubscriptions: [],
    hooks: {
      after_scheduled_effects: (context) => {
        if (context.elapsedDays <= 0) return;
        advanceExternalWorld(context, context.elapsedDays, context.ownState.private.config);
      },
    },
    invariants: [
      {
        id: "external-world-factors-finite-and-bounded",
        check: ({ ownState }) => {
          for (const key of FACTOR_KEYS) {
            const value = ownState.private.factors[key];
            if (!Number.isFinite(value) || value < -3 || value > 3) {
              throw new Error(`EXTERNAL_FACTOR_OUT_OF_RANGE:${key}:${value}`);
            }
          }
        },
      },
      {
        id: "external-world-public-fact-identities-unique",
        check: ({ ownState }) => {
          const ids = ownState.public.publicFacts.map((fact: PublicSourceFactV10) => fact.id);
          if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_PUBLIC_FACT_ID");
        },
      },
    ],
    projectionPolicy: {
      schema: externalWorldPublicStateSchemaV10,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: ["factors", "transitionWeights", "sampledOutcome", "probability", "eligibility", "private"],
    },
    snapshotPolicy: {
      mode: "period_close",
      maximumCommandsBetweenSnapshots: 100,
    },
    retentionPolicy: {
      maximumHeadBytes: 1_000_000,
      maximumMaterialRecords: 136,
      archiveClosedRecords: true,
    },
  };
}
