ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "state_format" text NOT NULL DEFAULT 'legacy_json';
ALTER TABLE "runs" ALTER COLUMN "head_state" DROP NOT NULL;
ALTER TABLE "run_commands" ALTER COLUMN "resulting_state" DROP NOT NULL;
ALTER TABLE "run_commands" ADD COLUMN IF NOT EXISTS "response_payload" jsonb;

CREATE TABLE IF NOT EXISTS "run_kernel_heads" (
  "run_id" uuid PRIMARY KEY REFERENCES "runs"("id") ON DELETE CASCADE,
  "kernel" jsonb NOT NULL,
  "manifest" jsonb NOT NULL,
  "version" integer NOT NULL,
  "overall_checksum" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "run_feature_heads" (
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "feature_id" text NOT NULL,
  "feature_version" text NOT NULL,
  "public_state" jsonb NOT NULL,
  "private_state" jsonb NOT NULL,
  "checksum" text NOT NULL,
  "updated_at_version" integer NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("run_id", "feature_id")
);
CREATE INDEX IF NOT EXISTS "run_feature_heads_lock_idx" ON "run_feature_heads" ("run_id", "feature_id");

CREATE TABLE IF NOT EXISTS "run_v10_events" (
  "id" text PRIMARY KEY,
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "command_id" text,
  "feature_id" text NOT NULL,
  "type" text NOT NULL,
  "simulation_day" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "engine_version" text NOT NULL,
  "created_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "run_v10_event_sequence_uidx" ON "run_v10_events" ("run_id", "sequence");
CREATE INDEX IF NOT EXISTS "run_v10_events_filter_idx" ON "run_v10_events" ("run_id", "feature_id", "sequence");

CREATE TABLE IF NOT EXISTS "run_feature_blobs" (
  "checksum" text PRIMARY KEY,
  "feature_id" text NOT NULL,
  "feature_version" text NOT NULL,
  "public_state" jsonb NOT NULL,
  "private_state" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "run_v10_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "event_sequence" integer NOT NULL,
  "state_version" integer NOT NULL,
  "kernel" jsonb NOT NULL,
  "manifest" jsonb NOT NULL,
  "feature_heads" jsonb NOT NULL,
  "overall_checksum" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "run_v10_snapshot_sequence_uidx" ON "run_v10_snapshots" ("run_id", "event_sequence");
CREATE INDEX IF NOT EXISTS "run_v10_snapshots_run_idx" ON "run_v10_snapshots" ("run_id", "state_version");

CREATE TABLE IF NOT EXISTS "run_v10_checkpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "snapshot_id" uuid NOT NULL REFERENCES "run_v10_snapshots"("id") ON DELETE CASCADE,
  "event_sequence" integer NOT NULL,
  "name" text NOT NULL,
  "automatic" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "run_v10_checkpoints_run_idx" ON "run_v10_checkpoints" ("run_id", "event_sequence");
