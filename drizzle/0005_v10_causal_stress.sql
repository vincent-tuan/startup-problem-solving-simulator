ALTER TABLE "run_v10_events"
  ADD COLUMN IF NOT EXISTS "causality" jsonb;

CREATE INDEX IF NOT EXISTS "run_v10_events_type_sequence_idx"
  ON "run_v10_events" ("run_id", "type", "sequence");
