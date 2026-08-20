import { createEmploymentCasesFeatureV10 } from "./employment-cases";
import { createCompetitiveMarketFeatureV10 } from "./competitive-market";
import { createCompetitorOrganizationsFeatureV10 } from "./competitor-organizations";
import { createCompetitorStrategyFeatureV10 } from "./competitor-strategy";
import { createExternalWorldFeatureV10 } from "./external-world";
import { createFinanceTreasuryFeatureV10 } from "./finance-treasury";
import { createFinanceTreasuryFeatureV10_1 } from "./finance-treasury-v10-1";
import { createFounderManagementFeatureV10 } from "./founder-management";
import {
  createJurisdictionRulesFeatureV10,
  type EmploymentJurisdictionV10,
} from "./jurisdiction-rules";
import { FeatureRegistryV10 } from "./registry";
import { V10_ENGINE_VERSION, type SimulationStateV10 } from "./types";
import { createWorkforceFeatureV10 } from "./workforce";
import { createMarketIntelligenceFeatureV10 } from "./market-intelligence";
import { V10_1_ENGINE_VERSION, V10_2_ENGINE_VERSION } from "./types";
import { createFinanceTreasuryFeatureV10_2 } from "./finance-treasury-v10-2";
import { createWorkforceFeatureV10_2 } from "./workforce-v10-2";
import { createEmploymentCasesFeatureV10_2 } from "./employment-cases-v10-2";
import { createCommercialObligationsFeatureV10_2 } from "./commercial-obligations";
import { createDeliveryServiceFeatureV10_2 } from "./delivery-service";
import { createCustomersRevenueFeatureV10_2 } from "./customers-revenue";
import { createCreditCovenantsFeatureV10_2 } from "./credit-covenants";
import { createCommercialCasesFeatureV10_2 } from "./commercial-cases";
import { createCustomerOrganizationsFeatureV10_3 } from "./customer-organizations";
import { createCommercialOpportunitiesFeatureV10_3 } from "./commercial-opportunities";
import { createProcurementProcessesFeatureV10_3 } from "./procurement-processes";
import { createContractLifecycleFeatureV10_3 } from "./contract-lifecycle";
import { V10_3_ENGINE_VERSION } from "./types";

export type ProductionFeatureConfigV10 = Record<string, unknown> & {
  "jurisdiction-rules"?: { archetype: EmploymentJurisdictionV10 };
  "finance-and-treasury"?: { openingCash: number };
  "founder-and-management"?: { baseCapacityHours: number };
  "workforce-and-organization"?: {
    startingCandidatePoolPerChannel: number;
    salaryAnchor: number;
    performancePeriodDays: number;
  };
  "employment-cases"?: {
    signalDelayMinDays: number;
    signalDelayMaxDays: number;
  };
};

export function createProductionFeatureRegistryV10(): FeatureRegistryV10 {
  return new FeatureRegistryV10(
    [
      createExternalWorldFeatureV10(),
      createFinanceTreasuryFeatureV10(),
      createFounderManagementFeatureV10(),
      createJurisdictionRulesFeatureV10(),
      createWorkforceFeatureV10(),
      createEmploymentCasesFeatureV10(),
    ],
    V10_ENGINE_VERSION,
  );
}

export function createProductionFeatureRegistryV10_1(): FeatureRegistryV10 {
  return new FeatureRegistryV10(
    [
      createExternalWorldFeatureV10(),
      createFinanceTreasuryFeatureV10_1(),
      createFounderManagementFeatureV10(),
      createJurisdictionRulesFeatureV10(),
      createWorkforceFeatureV10(),
      createEmploymentCasesFeatureV10(),
      createMarketIntelligenceFeatureV10(),
      createCompetitiveMarketFeatureV10(),
      createCompetitorOrganizationsFeatureV10(),
      createCompetitorStrategyFeatureV10(),
    ],
    V10_1_ENGINE_VERSION,
  );
}

export function createProductionFeatureRegistryV10_2(): FeatureRegistryV10 {
  return new FeatureRegistryV10(
    [
      createExternalWorldFeatureV10(),
      createFinanceTreasuryFeatureV10_2(),
      createFounderManagementFeatureV10(),
      createJurisdictionRulesFeatureV10(),
      createWorkforceFeatureV10_2(),
      createEmploymentCasesFeatureV10_2(),
      createCommercialObligationsFeatureV10_2(),
      createDeliveryServiceFeatureV10_2(),
      createCustomersRevenueFeatureV10_2(),
      createCreditCovenantsFeatureV10_2(),
      createCommercialCasesFeatureV10_2(),
      createMarketIntelligenceFeatureV10(),
      createCompetitiveMarketFeatureV10(),
      createCompetitorOrganizationsFeatureV10(),
      createCompetitorStrategyFeatureV10(),
    ],
    V10_2_ENGINE_VERSION,
  );
}

export function createProductionFeatureRegistryV10_3(): FeatureRegistryV10 {
  return new FeatureRegistryV10(
    [
      createExternalWorldFeatureV10(),
      createFinanceTreasuryFeatureV10_2({ procurement: true }),
      createFounderManagementFeatureV10(),
      createJurisdictionRulesFeatureV10(),
      createWorkforceFeatureV10_2(),
      createEmploymentCasesFeatureV10_2(),
      createCommercialObligationsFeatureV10_2({ contractLifecycle: true }),
      createDeliveryServiceFeatureV10_2({ contractLifecycle: true }),
      createCustomerOrganizationsFeatureV10_3(),
      createCommercialOpportunitiesFeatureV10_3(),
      createProcurementProcessesFeatureV10_3(),
      createContractLifecycleFeatureV10_3(),
      createCustomersRevenueFeatureV10_2({ contractLifecycle: true }),
      createCreditCovenantsFeatureV10_2({ customerProcurement: true }),
      createCommercialCasesFeatureV10_2(),
      createMarketIntelligenceFeatureV10(),
      createCompetitiveMarketFeatureV10(),
      createCompetitorOrganizationsFeatureV10(),
      createCompetitorStrategyFeatureV10(),
    ],
    V10_3_ENGINE_VERSION,
  );
}

export function registryForEngineVersionV10(engineVersion: string): FeatureRegistryV10 {
  return engineVersion === V10_3_ENGINE_VERSION
    ? createProductionFeatureRegistryV10_3()
    : engineVersion === V10_2_ENGINE_VERSION
    ? createProductionFeatureRegistryV10_2()
    : engineVersion === V10_1_ENGINE_VERSION
    ? createProductionFeatureRegistryV10_1()
    : createProductionFeatureRegistryV10();
}

export function createProductionFeatureConfigV10(
  input: {
    jurisdiction?: EmploymentJurisdictionV10;
    openingCash?: number;
    salaryAnchor?: number;
  } = {},
): ProductionFeatureConfigV10 {
  return {
    "jurisdiction-rules": { archetype: input.jurisdiction ?? "sea_like" },
    "finance-and-treasury": { openingCash: input.openingCash ?? 500 },
    "founder-and-management": { baseCapacityHours: 42 },
    "workforce-and-organization": {
      startingCandidatePoolPerChannel: 10,
      salaryAnchor: input.salaryAnchor ?? 36_000,
      performancePeriodDays: 30,
    },
    "employment-cases": { signalDelayMinDays: 2, signalDelayMaxDays: 10 },
  };
}

export function createProductionFeatureConfigV10_1(
  input: {
    jurisdiction?: EmploymentJurisdictionV10;
    openingCash?: number;
    salaryAnchor?: number;
  } = {},
): ProductionFeatureConfigV10 {
  return {
    ...createProductionFeatureConfigV10(input),
    "market-intelligence": {},
    "competitive-market": { accountOpportunities: 24, talentSlots: 12, channelSlots: 8, vendorSlots: 10, capitalSlots: 4 },
    "competitor-organizations": { maximumFirms: 4 },
    "competitor-strategy": { minimumCycleDays: 60, maximumCycleDays: 90, maximumAiTurns: 32 },
  };
}

export type CrossDomainProfileV10_2 = "ai_workflow" | "local_services" | "healthcare";

export function createProductionFeatureConfigV10_2(
  input: {
    jurisdiction?: EmploymentJurisdictionV10;
    openingCash?: number;
    salaryAnchor?: number;
    profile?: CrossDomainProfileV10_2;
  } = {},
): ProductionFeatureConfigV10 {
  const profile = input.profile ?? "ai_workflow";
  return {
    ...createProductionFeatureConfigV10_1(input),
    "customers-and-revenue": { profile },
    "commercial-obligations": { profile },
    "delivery-and-service": { profile },
    "credit-and-covenants": { profile },
    "commercial-cases": { profile },
  };
}

export function createProductionFeatureConfigV10_3(
  input: {
    jurisdiction?: EmploymentJurisdictionV10;
    openingCash?: number;
    salaryAnchor?: number;
    profile?: CrossDomainProfileV10_2;
  } = {},
): ProductionFeatureConfigV10 {
  const profile = input.profile ?? "ai_workflow";
  return {
    ...createProductionFeatureConfigV10_2(input),
    "customer-organizations": { profile },
    "commercial-opportunities": { profile },
    "procurement-processes": { profile },
    "contract-lifecycle": { profile },
  };
}

export type ClientSimulationStateV10 = {
  kernel: Pick<
    SimulationStateV10["kernel"],
    | "schemaVersion"
    | "engineVersion"
    | "scenarioVersionId"
    | "jurisdictionRuleVersionId"
    | "companyName"
    | "founderProfileId"
    | "challengeProfile"
    | "campaignClass"
    | "nonComparable"
    | "stage"
    | "status"
    | "simulationDay"
    | "fiscalPeriod"
    | "version"
    | "eventSequence"
    | "endingReason"
  >;
  manifest: SimulationStateV10["manifest"];
  features: Record<string, unknown>;
};

export function projectSimulationStateV10(
  state: SimulationStateV10,
  registry = registryForEngineVersionV10(state.kernel.engineVersion),
): ClientSimulationStateV10 {
  return {
    kernel: {
      schemaVersion: state.kernel.schemaVersion,
      engineVersion: state.kernel.engineVersion,
      scenarioVersionId: state.kernel.scenarioVersionId,
      jurisdictionRuleVersionId: state.kernel.jurisdictionRuleVersionId,
      companyName: state.kernel.companyName,
      founderProfileId: state.kernel.founderProfileId,
      challengeProfile: state.kernel.challengeProfile,
      campaignClass: state.kernel.campaignClass,
      nonComparable: state.kernel.nonComparable,
      stage: state.kernel.stage,
      status: state.kernel.status,
      simulationDay: state.kernel.simulationDay,
      fiscalPeriod: state.kernel.fiscalPeriod,
      version: state.kernel.version,
      eventSequence: state.kernel.eventSequence,
      endingReason: state.kernel.endingReason,
    },
    manifest: structuredClone(state.manifest),
    features: Object.fromEntries(
      registry.ordered.map((feature) => [
        feature.id,
        registry.project(state, feature.id),
      ]),
    ),
  };
}
