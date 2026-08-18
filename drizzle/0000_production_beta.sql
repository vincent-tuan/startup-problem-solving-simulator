CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, contact_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sessions_token_hash_uidx ON sessions(token_hash);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE recovery_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lookup_id text NOT NULL, secret_hash text NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX recovery_lookup_uidx ON recovery_credentials(lookup_id);
CREATE INDEX recovery_user_idx ON recovery_credentials(user_id);
CREATE TABLE scenarios (
  id text PRIMARY KEY, slug text NOT NULL, title text NOT NULL, hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX scenarios_slug_uidx ON scenarios(slug);
CREATE TABLE scenario_versions (
  id text PRIMARY KEY, scenario_id text NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE, version text NOT NULL,
  status text NOT NULL, content_hash text NOT NULL, content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX scenario_version_uidx ON scenario_versions(scenario_id, version);
CREATE TABLE runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_version_id text NOT NULL REFERENCES scenario_versions(id), parent_run_id uuid, title text NOT NULL,
  status text NOT NULL DEFAULT 'active', seed integer NOT NULL, engine_version text NOT NULL,
  state_version integer NOT NULL DEFAULT 1, head_event_sequence integer NOT NULL DEFAULT 1,
  head_state jsonb NOT NULL, head_checksum text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), last_played_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE INDEX runs_owner_last_played_idx ON runs(owner_id, last_played_at);
CREATE INDEX runs_parent_idx ON runs(parent_run_id);
CREATE TABLE run_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  client_command_id text NOT NULL, expected_version integer NOT NULL, resulting_version integer NOT NULL,
  type text NOT NULL, payload jsonb NOT NULL, resulting_state jsonb NOT NULL, resulting_checksum text NOT NULL, resulting_event_sequence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX run_command_idempotency_uidx ON run_commands(run_id, client_command_id);
CREATE INDEX run_commands_replay_idx ON run_commands(run_id, resulting_event_sequence);
CREATE TABLE run_events (
  id text PRIMARY KEY, run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE, command_id text, sequence integer NOT NULL,
  type text NOT NULL, category text NOT NULL, actor text NOT NULL, simulation_day integer NOT NULL, summary text NOT NULL,
  effects jsonb NOT NULL, engine_version text NOT NULL, replayable boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX run_event_sequence_uidx ON run_events(run_id, sequence);
CREATE INDEX run_events_filter_idx ON run_events(run_id, category, sequence);
CREATE TABLE run_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  event_sequence integer NOT NULL, state_version integer NOT NULL, state jsonb NOT NULL, checksum text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX snapshot_sequence_uidx ON run_snapshots(run_id, event_sequence);
CREATE TABLE checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES run_snapshots(id) ON DELETE CASCADE, event_sequence integer NOT NULL,
  name text NOT NULL, automatic boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkpoints_run_idx ON checkpoints(run_id, event_sequence);
CREATE TABLE security_rate_limits (
  key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, window_started_at timestamptz NOT NULL DEFAULT now(), blocked_until timestamptz
);
