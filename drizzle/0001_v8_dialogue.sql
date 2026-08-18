CREATE TABLE IF NOT EXISTS run_dialogue_turns (
  id text PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  interaction_id text NOT NULL,
  actor_id text NOT NULL,
  player_text text NOT NULL,
  response jsonb NOT NULL,
  provider text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS run_dialogue_turns_run_idx ON run_dialogue_turns(run_id, created_at);
