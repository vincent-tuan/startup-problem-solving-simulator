import { z } from "zod";
import type {
  FeatureCommandContextV10,
  FeatureRuntimeContextV10,
  SimulationFeatureV10,
} from "./contracts";
import type {
  CandidateAssessmentMethodV10,
  EmploymentTypeV10,
  WorkforceRole,
} from "./types";
import type { EmploymentRuleSetV10 } from "./jurisdiction-rules";
import type { WorkforceEconomicTransactionV10 } from "./finance-treasury";

const roleSchema = z.enum([
  "engineering",
  "product",
  "sales",
  "operations",
  "customer_success",
  "finance",
]);
const levelSchema = z.enum(["individual", "lead", "manager"]);
const employmentSchema = z.enum(["founder", "employee", "contractor"]);
const candidateStageSchema = z.enum([
  "screened",
  "assessment_pending",
  "assessed",
  "offer_pending",
  "notice",
  "declined",
  "withdrawn",
  "hired",
]);
const employeeStatusSchema = z.enum([
  "onboarding",
  "active",
  "leave",
  "notice",
  "terminated",
  "departed",
]);
const performanceSignalSchema = z.enum([
  "unknown",
  "concerning",
  "mixed",
  "credible",
  "strong",
]);
const retentionSignalSchema = z.enum([
  "unknown",
  "stable",
  "watch",
  "flight_risk",
  "notice_given",
]);

const estimateSchema = z.object({
  low: z.number().min(0).max(100),
  high: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
});
const assessmentSchema = z.object({
  id: z.string(),
  method: z.enum([
    "structured_interview",
    "work_sample",
    "reference",
    "portfolio_review",
  ]),
  panelCluster: z.string(),
  completedDay: z.number().int().nonnegative(),
  observation: z.number().min(0).max(100),
  reliability: z.number().min(0).max(1),
  contradiction: z.boolean(),
});

const openRoleSchema = z.object({
  id: z.string(),
  title: z.string(),
  role: roleSchema,
  level: levelSchema,
  employmentType: z.enum(["employee", "contractor"]),
  headcount: z.number().int().min(1).max(5),
  filled: z.number().int().nonnegative(),
  salaryMin: z.number().nonnegative(),
  salaryMax: z.number().nonnegative(),
  optionBpsMax: z.number().int().min(0).max(2_000),
  status: z.enum(["open", "filled", "closed"]),
  openedDay: z.number().int().nonnegative(),
});
export type OpenRoleV10 = z.infer<typeof openRoleSchema>;

const candidateSchema = z.object({
  id: z.string(),
  roleId: z.string(),
  name: z.string(),
  stage: candidateStageSchema,
  source: z.enum(["network", "inbound", "outbound", "agency"]),
  sourcedDay: z.number().int().nonnegative(),
  salaryExpectation: z.number().nonnegative(),
  optionExpectationBps: z.number().int().nonnegative(),
  estimate: estimateSchema,
  assessments: z.array(assessmentSchema).max(16),
  goodwillSignal: z.enum(["engaged", "neutral", "cooling", "at_risk"]),
  offer: z
    .object({
      salary: z.number().nonnegative(),
      optionBps: z.number().int().nonnegative(),
      expiresDay: z.number().int().nonnegative(),
      plannedStartDay: z.number().int().nonnegative(),
    })
    .nullable(),
});
export type CandidateProjectionV10 = z.infer<typeof candidateSchema>;

const performanceProcessSchema = z.object({
  expectations: z.string(),
  startedDay: z.number().int().nonnegative(),
  reviewDay: z.number().int().nonnegative(),
  evidenceIds: z.array(z.string()).max(20),
});
const employeeSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: roleSchema,
  level: levelSchema,
  employmentType: employmentSchema,
  managerId: z.string().nullable(),
  startDay: z.number().int().nonnegative(),
  status: employeeStatusSchema,
  annualSalary: z.number().nonnegative(),
  optionBps: z.number().int().nonnegative(),
  workload: z.number().min(0).max(1.5),
  performanceSignal: performanceSignalSchema,
  performanceConfidence: z.number().min(0).max(100),
  retentionSignal: retentionSignalSchema,
  onboardingProgress: z.number().min(0).max(100),
  ownership: z.array(z.string()).max(12),
  warnings: z.array(z.string()).max(20),
  lastOneOnOneDay: z.number().int().nonnegative().nullable(),
  performanceProcess: performanceProcessSchema.nullable(),
  delegatedMandates: z
    .array(z.enum(["delivery", "hiring", "people", "commercial"]))
    .max(4),
});
export type EmployeeProjectionV10 = z.infer<typeof employeeSchema>;

const signalSchema = z.object({
  id: z.string(),
  day: z.number().int().nonnegative(),
  kind: z.enum([
    "delivery",
    "retention",
    "conflict",
    "conduct",
    "management",
    "knowledge",
  ]),
  severity: z.enum(["low", "material", "critical"]),
  summary: z.string(),
  actorIds: z.array(z.string()).max(8),
});

export const workforcePublicStateSchemaV10 = z.object({
  organizationVersion: z.literal("workforce-v1"),
  openRoles: z.array(openRoleSchema).max(30),
  candidates: z.array(candidateSchema).max(100),
  employees: z.array(employeeSchema).max(25),
  signals: z.array(signalSchema).max(200),
  recruitingReputation: z.enum(["damaged", "weak", "credible", "strong"]),
  cultureSignal: z.enum(["fragmented", "strained", "functional", "cohesive"]),
  policies: z.object({
    oneOnOneCadenceDays: z.number().int().min(7).max(90),
    documentationStandard: z.enum(["minimal", "consistent", "formal"]),
    accessReviewCadenceDays: z.number().int().min(7).max(180),
  }),
});
export type WorkforcePublicStateV10 = z.infer<
  typeof workforcePublicStateSchemaV10
>;

const skillVectorSchema = z.object({
  functional: z.number().min(0).max(1),
  execution: z.number().min(0).max(1),
  judgment: z.number().min(0).max(1),
  learning: z.number().min(0).max(1),
  collaboration: z.number().min(0).max(1),
  leadership: z.number().min(0).max(1),
});
const candidateTruthSchema = z.object({
  candidateId: z.string(),
  skills: skillVectorSchema,
  roleFit: z.number().min(0).max(1),
  reliability: z.number().min(0).max(1),
  ambition: z.number().min(0).max(1),
  riskTolerance: z.number().min(0).max(1),
  compensationFloor: z.number().nonnegative(),
  optionPreference: z.number().min(0).max(1),
  offerCompetition: z.number().min(0).max(1),
  interviewTolerance: z.number().min(0).max(1),
  assessmentClusters: z.record(z.string(), z.number().int().nonnegative()),
  communicationStyle: z.enum(["direct", "diplomatic", "reserved", "opaque"]),
  managementPropensities: z.object({
    concealment: z.number().min(0).max(1),
    favoritism: z.number().min(0).max(1),
    escalationDiscipline: z.number().min(0).max(1),
  }),
  misconductPropensity: z.object({
    financial: z.number().min(0).max(1),
    data: z.number().min(0).max(1),
    interpersonal: z.number().min(0).max(1),
    conflict: z.number().min(0).max(1),
  }),
});
const employeeTruthSchema = z.object({
  employeeId: z.string(),
  skills: skillVectorSchema,
  roleFit: z.number().min(0).max(1),
  reliability: z.number().min(0).max(1),
  ambition: z.number().min(0).max(1),
  riskTolerance: z.number().min(0).max(1),
  burnoutSensitivity: z.number().min(0).max(1),
  exitThreshold: z.number().min(0).max(1),
  morale: z.number().min(0).max(1),
  managerTrust: z.number().min(0).max(1),
  jobSearch: z.boolean(),
  actualContribution: z.number().min(0).max(2),
  periodsObserved: z.number().int().nonnegative(),
  misconductPropensity: candidateTruthSchema.shape.misconductPropensity,
  communicationStyle: candidateTruthSchema.shape.communicationStyle,
  managementPropensities: candidateTruthSchema.shape.managementPropensities,
  memory: z.array(z.string()).max(80),
  hiddenActs: z.array(z.string()).max(30),
  knowledge: z.array(z.string()).max(20),
});
const socialEdgeSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  trust: z.number().min(0).max(1),
  influence: z.number().min(0).max(1),
  rivalry: z.number().min(0).max(1),
  dependency: z.number().min(0).max(1),
  memory: z.array(z.string()).max(20),
});

export const workforcePrivateStateSchemaV10 = z.object({
  candidateTruth: z.record(z.string(), candidateTruthSchema),
  employeeTruth: z.record(z.string(), employeeTruthSchema),
  socialGraph: z.array(socialEdgeSchema).max(600),
  sourceInventory: z.record(
    roleSchema,
    z.record(
      z.enum(["network", "inbound", "outbound", "agency"]),
      z.number().int().nonnegative(),
    ),
  ),
  nextRoleId: z.number().int().positive(),
  nextCandidateId: z.number().int().positive(),
  nextEmployeeId: z.number().int().positive(),
  nextSignalId: z.number().int().positive(),
  politicsPressure: z.number().min(0).max(1),
  controlGap: z.number().min(0).max(1),
  compensationFairness: z.number().min(0).max(1),
});
export type WorkforcePrivateStateV10 = z.infer<
  typeof workforcePrivateStateSchemaV10
>;

const configSchema = z
  .object({
    startingCandidatePoolPerChannel: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10),
    salaryAnchor: z.number().min(100).max(1_000_000).default(36_000),
    performancePeriodDays: z.number().int().min(14).max(90).default(30),
  })
  .default({
    startingCandidatePoolPerChannel: 10,
    salaryAnchor: 36_000,
    performancePeriodDays: 30,
  });

type WorkforceContext = FeatureRuntimeContextV10<
  WorkforcePublicStateV10,
  WorkforcePrivateStateV10
>;
type WorkforceCommandContext = FeatureCommandContextV10<
  WorkforcePublicStateV10,
  WorkforcePrivateStateV10
>;
type FinanceView = {
  cash: number;
  runwaySignal: "healthy" | "tight" | "critical" | "insolvent";
  monthlyPeopleCost: number;
};
type ManagementView = {
  availableHours: number;
  managementSkill: number;
  conflictAvoidance: number;
  optimismBias: number;
};

const FIRST_NAMES = [
  "Avery",
  "Blake",
  "Cameron",
  "Devon",
  "Emery",
  "Finley",
  "Gray",
  "Harper",
  "Indigo",
  "Jordan",
  "Kai",
  "Logan",
  "Morgan",
  "Noor",
  "Parker",
  "Quinn",
  "River",
  "Sage",
  "Taylor",
  "Val",
];
const LAST_NAMES = [
  "Chen",
  "Diaz",
  "Evans",
  "Fischer",
  "Gupta",
  "Haddad",
  "Ito",
  "Jones",
  "Khan",
  "Lim",
  "Martin",
  "Nguyen",
  "Okafor",
  "Patel",
  "Reyes",
  "Singh",
  "Tran",
  "Usman",
  "Vega",
  "Wong",
];
const CHANNEL_COST = {
  network: 15,
  inbound: 30,
  outbound: 70,
  agency: 350,
} as const;
const METHOD_COST = {
  structured_interview: 15,
  work_sample: 45,
  reference: 20,
  portfolio_review: 10,
} as const;
const METHOD_RELIABILITY = {
  structured_interview: 0.48,
  work_sample: 0.78,
  reference: 0.42,
  portfolio_review: 0.34,
} as const;
const METHOD_DAYS = {
  structured_interview: 3,
  work_sample: 5,
  reference: 4,
  portfolio_review: 2,
} as const;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function rounded(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function score(value: number): number {
  return rounded(clamp(value) * 100, 1);
}

function requireCash(context: WorkforceContext, amount: number): void {
  const finance = context.query(
    "finance-and-treasury.liquidity",
  ) as FinanceView;
  if (finance.cash < amount) throw new Error("INSUFFICIENT_COMPANY_CASH");
}

function rules(context: WorkforceContext): EmploymentRuleSetV10 {
  return context.query("jurisdiction-rules.employment") as EmploymentRuleSetV10;
}

function economic(
  context: WorkforceContext,
  transaction: WorkforceEconomicTransactionV10,
): void {
  context.emit({
    type: "workforce-and-organization.economic_transaction_requested",
    sourceId: transaction.transactionId,
    payload: transaction,
  });
}

function addSignal(
  context: WorkforceContext,
  kind: z.infer<typeof signalSchema>["kind"],
  severity: z.infer<typeof signalSchema>["severity"],
  summary: string,
  actorIds: string[],
): void {
  const id = `workforce-signal-${context.ownState.private.nextSignalId++}`;
  context.ownState.public.signals.push({
    id,
    day: context.kernel.simulationDay,
    kind,
    severity,
    summary,
    actorIds,
  });
  context.ownState.public.signals = context.ownState.public.signals.slice(-200);
}

function generateSkills(context: WorkforceContext) {
  const draw = () => clamp(0.56 + context.rng.normal(0, 0.17), 0.08, 0.96);
  return {
    functional: draw(),
    execution: draw(),
    judgment: draw(),
    learning: draw(),
    collaboration: draw(),
    leadership: draw(),
  };
}

function candidateName(context: WorkforceContext, serial: number): string {
  const first =
    FIRST_NAMES[Math.floor(context.rng.nextFloat() * FIRST_NAMES.length)];
  const last =
    LAST_NAMES[Math.floor(context.rng.nextFloat() * LAST_NAMES.length)];
  return `${first} ${last} ${serial}`;
}

function averageSkill(
  skills: z.infer<typeof skillVectorSchema>,
  role: WorkforceRole,
): number {
  const leadershipWeight =
    role === "operations" || role === "sales" ? 0.18 : 0.1;
  return (
    skills.functional * 0.3 +
    skills.execution * 0.24 +
    skills.judgment * 0.16 +
    skills.learning * 0.12 +
    skills.collaboration * (0.18 - leadershipWeight / 2) +
    skills.leadership * leadershipWeight
  );
}

function updateEstimate(candidate: CandidateProjectionV10): void {
  if (!candidate.assessments.length) return;
  const byCluster = new Map<string, number>();
  let precision = 0;
  let weighted = 0;
  for (const assessment of candidate.assessments) {
    const repeats = byCluster.get(assessment.panelCluster) ?? 0;
    byCluster.set(assessment.panelCluster, repeats + 1);
    const independencePenalty = 1 / (1 + repeats * 1.6);
    const weight = assessment.reliability * independencePenalty;
    precision += weight;
    weighted += assessment.observation * weight;
  }
  const mean = (50 * 0.65 + weighted) / (0.65 + precision);
  const width = Math.max(7, 34 / Math.sqrt(1 + precision));
  candidate.estimate = {
    low: rounded(Math.max(0, mean - width), 1),
    high: rounded(Math.min(100, mean + width), 1),
    confidence: rounded(Math.min(92, 18 + precision * 24), 1),
  };
}

function employee(
  context: WorkforceContext,
  id: string,
): EmployeeProjectionV10 {
  const found = context.ownState.public.employees.find(
    (item) => item.id === id && item.status !== "departed",
  );
  if (!found) throw new Error("EMPLOYEE_NOT_FOUND");
  return found;
}

function candidate(
  context: WorkforceContext,
  id: string,
): CandidateProjectionV10 {
  const found = context.ownState.public.candidates.find(
    (item) => item.id === id,
  );
  if (!found) throw new Error("CANDIDATE_NOT_FOUND");
  return found;
}

function reportingCycle(
  employees: EmployeeProjectionV10[],
  employeeId: string,
  managerId: string,
): boolean {
  let current: string | null = managerId;
  const visited = new Set<string>([employeeId]);
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = employees.find((item) => item.id === current)?.managerId ?? null;
  }
  return false;
}

function managementDemand(context: WorkforceContext): void {
  const active = context.ownState.public.employees.filter(
    (item) => !["terminated", "departed"].includes(item.status),
  );
  const founderReports = active.filter(
    (item) => item.managerId === "founder",
  ).length;
  const cases = context.ownState.public.signals.filter(
    (item) =>
      item.severity !== "low" && context.kernel.simulationDay - item.day <= 30,
  ).length;
  const committedHours =
    founderReports * 2.5 +
    cases * 3 +
    active.filter((item) => item.status === "onboarding").length * 2;
  context.emit({
    type: "workforce-and-organization.management_demand_changed",
    sourceId: `management-demand-${context.kernel.simulationDay}`,
    payload: {
      directReports: founderReports,
      committedHours: rounded(committedHours, 1),
      unresolvedLoad: cases * 8,
    },
  });
}

function capacityChanged(context: WorkforceContext): void {
  let capacity = 0;
  let qualityWeighted = 0;
  for (const member of context.ownState.public.employees) {
    if (
      member.employmentType === "founder" ||
      !["active", "onboarding"].includes(member.status)
    )
      continue;
    const truth = context.ownState.private.employeeTruth[member.id];
    if (!truth) continue;
    const onboarding =
      member.status === "onboarding" ? member.onboardingProgress / 100 : 1;
    const contribution = 40 * member.workload * onboarding;
    capacity += contribution;
    qualityWeighted += contribution * truth.actualContribution;
  }
  context.emit({
    type: "workforce-and-organization.capacity_changed",
    visibility: "public",
    sourceId: `capacity-${context.kernel.simulationDay}`,
    payload: {
      availableHours: rounded(capacity, 1),
      executionQuality:
        capacity > 0 ? rounded(qualityWeighted / capacity, 3) : 0,
      simulationDay: context.kernel.simulationDay,
    },
  });
}

function sourceCandidates(
  context: WorkforceCommandContext,
  roleId: string,
  channel: "network" | "inbound" | "outbound" | "agency",
  count: number,
): void {
  const role = context.ownState.public.openRoles.find(
    (item) => item.id === roleId && item.status === "open",
  );
  if (!role) throw new Error("OPEN_ROLE_NOT_FOUND");
  const inventory =
    context.ownState.private.sourceInventory[role.role][channel];
  if (inventory < count) throw new Error("CANDIDATE_SOURCE_EXHAUSTED");
  if (context.ownState.public.candidates.length + count > 100)
    throw new Error("CANDIDATE_RETENTION_LIMIT");
  const cost = CHANNEL_COST[channel] * count;
  requireCash(context, cost);
  context.ownState.private.sourceInventory[role.role][channel] -= count;
  const factors = context.query("external-world.domain-factors") as {
    wagePressure: number;
    talentAvailability: number;
  };
  for (let index = 0; index < count; index += 1) {
    const serial = context.ownState.private.nextCandidateId++;
    const id = `candidate-${serial}`;
    const skills = generateSkills(context);
    const roleFit = clamp(0.56 + context.rng.normal(0, 0.2));
    const baseExpectation = (role.salaryMin + role.salaryMax) / 2;
    const salaryExpectation = rounded(
      baseExpectation *
        factors.wagePressure *
        clamp(0.85 + context.rng.normal(0, 0.14), 0.65, 1.35),
      0,
    );
    const truth = {
      candidateId: id,
      skills,
      roleFit,
      reliability: clamp(0.66 + context.rng.normal(0, 0.16)),
      ambition: clamp(0.55 + context.rng.normal(0, 0.2)),
      riskTolerance: clamp(0.5 + context.rng.normal(0, 0.22)),
      compensationFloor:
        salaryExpectation *
        clamp(0.9 + context.rng.normal(0, 0.06), 0.78, 1.08),
      optionPreference: clamp(0.45 + context.rng.normal(0, 0.22)),
      offerCompetition: clamp(
        (2 - factors.talentAvailability) * 0.32 + context.rng.normal(0, 0.12),
      ),
      interviewTolerance: clamp(0.72 + context.rng.normal(0, 0.16)),
      assessmentClusters: {},
      communicationStyle: context.rng.categorical({
        direct: 0.3,
        diplomatic: 0.3,
        reserved: 0.25,
        opaque: 0.15,
      }),
      managementPropensities: {
        concealment: clamp(0.18 + Math.max(0, context.rng.normal(0, 0.16))),
        favoritism: clamp(0.16 + Math.max(0, context.rng.normal(0, 0.14))),
        escalationDiscipline: clamp(0.62 + context.rng.normal(0, 0.18)),
      },
      misconductPropensity: {
        financial: clamp(0.04 + Math.max(0, context.rng.normal(0, 0.05))),
        data: clamp(0.05 + Math.max(0, context.rng.normal(0, 0.06))),
        interpersonal: clamp(0.08 + Math.max(0, context.rng.normal(0, 0.08))),
        conflict: clamp(0.1 + Math.max(0, context.rng.normal(0, 0.1))),
      },
    };
    context.ownState.private.candidateTruth[id] = truth;
    const resumeSignal = score(
      averageSkill(skills, role.role) + context.rng.normal(0, 0.2),
    );
    context.ownState.public.candidates.push({
      id,
      roleId,
      name: candidateName(context, serial),
      stage: "screened",
      source: channel,
      sourcedDay: context.kernel.simulationDay,
      salaryExpectation,
      optionExpectationBps: Math.max(
        0,
        Math.round(role.optionBpsMax * truth.optionPreference),
      ),
      estimate: {
        low: rounded(Math.max(0, resumeSignal - 32), 1),
        high: rounded(Math.min(100, resumeSignal + 32), 1),
        confidence: 12,
      },
      assessments: [],
      goodwillSignal: "engaged",
      offer: null,
    });
    context.emit({
      type: "workforce-and-organization.candidate_sourced",
      visibility: "public",
      sourceId: id,
      payload: { candidateId: id, roleId, channel },
    });
  }
  economic(context, {
    transactionId: `source-${context.command.commandId}`,
    kind: "recruiting",
    amount: cost,
    memo: `${channel} sourcing for ${role.title}`,
    dueDay: context.kernel.simulationDay,
  });
  managementDemand(context);
}

function assessCandidate(
  context: WorkforceCommandContext,
  candidateId: string,
  method: CandidateAssessmentMethodV10,
  panelCluster: string,
): void {
  const view = candidate(context, candidateId);
  if (!["screened", "assessed"].includes(view.stage))
    throw new Error("CANDIDATE_NOT_ASSESSABLE");
  const truth = context.ownState.private.candidateTruth[candidateId];
  if (!truth) throw new Error("CANDIDATE_TRUTH_NOT_FOUND");
  requireCash(context, METHOD_COST[method]);
  const repeats = truth.assessmentClusters[panelCluster] ?? 0;
  truth.assessmentClusters[panelCluster] = repeats + 1;
  const reliability = METHOD_RELIABILITY[method] / (1 + repeats * 0.75);
  const actual =
    averageSkill(
      truth.skills,
      context.ownState.public.openRoles.find((item) => item.id === view.roleId)
        ?.role ?? "operations",
    ) * truth.roleFit;
  const observed = score(
    actual + context.rng.normal(0, (1 - reliability) * 0.3),
  );
  view.stage = "assessment_pending";
  view.goodwillSignal =
    repeats >= 2 ? "at_risk" : repeats === 1 ? "cooling" : view.goodwillSignal;
  context.schedule({
    type: "workforce-and-organization.assessment_complete",
    dueDay: context.kernel.simulationDay + METHOD_DAYS[method],
    sourceId: candidateId,
    payload: { method, panelCluster },
    sampledOutcome: {
      observed,
      reliability,
      contradiction:
        view.assessments.length > 0 &&
        Math.abs(view.assessments.at(-1)!.observation - observed) > 28,
    },
  });
  economic(context, {
    transactionId: `assessment-${context.command.commandId}`,
    kind: "recruiting",
    amount: METHOD_COST[method],
    memo: `${method.replaceAll("_", " ")} for ${view.name}`,
    dueDay: context.kernel.simulationDay,
  });
}

function makeOffer(
  context: WorkforceCommandContext,
  candidateId: string,
  salary: number,
  optionBps: number,
  startDelayDays: number,
): void {
  const view = candidate(context, candidateId);
  if (!["screened", "assessed"].includes(view.stage))
    throw new Error("CANDIDATE_NOT_OFFERABLE");
  const role = context.ownState.public.openRoles.find(
    (item) => item.id === view.roleId && item.status === "open",
  );
  if (!role) throw new Error("OPEN_ROLE_NOT_FOUND");
  const committedSeats = context.ownState.public.candidates.filter(
    (item) =>
      item.id !== candidateId &&
      item.roleId === role.id &&
      ["offer_pending", "notice"].includes(item.stage),
  ).length;
  if (role.filled + committedSeats >= role.headcount) {
    throw new Error("ROLE_OFFER_CAPACITY_FILLED");
  }
  if (
    salary < role.salaryMin * 0.6 ||
    salary > role.salaryMax * 1.5 ||
    optionBps > role.optionBpsMax
  )
    throw new Error("OFFER_OUTSIDE_AUTHORIZED_BAND");
  const truth = context.ownState.private.candidateTruth[candidateId];
  const compensationFit = salary / Math.max(1, truth.compensationFloor) - 1;
  const equityFit = role.optionBpsMax > 0 ? optionBps / role.optionBpsMax : 0;
  const processFatigue =
    view.assessments.length * 0.035 +
    (view.goodwillSignal === "at_risk" ? 0.18 : 0);
  const acceptScore =
    0.54 +
    compensationFit * 0.8 +
    equityFit * truth.optionPreference * 0.18 +
    truth.riskTolerance * 0.12 -
    truth.offerCompetition * 0.25 -
    processFatigue;
  const accepted = context.rng.nextFloat() < clamp(acceptScore, 0.04, 0.95);
  const startDay =
    context.kernel.simulationDay +
    Math.max(startDelayDays, role.employmentType === "employee" ? 7 : 1);
  view.stage = "offer_pending";
  view.offer = {
    salary,
    optionBps,
    expiresDay: context.kernel.simulationDay + 5,
    plannedStartDay: startDay,
  };
  context.schedule({
    type: "workforce-and-organization.offer_response",
    dueDay: context.kernel.simulationDay + 3,
    sourceId: candidateId,
    payload: {},
    sampledOutcome: { accepted, startDay },
  });
  context.emit({
    type: "workforce-and-organization.offer_made",
    visibility: "public",
    sourceId: candidateId,
    payload: {
      candidateId,
      salary,
      optionBps,
      expiresDay: view.offer.expiresDay,
    },
  });
}

function startEmployee(context: WorkforceContext, candidateId: string): void {
  const view = candidate(context, candidateId);
  const truth = context.ownState.private.candidateTruth[candidateId];
  const role = context.ownState.public.openRoles.find(
    (item) => item.id === view.roleId,
  );
  if (!view.offer || !truth || !role || view.stage !== "notice") return;
  if (role.filled >= role.headcount) {
    view.stage = "withdrawn";
    view.offer = null;
    context.emit({
      type: "workforce-and-organization.accepted_offer_cancelled",
      sourceId: candidateId,
      payload: {
        candidateId,
        roleId: role.id,
        reason: "role_capacity_already_filled",
      },
    });
    return;
  }
  if (
    context.ownState.public.employees.filter(
      (item) => item.status !== "departed",
    ).length >= 25
  )
    throw new Error("WORKFORCE_HEADCOUNT_LIMIT");
  const serial = context.ownState.private.nextEmployeeId++;
  const id = `employee-${serial}`;
  const manager =
    context.ownState.public.employees.find(
      (item) => item.level === "manager" && item.status === "active",
    )?.id ?? "founder";
  const employmentType: EmploymentTypeV10 = role.employmentType;
  const member: EmployeeProjectionV10 = {
    id,
    name: view.name,
    role: role.role,
    level: role.level,
    employmentType,
    managerId: manager,
    startDay: context.kernel.simulationDay,
    status: "onboarding",
    annualSalary: view.offer.salary,
    optionBps: view.offer.optionBps,
    workload: 0.65,
    performanceSignal: "unknown",
    performanceConfidence: 0,
    retentionSignal: "unknown",
    onboardingProgress: 0,
    ownership: [],
    warnings: [],
    lastOneOnOneDay: null,
    performanceProcess: null,
    delegatedMandates: [],
  };
  context.ownState.public.employees.push(member);
  context.ownState.private.employeeTruth[id] = {
    employeeId: id,
    skills: truth.skills,
    roleFit: truth.roleFit,
    reliability: truth.reliability,
    ambition: truth.ambition,
    riskTolerance: truth.riskTolerance,
    burnoutSensitivity: clamp(0.5 + context.rng.normal(0, 0.18)),
    exitThreshold: clamp(0.62 + context.rng.normal(0, 0.16)),
    morale: 0.72,
    managerTrust: 0.58,
    jobSearch: false,
    actualContribution: 0,
    periodsObserved: 0,
    misconductPropensity: truth.misconductPropensity,
    communicationStyle: truth.communicationStyle,
    managementPropensities: truth.managementPropensities,
    memory: [`Joined on day ${context.kernel.simulationDay}`],
    hiddenActs: [],
    knowledge: [],
  };
  for (const other of context.ownState.public.employees.filter(
    (item) => item.id !== id && item.status !== "departed",
  )) {
    context.ownState.private.socialGraph.push({
      fromId: id,
      toId: other.id,
      trust: clamp(0.5 + context.rng.normal(0, 0.12)),
      influence: 0.2,
      rivalry: 0.05,
      dependency: 0.15,
      memory: [],
    });
    context.ownState.private.socialGraph.push({
      fromId: other.id,
      toId: id,
      trust: clamp(0.5 + context.rng.normal(0, 0.12)),
      influence: 0.2,
      rivalry: 0.05,
      dependency: 0.15,
      memory: [],
    });
  }
  view.stage = "hired";
  role.filled += 1;
  if (role.filled >= role.headcount) role.status = "filled";
  context.schedule({
    type: "workforce-and-organization.onboarding_progress",
    dueDay: context.kernel.simulationDay + 14,
    sourceId: id,
    payload: { step: 1 },
    sampledOutcome: { progress: 50 },
  });
  economic(context, {
    transactionId: `equipment-${id}`,
    kind: "equipment",
    amount: employmentType === "employee" ? 650 : 180,
    memo: `Equipment and access setup for ${member.name}`,
    dueDay: context.kernel.simulationDay,
  });
  context.emit({
    type: "workforce-and-organization.employee_started",
    visibility: "public",
    sourceId: id,
    payload: { employeeId: id, role: member.role, employmentType },
  });
  managementDemand(context);
}

function performanceSignal(
  actual: number,
  noisy: number,
): EmployeeProjectionV10["performanceSignal"] {
  const observed = actual * 0.7 + noisy * 0.3;
  if (observed < 0.38) return "concerning";
  if (observed < 0.58) return "mixed";
  if (observed < 0.82) return "credible";
  return "strong";
}

function performancePeriod(
  context: WorkforceContext,
  periodDays: number,
): void {
  const management = context.query(
    "founder-and-management.capacity",
  ) as ManagementView;
  const jurisdiction = rules(context);
  const active = context.ownState.public.employees.filter(
    (item) =>
      item.employmentType !== "founder" &&
      ["active", "onboarding", "notice"].includes(item.status),
  );
  let payroll = 0;
  for (const member of active) {
    const truth = context.ownState.private.employeeTruth[member.id];
    if (!truth) continue;
    const managerTruth = member.managerId
      ? context.ownState.private.employeeTruth[member.managerId]
      : undefined;
    const managerFit =
      member.managerId === "founder"
        ? management.managementSkill
        : (managerTruth?.skills.leadership ?? 0.45);
    const onboarding =
      member.status === "onboarding" ? member.onboardingProgress / 100 : 1;
    const clarity = member.ownership.length ? 0.85 : 0.58;
    const overloadPenalty =
      Math.max(0, member.workload - 1) * truth.burnoutSensitivity;
    const socialEdges = context.ownState.private.socialGraph.filter(
      (edge) =>
        edge.fromId === member.id &&
        active.some((peer) => peer.id === edge.toId),
    );
    const socialTrust = socialEdges.length
      ? socialEdges.reduce(
          (sum, edge) => sum + edge.trust - edge.rivalry * 0.6,
          0,
        ) / socialEdges.length
      : 0.5;
    const collaborationFactor = clamp(0.78 + socialTrust * 0.32, 0.65, 1.08);
    const skill = averageSkill(truth.skills, member.role);
    const actual = clamp(
      skill *
        truth.roleFit *
        truth.reliability *
        onboarding *
        clarity *
        (0.65 + managerFit * 0.35) *
        collaborationFactor *
        (1 - overloadPenalty),
      0,
      1.4,
    );
    truth.actualContribution = actual;
    truth.periodsObserved += 1;
    truth.morale = clamp(
      truth.morale +
        (actual > 0.65 ? 0.025 : -0.02) -
        Math.max(0, member.workload - 0.9) * 0.08 +
        (context.kernel.simulationDay - (member.lastOneOnOneDay ?? 0) > 45
          ? -0.035
          : 0),
    );
    const noisy = clamp(actual + context.rng.normal(0, 0.2));
    member.performanceSignal = performanceSignal(actual, noisy);
    member.performanceConfidence = Math.min(
      90,
      18 + truth.periodsObserved * 13,
    );
    if (truth.morale < 0.34) member.retentionSignal = "flight_risk";
    else if (truth.morale < 0.52) member.retentionSignal = "watch";
    else member.retentionSignal = "stable";
    context.emit({
      type: "workforce-and-organization.performance_signal_recorded",
      visibility: "public",
      sourceId: member.id,
      payload: {
        employeeId: member.id,
        signal: member.performanceSignal,
        confidence: member.performanceConfidence,
      },
    });

    const monthlySalary = member.annualSalary / 12;
    payroll += monthlySalary;
    const exitPressure =
      (1 - truth.morale) * 0.38 +
      Math.max(0, member.workload - 1) * 0.18 +
      truth.ambition * 0.08 +
      (member.performanceSignal === "concerning" ? 0.06 : 0);
    if (
      member.status === "active" &&
      context.rng.nextFloat() <
        clamp(exitPressure - truth.exitThreshold + 0.12, 0.01, 0.28)
    ) {
      truth.jobSearch = true;
      member.status = "notice";
      member.retentionSignal = "notice_given";
      const noticeDays =
        member.employmentType === "contractor"
          ? jurisdiction.contractorNoticeDays
          : jurisdiction.employeeNoticeDays;
      context.schedule({
        type: "workforce-and-organization.departure_complete",
        dueDay: context.kernel.simulationDay + Math.max(1, noticeDays),
        sourceId: member.id,
        payload: { reason: "resignation" },
        sampledOutcome: { knowledgeLoss: truth.knowledge.length },
      });
      addSignal(
        context,
        "retention",
        "critical",
        `${member.name} submitted notice; the reasons remain only partially observable.`,
        [member.id],
      );
      context.emit({
        type: "workforce-and-organization.resignation_submitted",
        visibility: "public",
        sourceId: member.id,
        payload: { employeeId: member.id, noticeDays },
      });
    }

    const opportunity =
      context.ownState.private.controlGap * (0.45 + member.workload * 0.25);
    const propensity = Math.max(
      truth.misconductPropensity.financial,
      truth.misconductPropensity.data,
      truth.misconductPropensity.interpersonal,
      truth.misconductPropensity.conflict,
    );
    const pressure =
      context.ownState.private.politicsPressure * 0.35 +
      (1 - truth.morale) * 0.25;
    if (
      member.status === "active" &&
      context.rng.nextFloat() <
        clamp(opportunity * propensity + pressure * propensity, 0, 0.12)
    ) {
      const families = Object.entries(truth.misconductPropensity).sort(
        (left, right) => right[1] - left[1],
      );
      const family = families[0]?.[0] ?? "conflict";
      const type =
        family === "financial"
          ? context.rng.categorical({
              expense_fraud: 0.45,
              falsified_work: 0.35,
              theft: 0.2,
            })
          : family === "data"
            ? context.rng.categorical({
                data_misuse: 0.28,
                credential_misuse: 0.24,
                ip_leakage: 0.2,
                negligent_security: 0.2,
                sabotage: 0.08,
              })
            : family === "interpersonal"
              ? context.rng.categorical({
                  harassment_complaint: 0.44,
                  discrimination_allegation: 0.22,
                  retaliation: 0.18,
                  privacy_complaint: 0.16,
                })
              : context.rng.categorical({
                  conflict_of_interest: 0.68,
                  employment_contract_dispute: 0.32,
                });
      truth.hiddenActs.push(`${type}:${context.kernel.simulationDay}`);
      context.emit({
        type: "workforce-and-organization.exposure_detected",
        sourceId: member.id,
        payload: {
          employeeId: member.id,
          type,
          severity: propensity > 0.2 ? 3 : 2,
          causalFactors: [
            "control_gap",
            pressure > 0.15 ? "workplace_pressure" : "opportunity",
          ],
        },
      });
    }
    const classificationExposure =
      member.employmentType === "contractor" &&
      context.kernel.simulationDay - member.startDay >= 90 &&
      member.workload >= 0.85 &&
      member.ownership.length > 0;
    if (
      classificationExposure &&
      context.rng.nextFloat() < jurisdiction.misclassificationSensitivity * 0.08
    ) {
      context.emit({
        type: "workforce-and-organization.exposure_detected",
        sourceId: member.id,
        payload: {
          employeeId: member.id,
          type: "contractor_misclassification",
          severity: 3,
          causalFactors: [
            "long_tenure",
            "company_control",
            "core_work_ownership",
          ],
        },
      });
    }
  }

  const managers = active.filter(
    (member) =>
      member.level === "manager" &&
      member.status === "active" &&
      member.delegatedMandates.length > 0,
  );
  for (const manager of managers) {
    const truth = context.ownState.private.employeeTruth[manager.id];
    if (!truth) continue;
    const reports = active.filter((member) => member.managerId === manager.id);
    const observedPressure = clamp(
      reports.length / 7 +
        context.ownState.private.politicsPressure * 0.45 +
        Math.max(0, manager.workload - 1) * 0.3,
    );
    const materialSignals = reports.filter(
      (member) =>
        member.performanceSignal === "concerning" ||
        member.retentionSignal === "flight_risk",
    );
    if (materialSignals.length > 0 && observedPressure > 0.25) {
      const conceal =
        context.rng.nextFloat() <
        clamp(
          truth.managementPropensities.concealment * observedPressure,
          0,
          0.72,
        );
      if (conceal) {
        truth.memory.push(
          `Presented an optimistic status update under pressure on day ${context.kernel.simulationDay}`,
        );
        addSignal(
          context,
          "management",
          "low",
          `${manager.name} reported controlled delivery; the status packet has thin underlying evidence.`,
          [manager.id],
        );
        context.emit({
          type: "workforce-and-organization.manager_report_distorted",
          sourceId: manager.id,
          payload: {
            managerId: manager.id,
            drivers: ["span_pressure", "weak_escalation_incentive"],
            affectedReportIds: materialSignals.map((item) => item.id),
          },
        });
      } else if (
        context.rng.nextFloat() <
        truth.managementPropensities.escalationDiscipline
      ) {
        addSignal(
          context,
          "management",
          "material",
          `${manager.name} escalated delivery or retention concerns affecting ${materialSignals.length} report(s).`,
          [manager.id, ...materialSignals.map((item) => item.id)],
        );
        context.emit({
          type: "workforce-and-organization.manager_risk_escalated",
          visibility: "public",
          sourceId: manager.id,
          payload: {
            managerId: manager.id,
            affectedReportIds: materialSignals.map((item) => item.id),
          },
        });
      } else {
        context.ownState.private.politicsPressure = clamp(
          context.ownState.private.politicsPressure + 0.04,
        );
      }
    }
    if (
      reports.length >= 2 &&
      context.ownState.private.politicsPressure > 0.3 &&
      context.rng.nextFloat() <
        truth.managementPropensities.favoritism * observedPressure * 0.4
    ) {
      const favored = [...reports].sort((left, right) =>
        left.id.localeCompare(right.id),
      )[0];
      for (const edge of context.ownState.private.socialGraph.filter(
        (item) =>
          item.toId === favored.id &&
          reports.some((report) => report.id === item.fromId),
      )) {
        edge.trust = clamp(edge.trust - 0.05);
        edge.rivalry = clamp(edge.rivalry + 0.06);
        edge.memory.push(
          `Perceived unequal credit allocation on day ${context.kernel.simulationDay}`,
        );
        edge.memory = edge.memory.slice(-20);
      }
      context.emit({
        type: "workforce-and-organization.manager_favoritism_pressure",
        sourceId: manager.id,
        payload: {
          managerId: manager.id,
          causalFactors: ["scarcity", "credit_allocation"],
        },
      });
    }
    truth.memory = truth.memory.slice(-80);
  }

  if (payroll > 0) {
    economic(context, {
      transactionId: `payroll-${context.kernel.fiscalPeriod}`,
      kind: "payroll",
      amount: rounded(payroll, 2),
      memo: `Workforce payroll for ${context.kernel.fiscalPeriod}`,
      dueDay: context.kernel.simulationDay,
    });
    economic(context, {
      transactionId: `people-tax-benefits-${context.kernel.fiscalPeriod}`,
      kind: "benefits_tax",
      amount: rounded(
        payroll *
          (jurisdiction.employerPayrollTaxRate + jurisdiction.benefitsRate),
        2,
      ),
      memo: `Employer taxes and benefits for ${context.kernel.fiscalPeriod}`,
      dueDay: context.kernel.simulationDay,
    });
    context.emit({
      type: "workforce-and-organization.payroll_obligation_created",
      visibility: "public",
      sourceId: context.kernel.fiscalPeriod,
      payload: {
        grossPayroll: rounded(payroll, 2),
        period: context.kernel.fiscalPeriod,
      },
    });
  }

  const managerSpanPressure =
    context.ownState.public.employees.filter(
      (item) => item.managerId === "founder" && item.status !== "departed",
    ).length / 8;
  const fairness = context.ownState.private.compensationFairness;
  context.ownState.private.politicsPressure = clamp(
    context.ownState.private.politicsPressure * 0.75 +
      Math.max(0, 1 - fairness) * 0.18 +
      Math.max(0, managerSpanPressure - 1) * 0.12,
  );
  if (
    context.ownState.private.politicsPressure > 0.48 &&
    active.length >= 3 &&
    context.rng.nextFloat() < context.ownState.private.politicsPressure * 0.22
  ) {
    const sorted = [...active].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const first = sorted[Math.floor(context.rng.nextFloat() * sorted.length)];
    const second = sorted.find((item) => item.id !== first.id) ?? first;
    addSignal(
      context,
      "conflict",
      context.ownState.private.politicsPressure > 0.72
        ? "critical"
        : "material",
      "Conflicting ownership claims and inconsistent reporting have become visible.",
      [first.id, second.id],
    );
    context.emit({
      type: "workforce-and-organization.conflict_observed",
      visibility: "public",
      sourceId: `${first.id}:${second.id}`,
      payload: {
        actorIds: [first.id, second.id],
        drivers: ["ownership_ambiguity", "resource_scarcity"],
      },
    });
  }
  capacityChanged(context);
  managementDemand(context);
  context.schedule({
    type: "workforce-and-organization.performance_period",
    dueDay: context.kernel.simulationDay + periodDays,
    sourceId: "workforce",
    payload: { periodDays },
    sampledOutcome: { period: context.kernel.fiscalPeriod },
  });
}

function completeDeparture(
  context: WorkforceContext,
  employeeId: string,
  reason: string,
): void {
  const member = context.ownState.public.employees.find(
    (item) => item.id === employeeId,
  );
  if (!member || member.status === "departed") return;
  const truth = context.ownState.private.employeeTruth[employeeId];
  member.status = "departed";
  member.workload = 0;
  const knowledgeLoss = truth?.knowledge.length ?? 0;
  for (const edge of context.ownState.private.socialGraph.filter(
    (item) => item.toId === employeeId,
  )) {
    const peerTruth = context.ownState.private.employeeTruth[edge.fromId];
    const peer = context.ownState.public.employees.find(
      (item) => item.id === edge.fromId && item.status === "active",
    );
    if (!peerTruth || !peer) continue;
    const contagion = Math.min(
      0.08,
      edge.trust * edge.influence * 0.12 + edge.dependency * 0.04,
    );
    peerTruth.morale = clamp(peerTruth.morale - contagion);
    if (contagion > 0.045 && peer.retentionSignal === "stable")
      peer.retentionSignal = "watch";
  }
  if (knowledgeLoss > 0)
    addSignal(
      context,
      "knowledge",
      knowledgeLoss > 3 ? "critical" : "material",
      `${member.name} left with concentrated ownership that was not fully transferred.`,
      [member.id],
    );
  if (
    truth &&
    knowledgeLoss > 0 &&
    context.rng.nextFloat() <
      clamp(truth.misconductPropensity.data * knowledgeLoss * 0.08, 0, 0.24)
  ) {
    context.emit({
      type: "workforce-and-organization.exposure_detected",
      sourceId: member.id,
      payload: {
        employeeId: member.id,
        type: reason.startsWith("termination")
          ? "confidentiality_dispute"
          : "ip_leakage",
        severity: knowledgeLoss > 3 ? 4 : 2,
        causalFactors: ["knowledge_not_transferred", "offboarding_gap"],
      },
    });
  }
  context.emit({
    type: "workforce-and-organization.employee_departed",
    visibility: "public",
    sourceId: employeeId,
    payload: { employeeId, reason, knowledgeLoss },
  });
  capacityChanged(context);
  managementDemand(context);
}

function createInventory(
  count: number,
): WorkforcePrivateStateV10["sourceInventory"] {
  const roles = roleSchema.options;
  return Object.fromEntries(
    roles.map((role) => [
      role,
      { network: count, inbound: count, outbound: count, agency: count },
    ]),
  ) as WorkforcePrivateStateV10["sourceInventory"];
}

export function createWorkforceFeatureV10(): SimulationFeatureV10<
  WorkforcePublicStateV10,
  WorkforcePrivateStateV10,
  z.infer<typeof configSchema>
> {
  return {
    id: "workforce-and-organization",
    version: "1.0.0",
    dependencies: [
      { id: "external-world", versionRange: "^1.0.0" },
      { id: "jurisdiction-rules", versionRange: "^1.0.0" },
      { id: "founder-and-management", versionRange: "^1.0.0" },
      { id: "finance-and-treasury", versionRange: "^1.0.0" },
    ],
    compatibleEngineRange: ">=10.0.0 <11.0.0",
    configSchema,
    publicStateSchema: workforcePublicStateSchemaV10,
    privateStateSchema: workforcePrivateStateSchemaV10,
    initialize: ({ kernel, config, rng, schedule }) => {
      const founderSkills = {
        functional: 0.58,
        execution: 0.62,
        judgment: 0.55,
        learning: 0.72,
        collaboration: 0.5,
        leadership: 0.42,
      };
      const founder: EmployeeProjectionV10 = {
        id: "founder",
        name: `${kernel.companyName} founder`,
        role:
          kernel.founderProfileId === "commercial_hunter"
            ? "sales"
            : kernel.founderProfileId === "technical_builder"
              ? "engineering"
              : "product",
        level: "manager",
        employmentType: "founder",
        managerId: null,
        startDay: 0,
        status: "active",
        annualSalary: 0,
        optionBps: 10_000,
        workload: 1,
        performanceSignal: "unknown",
        performanceConfidence: 0,
        retentionSignal: "stable",
        onboardingProgress: 100,
        ownership: ["company"],
        warnings: [],
        lastOneOnOneDay: null,
        performanceProcess: null,
        delegatedMandates: [],
      };
      schedule({
        type: "workforce-and-organization.performance_period",
        dueDay: config.performancePeriodDays,
        sourceId: "workforce",
        payload: { periodDays: config.performancePeriodDays },
        sampledOutcome: { initialized: true },
      });
      return {
        public: {
          organizationVersion: "workforce-v1",
          openRoles: [],
          candidates: [],
          employees: [founder],
          signals: [],
          recruitingReputation: "credible",
          cultureSignal: "functional",
          policies: {
            oneOnOneCadenceDays: 30,
            documentationStandard: "minimal",
            accessReviewCadenceDays: 90,
          },
        },
        private: {
          candidateTruth: {},
          employeeTruth: {
            founder: {
              employeeId: "founder",
              skills: founderSkills,
              roleFit: 1,
              reliability: 0.75,
              ambition: 0.85,
              riskTolerance: 0.7,
              burnoutSensitivity: 0.68,
              exitThreshold: 1,
              morale: 0.72,
              managerTrust: 1,
              jobSearch: false,
              actualContribution: 0,
              periodsObserved: 0,
              misconductPropensity: {
                financial: 0,
                data: 0,
                interpersonal: 0,
                conflict: 0,
              },
              memory: [],
              hiddenActs: [],
              knowledge: ["company"],
              communicationStyle: "direct",
              managementPropensities: {
                concealment: 0,
                favoritism: 0,
                escalationDiscipline: 0.8,
              },
            },
          },
          socialGraph: [],
          sourceInventory: createInventory(
            config.startingCandidatePoolPerChannel,
          ),
          nextRoleId: 1,
          nextCandidateId: 1,
          nextEmployeeId: 1,
          nextSignalId: 1,
          politicsPressure: 0.08,
          controlGap: clamp(0.62 + rng.normal(0, 0.08)),
          compensationFairness: 0.72,
        },
      };
    },
    commands: {
      "workforce.role.open": (context) => {
        if (context.command.type !== "workforce.role.open") return;
        if (
          context.ownState.public.openRoles.filter(
            (item) => item.status === "open",
          ).length >= 10
        )
          throw new Error("OPEN_ROLE_LIMIT");
        const payload = context.command.payload;
        const id = `role-${context.ownState.private.nextRoleId++}`;
        context.ownState.public.openRoles.push({
          ...payload,
          id,
          filled: 0,
          status: "open",
          openedDay: context.kernel.simulationDay,
        });
        context.emit({
          type: "workforce-and-organization.role_opened",
          visibility: "public",
          sourceId: id,
          payload: {
            roleId: id,
            title: payload.title,
            headcount: payload.headcount,
          },
        });
        managementDemand(context);
      },
      "workforce.candidate.source": (context) => {
        if (context.command.type !== "workforce.candidate.source") return;
        sourceCandidates(
          context,
          context.command.payload.roleId,
          context.command.payload.channel,
          context.command.payload.count,
        );
      },
      "workforce.candidate.assess": (context) => {
        if (context.command.type !== "workforce.candidate.assess") return;
        assessCandidate(
          context,
          context.command.payload.candidateId,
          context.command.payload.method,
          context.command.payload.panelCluster,
        );
      },
      "workforce.offer.make": (context) => {
        if (context.command.type !== "workforce.offer.make") return;
        makeOffer(
          context,
          context.command.payload.candidateId,
          context.command.payload.salary,
          context.command.payload.optionBps,
          context.command.payload.startDelayDays,
        );
      },
      "workforce.offer.withdraw": (context) => {
        if (context.command.type !== "workforce.offer.withdraw") return;
        const view = candidate(context, context.command.payload.candidateId);
        if (view.stage !== "offer_pending")
          throw new Error("OFFER_NOT_PENDING");
        view.stage = "withdrawn";
        view.offer = null;
        context.emit({
          type: "workforce-and-organization.offer_withdrawn",
          visibility: "public",
          sourceId: view.id,
          payload: { candidateId: view.id },
        });
      },
      "workforce.assignment.set": (context) => {
        if (context.command.type !== "workforce.assignment.set") return;
        const member = employee(context, context.command.payload.employeeId);
        if (!["active", "onboarding"].includes(member.status))
          throw new Error("EMPLOYEE_NOT_ASSIGNABLE");
        member.workload = context.command.payload.workload;
        member.ownership = [...new Set(context.command.payload.ownership)];
        const truth = context.ownState.private.employeeTruth[member.id];
        if (truth)
          truth.knowledge = [
            ...new Set([...truth.knowledge, ...member.ownership]),
          ].slice(-20);
        capacityChanged(context);
      },
      "workforce.manager.assign": (context) => {
        if (context.command.type !== "workforce.manager.assign") return;
        const member = employee(context, context.command.payload.employeeId);
        const manager = employee(context, context.command.payload.managerId);
        if (manager.level !== "manager" && manager.id !== "founder")
          throw new Error("MANAGER_ROLE_REQUIRED");
        if (
          member.id === manager.id ||
          reportingCycle(
            context.ownState.public.employees,
            member.id,
            manager.id,
          )
        )
          throw new Error("REPORTING_GRAPH_CYCLE");
        member.managerId = manager.id;
        managementDemand(context);
      },
      "workforce.one_on_one.hold": (context) => {
        if (context.command.type !== "workforce.one_on_one.hold") return;
        const member = employee(context, context.command.payload.employeeId);
        if (member.lastOneOnOneDay === context.kernel.simulationDay)
          throw new Error("ONE_ON_ONE_ALREADY_RECORDED_TODAY");
        const management = context.query(
          "founder-and-management.capacity",
        ) as ManagementView;
        if (management.availableHours < 1)
          throw new Error("MANAGEMENT_CAPACITY_EXHAUSTED");
        member.lastOneOnOneDay = context.kernel.simulationDay;
        const truth = context.ownState.private.employeeTruth[member.id];
        if (truth) {
          truth.managerTrust = clamp(
            truth.managerTrust +
              (context.command.payload.focus === "retention" ? 0.08 : 0.04),
          );
          truth.morale = clamp(truth.morale + 0.025);
          truth.memory.push(
            `1:1 focused on ${context.command.payload.focus} on day ${context.kernel.simulationDay}`,
          );
          truth.memory = truth.memory.slice(-80);
          if (
            context.command.payload.focus === "retention" &&
            truth.morale < 0.5
          )
            member.retentionSignal = "watch";
        }
        context.emit({
          type: "workforce-and-organization.one_on_one_held",
          visibility: "public",
          sourceId: member.id,
          payload: {
            employeeId: member.id,
            focus: context.command.payload.focus,
          },
        });
      },
      "workforce.feedback.record": (context) => {
        if (context.command.type !== "workforce.feedback.record") return;
        const member = employee(context, context.command.payload.employeeId);
        const truth = context.ownState.private.employeeTruth[member.id];
        if (truth) {
          const dailyMarker = `Feedback recorded on day ${context.kernel.simulationDay}`;
          if (truth.memory.includes(dailyMarker))
            throw new Error("FEEDBACK_ALREADY_RECORDED_TODAY");
          const trustDelta =
            context.command.payload.style === "coaching"
              ? 0.04
              : context.command.payload.style === "ambiguous"
                ? -0.06
                : truth.skills.collaboration < 0.4
                  ? -0.02
                  : 0.01;
          truth.managerTrust = clamp(truth.managerTrust + trustDelta);
          truth.memory.push(
            dailyMarker,
            `Feedback (${context.command.payload.style}): ${context.command.payload.topic}`,
          );
          truth.memory = truth.memory.slice(-80);
        }
        const evidenceId = `feedback-${context.command.commandId}`;
        if (member.performanceProcess)
          member.performanceProcess.evidenceIds.push(evidenceId);
        context.emit({
          type: "workforce-and-organization.feedback_recorded",
          visibility: "public",
          sourceId: member.id,
          payload: {
            employeeId: member.id,
            style: context.command.payload.style,
            evidenceId,
          },
        });
      },
      "workforce.compensation.change": (context) => {
        if (context.command.type !== "workforce.compensation.change") return;
        const member = employee(context, context.command.payload.employeeId);
        member.annualSalary = context.command.payload.salary;
        member.optionBps = context.command.payload.optionBps;
        const truth = context.ownState.private.employeeTruth[member.id];
        if (truth)
          truth.memory.push(
            `Compensation changed on day ${context.kernel.simulationDay}`,
          );
        const salaries = context.ownState.public.employees
          .filter(
            (item) =>
              item.employmentType !== "founder" && item.status !== "departed",
          )
          .map((item) => item.annualSalary);
        if (salaries.length > 1)
          context.ownState.private.compensationFairness = clamp(
            Math.min(...salaries) / Math.max(...salaries),
          );
        context.emit({
          type: "workforce-and-organization.compensation_changed",
          visibility: "public",
          sourceId: member.id,
          payload: {
            employeeId: member.id,
            annualSalary: member.annualSalary,
            optionBps: member.optionBps,
          },
        });
      },
      "workforce.role.change": (context) => {
        if (context.command.type !== "workforce.role.change") return;
        const member = employee(context, context.command.payload.employeeId);
        member.role = context.command.payload.role;
        member.level = context.command.payload.level;
        const truth = context.ownState.private.employeeTruth[member.id];
        if (truth)
          truth.roleFit = clamp(
            truth.roleFit + context.rng.normal(-0.04, 0.12),
          );
        context.emit({
          type: "workforce-and-organization.role_changed",
          visibility: "public",
          sourceId: member.id,
          payload: {
            employeeId: member.id,
            role: member.role,
            level: member.level,
          },
        });
      },
      "workforce.performance_process.start": (context) => {
        if (context.command.type !== "workforce.performance_process.start")
          return;
        const member = employee(context, context.command.payload.employeeId);
        member.performanceProcess = {
          expectations: context.command.payload.expectations,
          startedDay: context.kernel.simulationDay,
          reviewDay:
            context.kernel.simulationDay + context.command.payload.reviewDays,
          evidenceIds: [],
        };
        context.emit({
          type: "workforce-and-organization.performance_process_started",
          visibility: "public",
          sourceId: member.id,
          payload: {
            employeeId: member.id,
            reviewDay: member.performanceProcess.reviewDay,
          },
        });
      },
      "workforce.resignation.respond": (context) => {
        if (context.command.type !== "workforce.resignation.respond") return;
        const member = employee(context, context.command.payload.employeeId);
        if (member.status !== "notice")
          throw new Error("RESIGNATION_NOT_PENDING");
        const truth = context.ownState.private.employeeTruth[member.id];
        const response = context.command.payload.response;
        if (response === "counteroffer") {
          if (
            !context.command.payload.salary ||
            context.command.payload.salary <= member.annualSalary
          )
            throw new Error("COUNTEROFFER_RAISE_REQUIRED");
          const retained =
            context.rng.nextFloat() <
            clamp(
              (context.command.payload.salary /
                Math.max(1, member.annualSalary) -
                1) *
                1.2 +
                (truth?.managerTrust ?? 0.4) * 0.25 -
                (truth?.ambition ?? 0.5) * 0.2,
              0.05,
              0.65,
            );
          member.annualSalary = context.command.payload.salary;
          if (retained) {
            member.status = "active";
            member.retentionSignal = "watch";
            context.emit({
              type: "workforce-and-organization.resignation_withdrawn",
              visibility: "public",
              sourceId: member.id,
              payload: { employeeId: member.id },
            });
            return;
          }
        } else if (response === "change_role" && truth) {
          truth.roleFit = clamp(truth.roleFit + 0.12);
          if (
            context.rng.nextFloat() < clamp(truth.managerTrust + 0.15, 0.1, 0.8)
          ) {
            member.status = "active";
            member.retentionSignal = "watch";
            return;
          }
        } else if (response === "negotiate_handoff" && truth) {
          truth.knowledge = truth.knowledge.slice(
            0,
            Math.ceil(truth.knowledge.length / 2),
          );
        }
        context.emit({
          type: "workforce-and-organization.resignation_response_recorded",
          visibility: "public",
          sourceId: member.id,
          payload: { employeeId: member.id, response },
        });
      },
      "workforce.termination.plan": (context) => {
        if (context.command.type !== "workforce.termination.plan") return;
        const member = employee(context, context.command.payload.employeeId);
        if (member.employmentType === "founder")
          throw new Error("FOUNDER_TERMINATION_UNSUPPORTED");
        const jurisdiction = rules(context);
        const documented =
          !jurisdiction.documentationRequired ||
          context.command.payload.documentationIds.length >= 2 ||
          context.command.payload.reason === "role_eliminated";
        const noticeDays =
          member.employmentType === "contractor"
            ? jurisdiction.contractorNoticeDays
            : jurisdiction.employeeNoticeDays;
        member.status = "notice";
        context.schedule({
          type: "workforce-and-organization.termination_complete",
          dueDay: context.kernel.simulationDay + Math.max(1, noticeDays),
          sourceId: member.id,
          payload: { reason: context.command.payload.reason, documented },
          sampledOutcome: {
            knowledgeLoss:
              context.ownState.private.employeeTruth[member.id]?.knowledge
                .length ?? 0,
          },
        });
        context.emit({
          type: "workforce-and-organization.termination_requested",
          sourceId: member.id,
          payload: {
            employeeId: member.id,
            reason: context.command.payload.reason,
            documented,
            noticeDays,
            documentationIds: context.command.payload.documentationIds,
          },
        });
        return { checkpointRequired: true };
      },
      "workforce.layoff.plan": (context) => {
        if (context.command.type !== "workforce.layoff.plan") return;
        const ids = [...new Set(context.command.payload.employeeIds)];
        const jurisdiction = rules(context);
        for (const id of ids) {
          const member = employee(context, id);
          if (member.employmentType === "founder")
            throw new Error("FOUNDER_LAYOFF_UNSUPPORTED");
          member.status = "notice";
          const noticeDays =
            member.employmentType === "contractor"
              ? jurisdiction.contractorNoticeDays
              : jurisdiction.employeeNoticeDays;
          context.schedule({
            type: "workforce-and-organization.layoff_complete",
            dueDay: context.kernel.simulationDay + Math.max(1, noticeDays),
            sourceId: member.id,
            payload: { reason: context.command.payload.reason },
            sampledOutcome: {
              severanceWeeks: jurisdiction.severanceWeeksPerYear,
            },
          });
        }
        addSignal(
          context,
          "management",
          "critical",
          `A ${ids.length}-person layoff was announced; payroll savings are delayed until departures complete.`,
          ids,
        );
        context.emit({
          type: "workforce-and-organization.layoff_announced",
          visibility: "public",
          sourceId: context.command.commandId,
          payload: {
            employeeIds: ids,
            reason: context.command.payload.reason,
            consultationRequired: jurisdiction.consultationRequiredForLayoff,
          },
        });
        return { checkpointRequired: true };
      },
    },
    effects: {
      "workforce-and-organization.assessment_complete": (context) => {
        const view = candidate(context, context.effect.sourceId);
        if (view.stage !== "assessment_pending") return;
        const payload = context.effect.payload as {
          method: CandidateAssessmentMethodV10;
          panelCluster: string;
        };
        const outcome = context.effect.sampledOutcome as {
          observed: number;
          reliability: number;
          contradiction: boolean;
        };
        view.assessments.push({
          id: context.effect.id,
          method: payload.method,
          panelCluster: payload.panelCluster,
          completedDay: context.kernel.simulationDay,
          observation: outcome.observed,
          reliability: outcome.reliability,
          contradiction: outcome.contradiction,
        });
        view.stage = "assessed";
        updateEstimate(view);
        context.emit({
          type: "workforce-and-organization.assessment_recorded",
          visibility: "public",
          sourceId: view.id,
          payload: {
            candidateId: view.id,
            method: payload.method,
            observation: outcome.observed,
            reliability: rounded(outcome.reliability, 2),
            contradiction: outcome.contradiction,
          },
        });
      },
      "workforce-and-organization.offer_response": (context) => {
        const view = candidate(context, context.effect.sourceId);
        if (view.stage !== "offer_pending" || !view.offer) return;
        const outcome = context.effect.sampledOutcome as {
          accepted: boolean;
          startDay: number;
        };
        if (!outcome.accepted) {
          view.stage = "declined";
          context.emit({
            type: "workforce-and-organization.offer_declined",
            visibility: "public",
            sourceId: view.id,
            payload: { candidateId: view.id },
          });
          return;
        }
        view.stage = "notice";
        context.schedule({
          type: "workforce-and-organization.employee_start",
          dueDay: outcome.startDay,
          sourceId: view.id,
          payload: {},
          sampledOutcome: { accepted: true },
        });
        context.emit({
          type: "workforce-and-organization.offer_accepted",
          visibility: "public",
          sourceId: view.id,
          payload: { candidateId: view.id, plannedStartDay: outcome.startDay },
        });
      },
      "workforce-and-organization.employee_start": (context) =>
        startEmployee(context, context.effect.sourceId),
      "workforce-and-organization.onboarding_progress": (context) => {
        const member = context.ownState.public.employees.find(
          (item) =>
            item.id === context.effect.sourceId && item.status === "onboarding",
        );
        if (!member) return;
        const outcome = context.effect.sampledOutcome as { progress: number };
        member.onboardingProgress = Math.min(
          100,
          member.onboardingProgress + outcome.progress,
        );
        if (member.onboardingProgress >= 100) {
          member.status = "active";
          context.emit({
            type: "workforce-and-organization.onboarding_completed",
            visibility: "public",
            sourceId: member.id,
            payload: { employeeId: member.id },
          });
          capacityChanged(context);
        } else {
          context.schedule({
            type: "workforce-and-organization.onboarding_progress",
            dueDay: context.kernel.simulationDay + 14,
            sourceId: member.id,
            payload: { step: 2 },
            sampledOutcome: { progress: 50 },
          });
        }
        managementDemand(context);
      },
      "workforce-and-organization.performance_period": (context) => {
        const periodDays =
          (context.effect.payload as { periodDays?: number }).periodDays ?? 30;
        performancePeriod(context, periodDays);
      },
      "workforce-and-organization.departure_complete": (context) =>
        completeDeparture(
          context,
          context.effect.sourceId,
          (context.effect.payload as { reason?: string }).reason ??
            "resignation",
        ),
      "workforce-and-organization.termination_complete": (context) => {
        const member = context.ownState.public.employees.find(
          (item) => item.id === context.effect.sourceId,
        );
        if (!member || member.status === "departed") return;
        member.status = "terminated";
        const payload = context.effect.payload as {
          reason: string;
          documented: boolean;
        };
        context.emit({
          type: "workforce-and-organization.termination_completed",
          visibility: "public",
          sourceId: member.id,
          payload: { employeeId: member.id, ...payload },
        });
        completeDeparture(context, member.id, `termination:${payload.reason}`);
      },
      "workforce-and-organization.layoff_complete": (context) => {
        const member = context.ownState.public.employees.find(
          (item) => item.id === context.effect.sourceId,
        );
        if (!member || member.status === "departed") return;
        const jurisdiction = rules(context);
        const tenureYears = Math.max(
          0.25,
          (context.kernel.simulationDay - member.startDay) / 360,
        );
        const severance =
          member.employmentType === "employee"
            ? rounded(
                (member.annualSalary / 52) *
                  jurisdiction.severanceWeeksPerYear *
                  tenureYears,
                2,
              )
            : 0;
        if (severance > 0)
          economic(context, {
            transactionId: `severance-${member.id}-${context.kernel.simulationDay}`,
            kind: "severance",
            amount: severance,
            memo: `Severance for ${member.name}`,
            dueDay: context.kernel.simulationDay,
          });
        completeDeparture(context, member.id, "layoff");
      },
    },
    queries: [
      {
        id: "workforce-and-organization.employee",
        resolve: ({ ownState }, input) => {
          const id = (input as { employeeId?: string } | undefined)?.employeeId;
          const publicEmployee = ownState.public.employees.find(
            (item) => item.id === id,
          );
          const truth = id ? ownState.private.employeeTruth[id] : undefined;
          return publicEmployee && truth
            ? {
                public: structuredClone(publicEmployee),
                documentationCount:
                  publicEmployee.performanceProcess?.evidenceIds.length ?? 0,
                managerTrust: truth.managerTrust,
              }
            : null;
        },
      },
      {
        id: "workforce-and-organization.capacity",
        resolve: ({ ownState }) => {
          const active = ownState.public.employees.filter(
            (item) =>
              item.employmentType !== "founder" &&
              ["active", "onboarding"].includes(item.status),
          );
          return {
            headcount: active.length + 1,
            monthlyPayroll: active.reduce(
              (sum, item) => sum + item.annualSalary / 12,
              0,
            ),
          };
        },
      },
    ],
    eventSubscriptions: [
      {
        id: "workforce-validates-delegation",
        eventType: "founder-and-management.delegation_changed",
        handle: (context, event) => {
          const payload = event.payload as {
            managerId: string;
            mandate: EmployeeProjectionV10["delegatedMandates"][number];
          };
          const manager = context.ownState.public.employees.find(
            (item) => item.id === payload.managerId && item.status === "active",
          );
          if (!manager || manager.level !== "manager")
            throw new Error("DELEGATION_MANAGER_NOT_AVAILABLE");
          if (!manager.delegatedMandates.includes(payload.mandate))
            manager.delegatedMandates.push(payload.mandate);
        },
      },
      {
        id: "workforce-applies-employment-interim-measure",
        eventType: "employment-cases.interim_measure_requested",
        handle: (context, event) => {
          const payload = event.payload as {
            employeeId: string;
            action: string;
          };
          const member = context.ownState.public.employees.find(
            (item) => item.id === payload.employeeId,
          );
          if (!member) return;
          if (payload.action === "interim_leave") {
            member.status = "leave";
            member.workload = 0;
          }
          if (payload.action === "limit_access")
            member.warnings.push(
              `Access limited on day ${event.simulationDay}`,
            );
          capacityChanged(context);
        },
      },
      {
        id: "workforce-applies-case-remediation",
        eventType: "employment-cases.remediation_requested",
        handle: (context, event) => {
          const payload = event.payload as {
            employeeId: string;
            action: string;
          };
          const member = context.ownState.public.employees.find(
            (item) => item.id === payload.employeeId,
          );
          if (!member) return;
          if (payload.action === "warning")
            member.warnings.push(
              `Formal warning on day ${event.simulationDay}`,
            );
          if (payload.action === "reassign") member.ownership = [];
          if (payload.action === "coaching") member.performanceSignal = "mixed";
        },
      },
      {
        id: "workforce-applies-case-termination",
        eventType: "employment-cases.termination_authorized",
        handle: (context, event) => {
          const payload = event.payload as {
            employeeId: string;
            caseId: string;
            finding: string;
          };
          const member = context.ownState.public.employees.find(
            (item) => item.id === payload.employeeId,
          );
          if (
            !member ||
            member.status === "departed" ||
            member.employmentType === "founder"
          )
            return;
          const jurisdiction = rules(context);
          const documented = payload.finding === "substantiated";
          const noticeDays =
            member.employmentType === "contractor"
              ? jurisdiction.contractorNoticeDays
              : jurisdiction.employeeNoticeDays;
          member.status = "notice";
          context.schedule({
            type: "workforce-and-organization.termination_complete",
            dueDay: context.kernel.simulationDay + Math.max(1, noticeDays),
            sourceId: member.id,
            payload: { reason: `case:${payload.caseId}`, documented },
            sampledOutcome: {
              knowledgeLoss:
                context.ownState.private.employeeTruth[member.id]?.knowledge
                  .length ?? 0,
            },
          });
          context.emit({
            type: "workforce-and-organization.termination_requested",
            sourceId: member.id,
            payload: {
              employeeId: member.id,
              reason: `case:${payload.caseId}`,
              documented,
              noticeDays,
              documentationIds: [payload.caseId],
            },
          });
        },
      },
      {
        id: "workforce-closes-case-interim-leave",
        eventType: "employment-cases.employment_case_resolved",
        handle: (context, event) => {
          const payload = event.payload as { employeeId?: string };
          const member = context.ownState.public.employees.find(
            (item) => item.id === payload.employeeId,
          );
          if (!member || member.status !== "leave") return;
          member.status = "active";
          member.workload = 0;
          member.warnings.push(
            `Returned from interim leave on day ${event.simulationDay}; assignment requires review.`,
          );
          capacityChanged(context);
        },
      },
    ],
    hooks: {},
    invariants: [
      {
        id: "workforce-actor-identities-unique",
        check: ({ ownState }) => {
          const ids = ownState.public.employees.map((item) => item.id);
          if (new Set(ids).size !== ids.length || ids.length > 25)
            throw new Error("WORKFORCE_ACTOR_IDENTITY_INVALID");
          const candidateIds = ownState.public.candidates.map(
            (item) => item.id,
          );
          if (new Set(candidateIds).size !== candidateIds.length)
            throw new Error("CANDIDATE_IDENTITY_INVALID");
        },
      },
      {
        id: "workforce-reporting-graph-acyclic",
        check: ({ ownState }) => {
          for (const member of ownState.public.employees)
            if (
              member.managerId &&
              reportingCycle(
                ownState.public.employees,
                member.id,
                member.managerId,
              )
            )
              throw new Error("REPORTING_GRAPH_CYCLE");
        },
      },
      {
        id: "workforce-private-actors-match-public",
        check: ({ ownState }) => {
          for (const member of ownState.public.employees)
            if (!ownState.private.employeeTruth[member.id])
              throw new Error(`EMPLOYEE_TRUTH_MISSING:${member.id}`);
          for (const item of ownState.public.candidates)
            if (!ownState.private.candidateTruth[item.id])
              throw new Error(`CANDIDATE_TRUTH_MISSING:${item.id}`);
        },
      },
      {
        id: "workforce-openings-respect-seat-commitments",
        check: ({ ownState }) => {
          for (const role of ownState.public.openRoles) {
            const pendingCandidates = ownState.public.candidates.filter(
              (item) =>
                item.roleId === role.id &&
                ["offer_pending", "notice"].includes(item.stage),
            ).length;
            const hiredCandidates = ownState.public.candidates.filter(
              (item) => item.roleId === role.id && item.stage === "hired",
            ).length;
            if (
              role.filled < 0 ||
              role.filled > role.headcount ||
              role.filled + pendingCandidates > role.headcount ||
              hiredCandidates !== role.filled ||
              (role.status === "filled" && role.filled !== role.headcount)
            ) {
              throw new Error(`ROLE_HEADCOUNT_COMMITMENT_INVALID:${role.id}`);
            }
          }
        },
      },
      {
        id: "workforce-departed-actors-have-no-active-assignment",
        check: ({ ownState }) => {
          if (
            ownState.public.employees.some(
              (item) =>
                ["leave", "departed"].includes(item.status) &&
                item.workload > 0,
            )
          )
            throw new Error("INACTIVE_EMPLOYEE_HAS_WORKLOAD");
        },
      },
    ],
    projectionPolicy: {
      schema: workforcePublicStateSchemaV10,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: [
        "candidateTruth",
        "employeeTruth",
        "socialGraph",
        "misconductPropensity",
        "managementPropensities",
        "communicationStyle",
        "actualContribution",
        "exitThreshold",
        "offerCompetition",
        "sampledOutcome",
        "probability",
        "private",
      ],
    },
    snapshotPolicy: { mode: "adaptive", maximumCommandsBetweenSnapshots: 25 },
    retentionPolicy: {
      maximumHeadBytes: 3_000_000,
      maximumMaterialRecords: 1_000,
      archiveClosedRecords: true,
    },
  };
}
