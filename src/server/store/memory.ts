import "server-only";
import { randomUUID } from "node:crypto";
import {
  ENGINE_VERSION, applySystemCommand, buildAgentDecisionEnvelope, createInitialState, marketIntelligencePublic, runSetupSchema,
  stateChecksum, type AgentTurnRecord, type DialogueTurn, type ExternalInputRecord, type HistoryEvent, type MarketDossierVersion, type ScenarioDefinition, type SimulationState,
} from "@sim/engine";
import { generateAgentDecision } from "@/server/ai/actors";
import { migrateLegacySave } from "@/server/legacy";
import type {
  CheckpointRecord, CommandRequest, CommandResponse, IdentityInput, LegacyImportResult,
  RecoveryInput, RunRecord, RuntimeStore, UserRecord,
} from "./types";
import { applyVersionedCommand, createVersionedDebrief, projectVersionedState } from "./versioning";

type Snapshot = { id: string; runId: string; eventSequence: number; stateVersion: number; state: SimulationState; checksum: string; createdAt: string };
type Recovery = { userId: string; lookupId: string; secretHash: string; usedAt: string | null };
type MemoryData = {
  users: Map<string, UserRecord>;
  sessions: Map<string, { userId: string; expiresAt: string; revokedAt: string | null; createdAt: string }>;
  recoveries: Map<string, Recovery>;
  scenarios: Map<string, ScenarioDefinition>;
  runs: Map<string, RunRecord>;
  events: Map<string, HistoryEvent[]>;
  snapshots: Map<string, Snapshot[]>;
  checkpoints: Map<string, CheckpointRecord[]>;
  commandResponses: Map<string, CommandResponse>;
  dialogue: Map<string, DialogueTurn[]>;
  externalInputs: Map<string, ExternalInputRecord>;
  agentTurns: Map<string, AgentTurnRecord>;
};

const globalMemory = globalThis as typeof globalThis & { __startupSimulatorMemory?: MemoryData };
function data(): MemoryData {
  globalMemory.__startupSimulatorMemory ??= {
    users: new Map(), sessions: new Map(), recoveries: new Map(), scenarios: new Map(), runs: new Map(),
    events: new Map(), snapshots: new Map(), checkpoints: new Map(), commandResponses: new Map(), dialogue: new Map(),
    externalInputs: new Map(), agentTurns: new Map(),
  };
  return globalMemory.__startupSimulatorMemory;
}
const copy = <T>(value: T): T => structuredClone(value);

function assertOwner(run: RunRecord | undefined, ownerId: string): RunRecord {
  if (!run || run.ownerId !== ownerId) throw new Error("RUN_NOT_FOUND");
  return run;
}

function initialEvent(runId: string, state: SimulationState, now: Date): HistoryEvent {
  state.sequence = 1;
  return {
    id: `${runId}:start`, sequence: 1, commandId: null, type: "decision_recorded", category: "system", actor: "system",
    simulationDay: 0, summary: `Started ${state.meta.companyName}.`, effects: [], engineVersion: state.engineVersion, createdAt: now.toISOString(),
  };
}

export class MemoryStore implements RuntimeStore {
  async syncScenarios(definitions: ScenarioDefinition[]) { definitions.forEach((definition) => data().scenarios.set(`${definition.id}@${definition.version}`, copy(definition))); }

  async createIdentity(input: IdentityInput) {
    const user: UserRecord = { id: randomUUID(), displayName: input.displayName, contactEmail: input.contactEmail, createdAt: input.now.toISOString() };
    data().users.set(user.id, user);
    data().sessions.set(input.session.tokenHash, { userId: user.id, expiresAt: input.session.expiresAt.toISOString(), revokedAt: null, createdAt: input.now.toISOString() });
    data().recoveries.set(input.recovery.lookupId, { userId: user.id, lookupId: input.recovery.lookupId, secretHash: input.recovery.secretHash, usedAt: null });
    return copy(user);
  }

  async resolveSession(tokenHash: string, now: Date) {
    const session = data().sessions.get(tokenHash);
    if (!session || session.revokedAt || new Date(session.expiresAt) <= now) return null;
    const user = data().users.get(session.userId);
    return user ? copy(user) : null;
  }

  async recoverIdentity(input: RecoveryInput) {
    const credential = data().recoveries.get(input.lookupId);
    if (!credential || credential.usedAt || credential.secretHash !== input.secretHash) throw new Error("INVALID_RECOVERY_CODE");
    credential.usedAt = input.now.toISOString();
    for (const session of data().sessions.values()) if (session.userId === credential.userId) session.revokedAt = input.now.toISOString();
    data().sessions.set(input.session.tokenHash, { userId: credential.userId, expiresAt: input.session.expiresAt.toISOString(), revokedAt: null, createdAt: input.now.toISOString() });
    data().recoveries.set(input.replacement.lookupId, { userId: credential.userId, lookupId: input.replacement.lookupId, secretHash: input.replacement.secretHash, usedAt: null });
    const user = data().users.get(credential.userId);
    if (!user) throw new Error("INVALID_RECOVERY_CODE");
    return copy(user);
  }

  async rotateRecovery(userId: string, lookupId: string, secretHash: string, now: Date) {
    for (const recovery of data().recoveries.values()) if (recovery.userId === userId && !recovery.usedAt) recovery.usedAt = now.toISOString();
    data().recoveries.set(lookupId, { userId, lookupId, secretHash, usedAt: null });
  }

  async refreshSession(userId: string, currentTokenHash: string, replacement: { tokenHash: string; expiresAt: Date }, now: Date) {
    const current = data().sessions.get(currentTokenHash);
    if (!current || current.userId !== userId || current.revokedAt || now.getTime() - new Date(current.createdAt).getTime() < 7 * 24 * 60 * 60_000) return false;
    current.revokedAt = now.toISOString();
    data().sessions.set(replacement.tokenHash, { userId, expiresAt: replacement.expiresAt.toISOString(), revokedAt: null, createdAt: now.toISOString() });
    return true;
  }

  async revokeSession(tokenHash: string, now: Date) { const session = data().sessions.get(tokenHash); if (session) session.revokedAt = now.toISOString(); }

  async listRuns(ownerId: string) {
    return [...data().runs.values()].filter((run) => run.ownerId === ownerId).sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt)).map(copy);
  }

  async createRun(ownerId: string, scenario: ScenarioDefinition, setupInput: unknown, seed: number, now: Date) {
    const setup = runSetupSchema.parse(setupInput);
    const id = randomUUID();
    const state = createInitialState(scenario, setup, { seed, now: now.toISOString(), engineVersion: ENGINE_VERSION, scenarioVersion: `${scenario.id}@${scenario.version}` });
    if (state.schemaVersion === 3) {
      const dossier = marketIntelligencePublic(state).dossier; const externalId = randomUUID();
      state.externalInputRefs?.push({ id: externalId, kind: "market_dossier", inputHash: dossier.contentHash, effectiveSimulationDay: 0 });
      data().externalInputs.set(externalId, { id: externalId, runId: id, sequence: 0, kind: "market_dossier", payload: dossier, inputHash: dossier.contentHash, provider: "authored", promptVersion: "curated-dossier-v9.1", effectiveSimulationDay: 0, observedAt: now.toISOString() });
    }
    const event = initialEvent(id, state, now);
    const checksum = stateChecksum(state);
    const run: RunRecord = {
      id, ownerId, scenarioVersionId: `${scenario.id}@${scenario.version}`, parentRunId: null, title: setup.companyName,
      status: state.status, seed, engineVersion: ENGINE_VERSION, stateVersion: 1, headEventSequence: 1, state, checksum,
      createdAt: now.toISOString(), updatedAt: now.toISOString(), lastPlayedAt: now.toISOString(),
    };
    data().runs.set(id, copy(run)); data().events.set(id, [event]); data().dialogue.set(id, []);
    const snapshot: Snapshot = { id: randomUUID(), runId: id, eventSequence: 1, stateVersion: 1, state: copy(state), checksum, createdAt: now.toISOString() };
    data().snapshots.set(id, [snapshot]);
    data().checkpoints.set(id, [{ id: randomUUID(), runId: id, eventSequence: 1, stateVersion: 1, name: "Run start", automatic: true, checksum, createdAt: now.toISOString() }]);
    return copy(run);
  }

  async getRun(ownerId: string, runId: string) { const run = data().runs.get(runId); return run?.ownerId === ownerId ? copy(run) : null; }

  async executeCommand(ownerId: string, runId: string, request: CommandRequest, now: Date) {
    const run = assertOwner(data().runs.get(runId), ownerId);
    const duplicate = data().commandResponses.get(`${runId}:${request.commandId}`);
    if (duplicate) return copy(duplicate);
    if (run.stateVersion !== request.expectedVersion) throw new Error("VERSION_CONFLICT");
    const command = { commandId: request.commandId, type: request.type, payload: request.payload };
    const result = applyVersionedCommand(run.state, command, {
      seed: run.seed, now: now.toISOString(), engineVersion: run.engineVersion, scenarioVersion: run.scenarioVersionId,
    });
    const storedEvents = result.events.map((event) => ({ ...event, id: `${runId}:${event.id}` }));
    run.state = result.state; run.stateVersion += 1; run.headEventSequence = result.state.sequence; run.status = result.state.status;
    run.checksum = result.checksum; run.updatedAt = now.toISOString(); run.lastPlayedAt = now.toISOString();
    data().events.get(runId)?.push(...copy(storedEvents));
    if (result.checkpoint) {
      const snapshot: Snapshot = { id: randomUUID(), runId, eventSequence: run.headEventSequence, stateVersion: run.stateVersion, state: copy(run.state), checksum: run.checksum, createdAt: now.toISOString() };
      data().snapshots.get(runId)?.push(snapshot);
      data().checkpoints.get(runId)?.push({ id: randomUUID(), runId, eventSequence: run.headEventSequence, stateVersion: run.stateVersion, name: run.status === "active" ? `Day ${run.state.calendar.absoluteDay}` : "Run ended", automatic: true, checksum: run.checksum, createdAt: now.toISOString() });
    }
    const response: CommandResponse = { runId, version: run.stateVersion, checksum: run.checksum, state: projectVersionedState(run.state), events: copy(storedEvents), savedAt: now.toISOString() };
    data().commandResponses.set(`${runId}:${request.commandId}`, copy(response));
    return response;
  }

  async resolvePendingAgentTurn(ownerId: string, runId: string, now: Date) {
    const run = assertOwner(data().runs.get(runId), ownerId);
    const pending = run.state.features?.public.competitors?.pendingTurn;
    if (!pending) return null;
    const key = `${runId}:${pending.id}`; const existing = data().agentTurns.get(key);
    if (existing?.status === "completed") return copy(existing);
    const envelope = buildAgentDecisionEnvelope(run.state);
    const record: AgentTurnRecord = { id: pending.id, runId, actorId: pending.actorId, status: "pending", envelope, decision: null, provider: null, model: null, promptVersion: "competitor-policy-v9.1", latencyMs: null, inputTokens: null, outputTokens: null, fallbackReason: null, createdAt: now.toISOString(), completedAt: null };
    data().agentTurns.set(key, copy(record));
    const generated = await generateAgentDecision(envelope);
    const current = assertOwner(data().runs.get(runId), ownerId); const stillPending = current.state.features?.public.competitors?.pendingTurn;
    if (!stillPending || stillPending.id !== pending.id || stillPending.worldInputHash !== envelope.worldInputHash) {
      const finished = data().agentTurns.get(key); if (finished?.status === "completed") return copy(finished);
      record.status = "failed"; record.fallbackReason = "STALE_AGENT_TURN"; record.completedAt = new Date().toISOString(); data().agentTurns.set(key, copy(record)); return copy(record);
    }
    const externalId = randomUUID(); const commandId = `system-agent-${pending.id}`;
    const result = applySystemCommand(current.state, { commandId, type: "system.agent_decision.apply", payload: { externalInputId: externalId, turnId: pending.id, decision: generated.decision, provider: generated.provider, inputHash: envelope.worldInputHash } }, { seed: current.seed, now: new Date().toISOString(), engineVersion: current.engineVersion, scenarioVersion: current.scenarioVersionId });
    const input: ExternalInputRecord = { id: externalId, runId, sequence: current.stateVersion + 1, kind: "agent_decision", payload: generated.decision, inputHash: envelope.worldInputHash, provider: generated.provider, model: generated.model ?? undefined, promptVersion: generated.promptVersion, effectiveSimulationDay: result.state.calendar.absoluteDay, observedAt: new Date().toISOString() };
    data().externalInputs.set(externalId, copy(input));
    const storedEvents = result.events.map((event) => ({ ...event, id: `${runId}:${event.id}` })); data().events.get(runId)?.push(...copy(storedEvents));
    current.state = result.state; current.stateVersion += 1; current.headEventSequence = result.state.sequence; current.checksum = result.checksum; current.updatedAt = new Date().toISOString();
    if (result.checkpoint) {
      const snapshot: Snapshot = { id: randomUUID(), runId, eventSequence: current.headEventSequence, stateVersion: current.stateVersion, state: copy(current.state), checksum: current.checksum, createdAt: new Date().toISOString() };
      data().snapshots.get(runId)?.push(snapshot); data().checkpoints.get(runId)?.push({ id: randomUUID(), runId, eventSequence: snapshot.eventSequence, stateVersion: snapshot.stateVersion, name: `Before simulated ${pending.actorId} move`, automatic: true, checksum: snapshot.checksum, createdAt: snapshot.createdAt });
    }
    record.status = "completed"; record.decision = generated.decision; record.provider = generated.provider; record.model = generated.model; record.promptVersion = generated.promptVersion; record.latencyMs = generated.latencyMs; record.inputTokens = generated.inputTokens; record.outputTokens = generated.outputTokens; record.fallbackReason = generated.fallbackReason; record.completedAt = new Date().toISOString();
    data().agentTurns.set(key, copy(record)); return copy(record);
  }

  async getAgentTurn(ownerId: string, runId: string, turnId: string) {
    assertOwner(data().runs.get(runId), ownerId); const value = data().agentTurns.get(`${runId}:${turnId}`); return value ? copy(value) : null;
  }

  async listExternalInputs(ownerId: string, runId: string) {
    const run = assertOwner(data().runs.get(runId), ownerId); const ids = new Set(run.state.externalInputRefs?.map((item) => item.id) ?? []);
    return [...data().externalInputs.values()].filter((item) => ids.has(item.id)).sort((a, b) => a.sequence - b.sequence).map(copy);
  }

  async publishMarketDossier(dossier: MarketDossierVersion, metadata: { provider: "openai" | "authored"; model?: string; promptVersion: string }, now: Date) {
    let updatedRuns = 0;
    for (const run of data().runs.values()) {
      if (run.state.schemaVersion !== 3 || run.state.scenarioId !== dossier.scenarioId || run.status !== "active" || run.state.externalInputRefs?.some((item) => item.kind === "market_dossier" && item.inputHash === dossier.contentHash)) continue;
      const externalId = randomUUID(); const commandId = `system-market-${dossier.id}`;
      const result = applySystemCommand(run.state, { commandId, type: "system.market_dossier.apply", payload: { externalInputId: externalId, dossier, inputHash: dossier.contentHash } }, { seed: run.seed, now: now.toISOString(), engineVersion: run.engineVersion, scenarioVersion: run.scenarioVersionId });
      const nextVersion = run.stateVersion + 1; data().externalInputs.set(externalId, { id: externalId, runId: run.id, sequence: nextVersion, kind: "market_dossier", payload: dossier, inputHash: dossier.contentHash, provider: metadata.provider, model: metadata.model, promptVersion: metadata.promptVersion, effectiveSimulationDay: result.state.calendar.absoluteDay, observedAt: now.toISOString() });
      const storedEvents = result.events.map((event) => ({ ...event, id: `${run.id}:${event.id}` })); data().events.get(run.id)?.push(...copy(storedEvents));
      run.state = result.state; run.stateVersion = nextVersion; run.headEventSequence = result.state.sequence; run.checksum = result.checksum; run.updatedAt = now.toISOString(); updatedRuns += 1;
      const snapshot: Snapshot = { id: randomUUID(), runId: run.id, eventSequence: run.headEventSequence, stateVersion: run.stateVersion, state: copy(run.state), checksum: run.checksum, createdAt: now.toISOString() };
      data().snapshots.get(run.id)?.push(snapshot); data().checkpoints.get(run.id)?.push({ id: randomUUID(), runId: run.id, eventSequence: snapshot.eventSequence, stateVersion: snapshot.stateVersion, name: `Market dossier ${dossier.capturedAt.slice(0, 10)}`, automatic: true, checksum: snapshot.checksum, createdAt: snapshot.createdAt });
    }
    return { updatedRuns };
  }

  async listEvents(ownerId: string, runId: string, options: { category?: string; cursor?: number; limit?: number } = {}) {
    assertOwner(data().runs.get(runId), ownerId);
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const items = (data().events.get(runId) ?? []).filter((event) => !options.category || event.category === options.category)
      .filter((event) => !options.cursor || event.sequence < options.cursor).sort((a, b) => b.sequence - a.sequence).slice(0, limit);
    return { events: copy(items), nextCursor: items.length === limit ? items.at(-1)?.sequence ?? null : null };
  }

  async listCheckpoints(ownerId: string, runId: string) { assertOwner(data().runs.get(runId), ownerId); return copy(data().checkpoints.get(runId) ?? []).sort((a, b) => b.eventSequence - a.eventSequence); }

  async createCheckpoint(ownerId: string, runId: string, name: string, now: Date) {
    const run = assertOwner(data().runs.get(runId), ownerId);
    let snapshot = data().snapshots.get(runId)?.find((item) => item.eventSequence === run.headEventSequence);
    if (!snapshot) {
      snapshot = { id: randomUUID(), runId, eventSequence: run.headEventSequence, stateVersion: run.stateVersion, state: copy(run.state), checksum: run.checksum, createdAt: now.toISOString() };
      data().snapshots.get(runId)?.push(snapshot);
    }
    const checkpoint: CheckpointRecord = { id: randomUUID(), runId, eventSequence: snapshot.eventSequence, stateVersion: snapshot.stateVersion, name, automatic: false, checksum: snapshot.checksum, createdAt: now.toISOString() };
    data().checkpoints.get(runId)?.push(checkpoint); return copy(checkpoint);
  }

  async forkRun(ownerId: string, runId: string, checkpointId: string, now: Date) {
    const source = assertOwner(data().runs.get(runId), ownerId);
    const checkpoint = data().checkpoints.get(runId)?.find((item) => item.id === checkpointId);
    if (!checkpoint) throw new Error("CHECKPOINT_NOT_FOUND");
    const snapshot = data().snapshots.get(runId)?.find((item) => item.eventSequence === checkpoint.eventSequence);
    if (!snapshot) throw new Error("CHECKPOINT_NOT_FOUND");
    const id = randomUUID(); const state = copy(snapshot.state); state.sequence += 1;
    const event: HistoryEvent = { id: `${id}:fork`, sequence: state.sequence, commandId: null, type: "decision_recorded", category: "system", actor: "system", simulationDay: state.calendar.absoluteDay, summary: `Forked from ${source.title} at ${checkpoint.name}.`, effects: [], engineVersion: state.engineVersion, createdAt: now.toISOString() };
    const checksum = stateChecksum(state);
    const run: RunRecord = { id, ownerId, scenarioVersionId: source.scenarioVersionId, parentRunId: source.id, title: `${source.title} — fork`, status: state.status, seed: source.seed, engineVersion: source.engineVersion, stateVersion: 1, headEventSequence: state.sequence, state, checksum, createdAt: now.toISOString(), updatedAt: now.toISOString(), lastPlayedAt: now.toISOString() };
    data().runs.set(id, copy(run)); data().events.set(id, [event]); data().dialogue.set(id, []);
    const forkSnapshot: Snapshot = { id: randomUUID(), runId: id, eventSequence: state.sequence, stateVersion: 1, state: copy(state), checksum, createdAt: now.toISOString() };
    data().snapshots.set(id, [forkSnapshot]); data().checkpoints.set(id, [{ id: randomUUID(), runId: id, eventSequence: state.sequence, stateVersion: 1, name: "Fork start", automatic: true, checksum, createdAt: now.toISOString() }]);
    return copy(run);
  }

  async importLegacy(ownerId: string, payload: unknown, now: Date): Promise<LegacyImportResult> {
    const migrated = migrateLegacySave(payload, now); const id = randomUUID();
    migrated.events.forEach((event) => { event.id = `${id}:${event.id}`; });
    const run: RunRecord = { id, ownerId, scenarioVersionId: "legacy-v6-free-setup@6.0.0", parentRunId: null, title: migrated.state.meta.companyName, status: migrated.state.status, seed: migrated.state.seed, engineVersion: migrated.state.engineVersion, stateVersion: 1, headEventSequence: migrated.state.sequence, state: migrated.state, checksum: migrated.checksum, createdAt: now.toISOString(), updatedAt: now.toISOString(), lastPlayedAt: now.toISOString() };
    data().runs.set(id, copy(run)); data().events.set(id, copy(migrated.events)); data().dialogue.set(id, []);
    const snapshot: Snapshot = { id: randomUUID(), runId: id, eventSequence: run.headEventSequence, stateVersion: 1, state: copy(run.state), checksum: run.checksum, createdAt: now.toISOString() };
    data().snapshots.set(id, [snapshot]); data().checkpoints.set(id, [{ id: randomUUID(), runId: id, eventSequence: run.headEventSequence, stateVersion: 1, name: "Imported v6 save", automatic: true, checksum: run.checksum, createdAt: now.toISOString() }]);
    return { run: copy(run), importedEvents: migrated.events.length };
  }

  async saveDialogue(ownerId: string, runId: string, turn: DialogueTurn) {
    assertOwner(data().runs.get(runId), ownerId); data().dialogue.get(runId)?.push(copy(turn));
  }

  async listDialogue(ownerId: string, runId: string) {
    assertOwner(data().runs.get(runId), ownerId); return copy(data().dialogue.get(runId) ?? []);
  }

  async buildDebrief(ownerId: string, runId: string) {
    const run = assertOwner(data().runs.get(runId), ownerId); return createVersionedDebrief(runId, run.state, data().events.get(runId) ?? []);
  }
}

export function resetMemoryStoreForTests() { delete globalMemory.__startupSimulatorMemory; }
