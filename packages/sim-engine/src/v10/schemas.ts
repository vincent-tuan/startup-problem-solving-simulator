import { z } from "zod";
import type { CreateRunV10Request, EngineCommandV10, SimulationCommandV10 } from "./types";

export const founderProfileIdSchemaV10 = z.enum([
  "technical_builder",
  "commercial_hunter",
  "domain_insider",
  "community_operator",
]);

export const createRunV10RequestSchema = z.object({
  scenarioVersionId: z.string().trim().min(3).max(200),
  setup: z.object({
    companyName: z.string().trim().min(2).max(80),
    founderProfileId: founderProfileIdSchemaV10,
  }).strict(),
}).strict() satisfies z.ZodType<CreateRunV10Request>;

const commandBase = {
  commandId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
};

export const operationsAdvanceCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("operations.advance_to_next_material_event"),
  payload: z.object({
    horizonDays: z.number().int().min(1).max(365).optional(),
  }).strict(),
}).strict();

export const requestFinalAuditCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("campaign.request_final_audit"),
  payload: z.object({ confirmation: z.literal("FINAL_AUDIT") }).strict(),
}).strict();

export const controlledShutdownCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("campaign.controlled_shutdown"),
  payload: z.object({ reason: z.string().trim().min(3).max(500) }).strict(),
}).strict();

const publicFactSchema = z.object({
  id: z.string().min(3).max(160),
  sourceType: z.literal("verified_public_fact"),
  subjectId: z.string().min(1).max(160),
  kind: z.string().min(1).max(80),
  statement: z.string().min(3).max(1200),
  title: z.string().min(1).max(300),
  publisher: z.string().min(1).max(160),
  url: z.string().url().max(2048),
  observedAt: z.string().min(10).max(64),
  retrievedAt: z.string().min(10).max(64),
}).strict();

export const recordPublicFactCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("external_world.record_public_fact"),
  payload: z.object({
    fact: publicFactSchema,
    externalInputRef: z.string().min(3).max(200),
  }).strict(),
}).strict();

export const completeFinalAuditCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("campaign.complete_final_audit"),
  payload: z.object({ auditId: z.string().min(3).max(200) }).strict(),
}).strict();

export const simulationCommandSchemaV10 = z.discriminatedUnion("type", [
  operationsAdvanceCommandSchemaV10,
  requestFinalAuditCommandSchemaV10,
  controlledShutdownCommandSchemaV10,
  recordPublicFactCommandSchemaV10,
  completeFinalAuditCommandSchemaV10,
]) satisfies z.ZodType<SimulationCommandV10>;

const actorSchema = z.enum(["player", "system"]);

export const engineCommandSchemaV10 = z.discriminatedUnion("type", [
  operationsAdvanceCommandSchemaV10.extend({ actor: actorSchema }),
  requestFinalAuditCommandSchemaV10.extend({ actor: actorSchema }),
  controlledShutdownCommandSchemaV10.extend({ actor: actorSchema }),
  recordPublicFactCommandSchemaV10.extend({ actor: actorSchema }),
  completeFinalAuditCommandSchemaV10.extend({ actor: actorSchema }),
]) satisfies z.ZodType<EngineCommandV10>;
