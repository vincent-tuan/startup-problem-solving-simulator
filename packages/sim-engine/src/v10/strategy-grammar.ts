import { z } from "zod";

export const competitorObjectiveSchemaV10 = z.enum([
  "survive",
  "validate",
  "grow",
  "defend",
  "consolidate",
  "fund",
  "harvest",
]);
export type StrategicObjectiveV10 = z.infer<typeof competitorObjectiveSchemaV10>;

export const competitorInitiativeKindSchemaV10 = z.enum([
  "segment_enter",
  "segment_defend",
  "segment_reposition",
  "segment_exit",
  "price_package_change",
  "capability_build",
  "integration_build",
  "reliability_investment",
  "security_compliance_investment",
  "sales_campaign",
  "channel_develop",
  "partnership_negotiate",
  "services_bundle",
  "team_hire",
  "team_redeploy",
  "cost_restructure",
  "capital_raise",
  "debt_finance",
  "acquisition_pursue",
  "unit_deprioritize",
]);
export type CompetitorInitiativeKindV10 = z.infer<typeof competitorInitiativeKindSchemaV10>;

export const stopConditionSchemaV10 = z.object({
  metric: z.enum(["cash", "runway", "pipeline", "quality", "capacity", "deadline"]),
  operator: z.enum(["lt", "lte", "gt", "gte"]),
  threshold: z.number().finite(),
}).strict();
export type StopConditionV10 = z.infer<typeof stopConditionSchemaV10>;

export const competitorStrategicPlanSchemaV10 = z.object({
  planningCycleId: z.string().min(3).max(160),
  firmId: z.string().min(3).max(160),
  horizonDays: z.number().int().min(30).max(180),
  objectives: z.array(competitorObjectiveSchemaV10).min(1).max(3),
  allocations: z.array(z.object({
    function: z.enum(["product", "sales", "service", "people", "capital"]),
    ceilingPercent: z.number().min(0).max(100),
  }).strict()).min(1).max(5),
  initiatives: z.array(z.object({
    id: z.string().min(3).max(160),
    kind: competitorInitiativeKindSchemaV10,
    target: z.object({ kind: z.string().min(2).max(80), id: z.string().min(2).max(160) }).strict(),
    cashLimit: z.number().finite().nonnegative().max(100_000_000),
    teamCapacity: z.record(z.string(), z.number().finite().min(0).max(100)),
    executiveAttention: z.number().finite().min(0).max(100),
    dependencyIds: z.array(z.string().min(3).max(160)).max(8),
    reviewDay: z.number().int().nonnegative(),
    stopConditions: z.array(stopConditionSchemaV10).max(6),
  }).strict()).min(1).max(4),
  publicRationale: z.string().trim().min(12).max(900),
}).strict().superRefine((plan, context) => {
  const initiativeIds = new Set(plan.initiatives.map((initiative) => initiative.id));
  if (initiativeIds.size !== plan.initiatives.length) {
    context.addIssue({ code: "custom", message: "Duplicate initiative ID" });
  }
  if (plan.allocations.reduce((sum, allocation) => sum + allocation.ceilingPercent, 0) > 100.001) {
    context.addIssue({ code: "custom", message: "Allocations exceed 100%" });
  }
  for (const initiative of plan.initiatives) {
    if (initiative.dependencyIds.includes(initiative.id)) {
      context.addIssue({ code: "custom", message: "Self dependency is forbidden" });
    }
    if (initiative.dependencyIds.some((id) => !initiativeIds.has(id))) {
      context.addIssue({ code: "custom", message: "Unknown initiative dependency" });
    }
  }
});
export type CompetitorStrategicPlanV10 = z.infer<typeof competitorStrategicPlanSchemaV10>;

export type CompetitorDecisionEnvelopeV10 = {
  turnId: string;
  planningCycleId: string;
  firmId: string;
  simulationDay: number;
  syntheticInternalState: {
    lifecycle: string;
    doctrine: string;
    cash: number;
    monthlyRevenue: number;
    monthlyBurn: number;
    reservedCash: number;
    teamCapacity: Record<string, number>;
    productGaps: string[];
    pipelineByStage: Record<string, number>;
  };
  observedSignals: Array<{
    id: string;
    kind: string;
    statement: string;
    confidence: number;
    provenance: string;
  }>;
  memory: string[];
  constraints: string[];
  feasibleTargets: Array<{ kind: string; id: string }>;
  initiativeKinds: CompetitorInitiativeKindV10[];
  resourceCeilings: {
    cash: number;
    executiveAttention: number;
    teamCapacity: Record<string, number>;
  };
  worldInputHash: string;
  promptVersion: string;
};

export const competitorDecisionEnvelopeSchemaV10: z.ZodType<CompetitorDecisionEnvelopeV10> = z.object({
  turnId: z.string().min(3).max(160), planningCycleId: z.string().min(3).max(160), firmId: z.string().min(3).max(160),
  simulationDay: z.number().int().nonnegative(),
  syntheticInternalState: z.object({
    lifecycle: z.string(), doctrine: z.string(), cash: z.number().finite(), monthlyRevenue: z.number().finite().nonnegative(),
    monthlyBurn: z.number().finite().nonnegative(), reservedCash: z.number().finite().nonnegative(),
    teamCapacity: z.record(z.string(), z.number().finite().nonnegative()), productGaps: z.array(z.string()).max(24),
    pipelineByStage: z.record(z.string(), z.number().int().nonnegative()),
  }).strict(),
  observedSignals: z.array(z.object({ id: z.string(), kind: z.string(), statement: z.string(), confidence: z.number().min(0).max(100), provenance: z.string() }).strict()).max(80),
  memory: z.array(z.string()).max(40), constraints: z.array(z.string()).max(20),
  feasibleTargets: z.array(z.object({ kind: z.string(), id: z.string() }).strict()).max(240),
  initiativeKinds: z.array(competitorInitiativeKindSchemaV10).min(1),
  resourceCeilings: z.object({ cash: z.number().finite().nonnegative(), executiveAttention: z.number().min(0).max(100), teamCapacity: z.record(z.string(), z.number().finite().nonnegative()) }).strict(),
  worldInputHash: z.string().min(8).max(200), promptVersion: z.string().min(3).max(120),
}).strict();

export function hasDependencyCycleV10(plan: CompetitorStrategicPlanV10): boolean {
  const dependencies = new Map(plan.initiatives.map((item) => [item.id, item.dependencyIds]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) if (visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return plan.initiatives.some((item) => visit(item.id));
}
