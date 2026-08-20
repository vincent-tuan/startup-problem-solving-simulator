CREATE TABLE IF NOT EXISTS "external_input_blobs" (
  "content_hash" text PRIMARY KEY,
  "kind" text NOT NULL,
  "schema_version" text NOT NULL,
  "payload" jsonb NOT NULL,
  "input_hash" text NOT NULL,
  "provider" text NOT NULL,
  "model" text,
  "prompt_version" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "run_v10_external_input_refs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "event_sequence" integer NOT NULL,
  "effective_simulation_day" integer NOT NULL,
  "content_hash" text NOT NULL REFERENCES "external_input_blobs"("content_hash"),
  "inherited_from_run_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "run_v10_external_ref_sequence_uidx" ON "run_v10_external_input_refs" ("run_id", "event_sequence", "content_hash");
CREATE INDEX IF NOT EXISTS "run_v10_external_refs_run_idx" ON "run_v10_external_input_refs" ("run_id", "event_sequence");

CREATE TABLE IF NOT EXISTS "run_v10_agent_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "turn_id" text NOT NULL,
  "firm_id" text NOT NULL,
  "status" text NOT NULL,
  "envelope_schema_version" text NOT NULL,
  "envelope" jsonb NOT NULL,
  "plan" jsonb,
  "provider" text,
  "model" text,
  "prompt_version" text NOT NULL,
  "latency_ms" integer,
  "input_tokens" integer,
  "output_tokens" integer,
  "fallback_reason" text,
  "created_at" timestamptz NOT NULL,
  "completed_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "run_v10_agent_turn_uidx" ON "run_v10_agent_turns" ("run_id", "turn_id");
CREATE INDEX IF NOT EXISTS "run_v10_agent_turn_status_idx" ON "run_v10_agent_turns" ("run_id", "status");
