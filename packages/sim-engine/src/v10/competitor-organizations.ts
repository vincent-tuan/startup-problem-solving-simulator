import { z } from "zod";
import {
  accountingBalanceV10,
  assertLedgerV10,
  createEntityLedgerV10,
  postAccountingEntryV10,
  type EntityLedgerV10,
} from "./accounting-core";
import {
  assertCapabilityGraphV10,
  capabilityDependenciesSatisfiedV10,
} from "./capability-graph";
import {
  assertCapacityV10,
  availableCapacityV10,
  releaseCapacityV10,
  reserveCapacityV10,
} from "./capacity-model";
import type { FictionalTwinTemplateV10 } from "./competitor-content";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";
import type { ExternalWorldDomainMultipliersV10 } from "./external-world";
import {
  PIPELINE_STAGES_V10,
  transitionPipelineStageV10,
} from "./pipeline-physics";
import {
  competitorStrategicPlanSchemaV10,
  hasDependencyCycleV10,
  type CompetitorStrategicPlanV10,
} from "./strategy-grammar";

const lifecycleSchema = z.enum(["active", "distressed", "restructuring", "acquired", "insolvent", "exited", "unit_deprioritized"]);
const teamFunctionSchema = z.enum(["product", "engineering", "sales", "service", "operations"]);
const signalBandSchema = z.enum(["low", "guarded", "material", "strong"]);

const sourceFactSchema = z.object({
  id: z.string(), sourceType: z.literal("verified_public_fact"), subjectId: z.string(), kind: z.string(),
  statement: z.string(), title: z.string(), publisher: z.string(), url: z.string().url(), observedAt: z.string(), retrievedAt: z.string(),
}).strict();

const observedFirmSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  executiveName: z.string(),
  archetype: z.enum(["venture_startup", "bootstrapped_specialist", "scaled_saas", "platform_business_unit"]),
  positioning: z.string(),
  lifecycleSignal: z.enum(["operating", "pressure_visible", "restructuring_visible", "no_longer_competing"]),
  headcountEstimate: z.object({ low: z.number().int().nonnegative(), high: z.number().int().nonnegative(), confidence: z.number().min(0).max(100) }),
  commercialMomentum: signalBandSchema,
  implementationCapacity: signalBandSchema,
  productPace: signalBandSchema,
  cashPressureSignal: z.enum(["unknown", "stable", "watch", "material"]),
  visiblePriceBand: z.object({ low: z.number().nonnegative(), high: z.number().nonnegative(), confidence: z.number().min(0).max(100) }),
  visibleCapabilities: z.array(z.string()).max(24),
  lastObservedDay: z.number().int().nonnegative(),
  disclaimer: z.string(),
  sourceFacts: z.array(sourceFactSchema).max(20),
}).strict();

const publicSignalSchema = z.object({
  id: z.string(),
  firmId: z.string(),
  day: z.number().int().nonnegative(),
  kind: z.enum(["pricing", "product", "hiring", "partnership", "funding", "distress", "account", "exit"]),
  summary: z.string(),
  confidence: z.number().min(0).max(100),
  provenance: z.literal("simulated_observation"),
}).strict();

export const competitorOrganizationsPublicStateSchemaV10 = z.object({
  organizationVersion: z.literal("competitor-organizations-v1"),
  firms: z.array(observedFirmSchema).length(4),
  signals: z.array(publicSignalSchema).max(160),
  lastOperatingDay: z.number().int().nonnegative(),
}).strict();
export type CompetitorOrganizationsPublicStateV10 = z.infer<typeof competitorOrganizationsPublicStateSchemaV10>;

const ledgerSchema = z.object({
  entries: z.array(z.object({
    id: z.string(), day: z.number().int().nonnegative(), memo: z.string(),
    lines: z.array(z.object({ account: z.string(), debit: z.number().finite().nonnegative(), credit: z.number().finite().nonnegative() })).min(2),
  })).max(2_000),
  postedEntryIds: z.array(z.string()).max(10_000),
  carriedBalances: z.record(z.string(), z.number().finite()),
}).strict();

const teamPodSchema = z.object({
  id: z.string(), function: teamFunctionSchema, headcount: z.number().int().nonnegative(),
  capacity: z.number().min(0).max(500), skill: z.number().min(0).max(1), monthlyCost: z.number().nonnegative(),
  reservedCapacity: z.number().min(0).max(500),
}).strict();

const executiveSchema = z.object({
  id: z.string(), name: z.string(), role: z.enum(["ceo", "product", "commercial"]),
  judgment: z.number().min(0).max(1), riskTolerance: z.number().min(0).max(1),
  attention: z.number().min(0).max(100), reservedAttention: z.number().min(0).max(100), memory: z.array(z.string()).max(80),
}).strict();

const capabilitySchema = z.object({
  id: z.string(), label: z.string(), kind: z.enum(["core", "integration", "reliability", "security", "compliance"]),
  status: z.enum(["backlog", "building", "released"]), dependencyIds: z.array(z.string()).max(8),
  progress: z.number().min(0).max(100), quality: z.number().min(0).max(1),
}).strict();

const pipelineSchema = z.object({
  id: z.string(), resourceId: z.string(), segmentId: z.string(), stage: z.enum(PIPELINE_STAGES_V10),
  value: z.number().nonnegative(), enteredDay: z.number().int().nonnegative(),
}).strict();

const initiativeSchema = competitorStrategicPlanSchemaV10.shape.initiatives.element.extend({
  status: z.enum(["planned", "active", "completed", "failed", "cancelled"]),
  progress: z.number().min(0).max(100),
  requiredWork: z.number().positive(),
  cashSpent: z.number().nonnegative(),
  startedDay: z.number().int().nonnegative(),
  completedDay: z.number().int().nonnegative().nullable(),
}).strict();

const firmSchema = z.object({
  id: z.string(), displayName: z.string(), archetype: observedFirmSchema.shape.archetype,
  doctrine: z.enum(["product_led", "price_disruptor", "service_led", "channel_led", "platform_defense", "capital_conservative"]),
  lifecycle: lifecycleSchema, positioning: z.string(), targetSegments: z.array(z.string()), channels: z.array(z.string()),
  ledger: ledgerSchema, monthlyRevenue: z.number().nonnegative(), monthlyBurn: z.number().nonnegative(),
  debt: z.number().nonnegative(), equityRaised: z.number().nonnegative(), accountsReceivable: z.number().nonnegative(), accountsPayable: z.number().nonnegative(),
  reservedCash: z.number().nonnegative(), price: z.number().positive(), trust: z.number().min(0).max(1),
  teams: z.array(teamPodSchema).max(8), executives: z.array(executiveSchema).min(1).max(3),
  capabilities: z.array(capabilitySchema).max(24), pipeline: z.array(pipelineSchema).max(120),
  customers: z.number().int().nonnegative(), churnRate: z.number().min(0).max(1), supportLoad: z.number().nonnegative(),
  initiatives: z.array(initiativeSchema).max(40), completedInitiativeIds: z.array(z.string()).max(200),
  activePlan: competitorStrategicPlanSchemaV10.nullable(), strategicMemory: z.array(z.string()).max(120),
  observedPlayerSignals: z.array(z.string()).max(50), nextBidDay: z.number().int().nonnegative(), lastProcessedDay: z.number().int().nonnegative(),
}).strict();
export type CompetitorFirmPrivateV10 = z.infer<typeof firmSchema>;

const privateStateSchema = z.object({ firms: z.record(z.string(), firmSchema), nextSignalId: z.number().int().positive() }).strict();
export type CompetitorOrganizationsPrivateStateV10 = z.infer<typeof privateStateSchema>;

export type CompetitorDecisionViewV10 = {
  firmId: string;
  lifecycle: CompetitorFirmPrivateV10["lifecycle"];
  cash: number;
  monthlyRevenue: number;
  monthlyBurn: number;
  reservedCash: number;
  doctrine: CompetitorFirmPrivateV10["doctrine"];
  teamCapacity: Record<string, number>;
  productGaps: string[];
  pipelineByStage: Record<string, number>;
  memory: string[];
  feasibleTargets: Array<{ kind: string; id: string }>;
};

const configSchema = z.object({ maximumFirms: z.literal(4).default(4) }).default({ maximumFirms: 4 });

const round = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));

function startingEconomics(template: FictionalTwinTemplateV10, index: number) {
  const archetype = template.archetype;
  if (archetype === "platform_business_unit") return { cash: 1_400_000 + index * 90_000, revenue: 180_000, burn: 155_000, headcount: 22, price: 900 };
  if (archetype === "scaled_saas") return { cash: 650_000 + index * 60_000, revenue: 72_000, burn: 88_000, headcount: 15, price: 320 };
  if (archetype === "bootstrapped_specialist") return { cash: 95_000 + index * 15_000, revenue: 28_000, burn: 24_000, headcount: 6, price: 110 };
  return { cash: 310_000 + index * 40_000, revenue: 18_000, burn: 58_000, headcount: 9, price: 190 };
}

function createTeams(firmId: string, headcount: number, monthlyBurn: number, index: number) {
  const weights = [0.31, 0.22, 0.22, 0.15, 0.1];
  return teamFunctionSchema.options.map((fn, podIndex) => {
    const members = Math.max(podIndex === 0 ? 1 : 0, Math.round(headcount * weights[podIndex]));
    return {
      id: `${firmId}:${fn}`, function: fn, headcount: members,
      capacity: members * (15 + ((index + podIndex) % 4)), skill: round(0.55 + ((index * 7 + podIndex * 11) % 28) / 100, 3),
      monthlyCost: round(monthlyBurn * weights[podIndex]), reservedCapacity: 0,
    };
  });
}

function addSignal(
  context: FeatureRuntimeContextV10<CompetitorOrganizationsPublicStateV10, CompetitorOrganizationsPrivateStateV10>,
  firmId: string,
  kind: z.infer<typeof publicSignalSchema>["kind"],
  summary: string,
  confidence = 72,
): void {
  context.ownState.public.signals.push({
    id: `competitor-signal-${context.ownState.private.nextSignalId++}`,
    firmId, day: context.kernel.simulationDay, kind, summary, confidence, provenance: "simulated_observation",
  });
  context.ownState.public.signals = context.ownState.public.signals.slice(-160);
}

function postCashExpense(firm: CompetitorFirmPrivateV10, id: string, day: number, amount: number, memo: string): number {
  const cash = accountingBalanceV10(firm.ledger as EntityLedgerV10, "cash");
  const payable = round(Math.max(0, amount - cash));
  const paid = round(Math.min(cash, amount));
  if (paid > 0) postAccountingEntryV10(firm.ledger as EntityLedgerV10, {
    id: `${id}:paid`, day, memo,
    lines: [{ account: "operating_expense", debit: paid, credit: 0 }, { account: "cash", debit: 0, credit: paid }],
  });
  if (payable > 0) {
    firm.accountsPayable = round(firm.accountsPayable + payable);
    postAccountingEntryV10(firm.ledger as EntityLedgerV10, {
      id: `${id}:payable`, day, memo,
      lines: [{ account: "operating_expense", debit: payable, credit: 0 }, { account: "accounts_payable", debit: 0, credit: payable }],
    });
  }
  return paid;
}

function postCashRevenue(firm: CompetitorFirmPrivateV10, id: string, day: number, amount: number, memo: string): void {
  if (amount <= 0) return;
  postAccountingEntryV10(firm.ledger as EntityLedgerV10, {
    id, day, memo,
    lines: [{ account: "cash", debit: amount, credit: 0 }, { account: "revenue", debit: 0, credit: amount }],
  });
}

function releaseInitiativeReservations(
  firm: CompetitorFirmPrivateV10,
  initiative: CompetitorFirmPrivateV10["initiatives"][number],
): void {
  firm.reservedCash = round(
    Math.max(0, firm.reservedCash - Math.max(0, initiative.cashLimit - initiative.cashSpent)),
  );
  for (const [teamId, reserved] of Object.entries(initiative.teamCapacity)) {
    const team = firm.teams.find(
      (item) => item.id === teamId || item.function === teamId,
    );
    if (team) {
      releaseCapacityV10(team, reserved);
    }
  }
  firm.executives[0].reservedAttention = round(
    Math.max(
      0,
      firm.executives[0].reservedAttention - initiative.executiveAttention,
    ),
  );
}

function stopConditionReached(
  firm: CompetitorFirmPrivateV10,
  initiative: CompetitorFirmPrivateV10["initiatives"][number],
  day: number,
): boolean {
  const cash = accountingBalanceV10(firm.ledger as EntityLedgerV10, "cash");
  const netBurn = Math.max(1, firm.monthlyBurn - firm.monthlyRevenue);
  const metrics: Record<string, number> = {
    cash,
    runway: cash / netBurn,
    pipeline: firm.pipeline.filter((item) => !["won", "lost"].includes(item.stage)).length,
    quality: firm.capabilities.length
      ? firm.capabilities.reduce((sum, item) => sum + item.quality, 0) / firm.capabilities.length
      : 0,
    capacity: firm.teams.reduce((sum, item) => sum + Math.max(0, item.capacity - item.reservedCapacity), 0),
    deadline: day,
  };
  return initiative.stopConditions.some((condition) => {
    const value = metrics[condition.metric];
    if (condition.operator === "lt") return value < condition.threshold;
    if (condition.operator === "lte") return value <= condition.threshold;
    if (condition.operator === "gt") return value > condition.threshold;
    return value >= condition.threshold;
  });
}

function completeInitiative(
  context: FeatureRuntimeContextV10<CompetitorOrganizationsPublicStateV10, CompetitorOrganizationsPrivateStateV10>,
  firm: CompetitorFirmPrivateV10,
  initiative: CompetitorFirmPrivateV10["initiatives"][number],
): void {
  initiative.status = "completed";
  initiative.progress = 100;
  initiative.completedDay = context.kernel.simulationDay;
  firm.completedInitiativeIds.push(initiative.id);
  releaseInitiativeReservations(firm, initiative);

  if (["capability_build", "integration_build", "reliability_investment", "security_compliance_investment"].includes(initiative.kind)) {
    const kind = initiative.kind === "integration_build" ? "integration" : initiative.kind === "reliability_investment" ? "reliability" : initiative.kind === "security_compliance_investment" ? "security" : "core";
    const existing = firm.capabilities.find((item) => item.id === initiative.target.id);
    if (existing) { existing.status = "released"; existing.progress = 100; existing.quality = clamp(existing.quality + 0.12); }
    else firm.capabilities.push({ id: initiative.target.id, label: initiative.target.id.replaceAll("_", " "), kind, status: "released", dependencyIds: [], progress: 100, quality: 0.68 });
    addSignal(context, firm.id, "product", `${firm.displayName} visibly released a simulated ${initiative.target.id.replaceAll("_", " ")} capability.`);
  } else if (initiative.kind === "price_package_change") {
    firm.price = round(Math.max(10, firm.price * (firm.doctrine === "price_disruptor" ? 0.88 : 1.08)));
    addSignal(context, firm.id, "pricing", `${firm.displayName} changed its simulated offer and packaging.`);
  } else if (initiative.kind === "cost_restructure") {
    firm.monthlyBurn = round(firm.monthlyBurn * 0.86);
    firm.lifecycle = "restructuring";
    addSignal(context, firm.id, "distress", `${firm.displayName} entered a visible simulated restructuring.`);
  } else if (initiative.kind === "team_hire") {
    const team = firm.teams.find((item) => item.function === initiative.target.kind) ?? firm.teams[0];
    team.headcount += 1; team.capacity = round(team.capacity + 17); team.monthlyCost = round(team.monthlyCost + firm.monthlyBurn / Math.max(4, firm.teams.reduce((sum, item) => sum + item.headcount, 0)));
    firm.monthlyBurn = round(firm.monthlyBurn + team.monthlyCost / Math.max(1, team.headcount));
    addSignal(context, firm.id, "hiring", `${firm.displayName} completed a simulated key-team hire.`);
  } else if (initiative.kind === "unit_deprioritize" || initiative.kind === "segment_exit") {
    firm.lifecycle = firm.archetype === "platform_business_unit" ? "unit_deprioritized" : "exited";
    addSignal(context, firm.id, "exit", `${firm.displayName} is no longer actively competing in the simulated segment.`);
  }
  context.emit({
    type: "competitor-organizations.initiative_completed",
    visibility: "public",
    sourceId: initiative.id,
    payload: { firmId: firm.id, initiativeId: initiative.id, kind: initiative.kind, target: initiative.target },
  });
}

function runFirmOperations(
  context: FeatureRuntimeContextV10<CompetitorOrganizationsPublicStateV10, CompetitorOrganizationsPrivateStateV10>,
  firm: CompetitorFirmPrivateV10,
  elapsedDays: number,
): void {
  if (elapsedDays <= 0 || ["insolvent", "exited", "unit_deprioritized", "acquired"].includes(firm.lifecycle)) return;
  const factors = context.query("external-world.domain-factors") as ExternalWorldDomainMultipliersV10;
  const revenue = round(firm.monthlyRevenue * elapsedDays / 30 * factors.demand * (1 - firm.churnRate));
  const burn = round(firm.monthlyBurn * elapsedDays / 30 * factors.vendorCost);
  postCashRevenue(firm, `${firm.id}:revenue:${context.kernel.simulationDay}`, context.kernel.simulationDay, revenue, "Simulated customer collections");
  postCashExpense(firm, `${firm.id}:burn:${context.kernel.simulationDay}`, context.kernel.simulationDay, burn, "Simulated operating burn");

  for (const initiative of firm.initiatives.filter((item) => ["planned", "active"].includes(item.status))) {
    if (initiative.dependencyIds.some((id) => !firm.completedInitiativeIds.includes(id))) continue;
    if (stopConditionReached(firm, initiative, context.kernel.simulationDay)) {
      initiative.status = "failed";
      initiative.completedDay = context.kernel.simulationDay;
      releaseInitiativeReservations(firm, initiative);
      firm.strategicMemory.push(
        `Day ${context.kernel.simulationDay}: stopped ${initiative.kind} after a committed stop condition was reached.`,
      );
      context.emit({
        type: "competitor-organizations.initiative_failed",
        visibility: "public",
        sourceId: initiative.id,
        payload: { firmId: firm.id, initiativeId: initiative.id, kind: initiative.kind },
      });
      context.emit({
        type: "competitor-organizations.material_shock",
        sourceId: initiative.id,
        payload: { firmId: firm.id, trigger: "initiative_failed" },
      });
      continue;
    }
    const requiredCapacity = Object.entries(initiative.teamCapacity);
    const capacityRatio = requiredCapacity.length ? Math.min(...requiredCapacity.map(([teamId, required]) => {
      const team = firm.teams.find((item) => item.id === teamId || item.function === teamId);
      return required > 0 ? (team?.capacity ?? 0) / required : 1;
    })) : 1;
    initiative.status = "active";
    const work = elapsedDays * clamp(capacityRatio, 0.25, 1.25) * (0.75 + firm.executives[0].judgment * 0.35);
    const progressBefore = initiative.progress;
    initiative.progress = round(Math.min(100, initiative.progress + work / initiative.requiredWork * 100));
    const fraction = Math.max(0, (initiative.progress - progressBefore) / 100);
    const spend = round(Math.min(initiative.cashLimit - initiative.cashSpent, initiative.cashLimit * fraction));
    if (spend > 0) {
      postCashExpense(firm, `${firm.id}:${initiative.id}:${context.kernel.simulationDay}`, context.kernel.simulationDay, spend, `Initiative ${initiative.kind}`);
      initiative.cashSpent = round(initiative.cashSpent + spend);
      firm.reservedCash = round(Math.max(0, firm.reservedCash - spend));
    }
    if (initiative.progress >= 100) completeInitiative(context, firm, initiative);
  }

  const cash = accountingBalanceV10(firm.ledger as EntityLedgerV10, "cash");
  const runway = firm.monthlyBurn > firm.monthlyRevenue ? cash / (firm.monthlyBurn - firm.monthlyRevenue) : 99;
  const previousLifecycle = firm.lifecycle;
  if (firm.accountsPayable > 0 || runway < 1) {
    firm.lifecycle = cash <= 0 && firm.accountsPayable > firm.monthlyRevenue
      ? firm.archetype === "platform_business_unit" ? "unit_deprioritized" : "insolvent"
      : "distressed";
  }
  else if (firm.lifecycle === "distressed" && runway > 3) firm.lifecycle = "active";
  if (previousLifecycle !== firm.lifecycle && ["distressed", "insolvent", "unit_deprioritized"].includes(firm.lifecycle)) {
    context.emit({
      type: "competitor-organizations.material_shock",
      sourceId: firm.id,
      payload: { firmId: firm.id, trigger: `lifecycle_${firm.lifecycle}` },
    });
  }
  firm.lastProcessedDay = context.kernel.simulationDay;
}

function submitMarketBids(
  context: FeatureRuntimeContextV10<CompetitorOrganizationsPublicStateV10, CompetitorOrganizationsPrivateStateV10>,
  firm: CompetitorFirmPrivateV10,
): void {
  if (firm.nextBidDay > context.kernel.simulationDay || firm.lifecycle !== "active") return;
  const types = ["account", "talent", "channel", "vendor", "capital"] as const;
  const desired = new Set<string>(["account"]);
  for (const initiative of firm.initiatives.filter((item) => ["planned", "active"].includes(item.status))) {
    if (initiative.kind === "team_hire") desired.add("talent");
    if (["channel_develop", "partnership_negotiate"].includes(initiative.kind)) desired.add("channel");
    if (["capability_build", "integration_build", "services_bundle"].includes(initiative.kind)) desired.add("vendor");
    if (["capital_raise", "debt_finance"].includes(initiative.kind)) desired.add("capital");
  }
  for (const type of types.filter((value) => desired.has(value))) {
    const resources = context.query("competitive-market.available-resources", { type, firmId: firm.id }) as Array<{
      id: string;
      type: string;
      segmentId?: string;
      budgetBand?: "micro" | "small" | "mid" | "enterprise";
      switchingFriction?: "low" | "material" | "high";
    }>;
    if (!resources.length) continue;
    const relevantResources = type === "account"
      ? resources.filter((resource) => resource.segmentId && firm.targetSegments.includes(resource.segmentId))
      : resources;
    const candidates = relevantResources.length ? relevantResources : resources;
    const focusedCandidates = candidates.slice().sort((left, right) => left.id.localeCompare(right.id)).slice(0, 3);
    const resource = focusedCandidates[Math.floor(context.rng.nextFloat() * focusedCandidates.length)];
    const product = firm.teams.find((item) => item.function === "product")!;
    const sales = firm.teams.find((item) => item.function === "sales")!;
    const service = firm.teams.find((item) => item.function === "service")!;
    const doctrineFit = type !== "account" ? 0 :
      firm.doctrine === "price_disruptor" && ["micro", "small"].includes(resource.budgetBand ?? "") ? 0.14 :
        firm.doctrine === "platform_defense" && resource.budgetBand === "enterprise" ? 0.14 :
          firm.doctrine === "service_led" && resource.switchingFriction === "high" ? 0.12 :
            firm.doctrine === "channel_led" && firm.channels.length > 1 ? 0.1 :
              firm.doctrine === "product_led" && resource.switchingFriction === "low" ? 0.1 : 0;
    if (type === "account" && !firm.pipeline.some((item) => item.resourceId === resource.id)) {
      firm.pipeline.push({
        id: `${firm.id}:${resource.id}`,
        resourceId: resource.id,
        segmentId: resource.segmentId ?? "general",
        stage: "negotiation",
        value: round(Math.max(firm.price * 6, 500)),
        enteredDay: context.kernel.simulationDay,
      });
    }
    context.emit({
      type: "competitor-organizations.market_bid_submitted",
      sourceId: `${firm.id}:${resource.id}:${context.kernel.simulationDay}`,
      payload: {
        id: `${firm.id}:${resource.id}:${context.kernel.simulationDay}`,
        firmId: firm.id, resourceId: resource.id, resourceType: type, submittedDay: context.kernel.simulationDay,
        offerFit: clamp(0.38 + firm.capabilities.filter((item) => item.status === "released").length * 0.035 + doctrineFit),
        proof: clamp(0.3 + firm.customers * 0.025), coverage: clamp(sales.capacity / 150), trust: firm.trust,
        implementationCapacity: clamp((service.capacity + product.capacity * 0.35) / 170),
        economicCommitment: type === "capital" ? Math.max(10_000, firm.monthlyBurn * 6) : Math.max(500, firm.price * 3),
      },
    });
  }
  firm.nextBidDay = context.kernel.simulationDay + 7;
}

function refreshObservedFirm(
  publicState: CompetitorOrganizationsPublicStateV10,
  firm: CompetitorFirmPrivateV10,
  day: number,
): void {
  const observed = publicState.firms.find((item) => item.id === firm.id);
  if (!observed) return;
  const headcount = firm.teams.reduce((sum, team) => sum + team.headcount, 0);
  const capacity = firm.teams.reduce((sum, team) => sum + team.capacity, 0);
  const cash = accountingBalanceV10(firm.ledger as EntityLedgerV10, "cash");
  const netBurn = Math.max(1, firm.monthlyBurn - firm.monthlyRevenue);
  const runway = cash / netBurn;
  const momentum = firm.monthlyRevenue > firm.monthlyBurn * 0.9 ? "strong" : firm.pipeline.filter((item) => !["lost", "won"].includes(item.stage)).length > 4 ? "material" : "guarded";
  observed.headcountEstimate = { low: Math.max(1, Math.floor(headcount * 0.82)), high: Math.ceil(headcount * 1.22), confidence: 62 };
  observed.commercialMomentum = momentum;
  observed.implementationCapacity = capacity > 280 ? "strong" : capacity > 150 ? "material" : capacity > 70 ? "guarded" : "low";
  observed.productPace = firm.initiatives.some((item) => item.status === "active" && item.kind.includes("build")) ? "material" : firm.capabilities.length > 5 ? "strong" : "guarded";
  observed.cashPressureSignal = runway < 1.5 ? "material" : runway < 4 ? "watch" : firm.archetype === "platform_business_unit" ? "unknown" : "stable";
  observed.visiblePriceBand = { low: round(firm.price * 0.85), high: round(firm.price * 1.18), confidence: 68 };
  observed.visibleCapabilities = firm.capabilities.filter((item) => item.status === "released").map((item) => item.label).slice(0, 24);
  observed.lifecycleSignal = ["exited", "unit_deprioritized", "insolvent", "acquired"].includes(firm.lifecycle) ? "no_longer_competing" : firm.lifecycle === "restructuring" ? "restructuring_visible" : firm.lifecycle === "distressed" ? "pressure_visible" : "operating";
  observed.lastObservedDay = day;
}

function decisionView(
  firm: CompetitorFirmPrivateV10,
  marketResources: Array<{ id: string; type: string }>,
): CompetitorDecisionViewV10 {
  return {
    firmId: firm.id, lifecycle: firm.lifecycle,
    cash: accountingBalanceV10(firm.ledger as EntityLedgerV10, "cash"), monthlyRevenue: firm.monthlyRevenue,
    monthlyBurn: firm.monthlyBurn, reservedCash: firm.reservedCash, doctrine: firm.doctrine,
    teamCapacity: Object.fromEntries(firm.teams.map((team) => [team.id, availableCapacityV10(team)])),
    productGaps: firm.capabilities.filter((capability) => capability.status !== "released").map((capability) => capability.id),
    pipelineByStage: Object.fromEntries(["lead", "qualified", "pilot", "negotiation", "won", "lost"].map((stage) => [stage, firm.pipeline.filter((item) => item.stage === stage).length])),
    memory: firm.strategicMemory.slice(-20),
    feasibleTargets: [
      { kind: "firm", id: firm.id },
      ...firm.targetSegments.map((id) => ({ kind: "segment", id })),
      ...firm.capabilities.map((item) => ({ kind: "capability", id: item.id })),
      ...firm.teams.map((item) => ({ kind: item.function, id: item.id })),
      ...marketResources.map((resource) => ({ kind: resource.type, id: resource.id })),
    ],
  };
}

export function createCompetitorOrganizationsFeatureV10(): SimulationFeatureV10<
  CompetitorOrganizationsPublicStateV10,
  CompetitorOrganizationsPrivateStateV10,
  z.infer<typeof configSchema>
> {
  return {
    id: "competitor-organizations",
    version: "1.0.0",
    dependencies: [
      { id: "external-world", versionRange: "^1.0.0" },
      { id: "market-intelligence", versionRange: "^2.0.0" },
      { id: "competitive-market", versionRange: "^1.0.0" },
    ],
    compatibleEngineRange: ">=10.1.0 <11.0.0",
    configSchema,
    publicStateSchema: competitorOrganizationsPublicStateSchemaV10,
    privateStateSchema,
    initialize: ({ kernel, query, rng }) => {
      const twins = (query("market-intelligence.fictional-twins") as FictionalTwinTemplateV10[]).slice(0, 4);
      const firms: Record<string, CompetitorFirmPrivateV10> = {};
      const publicFirms = twins.map((template, index) => {
        const calibrated = startingEconomics(template, index);
        const economics = {
          cash: round(calibrated.cash * (0.88 + rng.nextFloat() * 0.24)),
          revenue: round(calibrated.revenue * (0.84 + rng.nextFloat() * 0.32)),
          burn: round(calibrated.burn * (0.9 + rng.nextFloat() * 0.2)),
          headcount: calibrated.headcount,
          price: round(calibrated.price * (0.9 + rng.nextFloat() * 0.2)),
        };
        const ledger = createEntityLedgerV10(economics.cash, template.id);
        const capabilities = template.capabilitySignals.slice(0, 8).map((label, capabilityIndex) => ({
          id: `${template.id}:capability:${capabilityIndex + 1}`, label,
          kind: /integrat|sync|api|connector/i.test(label) ? "integration" as const : "core" as const,
          dependencyIds: capabilityIndex > 0 && capabilityIndex >= 3
            ? [`${template.id}:capability:${Math.min(3, capabilityIndex)}`]
            : [],
          status: capabilityIndex < 3 ? "released" as const : "backlog" as const,
          progress: capabilityIndex < 3 ? 100 : 0, quality: round(0.55 + ((index + capabilityIndex) % 4) * 0.08, 3),
        }));
        firms[template.id] = {
          id: template.id, displayName: template.displayName, archetype: template.archetype, doctrine: template.doctrine,
          lifecycle: "active", positioning: template.positioning, targetSegments: template.targetSegments, channels: template.channels,
          ledger, monthlyRevenue: economics.revenue, monthlyBurn: economics.burn, debt: 0, equityRaised: economics.cash,
          accountsReceivable: 0, accountsPayable: 0, reservedCash: 0, price: economics.price, trust: round(0.55 + index * 0.07, 3),
          teams: createTeams(template.id, economics.headcount, economics.burn, index),
          executives: [{ id: `${template.id}:ceo`, name: ["Alex Rowan", "Morgan Vale", "Samir Chen", "Jordan Reyes"][index], role: "ceo", judgment: 0.58 + index * 0.05, riskTolerance: 0.42 + (3 - index) * 0.08, attention: 100, reservedAttention: 0, memory: [] }],
          capabilities, pipeline: [], customers: Math.max(1, Math.round(economics.revenue / Math.max(1, economics.price * 10))),
          churnRate: 0.035 + index * 0.008, supportLoad: 0, initiatives: [], completedInitiativeIds: [], activePlan: null,
          strategicMemory: [`Simulation initialized from ${template.calibrationVersion}; internal state is synthetic.`], observedPlayerSignals: [],
          nextBidDay: 7 + index, lastProcessedDay: kernel.simulationDay,
        };
        return {
          id: template.id, displayName: template.displayName, executiveName: firms[template.id].executives[0].name,
          archetype: template.archetype, positioning: template.positioning, lifecycleSignal: "operating" as const,
          headcountEstimate: { low: Math.floor(economics.headcount * 0.8), high: Math.ceil(economics.headcount * 1.25), confidence: 54 },
          commercialMomentum: "guarded" as const, implementationCapacity: "material" as const, productPace: "guarded" as const,
          cashPressureSignal: "unknown" as const, visiblePriceBand: { low: economics.price * 0.8, high: economics.price * 1.2, confidence: 52 },
          visibleCapabilities: capabilities.filter((item) => item.status === "released").map((item) => item.label), lastObservedDay: 0,
          disclaimer: template.disclaimer, sourceFacts: template.sourceFacts,
        };
      });
      return { public: { organizationVersion: "competitor-organizations-v1", firms: publicFirms, signals: [], lastOperatingDay: 0 }, private: { firms, nextSignalId: 1 } };
    },
    commands: {},
    effects: {},
    queries: [{
      id: "competitor-organizations.firm-ids",
      resolve: ({ ownState }) => Object.keys(ownState.private.firms).sort(),
    }, {
      id: "competitor-organizations.decision-view",
      resolve: ({ ownState, query }, input) => {
        const firmId = z.object({ firmId: z.string() }).parse(input).firmId;
        const firm = ownState.private.firms[firmId];
        if (!firm) throw new Error("COMPETITOR_FIRM_NOT_FOUND");
        const resources = (["account", "talent", "channel", "vendor", "capital"] as const)
          .flatMap((type) => query("competitive-market.available-resources", { type, firmId }) as Array<{ id: string; type: string }>);
        return decisionView(firm, resources);
      },
    }],
    eventSubscriptions: [{
      id: "competitor-organizations-commits-plans",
      eventType: "competitor-strategy.plan_committed",
      handle: (context, event) => {
        const plan = competitorStrategicPlanSchemaV10.parse(event.payload) as CompetitorStrategicPlanV10;
        const firm = context.ownState.private.firms[plan.firmId];
        if (!firm || !["active", "distressed", "restructuring"].includes(firm.lifecycle)) throw new Error("COMPETITOR_FIRM_NOT_PLANNABLE");
        if (hasDependencyCycleV10(plan)) throw new Error("COMPETITOR_PLAN_DEPENDENCY_CYCLE");
        const cash = accountingBalanceV10(firm.ledger as EntityLedgerV10, "cash");
        const requestedCash = plan.initiatives.reduce((sum, item) => sum + item.cashLimit, 0);
        if (requestedCash + firm.reservedCash > cash + 0.005) throw new Error("COMPETITOR_PLAN_OVERSPEND");
        const requestedAttention = plan.initiatives.reduce((sum, item) => sum + item.executiveAttention, 0);
        if (requestedAttention + firm.executives[0].reservedAttention > firm.executives[0].attention + 0.005) throw new Error("COMPETITOR_PLAN_EXECUTIVE_OVERLOAD");
        for (const [teamId, required] of plan.initiatives.flatMap((item) => Object.entries(item.teamCapacity))) {
          const team = firm.teams.find((item) => item.id === teamId || item.function === teamId);
          if (!team || team.reservedCapacity + required > team.capacity + 0.005) throw new Error("COMPETITOR_PLAN_TEAM_OVERLOAD");
        }
        const plannedCapabilityIds = plan.initiatives
          .filter((item) => ["capability_build", "integration_build", "reliability_investment", "security_compliance_investment"].includes(item.kind))
          .map((item) => item.target.id);
        for (const item of plan.initiatives) {
          if (
            ["capability_build", "integration_build", "reliability_investment", "security_compliance_investment"].includes(item.kind) &&
            !capabilityDependenciesSatisfiedV10(firm.capabilities, item.target.id, plannedCapabilityIds)
          ) throw new Error("COMPETITOR_CAPABILITY_DEPENDENCY_MISSING");
        }
        firm.activePlan = structuredClone(plan);
        firm.reservedCash = round(firm.reservedCash + requestedCash);
        firm.executives[0].reservedAttention = round(firm.executives[0].reservedAttention + requestedAttention);
        for (const item of plan.initiatives) {
          for (const [teamId, reserved] of Object.entries(item.teamCapacity)) {
            const team = firm.teams.find((candidate) => candidate.id === teamId || candidate.function === teamId)!;
            reserveCapacityV10(team, reserved);
          }
          firm.initiatives.push({ ...structuredClone(item), status: "planned", progress: 0, requiredWork: Math.max(20, plan.horizonDays * 0.7), cashSpent: 0, startedDay: context.kernel.simulationDay, completedDay: null });
        }
        firm.strategicMemory.push(`Day ${context.kernel.simulationDay}: committed ${plan.objectives.join(", ")} plan with ${plan.initiatives.length} initiatives.`);
        context.emit({ type: "competitor-organizations.budget_reserved", sourceId: plan.planningCycleId, payload: { firmId: firm.id, initiativeCount: plan.initiatives.length } });
      },
    }, {
      id: "competitor-organizations-receives-market-allocation",
      eventType: "competitive-market.resource_allocated",
      handle: (context, event) => {
        const outcome = z.object({ resourceId: z.string(), resourceType: z.enum(["account", "talent", "channel", "vendor", "capital"]), firmId: z.string(), economicCommitment: z.number().nonnegative() }).parse(event.payload);
        const firm = context.ownState.private.firms[outcome.firmId];
        if (!firm) return;
        if (outcome.resourceType === "account") {
          const value = round(Math.max(firm.price * 6, outcome.economicCommitment));
          const pipeline = firm.pipeline.find((item) => item.resourceId === outcome.resourceId);
          if (pipeline) {
            pipeline.stage = transitionPipelineStageV10(pipeline.stage, "won");
            pipeline.value = value;
          } else {
            const segmentId = firm.targetSegments[firm.pipeline.length % Math.max(1, firm.targetSegments.length)] ?? "general";
            firm.pipeline.push({ id: `${firm.id}:${outcome.resourceId}`, resourceId: outcome.resourceId, segmentId, stage: "won", value, enteredDay: context.kernel.simulationDay });
          }
          firm.customers += 1; firm.monthlyRevenue = round(firm.monthlyRevenue + value / 12); firm.supportLoad = round(firm.supportLoad + 4);
          addSignal(context, firm.id, "account", `${firm.displayName} won a simulated contested account after a multi-supplier evaluation.`, 64);
        } else if (outcome.resourceType === "capital") {
          const amount = round(Math.max(50_000, Math.min(firm.monthlyBurn * 6, 750_000)));
          postAccountingEntryV10(firm.ledger as EntityLedgerV10, { id: `${firm.id}:funding:${outcome.resourceId}`, day: context.kernel.simulationDay, memo: "Simulated financing close", lines: [{ account: "cash", debit: amount, credit: 0 }, { account: "paid_in_capital", debit: 0, credit: amount }] });
          firm.equityRaised = round(firm.equityRaised + amount);
          addSignal(context, firm.id, "funding", `${firm.displayName} visibly closed a simulated financing allocation.`, 82);
        } else {
          firm.strategicMemory.push(`Day ${context.kernel.simulationDay}: secured ${outcome.resourceType} resource ${outcome.resourceId}.`);
          if (outcome.resourceType === "channel") addSignal(context, firm.id, "partnership", `${firm.displayName} secured simulated channel capacity.`, 68);
        }
      },
    }, {
      id: "competitor-organizations-remembers-market-denial",
      eventType: "competitive-market.resource_denied",
      handle: (context, event) => {
        const outcome = z.object({ resourceId: z.string(), resourceType: z.string(), firmId: z.string() }).parse(event.payload);
        const firm = context.ownState.private.firms[outcome.firmId];
        if (firm) {
          firm.strategicMemory.push(`Day ${context.kernel.simulationDay}: lost ${outcome.resourceType} allocation ${outcome.resourceId}.`);
          if (outcome.resourceType === "account") {
            const pipeline = firm.pipeline.find((item) => item.resourceId === outcome.resourceId);
            if (pipeline && pipeline.stage === "negotiation") {
              pipeline.stage = transitionPipelineStageV10(pipeline.stage, "lost");
            }
            context.emit({
              type: "competitor-organizations.material_shock",
              sourceId: outcome.resourceId,
              payload: { firmId: firm.id, trigger: "contested_account_lost" },
            });
          }
        }
      },
    }],
    hooks: {
      after_scheduled_effects: (context) => {
        if (context.elapsedDays <= 0) return;
        for (const firm of Object.values(context.ownState.private.firms)) {
          runFirmOperations(context, firm, context.elapsedDays);
          submitMarketBids(context, firm);
        }
        context.ownState.public.lastOperatingDay = context.kernel.simulationDay;
      },
      after_period_close: (context) => {
        for (const firm of Object.values(context.ownState.private.firms)) {
          refreshObservedFirm(context.ownState.public, firm, context.kernel.simulationDay);
          if (firm.lifecycle === "distressed") addSignal(context, firm.id, "distress", `${firm.displayName} shows simulated operating-pressure signals.`, 58);
          if (firm.lifecycle === "insolvent") {
            addSignal(context, firm.id, "exit", `${firm.displayName} can no longer fund its simulated obligations.`, 88);
            context.emit({ type: "competitor-organizations.exited", visibility: "public", sourceId: firm.id, payload: { firmId: firm.id, reason: "simulated_insolvency" } });
          }
        }
      },
    },
    invariants: [{
      id: "competitor-organizations-accounting-and-capacity",
      check: ({ ownState }) => {
        if (Object.keys(ownState.private.firms).length !== 4) throw new Error("COMPETITOR_FIRM_COUNT_INVALID");
        for (const firm of Object.values(ownState.private.firms)) {
          assertLedgerV10(firm.ledger as EntityLedgerV10);
          assertCapabilityGraphV10(firm.capabilities);
          firm.teams.forEach(assertCapacityV10);
          if (firm.reservedCash < 0 || firm.teams.some((team) => team.reservedCapacity < 0 || team.reservedCapacity > team.capacity + 0.005)) throw new Error("COMPETITOR_RESOURCE_RESERVATION_INVALID");
          if (firm.initiatives.some((item) => item.cashSpent < 0 || item.cashSpent > item.cashLimit + 0.005)) throw new Error("COMPETITOR_INITIATIVE_SPEND_INVALID");
          if (firm.initiatives.filter((item) => ["planned", "active"].includes(item.status)).length > 12) throw new Error("COMPETITOR_ACTIVE_INITIATIVE_LIMIT");
          if (firm.capabilities.length > 24 || firm.teams.length > 8) throw new Error("COMPETITOR_STATE_BOUND_EXCEEDED");
        }
      },
    }],
    projectionPolicy: {
      schema: competitorOrganizationsPublicStateSchemaV10,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: ["ledger", "monthlyRevenue", "monthlyBurn", "reservedCash", "pipeline", "activePlan", "strategicMemory", "judgment", "riskTolerance"],
    },
    snapshotPolicy: { mode: "adaptive", maximumCommandsBetweenSnapshots: 10 },
    retentionPolicy: { maximumHeadBytes: 4_000_000, maximumMaterialRecords: 4_000, archiveClosedRecords: true },
  };
}
