CREATE TABLE IF NOT EXISTS "market_sources" (
  "id" text PRIMARY KEY, "scenario_id" text NOT NULL REFERENCES "scenarios"("id") ON DELETE CASCADE,
  "title" text NOT NULL, "publisher" text NOT NULL, "url" text NOT NULL,
  "retrieved_at" timestamptz NOT NULL, "primary_source" boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "market_sources_scenario_idx" ON "market_sources" ("scenario_id");

CREATE TABLE IF NOT EXISTS "competitor_profiles" (
  "id" text PRIMARY KEY, "scenario_id" text NOT NULL REFERENCES "scenarios"("id") ON DELETE CASCADE,
  "public_name" text NOT NULL, "website" text NOT NULL, "category" text NOT NULL,
  "content" jsonb NOT NULL, "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "competitor_profiles_scenario_idx" ON "competitor_profiles" ("scenario_id");

CREATE TABLE IF NOT EXISTS "market_dossier_versions" (
  "id" text PRIMARY KEY, "scenario_version_id" text NOT NULL REFERENCES "scenario_versions"("id") ON DELETE CASCADE,
  "captured_at" timestamptz NOT NULL, "content_hash" text NOT NULL, "content" jsonb NOT NULL, "published_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "market_dossier_hash_uidx" ON "market_dossier_versions" ("scenario_version_id", "content_hash");

CREATE TABLE IF NOT EXISTS "market_facts" (
  "id" text PRIMARY KEY, "dossier_id" text NOT NULL REFERENCES "market_dossier_versions"("id") ON DELETE CASCADE,
  "subject_id" text NOT NULL, "kind" text NOT NULL, "statement" text NOT NULL, "value" jsonb, "unit" text,
  "observed_at" timestamptz NOT NULL, "confidence" integer NOT NULL, "source_ids" jsonb NOT NULL, "status" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "market_facts_dossier_subject_idx" ON "market_facts" ("dossier_id", "subject_id");

CREATE TABLE IF NOT EXISTS "run_external_inputs" (
  "id" uuid PRIMARY KEY, "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL, "kind" text NOT NULL, "payload" jsonb NOT NULL, "input_hash" text NOT NULL,
  "provider" text NOT NULL, "model" text, "prompt_version" text, "effective_simulation_day" integer NOT NULL,
  "observed_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "run_external_input_sequence_uidx" ON "run_external_inputs" ("run_id", "sequence");
CREATE INDEX IF NOT EXISTS "run_external_inputs_run_idx" ON "run_external_inputs" ("run_id");

CREATE TABLE IF NOT EXISTS "run_agent_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "turn_id" text NOT NULL, "actor_id" text NOT NULL, "status" text NOT NULL, "envelope" jsonb NOT NULL,
  "decision" jsonb, "provider" text, "model" text, "prompt_version" text NOT NULL, "latency_ms" integer,
  "input_tokens" integer, "output_tokens" integer, "fallback_reason" text,
  "created_at" timestamptz NOT NULL, "completed_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "run_agent_turn_uidx" ON "run_agent_turns" ("run_id", "turn_id");
CREATE INDEX IF NOT EXISTS "run_agent_turn_status_idx" ON "run_agent_turns" ("run_id", "status");
