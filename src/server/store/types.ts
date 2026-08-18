import type {
  AgentTurnRecord, ClientSimulationState, DebriefReport, DialogueTurn, ExternalInputRecord, HistoryEvent, MarketDossierVersion, ScenarioDefinition, SimulationCommand, SimulationState,
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
  createRun(ownerId: string, scenario: ScenarioDefinition, setup: unknown, seed: number, now: Date): Promise<RunRecord>;
  getRun(ownerId: string, runId: string): Promise<RunRecord | null>;
  executeCommand(ownerId: string, runId: string, request: CommandRequest, now: Date): Promise<CommandResponse>;
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
