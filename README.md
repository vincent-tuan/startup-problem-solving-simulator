# FounderOS Startup Simulator

A production-oriented Next.js startup training simulator. New campaigns run on the deterministic v9 modular engine: hidden market truth, delayed consequences, account funnels, evidence provenance, capability dependencies, double-entry finance, stakeholder obligations, founder load, cited market intelligence, bounded competitor physics, and multiple endings.

The original [`Startup_Problem_Solving_Simulator_500_v6.html`](./Startup_Problem_Solving_Simulator_500_v6.html) remains unchanged as the legacy compatibility reference.

## Architecture

```text
Next.js App Router
  ├─ responsive dashboard, scenario catalog, seven-view workspace
  ├─ anonymous session + rotating one-time recovery credential
  └─ versioned command API
         │
         ▼
@sim/engine — deterministic kernel + versioned feature registry
         │                   │
         │                   ├─ public/private feature namespaces
         │                   ├─ competitor policy + bounded effects
         │                   └─ client projection (private state removed)
         │
         ▼
PostgreSQL — commands, events, snapshots, dossiers, external-input tape
         ▲
         │ trusted system commands only
Vercel Workflow — AI competitor turns + daily shared dossier ingestion
```

- Server state is authoritative. The browser sends typed commands with `commandId` and `expectedVersion`, never a replacement state blob.
- Accepted commands and resulting events commit in one transaction. Duplicate IDs return the stored result; stale versions return `409`.
- In-memory persistence is available only in development/test. Production fails fast without `DATABASE_URL`.
- Email is unverified contact metadata. It is neither unique nor usable for account lookup or recovery.
- Canonical state contains hidden segment truth. API and page boundaries call `projectState`; hidden values are revealed only by a completed-run debrief.
- AI calls never run inside the command transaction. A durable workflow receives an engine-built allowlist, validates structured output, and applies the result through a separate internal command union.
- AI and web outputs are persisted in `run_external_inputs`; replay uses that tape and never calls the network again.
- Stakeholder dialogue is non-authoritative. Competitor AI chooses only an allowed strategy; engine code owns cost, probability, delay and impact. Both have deterministic authored fallbacks.
- Verified facts, founder estimates and simulated competitor moves are distinct UI concepts. Every verified fact keeps a clickable public source and retrieval timestamp.

## Local development

Requirements: Node.js 22+, npm, and Google Chrome/Chromium for browser tests.

```bash
cp .env.example .env.local
npm install
npm run dev
```

With no `DATABASE_URL`, development automatically uses the ephemeral in-memory adapter. To exercise PostgreSQL, create a Neon database, set `DATABASE_URL`, and run:

```bash
npm run db:migrate
```

Generate independent high-entropy values for `SESSION_PEPPER` and `RECOVERY_PEPPER`; never reuse them. Changing either pepper invalidates the associated credentials.

AI is optional and independently configurable:

- `OPENAI_DIALOGUE_MODEL`: stakeholder dialogue.
- `OPENAI_AGENT_FAST_MODEL` / `OPENAI_AGENT_DEEP_MODEL` (or shared `OPENAI_AGENT_MODEL`): allowlisted competitor decisions; missing/failed calls use deterministic authored policy.
- `OPENAI_MARKET_MODEL`: daily Responses API web-search dossier ingestion.
- `CRON_SECRET`: protects the Vercel Cron endpoint.

Pin evaluated model snapshots in production. Without the corresponding model/key, gameplay and replay remain available; an unavailable dossier job leaves the previously published immutable dossier in place.

## Verification

```bash
npm run validate:scenarios
npm run lint
npm run typecheck
npm test
npm run test:legacy
npm run build
npm run test:e2e
```

The Vitest suite additionally covers hidden-state projection, feature dependency cycles, duplicate command ownership, citation integrity, competitor allowlists, external-input idempotency, scenario-specific economics, delayed account outcomes, AR/deferred-revenue treatment, AI fallback isolation, and completed-run debrief gating. The legacy Chrome suite preserves the seven v6 regression tests.

Run the deterministic v9 calibration harness against the archived dossier before changing published scenario physics:

```bash
# Fast local smoke
npm run --silent calibrate:v9 -- --runs=10

# Release calibration: 10,000 seeds for every scenario/difficulty/policy cell
npm run --silent calibrate:v9 -- --runs=10000 > calibration-v9.json
```

The report includes ending distributions, healthy-ending rates, campaign length, customer/MRR/evidence means, and dominant-policy warnings. Calibration output is evidence for tuning; it does not replace expert review or the public-beta thresholds.

Set `PLAYWRIGHT_CHROMIUM_PATH` if Chrome is not installed at `/usr/bin/google-chrome`. CI downloads Playwright Chromium automatically.

## Scenario publishing

Scenario versions live under `content/scenarios/<slug>/<version>.json` and are validated by the shared Zod schema. Published versions are immutable: make a new version file instead of editing content already used by a run. The database seeder is idempotent by `<scenario-id>@<version>` and content hash.

Beta catalog:

- AI Workflow Automation
- Local Services SaaS
- Healthcare Operations
- hidden `legacy-v6-free-setup` import container

## Legacy v6 import

The deployed app cannot access localStorage belonging to a `file://` page. Export JSON from the v6 HTML and upload it from the dashboard. Imports are capped at 2 MB, recursively checked for non-finite/oversized structures, sanitized, mapped into the current state schema, and stored with the complete source payload. Existing v6 decisions become non-replayable display events; new commands are replayable.

## Production deployment

1. Create a Neon PostgreSQL primary in Singapore and enable PITR/backups.
2. Configure `DATABASE_URL`, `SESSION_PEPPER`, `RECOVERY_PEPPER`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, and optional pinned OpenAI models in Vercel.
3. Run `npm run db:migrate` against the target database before promoting the application.
4. Deploy to Vercel; `vercel.json` pins server functions to `sin1` and schedules the shared dossier workflow daily at 02:00 UTC.
5. Verify the generated Workflow endpoints, `/api/health`, market refresh, competitor fallback, account recovery, a command retry, checkpoint fork, replay checksum, and a staging restore drill.

Structured command metrics are emitted as JSON logs (`command.accepted` / `command.rejected`) with run/command IDs, duration, and version but never email, raw session tokens, or recovery secrets. Recommended launch sequence: internal 20 runs, invite beta 100 users, then public beta after command success is at least 99.5% and SEA p95 command latency is below 800 ms.

## Version and simulation boundaries

New runs use v9 schema 3. Existing v8/schema-2 and frozen v7 campaigns remain on compatibility paths; v6 imports continue on v8 and are marked non-comparable. No semantic migration rewrites an existing campaign.

English-first, public single-player, no payments, no classroom organizations, no social login, no full offline gameplay, no multiplayer, and no custom AI-generated scenarios. Public company facts are informational simulation inputs, not investment/legal advice. A simulated competitor move is always labeled as simulated and must never be interpreted as a claim about the real company.
