import { z } from "zod";

export const ENGINE_VERSION = "7.0.0-beta.1";

export const scenarioDefinitionSchema = z.object({
  id: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  status: z.enum(["draft", "published", "deprecated"]),
  hidden: z.boolean().default(false),
  title: z.string().min(3).max(100),
  subtitle: z.string().min(3).max(180),
  description: z.string().min(10).max(1200),
  vertical: z.string().min(2),
  jurisdiction: z.string().min(2),
  architecture: z.string().min(2),
  strategy: z.string().min(2),
  difficultyLabel: z.string().min(2),
  estimatedMinutes: z.number().int().min(10).max(600),
  tags: z.array(z.string().min(1)).max(12),
  learningObjectives: z.array(z.string().min(3)).min(1).max(10),
  initial: z.object({
    companyCash: z.number().nonnegative(),
    personalCash: z.number().nonnegative(),
    livingCost: z.number().nonnegative(),
    monthlyFixedCosts: z.number().nonnegative(),
    reducibleFixedCosts: z.number().nonnegative(),
    founderEnergy: z.number().min(0).max(100),
    founderHealth: z.number().min(0).max(100),
    founderBurnout: z.number().min(0).max(100),
    problemEvidence: z.number().min(0).max(100),
    budgetEvidence: z.number().min(0).max(100),
    buyerClarity: z.number().min(0).max(100),
    mvpProgress: z.number().min(0).max(100),
    productQuality: z.number().min(0).max(100),
  }),
  problems: z.array(z.object({
    key: z.string().min(2),
    domain: z.enum(["evidence", "finance", "product", "people", "strategy", "external"]),
    title: z.string().min(3),
    summary: z.string().min(3),
    severity: z.number().int().min(1).max(5),
    deadlineDay: z.number().int().min(1),
    hypotheses: z.array(z.string().min(2)).min(1).max(8),
  })).min(1).max(24),
});

export type ScenarioDefinition = z.infer<typeof scenarioDefinitionSchema>;

export const runSetupSchema = z.object({
  companyName: z.string().trim().min(2).max(42),
  founderArchetype: z.enum(["builder", "seller", "expert", "community"]),
  difficulty: z.enum(["guided", "realistic", "brutal"]),
  personalRunway: z.enum(["pressure", "standard", "stable"]),
});

export type RunSetup = z.infer<typeof runSetupSchema>;

export type ProblemDomain = "evidence" | "finance" | "product" | "people" | "strategy" | "external";

export type SimulationProblem = {
  id: string;
  key: string;
  domain: ProblemDomain;
  title: string;
  summary: string;
  severity: number;
  openedDay: number;
  deadlineDay: number;
  status: "open" | "resolved";
  hypotheses: Array<{ id: string; label: string; score: number }>;
  workingHypothesisId: string | null;
  escalationCount: number;
  resolution?: string;
};
export type SimulationAction = {
  id: string;
  problemId: string;
  kind: "research" | "build" | "outreach" | "cut_tools" | "personal_injection" | "service_offer";
  title: string;
  status: "active" | "completed" | "cancelled";
  intensity: "sustainable" | "hard" | "crunch";
  startedDay: number;
  remainingWork: number;
  requiredWork: number;
  attention: number;
  cashCost: number;
  executionWorkDone: number;
  executionQualityWeighted: number;
  result?: string;
  completedDay?: number;
  researchDesign?: { question: string; sample: string; method: string; count: number };
};

export type EvidenceItem = {
  id: string;
  day: number;
  kind: string;
  summary: string;
  direction: "positive" | "negative" | "neutral";
  quality: number;
  problemId: string | null;
};

export type SimulationState = {
  schemaVersion: 1;
  engineVersion: string;
  scenarioId: string;
  scenarioVersion: string;
  seed: number;
  rng: { state: number; draws: number };
  createdAt: string;
  meta: {
    companyName: string;
    founderArchetype: RunSetup["founderArchetype"];
    difficulty: RunSetup["difficulty"];
    personalRunway: RunSetup["personalRunway"];
    vertical: string;
    jurisdiction: string;
    architecture: string;
    strategy: string;
  };
  status: "active" | "won" | "ended";
  endingReason: string | null;
  calendar: { absoluteDay: number; month: number; year: number };
  finance: {
    companyCash: number;
    personalCash: number;
    personalDebt: number;
    founderLoanBalance: number;
    livingCost: number;
    monthlyFixedCosts: number;
    reducibleFixedCosts: number;
    monthlyFixedSavings: number;
    pendingServiceRevenue: number;
    mrr: number;
    founderDraw: number;
  };
  founder: { energy: number; health: number; burnout: number; attentionCapacity: number };
  evidence: {
    problem: number;
    budget: number;
    buyerClarity: number;
    quality: number;
    diversity: number;
    designHistory: string[];
    ledger: EvidenceItem[];
  };
  product: { mvpProgress: number; quality: number; rework: number; architecture: string };
  relationships: { trust: number; openPromises: number; overduePromises: number };
  organization: { teamSize: number; contractors: number; activeInitiatives: string[] };
  capital: { fundraising: "none" | "preparing" | "term_sheet"; debt: number };
  problems: SimulationProblem[];
  actions: SimulationAction[];
  assumptions: Array<{ id: string; label: string; confidence: number }>;
  pendingEvent: null | { id: string; title: string; choices: string[] };
  sequence: number;
  legacy?: { sourceVersion: string; sourceState: unknown };
};

const commandBase = { commandId: z.string().min(8) };
const actionKind = z.enum(["research", "build", "outreach", "cut_tools", "personal_injection", "service_offer"]);

export const simulationCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...commandBase, type: z.literal("planning.update"), payload: z.object({
    key: z.enum(["founderDraw"]), value: z.number().nonnegative(),
  }) }),
  z.object({ ...commandBase, type: z.literal("problem.hypothesis.set"), payload: z.object({
    problemId: z.string(), hypothesisId: z.string(),
  }) }),
  z.object({ ...commandBase, type: z.literal("problem.action.commit"), payload: z.object({
    problemId: z.string(), kind: actionKind, intensity: z.enum(["sustainable", "hard", "crunch"]),
    researchDesign: z.object({
      question: z.enum(["severity", "workflow", "budget", "buyer"]),
      sample: z.enum(["cold_targeted", "existing_users", "warm_network", "convenience"]),
      method: z.enum(["interview", "observation", "proposal", "survey"]),
      count: z.number().int().min(1).max(20),
    }).optional(),
  }) }),
  z.object({ ...commandBase, type: z.literal("problem.action.cancel"), payload: z.object({ actionId: z.string() }) }),
  z.object({ ...commandBase, type: z.literal("problem.assumption.adjust"), payload: z.object({
    assumptionId: z.string(), delta: z.number().min(-10).max(10),
  }) }),
  z.object({ ...commandBase, type: z.literal("operations.advance"), payload: z.object({}) }),
  z.object({ ...commandBase, type: z.literal("event.respond"), payload: z.object({ choiceIndex: z.number().int().min(0).max(4) }) }),
  z.object({ ...commandBase, type: z.literal("organization.hire"), payload: z.object({
    role: z.enum(["engineer", "product", "sales", "operations"]), count: z.number().int().min(1).max(5),
  }) }),
  z.object({ ...commandBase, type: z.literal("organization.layoff"), payload: z.object({ count: z.number().int().min(1).max(20) }) }),
  z.object({ ...commandBase, type: z.literal("organization.contractor"), payload: z.object({ operation: z.enum(["hire", "cancel"]) }) }),
  z.object({ ...commandBase, type: z.literal("organization.initiative"), payload: z.object({
    operation: z.enum(["start", "cancel"]), initiative: z.enum(["analytics", "bookkeeping", "security", "pricing"]),
  }) }),
  z.object({ ...commandBase, type: z.literal("capital.fundraise"), payload: z.object({ operation: z.enum(["start", "cancel"]) }) }),
  z.object({ ...commandBase, type: z.literal("capital.term_sheet"), payload: z.object({ decision: z.enum(["accept", "reject"]) }) }),
  z.object({ ...commandBase, type: z.literal("capital.debt"), payload: z.object({ operation: z.enum(["draw", "repay"]), amount: z.number().positive().max(10_000_000) }) }),
  z.object({ ...commandBase, type: z.literal("strategy.architecture.change"), payload: z.object({
    architecture: z.enum(["concierge", "no_code", "custom", "platform"]),
  }) }),
  z.object({ ...commandBase, type: z.literal("strategy.pivot"), payload: z.object({ strategy: z.enum(["smb", "design_partner", "enterprise"]) }) }),
]);

export type SimulationCommand = z.infer<typeof simulationCommandSchema>;

export type StateEffect = { path: string; before: string | number | boolean | null; after: string | number | boolean | null };

export type HistoryEventType =
  | "decision_recorded" | "problem_opened" | "problem_resolved" | "problem_escalated"
  | "action_committed" | "action_completed" | "action_cancelled" | "evidence_recorded"
  | "stakeholder_updated" | "finance_posted" | "month_closed" | "external_event_generated"
  | "run_ended" | "legacy_imported";

export type HistoryEvent = {
  id: string;
  sequence: number;
  commandId: string | null;
  type: HistoryEventType;
  category: "finance" | "evidence" | "action" | "stakeholder" | "problem" | "system";
  actor: "player" | "system" | "ai";
  simulationDay: number;
  summary: string;
  effects: StateEffect[];
  engineVersion: string;
  createdAt: string;
};

export type EngineContext = {
  seed: number;
  now: string;
  engineVersion: string;
  scenarioVersion: string;
};

export type EngineResult = {
  state: SimulationState;
  events: HistoryEvent[];
  checksum: string;
  checkpoint: boolean;
};

export type AiContextEnvelope = {
  scenarioVersion: string;
  engineVersion: string;
  stateSummary: Pick<SimulationState, "status" | "calendar" | "finance" | "founder" | "evidence" | "product">;
  recentEvents: HistoryEvent[];
  mayMutateState: false;
};
