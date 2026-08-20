import type {
  AgentTurnRecord, ClientSimulationState, DebriefReport, DialogueTurn, ExternalInputRecord, HistoryEvent, MarketDossierVersion, ScenarioDefinition, SimulationCommand, SimulationState,
  ClientSimulationStateV10, CommandResponseV10, PublicHistoryEventV10, SimulationCommandV10, SimulationStateV10,
  CompetitorDecisionEnvelopeV10, CompetitorStrategicPlanV10,
} from "@sim/engine";

export type UserRecord = {
  id: string;
  displayName: string;
  contactEmail: string;
  createdAt: string;
};

export type RunRecord = {
  id: string;
  ownerId: string;
  scenarioVersionId: string;
  parentRunId: string | null;
  title: string;
  status: SimulationState["status"];
  seed: number;
  engineVersion: string;
  stateVersion: number;
  headEventSequence: number;
  state: SimulationState;
  checksum: string;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string;
};

export type ClientRunRecord = Omit<RunRecord, "state"> & { state: ClientSimulationState };

export type V10RunRecord = {
  id: string;
  ownerId: string;
  scenarioVersionId: string;
  parentRunId: string | null;
  title: string;
  status: SimulationStateV10["kernel"]["status"];
  seed: number;
  engineVersion: string;
  stateFormat: "feature_heads_v10";
  stateVersion: number;
  headEventSequence: number;
  state: SimulationStateV10;
  checksum: string;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string;
};

export type ClientV10RunRecord = Omit<V10RunRecord, "state"> & { state: ClientSimulationStateV10 };

export type CheckpointRecord = {
  id: string;
  runId: string;
  eventSequence: number;
  stateVersion: number;
  name: string;
  automatic: boolean;
  checksum: string;
  createdAt: string;
};

export type CommandRequest = {
  commandId: string;
  expectedVersion: number;
  type: SimulationCommand["type"];
  payload: unknown;
};

export type CommandResponse = {
  runId: string;
  version: number;
  checksum: string;
  state: ClientSimulationState;
  events: HistoryEvent[];
  savedAt: string;
};

export type V10CommandRequest = {
  commandId: string;
  expectedVersion: number;
  type: SimulationCommandV10["type"];
  payload: unknown;
};

export type V10CommandResponse = Omit<CommandResponseV10, "changedProjections"> & {
  state: ClientSimulationStateV10;
  events: PublicHistoryEventV10[];
};

export type V10CompetitorTurnRecord = {
  id: string;
  runId: string;
  turnId: string;
  firmId: string;
  status: "pending" | "completed" | "failed" | "superseded";
  envelope: CompetitorDecisionEnvelopeV10;
  plan: CompetitorStrategicPlanV10 | null;
  provider: "openai" | "authored" | null;
  model: string | null;
  promptVersion: string;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  fallbackReason: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type V10ExternalInputRecord = {
  contentHash: string;
  runId: string;
  eventSequence: number;
  effectiveSimulationDay: number;
  kind: "competitor_strategic_plan" | "market_dossier";
  payload: unknown;
  inputHash: string;
  provider: "openai" | "authored";
  model: string | null;
  promptVersion: string;
  inheritedFromRunId: string | null;
  observedAt: string;
};

export type SessionRecord = { userId: string; tokenHash: string; expiresAt: string; revokedAt: string | null };

export type IdentityInput = {
  displayName: string;
  contactEmail: string;
  session: { tokenHash: string; expiresAt: Date };
  recovery: { lookupId: string; secretHash: string };
  now: Date;
};

export type RecoveryInput = {
  lookupId: string;
  secretHash: string;
  session: { tokenHash: string; expiresAt: Date };
  replacement: { lookupId: string; secretHash: string };
  now: Date;
};

export type LegacyImportResult = { run: RunRecord; importedEvents: number };

export interface RuntimeStore {
  syncScenarios(definitions: ScenarioDefinition[]): Promise<void>;
  createIdentity(input: IdentityInput): Promise<UserRecord>;
  resolveSession(tokenHash: string, now: Date): Promise<UserRecord | null>;
  recoverIdentity(input: RecoveryInput): Promise<UserRecord>;
  rotateRecovery(userId: string, lookupId: string, secretHash: string, now: Date): Promise<void>;
  refreshSession(userId: string, currentTokenHash: string, replacement: { tokenHash: string; expiresAt: Date }, now: Date): Promise<boolean>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
  listRuns(ownerId: string): Promise<RunRecord[]>;
  listV10Runs(ownerId: string): Promise<V10RunRecord[]>;
  createRun(ownerId: string, scenario: ScenarioDefinition, setup: unknown, seed: number, now: Date): Promise<RunRecord>;
  createV10Run(ownerId: string, scenario: ScenarioDefinition, setup: unknown, seed: number, now: Date): Promise<V10RunRecord>;
  getRun(ownerId: string, runId: string): Promise<RunRecord | null>;
  getV10Run(ownerId: string, runId: string): Promise<V10RunRecord | null>;
  executeCommand(ownerId: string, runId: string, request: CommandRequest, now: Date): Promise<CommandResponse>;
  executeV10Command(ownerId: string, runId: string, request: V10CommandRequest, now: Date): Promise<V10CommandResponse>;
  resolvePendingV10CompetitorTurn(ownerId: string, runId: string, now: Date): Promise<V10CompetitorTurnRecord | null>;
  getV10CompetitorTurn(ownerId: string, runId: string, turnId: string): Promise<V10CompetitorTurnRecord | null>;
  listV10ExternalInputs(ownerId: string, runId: string): Promise<V10ExternalInputRecord[]>;
  listV10Events(ownerId: string, runId: string, options?: { featureId?: string; cursor?: number; limit?: number }): Promise<{ events: PublicHistoryEventV10[]; nextCursor: number | null }>;
  listV10Checkpoints(ownerId: string, runId: string): Promise<CheckpointRecord[]>;
  createV10Checkpoint(ownerId: string, runId: string, name: string, now: Date): Promise<CheckpointRecord>;
  forkV10Run(ownerId: string, runId: string, checkpointId: string, now: Date): Promise<V10RunRecord>;
  resolvePendingAgentTurn(ownerId: string, runId: string, now: Date): Promise<AgentTurnRecord | null>;
  getAgentTurn(ownerId: string, runId: string, turnId: string): Promise<AgentTurnRecord | null>;
  listExternalInputs(ownerId: string, runId: string): Promise<ExternalInputRecord[]>;
  publishMarketDossier(dossier: MarketDossierVersion, metadata: { provider: "openai" | "authored"; model?: string; promptVersion: string }, now: Date): Promise<{ updatedRuns: number }>;
  listEvents(ownerId: string, runId: string, options?: { category?: string; cursor?: number; limit?: number }): Promise<{ events: HistoryEvent[]; nextCursor: number | null }>;
  listCheckpoints(ownerId: string, runId: string): Promise<CheckpointRecord[]>;
  createCheckpoint(ownerId: string, runId: string, name: string, now: Date): Promise<CheckpointRecord>;
  forkRun(ownerId: string, runId: string, checkpointId: string, now: Date): Promise<RunRecord>;
  importLegacy(ownerId: string, payload: unknown, now: Date): Promise<LegacyImportResult>;
  saveDialogue(ownerId: string, runId: string, turn: DialogueTurn): Promise<void>;
  listDialogue(ownerId: string, runId: string): Promise<DialogueTurn[]>;
  buildDebrief(ownerId: string, runId: string): Promise<DebriefReport>;
}
