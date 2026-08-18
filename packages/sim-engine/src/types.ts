import { z } from "zod";

export const ENGINE_VERSION = "9.0.0-beta.1";
export const V8_ENGINE_VERSION = "8.0.0-beta.1";
export const V7_ENGINE_VERSION = "7.0.0-beta.1";

const segmentSchema = z.object({
  id: z.string().min(2), label: z.string().min(2), urgency: z.number().min(0).max(100),
  willingnessToPay: z.number().nonnegative(), switchingFriction: z.number().min(0).max(100),
  budgetCycleDays: z.number().int().min(1).max(365), adoptionRisk: z.number().min(0).max(100),
  reachableAccounts: z.number().int().min(1), responseRate: z.number().min(0).max(1),
  baseMonthlyChurn: z.number().min(0).max(1),
});

const capabilityDefinitionSchema = z.object({
  id: z.string().min(2), label: z.string().min(2),
  kind: z.enum(["core", "reliability", "security", "compliance", "integration", "onboarding"]),
  dependencies: z.array(z.string()).max(8).default([]), effort: z.number().positive().max(120),
});

export const scenarioDefinitionSchema = z.object({
  id: z.string().min(2), slug: z.string().regex(/^[a-z0-9-]+$/), version: z.string().regex(/^\d+\.\d+\.\d+$/),
  status: z.enum(["draft", "published", "deprecated"]), hidden: z.boolean().default(false),
  title: z.string().min(3).max(100), subtitle: z.string().min(3).max(180), description: z.string().min(10).max(1200),
  vertical: z.string().min(2), jurisdiction: z.string().min(2), architecture: z.string().min(2), strategy: z.string().min(2),
  difficultyLabel: z.string().min(2), estimatedMinutes: z.number().int().min(10).max(600),
  tags: z.array(z.string().min(1)).max(12), learningObjectives: z.array(z.string().min(3)).min(1).max(10),
  initial: z.object({
    companyCash: z.number().nonnegative(), personalCash: z.number().nonnegative(), livingCost: z.number().nonnegative(),
    monthlyFixedCosts: z.number().nonnegative(), reducibleFixedCosts: z.number().nonnegative(),
    founderEnergy: z.number().min(0).max(100), founderHealth: z.number().min(0).max(100), founderBurnout: z.number().min(0).max(100),
    problemEvidence: z.number().min(0).max(100), budgetEvidence: z.number().min(0).max(100), buyerClarity: z.number().min(0).max(100),
    mvpProgress: z.number().min(0).max(100), productQuality: z.number().min(0).max(100),
  }),
  simulation: z.object({
    jurisdictionArchetype: z.enum(["us_like", "eu_like", "sea_like", "legacy"]),
    maxDays: z.number().int().min(90).max(730).default(540), defaultPrice: z.number().positive(),
    onboardingCost: z.number().nonnegative(), variableCostRate: z.number().min(0).max(1),
    collectionDelayDays: z.number().int().min(0).max(180), supportHoursPerAccount: z.number().nonnegative(),
    segments: z.array(segmentSchema).min(1).max(8), capabilities: z.array(capabilityDefinitionSchema).min(1).max(20),
    pressureProfile: z.enum(["integration", "support", "compliance"]),
  }).optional(),
  problems: z.array(z.object({
    key: z.string().min(2), domain: z.enum(["evidence", "finance", "product", "people", "strategy", "external"]),
    title: z.string().min(3), summary: z.string().min(3), severity: z.number().int().min(1).max(5), deadlineDay: z.number().int().min(1),
    hypotheses: z.array(z.string().min(2)).min(1).max(8),
  })).min(1).max(24),
});

export type ScenarioDefinition = z.infer<typeof scenarioDefinitionSchema>;

export const runSetupSchema = z.object({
  companyName: z.string().trim().min(2).max(42), founderArchetype: z.enum(["builder", "seller", "expert", "community"]),
  difficulty: z.enum(["guided", "realistic", "brutal"]), personalRunway: z.enum(["pressure", "standard", "stable"]),
});
export type RunSetup = z.infer<typeof runSetupSchema>;

export type ProblemDomain = "evidence" | "finance" | "product" | "people" | "strategy" | "external";
export type SimulationStage = "discovery" | "validation" | "pilot" | "productization" | "repeatability";

export type SimulationProblem = {
  id: string; key: string; domain: ProblemDomain; title: string; summary: string; severity: number;
  openedDay: number; deadlineDay: number; status: "open" | "resolved";
  hypotheses: Array<{ id: string; label: string; score: number }>; workingHypothesisId: string | null;
  escalationCount: number; resolution?: string; drivers?: string[];
  trajectory?: "improving" | "stable" | "worsening"; resolutionProgress?: number;
};

export type ResearchDesign = {
  question: "severity" | "workflow" | "budget" | "buyer";
  sample: "cold_targeted" | "existing_users" | "warm_network" | "convenience";
  method: "interview" | "observation" | "proposal" | "survey"; count: number;
};

export type SimulationAction = {
  id: string; problemId: string;
  kind: "research" | "build" | "outreach" | "cut_tools" | "personal_injection" | "service_offer" | "experiment" | "sales" | "product" | "hiring" | "risk";
  title: string; status: "active" | "completed" | "cancelled"; intensity: "sustainable" | "hard" | "crunch";
  startedDay: number; remainingWork: number; requiredWork: number; attention: number; cashCost: number;
  executionWorkDone: number; executionQualityWeighted: number; result?: string; completedDay?: number;
  researchDesign?: ResearchDesign; dependencies?: string[]; cancellationCost?: number; targetId?: string;
};

export type EvidenceItem = {
  id: string; day: number; kind: string; summary: string; direction: "positive" | "negative" | "neutral";
  quality: number; problemId: string | null; source?: string; method?: string; segmentId?: string;
  sampleSize?: number; usableSample?: number; independenceCluster?: string; claimIds?: string[]; expiresDay?: number;
};
export type EvidenceClaim = {
  id: string; label: string; confidence: number; supportingWeight: number; contradictingWeight: number;
  sampleDiversity: number; lastUpdatedDay: number;
};

export type MarketSegment = z.infer<typeof segmentSchema> & { discovered: boolean; fitSignal: number };
export type AccountStage = "lead" | "discovery" | "qualified" | "pilot" | "negotiation" | "customer" | "lost" | "churned";
export type CustomerAccount = {
  id: string; name: string; segmentId: string; stage: AccountStage; createdDay: number; stageEnteredDay: number;
  championStrength: number; buyerAccess: number; blockerRisk: number; trust: number; expectedValue: number;
  offeredPrice: number | null; contractMonths: number; collectionDelayDays: number; supportHours: number;
  lossReason?: string; cohortId?: string;
  knownStakeholderIds?: string[]; committeeCoverage?: number; valueCase?: number; riskClearance?: number;
  implementationReadiness?: number; procurementProgress?: number; negotiationRound?: number;
  dealTerms?: { paymentTermsDays: number; onboardingMode: "self_serve" | "guided" | "custom"; supportSlaHours: 8 | 24 | 72; dataTerms: "standard" | "dpa" | "enterprise"; discountPercent: number };
};
export type CustomerCohort = {
  id: string; startedDay: number; accountIds: string[]; startingMrr: number; currentMrr: number;
  retainedAccounts: number; churnedAccounts: number; grossMargin: number;
};

export type ProductCapability = {
  id: string; label: string; kind: "core" | "reliability" | "security" | "compliance" | "integration" | "onboarding";
  dependencies: string[]; status: "backlog" | "building" | "released"; progress: number; quality: number; effort: number;
};
export type ProductIncident = {
  id: string; openedDay: number; severity: number; type: "reliability" | "security" | "vendor" | "compliance";
  status: "open" | "contained" | "resolved"; accountIds: string[];
};

export type JournalLine = { account: string; debit: number; credit: number };
export type JournalEntry = { id: string; day: number; memo: string; sourceId: string; lines: JournalLine[] };

export type TeamMember = {
  id: string; name: string; role: "founder" | "engineer" | "product" | "sales" | "operations" | "advisor";
  employment: "founder" | "employee" | "contractor"; skill: number; capacity: number; morale: number; trust: number;
  monthlyCost: number; onboardingRemaining: number;
};
export type HiringProcess = { id: string; role: TeamMember["role"]; stage: "sourcing" | "interview" | "offer" | "onboarding" | "closed"; candidateQuality: number; remainingDays: number };

export type Stakeholder = {
  id: string; name: string; role: "buyer" | "user" | "champion" | "blocker" | "approver" | "investor" | "advisor" | "vendor";
  accountId?: string; trust: number; influence: number; memory: string[]; discovered?: boolean;
};
export type Obligation = {
  id: string; title: string; ownerId: string; stakeholderId?: string; dueDay: number;
  status: "open" | "fulfilled" | "missed" | "renegotiated"; severity: number; dependencyIds: string[];
};
export type RiskItem = {
  id: string; domain: "legal" | "compliance" | "security" | "vendor" | "market" | "founder";
  title: string; likelihood: number; impact: number; exposure: number; status: "latent" | "open" | "mitigated" | "realized";
};

export type MarketFactKind = "pricing" | "capability" | "positioning" | "channel" | "partnership" | "funding" | "availability";
export type MarketSource = {
  id: string; title: string; publisher: string; url: string; retrievedAt: string; primary: boolean;
};
export type MarketFact = {
  id: string; subjectId: string; kind: MarketFactKind; statement: string; value?: string | number;
  unit?: string; observedAt: string; confidence: number; sourceIds: string[]; status: "verified" | "quarantined";
};
export type MarketDossierVersion = {
  id: string; scenarioId: string; capturedAt: string; contentHash: string; sources: MarketSource[]; facts: MarketFact[];
};

export type CompetitorActionId =
  | "hold_position" | "change_pricing" | "reposition" | "launch_capability" | "add_integration"
  | "bundle_services" | "target_segment" | "channel_partnership" | "increase_sales_pressure" | "exit_segment";
export type CompetitorResponseId = "differentiate" | "match_price" | "niche_down" | "accelerate" | "partner" | "ignore";
export type CompetitorProfile = {
  id: string; publicName: string; website: string; category: "direct" | "platform" | "substitute";
  positioning: string; priceAnchor: number | null; targetSegments: string[]; channels: string[]; capabilitySignals: string[];
};
export type CompetitorMove = {
  id: string; competitorId: string; actionId: CompetitorActionId; simulationDay: number; status: "announced" | "active" | "expired";
  publicSummary: string; impact: { pricePressure: number; substitutionRisk: number; channelPressure: number; trustPressure: number };
  provider: "openai" | "authored"; sourceFactIds: string[]; playerResponse?: CompetitorResponseId; respondedDay?: number;
};
export type PendingAgentTurn = {
  id: string; actorId: string; actorType: "competitor" | "stakeholder"; createdSimulationDay: number;
  allowedActionIds: CompetitorActionId[]; worldInputHash: string; status: "pending"; turnKind: "regular" | "deep";
};
export type MarketIntelligencePublicState = {
  dossier: MarketDossierVersion; lastAppliedAt: string; dynamicWorld: boolean;
};
export type CompetitorPublicState = {
  profiles: CompetitorProfile[]; moves: CompetitorMove[]; pendingTurn: PendingAgentTurn | null;
  nextTurnDay: number; regularTurnsUsed: number; deepTurnsUsed: number;
};
export type CompetitorPrivateState = {
  policies: Record<string, { resourceEnvelope: number; executionVelocity: number; riskTolerance: number; cooldownUntilDay: number; perceivedPlayerSignal: number }>;
};
export type FeatureRuntimeState = {
  versions: Record<string, string>;
  public: Record<string, unknown> & { "market-intelligence"?: MarketIntelligencePublicState; competitors?: CompetitorPublicState };
  private: Record<string, unknown> & { competitors?: CompetitorPrivateState };
};

export type AgentDecisionEnvelope = {
  turnId: string; actor: { id: string; name: string; role: string }; observedFacts: MarketFact[];
  memory: string[]; allowedActionIds: CompetitorActionId[]; constraints: string[]; worldInputHash: string; turnKind: "regular" | "deep";
};
export type AgentDecision = {
  selectedActionId: CompetitorActionId; targetId?: string; publicRationale: string; citedSourceIds: string[];
};
export type ExternalInputRecord = {
  id: string; runId: string; sequence: number; kind: "market_dossier" | "agent_decision"; payload: unknown;
  inputHash: string; provider: "openai" | "authored"; model?: string; promptVersion?: string;
  effectiveSimulationDay: number; observedAt: string;
};
export type AgentTurnRecord = {
  id: string; runId: string; actorId: string; status: "pending" | "completed" | "failed";
  envelope: AgentDecisionEnvelope; decision: AgentDecision | null; provider: "openai" | "authored" | null;
  model: string | null; promptVersion: string; latencyMs: number | null; inputTokens: number | null; outputTokens: number | null;
  fallbackReason: string | null; createdAt: string; completedAt: string | null;
};

export type CoreScheduledEffectType = "invoice_due" | "payment_received" | "account_followup" | "churn_check" | "contract_renewal" | "hire_progress" | "obligation_due" | "risk_check" | "fundraise_progress";
export type ScheduledEffect = {
  id: string; dueDay: number;
  type: CoreScheduledEffectType | `${string}.${string}`;
  sourceId: string; payload: Record<string, string | number | boolean | null>; sampledOutcome: number;
};

export type PendingDecision = {
  id: string; ruleId: string; title: string; summary: string; actorId?: string; pressure: string;
  choices: Array<{ id: string; label: string; intentId: string; tradeoff: string }>;
  revealableClueIds: string[];
};

export type EndingCode = "pmf" | "sustainable_niche" | "acqui_hire" | "voluntary_shutdown" | "insolvency" | "founder_collapse" | "trust_failure" | "regulatory_failure" | "time_limit";

export type SimulationState = {
  schemaVersion: 2 | 3; engineVersion: string; scenarioId: string; scenarioVersion: string; seed: number;
  rng: { state: number; draws: number }; createdAt: string;
  meta: { companyName: string; founderArchetype: RunSetup["founderArchetype"]; difficulty: RunSetup["difficulty"]; personalRunway: RunSetup["personalRunway"]; vertical: string; jurisdiction: string; architecture: string; strategy: string };
  status: "active" | "won" | "ended"; endingReason: string | null; endingCode: EndingCode | null;
  stage: SimulationStage; stageEnteredDay: number; healthyWeeks: number; decisionPoints: number; maxDays: number;
  calendar: { absoluteDay: number; month: number; year: number };
  finance: {
    companyCash: number; personalCash: number; personalDebt: number; founderLoanBalance: number; livingCost: number;
    monthlyFixedCosts: number; reducibleFixedCosts: number; monthlyFixedSavings: number; pendingServiceRevenue: number;
    mrr: number; founderDraw: number; accountsReceivable: number; accountsPayable: number; deferredRevenue: number;
    recognizedRevenue: number; payrollExpense: number; taxReserve: number; variableCosts: number; journal: JournalEntry[];
  };
  founder: { energy: number; health: number; burnout: number; attentionCapacity: number; stress: number; learningVelocity: number; allocation: { research: number; product: number; sales: number; operations: number } };
  evidence: { problem: number; budget: number; buyerClarity: number; quality: number; diversity: number; designHistory: string[]; ledger: EvidenceItem[]; claims: EvidenceClaim[] };
  market: { segments: MarketSegment[]; accounts: CustomerAccount[]; cohorts: CustomerCohort[]; defaultPrice: number; pipelineValue: number; winRate: number; monthlyChurn: number; supportLoad: number };
  product: { mvpProgress: number; quality: number; rework: number; architecture: string; reliability: number; usability: number; security: number; compliance: number; technicalDebt: number; capabilities: ProductCapability[]; incidents: ProductIncident[] };
  relationships: { trust: number; openPromises: number; overduePromises: number };
  stakeholders: Stakeholder[]; obligations: Obligation[]; risks: RiskItem[];
  organization: { teamSize: number; contractors: number; activeInitiatives: string[]; members: TeamMember[]; hiring: HiringProcess[] };
  capital: { fundraising: "none" | "preparing" | "diligence" | "term_sheet"; debt: number; investorPipeline: number; dilution: number; runwayExtensionMonths: number };
  problems: SimulationProblem[]; actions: SimulationAction[]; assumptions: Array<{ id: string; label: string; confidence: number }>;
  pendingEvent: PendingDecision | null; scheduledEffects: ScheduledEffect[]; triggeredRuleIds: string[]; sequence: number;
  features?: FeatureRuntimeState;
  externalInputRefs?: Array<{ id: string; kind: ExternalInputRecord["kind"]; inputHash: string; effectiveSimulationDay: number }>;
  hidden: { segmentTruth: Record<string, { fit: number; actualWtp: number; churnRisk: number }>; scenarioPressure: number; endingScores: Record<string, number> };
  legacy?: { sourceVersion: string; sourceState: unknown };
};

const commandBase = { commandId: z.string().min(8) };
const actionKind = z.enum(["research", "build", "outreach", "cut_tools", "personal_injection", "service_offer"]);
const role = z.enum(["engineer", "product", "sales", "operations"]);

export const simulationCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...commandBase, type: z.literal("planning.update"), payload: z.object({ key: z.enum(["founderDraw"]), value: z.number().nonnegative() }) }),
  z.object({ ...commandBase, type: z.literal("planning.capacity.allocate"), payload: z.object({ research: z.number().min(0).max(100), product: z.number().min(0).max(100), sales: z.number().min(0).max(100), operations: z.number().min(0).max(100) }).refine((v) => v.research + v.product + v.sales + v.operations === 100, "Capacity must total 100") }),
  z.object({ ...commandBase, type: z.literal("problem.hypothesis.set"), payload: z.object({ problemId: z.string(), hypothesisId: z.string() }) }),
  z.object({ ...commandBase, type: z.literal("problem.action.commit"), payload: z.object({ problemId: z.string(), kind: actionKind, intensity: z.enum(["sustainable", "hard", "crunch"]), researchDesign: z.object({ question: z.enum(["severity", "workflow", "budget", "buyer"]), sample: z.enum(["cold_targeted", "existing_users", "warm_network", "convenience"]), method: z.enum(["interview", "observation", "proposal", "survey"]), count: z.number().int().min(1).max(20) }).optional() }) }),
  z.object({ ...commandBase, type: z.literal("research.run"), payload: z.object({ problemId: z.string(), segmentId: z.string(), design: z.object({ question: z.enum(["severity", "workflow", "budget", "buyer"]), sample: z.enum(["cold_targeted", "existing_users", "warm_network", "convenience"]), method: z.enum(["interview", "observation", "proposal", "survey"]), count: z.number().int().min(1).max(30) }), intensity: z.enum(["sustainable", "hard", "crunch"]).default("sustainable") }) }),
  z.object({ ...commandBase, type: z.literal("experiment.start"), payload: z.object({ problemId: z.string(), segmentId: z.string(), kind: z.enum(["landing_page", "concierge", "paid_pilot", "pricing"]), budget: z.number().min(0).max(5000) }) }),
  z.object({ ...commandBase, type: z.literal("account.manage"), payload: z.object({ operation: z.enum(["source", "advance", "disqualify"]), accountId: z.string().optional(), segmentId: z.string().optional() }) }),
  z.object({ ...commandBase, type: z.literal("account.engage_stakeholder"), payload: z.object({ accountId: z.string(), stakeholderId: z.string().optional(), intent: z.enum(["map_committee", "user_discovery", "build_champion", "prove_roi", "risk_review", "procurement"]) }) }),
  z.object({ ...commandBase, type: z.literal("contract.negotiate"), payload: z.object({
    accountId: z.string(), price: z.number().positive(), contractMonths: z.number().int().min(1).max(36), discountForPrepay: z.boolean().default(false),
    paymentTermsDays: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]).default(30),
    onboardingMode: z.enum(["self_serve", "guided", "custom"]).default("guided"), supportSlaHours: z.union([z.literal(8), z.literal(24), z.literal(72)]).default(24),
    dataTerms: z.enum(["standard", "dpa", "enterprise"]).default("standard"),
  }) }),
  z.object({ ...commandBase, type: z.literal("product.plan"), payload: z.object({ capabilityId: z.string(), approach: z.enum(["prototype", "production", "accept_debt"]), intensity: z.enum(["sustainable", "hard", "crunch"]) }) }),
  z.object({ ...commandBase, type: z.literal("incident.handle"), payload: z.object({ incidentId: z.string(), response: z.enum(["contain", "communicate", "fix_root", "accept_risk"]) }) }),
  z.object({ ...commandBase, type: z.literal("people.engage"), payload: z.object({ operation: z.enum(["hire", "contract", "advisor"]), role, budget: z.number().nonnegative().max(100_000) }) }),
  z.object({ ...commandBase, type: z.literal("finance.manage"), payload: z.object({ operation: z.enum(["cut_cost", "founder_injection", "reserve_tax", "collect_invoice"]), amount: z.number().nonnegative().max(10_000_000), sourceId: z.string().optional() }) }),
  z.object({ ...commandBase, type: z.literal("obligation.manage"), payload: z.object({ obligationId: z.string(), operation: z.enum(["fulfill", "renegotiate", "accept_miss"]) }) }),
  z.object({ ...commandBase, type: z.literal("problem.action.cancel"), payload: z.object({ actionId: z.string() }) }),
  z.object({ ...commandBase, type: z.literal("problem.assumption.adjust"), payload: z.object({ assumptionId: z.string(), delta: z.number().min(-10).max(10) }) }),
  z.object({ ...commandBase, type: z.literal("operations.advance"), payload: z.object({}) }),
  z.object({ ...commandBase, type: z.literal("operations.advance_to_decision"), payload: z.object({ maxDays: z.number().int().min(1).max(30).default(14) }) }),
  z.object({ ...commandBase, type: z.literal("event.respond"), payload: z.object({ choiceIndex: z.number().int().min(0).max(4) }) }),
  z.object({ ...commandBase, type: z.literal("organization.hire"), payload: z.object({ role, count: z.number().int().min(1).max(5) }) }),
  z.object({ ...commandBase, type: z.literal("organization.layoff"), payload: z.object({ count: z.number().int().min(1).max(20) }) }),
  z.object({ ...commandBase, type: z.literal("organization.contractor"), payload: z.object({ operation: z.enum(["hire", "cancel"]) }) }),
  z.object({ ...commandBase, type: z.literal("organization.initiative"), payload: z.object({ operation: z.enum(["start", "cancel"]), initiative: z.enum(["analytics", "bookkeeping", "security", "pricing"]) }) }),
  z.object({ ...commandBase, type: z.literal("capital.fundraise"), payload: z.object({ operation: z.enum(["start", "cancel"]) }) }),
  z.object({ ...commandBase, type: z.literal("capital.term_sheet"), payload: z.object({ decision: z.enum(["accept", "reject"]) }) }),
  z.object({ ...commandBase, type: z.literal("capital.debt"), payload: z.object({ operation: z.enum(["draw", "repay"]), amount: z.number().positive().max(10_000_000) }) }),
  z.object({ ...commandBase, type: z.literal("strategy.architecture.change"), payload: z.object({ architecture: z.enum(["concierge", "no_code", "custom", "platform"]) }) }),
  z.object({ ...commandBase, type: z.literal("strategy.pivot"), payload: z.object({ strategy: z.enum(["smb", "design_partner", "enterprise"]) }) }),
  z.object({ ...commandBase, type: z.literal("competitor.respond"), payload: z.object({ competitorId: z.string(), response: z.enum(["differentiate", "match_price", "niche_down", "accelerate", "partner", "ignore"]) }) }),
  z.object({ ...commandBase, type: z.literal("strategy.exit"), payload: z.object({ ending: z.enum(["voluntary_shutdown", "acqui_hire"]) }) }),
]);
export type SimulationCommand = z.infer<typeof simulationCommandSchema>;

export const systemSimulationCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...commandBase, type: z.literal("system.market_dossier.apply"), payload: z.object({ externalInputId: z.string(), dossier: z.custom<MarketDossierVersion>(), inputHash: z.string().min(8) }) }),
  z.object({ ...commandBase, type: z.literal("system.agent_decision.apply"), payload: z.object({ externalInputId: z.string(), turnId: z.string(), decision: z.custom<AgentDecision>(), provider: z.enum(["openai", "authored"]), inputHash: z.string().min(8) }) }),
]);
export type SystemSimulationCommand = z.infer<typeof systemSimulationCommandSchema>;

export type StateEffect = { path: string; before: string | number | boolean | null; after: string | number | boolean | null };
export type HistoryEventType =
  | "decision_recorded" | "problem_opened" | "problem_resolved" | "problem_escalated" | "action_committed" | "action_completed" | "action_cancelled"
  | "evidence_recorded" | "stakeholder_updated" | "finance_posted" | "month_closed" | "external_event_generated" | "run_ended" | "legacy_imported"
  | "account_sourced" | "account_stage_changed" | "contract_signed" | "contract_renewed" | "invoice_issued" | "payment_received" | "customer_churned" | "cohort_updated"
  | "capability_released" | "incident_opened" | "incident_resolved" | "hiring_updated" | "obligation_updated" | "risk_updated" | "stage_changed" | "ending_reached"
  | "market_intelligence_updated" | "competitor_move_announced" | "competitor_response_committed" | "agent_turn_requested";
export type HistoryCategory = "finance" | "evidence" | "action" | "stakeholder" | "problem" | "system" | "customer" | "product" | "people" | "risk" | "capital" | "competition" | "intelligence";
export type HistoryEvent = { id: string; sequence: number; commandId: string | null; type: HistoryEventType; category: HistoryCategory; actor: "player" | "system" | "ai"; simulationDay: number; summary: string; effects: StateEffect[]; engineVersion: string; createdAt: string };

export type EngineContext = { seed: number; now: string; engineVersion: string; scenarioVersion: string };
export type EngineResult = { state: SimulationState; events: HistoryEvent[]; checksum: string; checkpoint: boolean };

export type MetricEstimate = { low: number; expected: number; high: number; confidence: "low" | "medium" | "high" };
export type ClientSimulationState = Omit<SimulationState, "hidden" | "features"> & {
  features?: Omit<FeatureRuntimeState, "private">;
  forecasts: { runwayMonths: MetricEstimate; nextMonthCash: MetricEstimate; pipelineRevenue: MetricEstimate; pmfReadiness: MetricEstimate };
};

export type PublicActorProfile = Pick<Stakeholder, "id" | "name" | "role" | "trust" | "influence">;
export type AiContextEnvelope = { interactionId: string; actorProfile: PublicActorProfile; situationFacts: string[]; revealableClueIds: string[]; allowedIntentIds: string[]; toneConstraints: string[] };
export type AiDialogueResponse = { utterance: string; tone: string; revealedClueIds: string[]; interpretedIntentId?: string; replySuggestions: Array<{ label: string; intentId: string }> };
export type DialogueTurn = { id: string; runId: string; interactionId: string; actorId: string; playerText: string; response: AiDialogueResponse; provider: "openai" | "authored"; createdAt: string };

export type DebriefReport = {
  runId: string; endingCode: EndingCode; endingReason: string; daysElapsed: number; stageReached: SimulationStage;
  scores: { customerTruth: number; financialResilience: number; executionQuality: number; stakeholderTrust: number; founderSustainability: number };
  causalChain: Array<{ day: number; eventType: HistoryEventType; summary: string }>;
  missedSignals: string[]; strengths: string[]; counterfactuals: string[];
  hiddenTruth: Array<{ segment: string; fit: number; actualWtp: number; churnRisk: number }>;
};
