import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import {
  ENGINE_VERSION, applySystemCommand, buildAgentDecisionEnvelope, createInitialState, marketIntelligencePublic, marketSeedForScenario, runSetupSchema,
  stateChecksum, type AgentTurnRecord, type DialogueTurn, type ExternalInputRecord, type HistoryEvent, type MarketDossierVersion, type ScenarioDefinition, type SimulationCommand, type SimulationState,
} from "@sim/engine";
import { generateAgentDecision } from "@/server/ai/actors";
import { scenarioContentHash, scenarioVersionId } from "@/content/scenarios";
import { safeHashEqual } from "@/server/auth/crypto";
import { database } from "@/server/db/client";
import {
  checkpoints, competitorProfiles, marketDossierVersions, marketFacts, marketSources, recoveryCredentials, runAgentTurns, runCommands, runDialogueTurns, runEvents, runExternalInputs, runs, runSnapshots,
  scenarioVersions, scenarios, sessions, users,
} from "@/server/db/schema";
import { migrateLegacySave } from "@/server/legacy";
import type {
  CheckpointRecord, CommandRequest, CommandResponse, IdentityInput, LegacyImportResult,
  RecoveryInput, RunRecord, RuntimeStore, UserRecord,
} from "./types";
import { applyVersionedCommand, createVersionedDebrief, projectVersionedState } from "./versioning";

type RunRow = typeof runs.$inferSelect;
const toUser = (row: typeof users.$inferSelect): UserRecord => ({
  id: row.id, displayName: row.displayName, contactEmail: row.contactEmail, createdAt: row.createdAt.toISOString(),
});
const toRun = (row: RunRow): RunRecord => ({
  id: row.id, ownerId: row.ownerId, scenarioVersionId: row.scenarioVersionId, parentRunId: row.parentRunId,
  title: row.title, status: row.status as SimulationState["status"], seed: row.seed, engineVersion: row.engineVersion,
  stateVersion: row.stateVersion, headEventSequence: row.headEventSequence, state: row.headState,
  checksum: row.headChecksum, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), lastPlayedAt: row.lastPlayedAt.toISOString(),
});
const toEvent = (row: typeof runEvents.$inferSelect): HistoryEvent => ({
  id: row.id, sequence: row.sequence, commandId: row.commandId, type: row.type as HistoryEvent["type"],
  category: row.category as HistoryEvent["category"], actor: row.actor as HistoryEvent["actor"],
  simulationDay: row.simulationDay, summary: row.summary, effects: row.effects, engineVersion: row.engineVersion,
  createdAt: row.createdAt.toISOString(),
});
const toAgentTurn = (row: typeof runAgentTurns.$inferSelect): AgentTurnRecord => ({
  id: row.turnId, runId: row.runId, actorId: row.actorId, status: row.status as AgentTurnRecord["status"], envelope: row.envelope,
  decision: row.decision, provider: row.provider as AgentTurnRecord["provider"], model: row.model, promptVersion: row.promptVersion,
  latencyMs: row.latencyMs, inputTokens: row.inputTokens, outputTokens: row.outputTokens, fallbackReason: row.fallbackReason,
  createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null,
});
const toExternalInput = (row: typeof runExternalInputs.$inferSelect): ExternalInputRecord => ({
  id: row.id, runId: row.runId, sequence: row.sequence, kind: row.kind as ExternalInputRecord["kind"], payload: row.payload,
  inputHash: row.inputHash, provider: row.provider as ExternalInputRecord["provider"], model: row.model ?? undefined,
  promptVersion: row.promptVersion ?? undefined, effectiveSimulationDay: row.effectiveSimulationDay, observedAt: row.observedAt.toISOString(),
});

function startEvent(runId: string, state: SimulationState, now: Date): HistoryEvent {
  state.sequence = 1;
  return { id: `${runId}:start`, sequence: 1, commandId: null, type: "decision_recorded", category: "system", actor: "system", simulationDay: 0, summary: `Started ${state.meta.companyName}.`, effects: [], engineVersion: state.engineVersion, createdAt: now.toISOString() };
}

export class PostgresStore implements RuntimeStore {
  async syncScenarios(definitions: ScenarioDefinition[]) {
    const db = database();
    await db.transaction(async (tx) => {
      for (const definition of definitions) {
        await tx.insert(scenarios).values({ id: definition.id, slug: definition.slug, title: definition.title, hidden: definition.hidden })
          .onConflictDoUpdate({ target: scenarios.id, set: { slug: definition.slug, title: definition.title, hidden: definition.hidden, updatedAt: new Date() } });
        await tx.insert(scenarioVersions).values({
          id: scenarioVersionId(definition), scenarioId: definition.id, version: definition.version,
          status: definition.status, contentHash: scenarioContentHash(definition), content: definition,
        }).onConflictDoNothing();
        if (["ai-workflow-automation", "local-services-saas", "healthcare-operations"].includes(definition.id)) {
          const { dossier, profiles } = marketSeedForScenario(definition.id);
          for (const source of dossier.sources) await tx.insert(marketSources).values({ id: source.id, scenarioId: definition.id, title: source.title, publisher: source.publisher, url: source.url, retrievedAt: new Date(source.retrievedAt), primary: source.primary }).onConflictDoUpdate({ target: marketSources.id, set: { title: source.title, publisher: source.publisher, url: source.url, retrievedAt: new Date(source.retrievedAt), primary: source.primary } });
          for (const profile of profiles) await tx.insert(competitorProfiles).values({ id: profile.id, scenarioId: definition.id, publicName: profile.publicName, website: profile.website, category: profile.category, content: profile as unknown as Record<string, unknown> }).onConflictDoUpdate({ target: competitorProfiles.id, set: { publicName: profile.publicName, website: profile.website, category: profile.category, content: profile as unknown as Record<string, unknown>, updatedAt: new Date() } });
          await tx.insert(marketDossierVersions).values({ id: dossier.id, scenarioVersionId: scenarioVersionId(definition), capturedAt: new Date(dossier.capturedAt), contentHash: dossier.contentHash, content: dossier }).onConflictDoNothing();
          for (const fact of dossier.facts) await tx.insert(marketFacts).values({ id: fact.id, dossierId: dossier.id, subjectId: fact.subjectId, kind: fact.kind, statement: fact.statement, value: fact.value ?? null, unit: fact.unit, observedAt: new Date(fact.observedAt), confidence: fact.confidence, sourceIds: fact.sourceIds, status: fact.status }).onConflictDoNothing();
        }
      }
    });
  }

  async createIdentity(input: IdentityInput) {
    return database().transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ displayName: input.displayName, contactEmail: input.contactEmail, createdAt: input.now, updatedAt: input.now }).returning();
      await tx.insert(sessions).values({ userId: user.id, tokenHash: input.session.tokenHash, expiresAt: input.session.expiresAt, createdAt: input.now, lastSeenAt: input.now });
      await tx.insert(recoveryCredentials).values({ userId: user.id, lookupId: input.recovery.lookupId, secretHash: input.recovery.secretHash, createdAt: input.now });
      return toUser(user);
    });
  }

  async resolveSession(tokenHash: string, now: Date) {
    const db = database();
    const [row] = await db.select({ user: users }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(
      eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now),
    )).limit(1);
    if (!row) return null;
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.tokenHash, tokenHash));
    return toUser(row.user);
  }

  async recoverIdentity(input: RecoveryInput) {
    return database().transaction(async (tx) => {
      const [credential] = await tx.select().from(recoveryCredentials).where(and(eq(recoveryCredentials.lookupId, input.lookupId), isNull(recoveryCredentials.usedAt))).for("update").limit(1);
      if (!credential || !safeHashEqual(credential.secretHash, input.secretHash)) throw new Error("INVALID_RECOVERY_CODE");
      await tx.update(recoveryCredentials).set({ usedAt: input.now }).where(eq(recoveryCredentials.id, credential.id));
      await tx.update(sessions).set({ revokedAt: input.now }).where(and(eq(sessions.userId, credential.userId), isNull(sessions.revokedAt)));
      await tx.insert(sessions).values({ userId: credential.userId, tokenHash: input.session.tokenHash, expiresAt: input.session.expiresAt, createdAt: input.now, lastSeenAt: input.now });
      await tx.insert(recoveryCredentials).values({ userId: credential.userId, lookupId: input.replacement.lookupId, secretHash: input.replacement.secretHash, createdAt: input.now });
      const [user] = await tx.select().from(users).where(eq(users.id, credential.userId)).limit(1);
      if (!user) throw new Error("INVALID_RECOVERY_CODE");
      return toUser(user);
    });
  }

  async rotateRecovery(userId: string, lookupId: string, secretHash: string, now: Date) {
    await database().transaction(async (tx) => {
      await tx.update(recoveryCredentials).set({ usedAt: now }).where(and(eq(recoveryCredentials.userId, userId), isNull(recoveryCredentials.usedAt)));
      await tx.insert(recoveryCredentials).values({ userId, lookupId, secretHash, createdAt: now });
    });
  }

  async refreshSession(userId: string, currentTokenHash: string, replacement: { tokenHash: string; expiresAt: Date }, now: Date) {
    return database().transaction(async (tx) => {
      const [current] = await tx.select().from(sessions).where(and(eq(sessions.userId, userId), eq(sessions.tokenHash, currentTokenHash), isNull(sessions.revokedAt))).for("update").limit(1);
      if (!current || now.getTime() - current.createdAt.getTime() < 7 * 24 * 60 * 60_000) return false;
      await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, current.id));
      await tx.insert(sessions).values({ userId, tokenHash: replacement.tokenHash, expiresAt: replacement.expiresAt, createdAt: now, lastSeenAt: now });
      return true;
    });
  }

  async revokeSession(tokenHash: string, now: Date) { await database().update(sessions).set({ revokedAt: now }).where(eq(sessions.tokenHash, tokenHash)); }

  async listRuns(ownerId: string) {
    const rows = await database().select().from(runs).where(and(eq(runs.ownerId, ownerId), isNull(runs.archivedAt))).orderBy(desc(runs.lastPlayedAt));
    return rows.map(toRun);
  }

  async createRun(ownerId: string, scenario: ScenarioDefinition, setupInput: unknown, seed: number, now: Date) {
    const setup = runSetupSchema.parse(setupInput); const id = randomUUID();
    const state = createInitialState(scenario, setup, { seed, now: now.toISOString(), engineVersion: ENGINE_VERSION, scenarioVersion: scenarioVersionId(scenario) });
    let initialInput: ExternalInputRecord | null = null;
    if (state.schemaVersion === 3) {
      const dossier = marketIntelligencePublic(state).dossier; const externalId = randomUUID();
      state.externalInputRefs?.push({ id: externalId, kind: "market_dossier", inputHash: dossier.contentHash, effectiveSimulationDay: 0 });
      initialInput = { id: externalId, runId: id, sequence: 0, kind: "market_dossier", payload: dossier, inputHash: dossier.contentHash, provider: "authored", promptVersion: "curated-dossier-v9.1", effectiveSimulationDay: 0, observedAt: now.toISOString() };
    }
    const event = startEvent(id, state, now); const checksum = stateChecksum(state);
    return database().transaction(async (tx) => {
      const [row] = await tx.insert(runs).values({ id, ownerId, scenarioVersionId: scenarioVersionId(scenario), title: setup.companyName, seed, engineVersion: ENGINE_VERSION, stateVersion: 1, headEventSequence: 1, headState: state, headChecksum: checksum, status: state.status, createdAt: now, updatedAt: now, lastPlayedAt: now }).returning();
      await tx.insert(runEvents).values({ ...event, runId: id, replayable: true, createdAt: now });
      if (initialInput) await tx.insert(runExternalInputs).values({ ...initialInput, observedAt: now });
      const [snapshot] = await tx.insert(runSnapshots).values({ runId: id, eventSequence: 1, stateVersion: 1, state, checksum, createdAt: now }).returning();
      await tx.insert(checkpoints).values({ runId: id, snapshotId: snapshot.id, eventSequence: 1, name: "Run start", automatic: true, createdAt: now });
      return toRun(row);
    });
  }

  async getRun(ownerId: string, runId: string) {
    const [row] = await database().select().from(runs).where(and(eq(runs.id, runId), eq(runs.ownerId, ownerId), isNull(runs.archivedAt))).limit(1);
    return row ? toRun(row) : null;
  }

  async executeCommand(ownerId: string, runId: string, request: CommandRequest, now: Date): Promise<CommandResponse> {
    return database().transaction(async (tx) => {
      const [row] = await tx.select().from(runs).where(and(eq(runs.id, runId), eq(runs.ownerId, ownerId), isNull(runs.archivedAt))).for("update").limit(1);
      if (!row) throw new Error("RUN_NOT_FOUND");
      const [duplicate] = await tx.select().from(runCommands).where(and(eq(runCommands.runId, runId), eq(runCommands.clientCommandId, request.commandId))).limit(1);
      if (duplicate) {
        const storedEvents = await tx.select().from(runEvents).where(and(eq(runEvents.runId, runId), eq(runEvents.commandId, request.commandId))).orderBy(runEvents.sequence);
        return { runId, version: duplicate.resultingVersion, checksum: duplicate.resultingChecksum, state: projectVersionedState(duplicate.resultingState), events: storedEvents.map(toEvent), savedAt: duplicate.createdAt.toISOString() };
      }
      if (row.stateVersion !== request.expectedVersion) throw new Error("VERSION_CONFLICT");
      const command = { commandId: request.commandId, type: request.type, payload: request.payload };
      const result = applyVersionedCommand(row.headState, command, { seed: row.seed, now: now.toISOString(), engineVersion: row.engineVersion, scenarioVersion: row.scenarioVersionId });
      const storedEvents = result.events.map((event) => ({ ...event, id: `${runId}:${event.id}` }));
      const nextVersion = row.stateVersion + 1;
      await tx.insert(runCommands).values({ runId, clientCommandId: request.commandId, expectedVersion: request.expectedVersion, resultingVersion: nextVersion, type: command.type, payload: command.payload as SimulationCommand["payload"], resultingState: result.state, resultingChecksum: result.checksum, resultingEventSequence: result.state.sequence, createdAt: now });
      if (storedEvents.length) await tx.insert(runEvents).values(storedEvents.map((event) => ({ ...event, runId, replayable: true, createdAt: new Date(event.createdAt) })));
      await tx.update(runs).set({ stateVersion: nextVersion, headEventSequence: result.state.sequence, headState: result.state, headChecksum: result.checksum, status: result.state.status, updatedAt: now, lastPlayedAt: now }).where(eq(runs.id, runId));
      if (result.checkpoint) {
        const [snapshot] = await tx.insert(runSnapshots).values({ runId, eventSequence: result.state.sequence, stateVersion: nextVersion, state: result.state, checksum: result.checksum, createdAt: now }).returning();
        await tx.insert(checkpoints).values({ runId, snapshotId: snapshot.id, eventSequence: result.state.sequence, name: result.state.status === "active" ? `Day ${result.state.calendar.absoluteDay}` : "Run ended", automatic: true, createdAt: now });
      }
      return { runId, version: nextVersion, checksum: result.checksum, state: projectVersionedState(result.state), events: storedEvents, savedAt: now.toISOString() };
    });
  }

  async resolvePendingAgentTurn(ownerId: string, runId: string, now: Date) {
    const run = await this.getRun(ownerId, runId); if (!run) throw new Error("RUN_NOT_FOUND");
    const pending = run.state.features?.public.competitors?.pendingTurn; if (!pending) return null;
    const envelope = buildAgentDecisionEnvelope(run.state); const db = database();
    const [inserted] = await db.insert(runAgentTurns).values({ runId, turnId: pending.id, actorId: pending.actorId, status: "pending", envelope, promptVersion: "competitor-policy-v9.1", createdAt: now }).onConflictDoNothing().returning();
    const [existing] = inserted ? [inserted] : await db.select().from(runAgentTurns).where(and(eq(runAgentTurns.runId, runId), eq(runAgentTurns.turnId, pending.id))).limit(1);
    if (!existing) return null;
    if (existing.status === "completed") return toAgentTurn(existing);
    const generated = await generateAgentDecision(envelope); const completedAt = new Date();
    return db.transaction(async (tx) => {
      const [locked] = await tx.select().from(runs).where(and(eq(runs.id, runId), eq(runs.ownerId, ownerId), isNull(runs.archivedAt))).for("update").limit(1);
      const currentPending = locked?.headState.features?.public.competitors?.pendingTurn;
      if (!locked || !currentPending || currentPending.id !== pending.id || currentPending.worldInputHash !== envelope.worldInputHash) {
        const [alreadyFinished] = await tx.select().from(runAgentTurns).where(eq(runAgentTurns.id, existing.id)).limit(1);
        if (alreadyFinished?.status === "completed") return toAgentTurn(alreadyFinished);
        const [failed] = await tx.update(runAgentTurns).set({ status: "failed", fallbackReason: "STALE_AGENT_TURN", completedAt }).where(eq(runAgentTurns.id, existing.id)).returning();
        return toAgentTurn(failed);
      }
      const externalId = randomUUID(); const commandId = `system-agent-${pending.id}`;
      const command = { commandId, type: "system.agent_decision.apply" as const, payload: { externalInputId: externalId, turnId: pending.id, decision: generated.decision, provider: generated.provider, inputHash: envelope.worldInputHash } };
      const result = applySystemCommand(locked.headState, command, { seed: locked.seed, now: completedAt.toISOString(), engineVersion: locked.engineVersion, scenarioVersion: locked.scenarioVersionId });
      const nextVersion = locked.stateVersion + 1; const storedEvents = result.events.map((event) => ({ ...event, id: `${runId}:${event.id}` }));
      await tx.insert(runExternalInputs).values({ id: externalId, runId, sequence: nextVersion, kind: "agent_decision", payload: generated.decision, inputHash: envelope.worldInputHash, provider: generated.provider, model: generated.model, promptVersion: generated.promptVersion, effectiveSimulationDay: result.state.calendar.absoluteDay, observedAt: completedAt });
      await tx.insert(runCommands).values({ runId, clientCommandId: commandId, expectedVersion: locked.stateVersion, resultingVersion: nextVersion, type: command.type, payload: command.payload, resultingState: result.state, resultingChecksum: result.checksum, resultingEventSequence: result.state.sequence, createdAt: completedAt });
      if (storedEvents.length) await tx.insert(runEvents).values(storedEvents.map((event) => ({ ...event, runId, replayable: true, createdAt: new Date(event.createdAt) })));
      await tx.update(runs).set({ stateVersion: nextVersion, headEventSequence: result.state.sequence, headState: result.state, headChecksum: result.checksum, status: result.state.status, updatedAt: completedAt }).where(eq(runs.id, runId));
      if (result.checkpoint) {
        const [snapshot] = await tx.insert(runSnapshots).values({ runId, eventSequence: result.state.sequence, stateVersion: nextVersion, state: result.state, checksum: result.checksum, createdAt: completedAt }).onConflictDoNothing().returning();
        if (snapshot) await tx.insert(checkpoints).values({ runId, snapshotId: snapshot.id, eventSequence: result.state.sequence, name: `Before simulated ${pending.actorId} move`, automatic: true, createdAt: completedAt });
      }
      const [finished] = await tx.update(runAgentTurns).set({ status: "completed", decision: generated.decision, provider: generated.provider, model: generated.model, promptVersion: generated.promptVersion, latencyMs: generated.latencyMs, inputTokens: generated.inputTokens, outputTokens: generated.outputTokens, fallbackReason: generated.fallbackReason, completedAt }).where(eq(runAgentTurns.id, existing.id)).returning();
      return toAgentTurn(finished);
    });
  }

  async getAgentTurn(ownerId: string, runId: string, turnId: string) {
    const owned = await this.getRun(ownerId, runId); if (!owned) throw new Error("RUN_NOT_FOUND");
    const [row] = await database().select().from(runAgentTurns).where(and(eq(runAgentTurns.runId, runId), eq(runAgentTurns.turnId, turnId))).limit(1);
    return row ? toAgentTurn(row) : null;
  }

  async listExternalInputs(ownerId: string, runId: string) {
    const run = await this.getRun(ownerId, runId); if (!run) throw new Error("RUN_NOT_FOUND");
    const ids = run.state.externalInputRefs?.map((item) => item.id) ?? []; if (!ids.length) return [];
    const rows = await database().select().from(runExternalInputs).where(inArray(runExternalInputs.id, ids)).orderBy(runExternalInputs.sequence);
    return rows.map(toExternalInput);
  }

  async publishMarketDossier(dossier: MarketDossierVersion, metadata: { provider: "openai" | "authored"; model?: string; promptVersion: string }, now: Date) {
    const db = database();
    const versions = await db.select().from(scenarioVersions).where(eq(scenarioVersions.scenarioId, dossier.scenarioId)).orderBy(desc(scenarioVersions.createdAt));
    if (!versions.length) throw new Error("DOSSIER_SCENARIO_MISSING");
    await db.transaction(async (tx) => {
      for (const source of dossier.sources) await tx.insert(marketSources).values({ id: source.id, scenarioId: dossier.scenarioId, title: source.title, publisher: source.publisher, url: source.url, retrievedAt: new Date(source.retrievedAt), primary: source.primary }).onConflictDoUpdate({ target: marketSources.id, set: { title: source.title, publisher: source.publisher, url: source.url, retrievedAt: new Date(source.retrievedAt), primary: source.primary } });
      await tx.insert(marketDossierVersions).values({ id: dossier.id, scenarioVersionId: versions[0].id, capturedAt: new Date(dossier.capturedAt), contentHash: dossier.contentHash, content: dossier, publishedAt: now }).onConflictDoNothing();
      for (const fact of dossier.facts) await tx.insert(marketFacts).values({ id: fact.id, dossierId: dossier.id, subjectId: fact.subjectId, kind: fact.kind, statement: fact.statement, value: fact.value ?? null, unit: fact.unit, observedAt: new Date(fact.observedAt), confidence: fact.confidence, sourceIds: fact.sourceIds, status: fact.status }).onConflictDoNothing();
    });
    const candidates = await db.select({ id: runs.id }).from(runs).where(and(inArray(runs.scenarioVersionId, versions.map((item) => item.id)), eq(runs.status, "active"), isNull(runs.archivedAt)));
    let updatedRuns = 0;
    for (const candidate of candidates) await db.transaction(async (tx) => {
      const [run] = await tx.select().from(runs).where(eq(runs.id, candidate.id)).for("update").limit(1);
      if (!run || run.headState.schemaVersion !== 3 || run.headState.externalInputRefs?.some((item) => item.kind === "market_dossier" && item.inputHash === dossier.contentHash)) return;
      const duplicateId = `system-market-${dossier.id}`; const [duplicate] = await tx.select().from(runCommands).where(and(eq(runCommands.runId, run.id), eq(runCommands.clientCommandId, duplicateId))).limit(1); if (duplicate) return;
      const externalId = randomUUID(); const command = { commandId: duplicateId, type: "system.market_dossier.apply" as const, payload: { externalInputId: externalId, dossier, inputHash: dossier.contentHash } };
      const result = applySystemCommand(run.headState, command, { seed: run.seed, now: now.toISOString(), engineVersion: run.engineVersion, scenarioVersion: run.scenarioVersionId }); const nextVersion = run.stateVersion + 1;
      await tx.insert(runExternalInputs).values({ id: externalId, runId: run.id, sequence: nextVersion, kind: "market_dossier", payload: dossier, inputHash: dossier.contentHash, provider: metadata.provider, model: metadata.model, promptVersion: metadata.promptVersion, effectiveSimulationDay: result.state.calendar.absoluteDay, observedAt: now });
      await tx.insert(runCommands).values({ runId: run.id, clientCommandId: command.commandId, expectedVersion: run.stateVersion, resultingVersion: nextVersion, type: command.type, payload: command.payload, resultingState: result.state, resultingChecksum: result.checksum, resultingEventSequence: result.state.sequence, createdAt: now });
      const storedEvents = result.events.map((event) => ({ ...event, id: `${run.id}:${event.id}` })); if (storedEvents.length) await tx.insert(runEvents).values(storedEvents.map((event) => ({ ...event, runId: run.id, replayable: true, createdAt: new Date(event.createdAt) })));
      await tx.update(runs).set({ stateVersion: nextVersion, headEventSequence: result.state.sequence, headState: result.state, headChecksum: result.checksum, updatedAt: now }).where(eq(runs.id, run.id));
      const [snapshot] = await tx.insert(runSnapshots).values({ runId: run.id, eventSequence: result.state.sequence, stateVersion: nextVersion, state: result.state, checksum: result.checksum, createdAt: now }).returning();
      await tx.insert(checkpoints).values({ runId: run.id, snapshotId: snapshot.id, eventSequence: result.state.sequence, name: `Market dossier ${dossier.capturedAt.slice(0, 10)}`, automatic: true, createdAt: now }); updatedRuns += 1;
    });
    return { updatedRuns };
  }

  async listEvents(ownerId: string, runId: string, options: { category?: string; cursor?: number; limit?: number } = {}) {
    const owned = await this.getRun(ownerId, runId); if (!owned) throw new Error("RUN_NOT_FOUND");
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const filters = [eq(runEvents.runId, runId)];
    if (options.category) filters.push(eq(runEvents.category, options.category));
    if (options.cursor) filters.push(lt(runEvents.sequence, options.cursor));
    const rows = await database().select().from(runEvents).where(and(...filters)).orderBy(desc(runEvents.sequence)).limit(limit);
    return { events: rows.map(toEvent), nextCursor: rows.length === limit ? rows.at(-1)?.sequence ?? null : null };
  }

  async listCheckpoints(ownerId: string, runId: string) {
    const owned = await this.getRun(ownerId, runId); if (!owned) throw new Error("RUN_NOT_FOUND");
    const rows = await database().select({ checkpoint: checkpoints, snapshot: runSnapshots }).from(checkpoints).innerJoin(runSnapshots, eq(checkpoints.snapshotId, runSnapshots.id)).where(eq(checkpoints.runId, runId)).orderBy(desc(checkpoints.eventSequence));
    return rows.map(({ checkpoint, snapshot }): CheckpointRecord => ({ id: checkpoint.id, runId, eventSequence: checkpoint.eventSequence, stateVersion: snapshot.stateVersion, name: checkpoint.name, automatic: checkpoint.automatic, checksum: snapshot.checksum, createdAt: checkpoint.createdAt.toISOString() }));
  }

  async createCheckpoint(ownerId: string, runId: string, name: string, now: Date) {
    return database().transaction(async (tx) => {
      const [run] = await tx.select().from(runs).where(and(eq(runs.id, runId), eq(runs.ownerId, ownerId))).for("update").limit(1);
      if (!run) throw new Error("RUN_NOT_FOUND");
      let [snapshot] = await tx.select().from(runSnapshots).where(and(eq(runSnapshots.runId, runId), eq(runSnapshots.eventSequence, run.headEventSequence))).limit(1);
      if (!snapshot) [snapshot] = await tx.insert(runSnapshots).values({ runId, eventSequence: run.headEventSequence, stateVersion: run.stateVersion, state: run.headState, checksum: run.headChecksum, createdAt: now }).returning();
      const [checkpoint] = await tx.insert(checkpoints).values({ runId, snapshotId: snapshot.id, eventSequence: snapshot.eventSequence, name, automatic: false, createdAt: now }).returning();
      return { id: checkpoint.id, runId, eventSequence: checkpoint.eventSequence, stateVersion: snapshot.stateVersion, name, automatic: false, checksum: snapshot.checksum, createdAt: checkpoint.createdAt.toISOString() };
    });
  }

  async forkRun(ownerId: string, runId: string, checkpointId: string, now: Date) {
    return database().transaction(async (tx) => {
      const [source] = await tx.select().from(runs).where(and(eq(runs.id, runId), eq(runs.ownerId, ownerId))).limit(1);
      if (!source) throw new Error("RUN_NOT_FOUND");
      const [found] = await tx.select({ checkpoint: checkpoints, snapshot: runSnapshots }).from(checkpoints).innerJoin(runSnapshots, eq(checkpoints.snapshotId, runSnapshots.id)).where(and(eq(checkpoints.id, checkpointId), eq(checkpoints.runId, runId))).limit(1);
      if (!found) throw new Error("CHECKPOINT_NOT_FOUND");
      const id = randomUUID(); const state = structuredClone(found.snapshot.state); state.sequence += 1;
      const checksum = stateChecksum(state);
      const event: HistoryEvent = { id: `${id}:fork`, sequence: state.sequence, commandId: null, type: "decision_recorded", category: "system", actor: "system", simulationDay: state.calendar.absoluteDay, summary: `Forked from ${source.title} at ${found.checkpoint.name}.`, effects: [], engineVersion: state.engineVersion, createdAt: now.toISOString() };
      const [row] = await tx.insert(runs).values({ id, ownerId, scenarioVersionId: source.scenarioVersionId, parentRunId: source.id, title: `${source.title} — fork`, status: state.status, seed: source.seed, engineVersion: source.engineVersion, stateVersion: 1, headEventSequence: state.sequence, headState: state, headChecksum: checksum, createdAt: now, updatedAt: now, lastPlayedAt: now }).returning();
      await tx.insert(runEvents).values({ ...event, runId: id, replayable: true, createdAt: now });
      const [snapshot] = await tx.insert(runSnapshots).values({ runId: id, eventSequence: state.sequence, stateVersion: 1, state, checksum, createdAt: now }).returning();
      await tx.insert(checkpoints).values({ runId: id, snapshotId: snapshot.id, eventSequence: state.sequence, name: "Fork start", automatic: true, createdAt: now });
      return toRun(row);
    });
  }

  async importLegacy(ownerId: string, payload: unknown, now: Date): Promise<LegacyImportResult> {
    const migrated = migrateLegacySave(payload, now); const id = randomUUID();
    const storedEvents = migrated.events.map((event) => ({ ...event, id: `${id}:${event.id}` }));
    return database().transaction(async (tx) => {
      const [row] = await tx.insert(runs).values({ id, ownerId, scenarioVersionId: "legacy-v6-free-setup@6.0.0", title: migrated.state.meta.companyName, status: migrated.state.status, seed: migrated.state.seed, engineVersion: migrated.state.engineVersion, stateVersion: 1, headEventSequence: migrated.state.sequence, headState: migrated.state, headChecksum: migrated.checksum, createdAt: now, updatedAt: now, lastPlayedAt: now }).returning();
      if (storedEvents.length) await tx.insert(runEvents).values(storedEvents.map((event) => ({ ...event, runId: id, replayable: false, createdAt: new Date(event.createdAt) })));
      const [snapshot] = await tx.insert(runSnapshots).values({ runId: id, eventSequence: migrated.state.sequence, stateVersion: 1, state: migrated.state, checksum: migrated.checksum, createdAt: now }).returning();
      await tx.insert(checkpoints).values({ runId: id, snapshotId: snapshot.id, eventSequence: migrated.state.sequence, name: "Imported v6 save", automatic: true, createdAt: now });
      return { run: toRun(row), importedEvents: migrated.events.length };
    });
  }

  async saveDialogue(ownerId: string, runId: string, turn: DialogueTurn) {
    const owned = await this.getRun(ownerId, runId); if (!owned) throw new Error("RUN_NOT_FOUND");
    await database().insert(runDialogueTurns).values({ id: turn.id, runId, interactionId: turn.interactionId, actorId: turn.actorId, playerText: turn.playerText, response: turn.response, provider: turn.provider, createdAt: new Date(turn.createdAt) });
  }

  async listDialogue(ownerId: string, runId: string) {
    const owned = await this.getRun(ownerId, runId); if (!owned) throw new Error("RUN_NOT_FOUND");
    const rows = await database().select().from(runDialogueTurns).where(eq(runDialogueTurns.runId, runId)).orderBy(runDialogueTurns.createdAt);
    return rows.map((row): DialogueTurn => ({ id: row.id, runId: row.runId, interactionId: row.interactionId, actorId: row.actorId, playerText: row.playerText, response: row.response, provider: row.provider as DialogueTurn["provider"], createdAt: row.createdAt.toISOString() }));
  }

  async buildDebrief(ownerId: string, runId: string) {
    const run = await this.getRun(ownerId, runId); if (!run) throw new Error("RUN_NOT_FOUND");
    const rows = await database().select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(runEvents.sequence);
    return createVersionedDebrief(runId, run.state, rows.map(toEvent));
  }
}
