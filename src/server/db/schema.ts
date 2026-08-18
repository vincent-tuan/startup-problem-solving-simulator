import {
  boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import type { AgentDecision, AgentDecisionEnvelope, AiDialogueResponse, HistoryEvent, MarketDossierVersion, ScenarioDefinition, SimulationCommand, SimulationState, SystemSimulationCommand } from "@sim/engine";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash), index("sessions_user_idx").on(table.userId)]);

export const recoveryCredentials = pgTable("recovery_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lookupId: text("lookup_id").notNull(),
  secretHash: text("secret_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("recovery_lookup_uidx").on(table.lookupId), index("recovery_user_idx").on(table.userId)]);

export const scenarios = pgTable("scenarios", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("scenarios_slug_uidx").on(table.slug)]);

export const scenarioVersions = pgTable("scenario_versions", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  status: text("status").notNull(),
  contentHash: text("content_hash").notNull(),
  content: jsonb("content").$type<ScenarioDefinition>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("scenario_version_uidx").on(table.scenarioId, table.version)]);

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scenarioVersionId: text("scenario_version_id").notNull().references(() => scenarioVersions.id),
  parentRunId: uuid("parent_run_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  seed: integer("seed").notNull(),
  engineVersion: text("engine_version").notNull(),
  stateVersion: integer("state_version").notNull().default(1),
  headEventSequence: integer("head_event_sequence").notNull().default(1),
  headState: jsonb("head_state").$type<SimulationState>().notNull(),
  headChecksum: text("head_checksum").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [index("runs_owner_last_played_idx").on(table.ownerId, table.lastPlayedAt), index("runs_parent_idx").on(table.parentRunId)]);

export const runCommands = pgTable("run_commands", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  clientCommandId: text("client_command_id").notNull(),
  expectedVersion: integer("expected_version").notNull(),
  resultingVersion: integer("resulting_version").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<SimulationCommand["payload"] | SystemSimulationCommand["payload"]>().notNull(),
  resultingState: jsonb("resulting_state").$type<SimulationState>().notNull(),
  resultingChecksum: text("resulting_checksum").notNull(),
  resultingEventSequence: integer("resulting_event_sequence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("run_command_idempotency_uidx").on(table.runId, table.clientCommandId), index("run_commands_replay_idx").on(table.runId, table.resultingEventSequence)]);

export const runEvents = pgTable("run_events", {
  id: text("id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  commandId: text("command_id"),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  category: text("category").notNull(),
  actor: text("actor").notNull(),
  simulationDay: integer("simulation_day").notNull(),
  summary: text("summary").notNull(),
  effects: jsonb("effects").$type<HistoryEvent["effects"]>().notNull(),
  engineVersion: text("engine_version").notNull(),
  replayable: boolean("replayable").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex("run_event_sequence_uidx").on(table.runId, table.sequence), index("run_events_filter_idx").on(table.runId, table.category, table.sequence)]);

export const runDialogueTurns = pgTable("run_dialogue_turns", {
  id: text("id").primaryKey(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  interactionId: text("interaction_id").notNull(), actorId: text("actor_id").notNull(),
  playerText: text("player_text").notNull(), response: jsonb("response").$type<AiDialogueResponse>().notNull(),
  provider: text("provider").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [index("run_dialogue_turns_run_idx").on(table.runId, table.createdAt)]);

export const marketSources = pgTable("market_sources", {
  id: text("id").primaryKey(), scenarioId: text("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  title: text("title").notNull(), publisher: text("publisher").notNull(), url: text("url").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(), primary: boolean("primary_source").notNull().default(false),
}, (table) => [index("market_sources_scenario_idx").on(table.scenarioId)]);

export const competitorProfiles = pgTable("competitor_profiles", {
  id: text("id").primaryKey(), scenarioId: text("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  publicName: text("public_name").notNull(), website: text("website").notNull(), category: text("category").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("competitor_profiles_scenario_idx").on(table.scenarioId)]);

export const marketDossierVersions = pgTable("market_dossier_versions", {
  id: text("id").primaryKey(), scenarioVersionId: text("scenario_version_id").notNull().references(() => scenarioVersions.id, { onDelete: "cascade" }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(), contentHash: text("content_hash").notNull(), content: jsonb("content").$type<MarketDossierVersion>().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("market_dossier_hash_uidx").on(table.scenarioVersionId, table.contentHash)]);

export const marketFacts = pgTable("market_facts", {
  id: text("id").primaryKey(), dossierId: text("dossier_id").notNull().references(() => marketDossierVersions.id, { onDelete: "cascade" }),
  subjectId: text("subject_id").notNull(), kind: text("kind").notNull(), statement: text("statement").notNull(),
  value: jsonb("value").$type<string | number | null>(), unit: text("unit"), observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  confidence: integer("confidence").notNull(), sourceIds: jsonb("source_ids").$type<string[]>().notNull(), status: text("status").notNull(),
}, (table) => [index("market_facts_dossier_subject_idx").on(table.dossierId, table.subjectId)]);

export const runExternalInputs = pgTable("run_external_inputs", {
  id: uuid("id").primaryKey(), runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(), kind: text("kind").notNull(), payload: jsonb("payload").$type<unknown>().notNull(), inputHash: text("input_hash").notNull(),
  provider: text("provider").notNull(), model: text("model"), promptVersion: text("prompt_version"), effectiveSimulationDay: integer("effective_simulation_day").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex("run_external_input_sequence_uidx").on(table.runId, table.sequence), index("run_external_inputs_run_idx").on(table.runId)]);

export const runAgentTurns = pgTable("run_agent_turns", {
  id: uuid("id").primaryKey().defaultRandom(), runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  turnId: text("turn_id").notNull(), actorId: text("actor_id").notNull(), status: text("status").notNull(),
  envelope: jsonb("envelope").$type<AgentDecisionEnvelope>().notNull(), decision: jsonb("decision").$type<AgentDecision>(), provider: text("provider"),
  model: text("model"), promptVersion: text("prompt_version").notNull(), latencyMs: integer("latency_ms"), inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"),
  fallbackReason: text("fallback_reason"), createdAt: timestamp("created_at", { withTimezone: true }).notNull(), completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [uniqueIndex("run_agent_turn_uidx").on(table.runId, table.turnId), index("run_agent_turn_status_idx").on(table.runId, table.status)]);

export const runSnapshots = pgTable("run_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  eventSequence: integer("event_sequence").notNull(),
  stateVersion: integer("state_version").notNull(),
  state: jsonb("state").$type<SimulationState>().notNull(),
  checksum: text("checksum").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("snapshot_sequence_uidx").on(table.runId, table.eventSequence)]);

export const checkpoints = pgTable("checkpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  snapshotId: uuid("snapshot_id").notNull().references(() => runSnapshots.id, { onDelete: "cascade" }),
  eventSequence: integer("event_sequence").notNull(),
  name: text("name").notNull(),
  automatic: boolean("automatic").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("checkpoints_run_idx").on(table.runId, table.eventSequence)]);

export const securityRateLimits = pgTable("security_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
});
