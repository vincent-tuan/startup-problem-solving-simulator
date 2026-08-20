import { z } from "zod";
import { createRunV10RequestSchema, runSetupSchema } from "@sim/engine";

export const anonymousSessionSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
});
export const recoverySchema = z.object({ recoveryCode: z.string().trim().min(20).max(120) });
export const createRunSchema = z.object({
  scenarioSlug: z.string().min(2).max(100),
  scenarioVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  setup: z.union([runSetupSchema, createRunV10RequestSchema.shape.setup]),
});
export const commandRequestSchema = z.object({
  commandId: z.string().min(8).max(100), expectedVersion: z.number().int().min(0), type: z.string().min(2).max(100), payload: z.unknown(),
});
export const checkpointSchema = z.object({ name: z.string().trim().min(2).max(80) });
export const forkSchema = z.object({ checkpointId: z.string().uuid() });
export const dialogueSchema = z.object({
  interactionId: z.string().min(3).max(120), actorId: z.string().min(2).max(120),
  message: z.string().trim().min(1).max(800),
});
