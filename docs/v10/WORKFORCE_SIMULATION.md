# V10 workforce simulation

## Scope and safety boundary

V10 models a startup workforce of 1–25 people. Candidates, employees and managers have server-only capability, fit, memory, relationships and conditional behavior. The browser receives observations and evidence ranges, never latent traits, resignation hazards, hidden case truth or legal outcome probabilities.

The jurisdiction feature is a versioned simulation archetype (`us-like`, `eu-like` or `sea-like`). It is not legal advice and must not be presented as a model of any specific country, person or employer. Protected characteristics are intentionally absent from actor generation and behavior.

AI is an optional dialogue renderer. It receives only a public actor packet, known facts, revealable clue IDs and allowed dialogue intents. Dialogue cannot mutate canonical state. Missing credentials, moderation failure, invalid output, refusal or timeout selects authored dialogue immediately.

## Feature graph

```text
external-world
       │ typed labor conditions
       ├──────────────┐
       ▼              ▼
jurisdiction-rules   founder-and-management
       │              │
       └──────┬───────┘
              ▼
   workforce-and-organization
          │             │
          │ exposure    │ economic transaction
          ▼             ▼
 employment-cases   finance-and-treasury
```

Each feature owns its public/private state and can only interact through registered queries, immutable domain events and typed economic transactions. Command handlers are allowlisted by their full discriminant; there is no generic state-path mutation.

## Implemented lifecycle

- Hiring: role opening, finite channel inventory, sourcing cost, correlated assessments, offer negotiation, delayed response, notice and onboarding.
- Employment: reporting graph, assignments, workload, contribution periods, payroll/tax-benefit postings, performance evidence and management capacity.
- Management: 1:1s, feedback, role/manager changes, delegated mandates and condition-driven distortion, escalation or favoritism pressure.
- Organization: directed trust/dependency graph, causal politics pressure, bounded resignation contagion and knowledge concentration.
- Exit: resignation response, delayed termination, jurisdiction notice, layoff consultation signal, severance and delayed payroll reduction.
- Cases: causal exposure, report, triage, evidence preservation, internal/independent investigation, finding, remediation, claim and resolution.

The finance feature recognizes and settles every workforce transaction once by transaction ID. Recruiting, equipment, payroll, employer costs, severance, reserves and settlements are separate economic transaction kinds.

## Persistence and replay

V10 runs use `state_format = feature_heads_v10`. The store locks the kernel, then affected feature heads in sorted feature-ID order. Accepted commands append events and atomically update checksums and heads. The canonical response is stored with the command so duplicate retries return the original result.

Snapshots store a kernel record plus content-addressed feature blobs. Checkpoint forks reconstruct that exact snapshot and then diverge with a new command stream. V7–V9 continue to use the frozen legacy state/replay path.

Apply the schema migration before using PostgreSQL:

```bash
npm run db:migrate
```

Without `DATABASE_URL`, local development uses the explicitly enabled ephemeral store. It is suitable for tests, not deployment.

Scenario `3.0.0` records are calibration drafts. Development can start them; a production runtime blocks draft creation unless `ALLOW_DRAFT_SCENARIOS=1` is explicitly set for a controlled preview. Do not set that flag for public traffic before the release gates below pass.

## Verification

```bash
npm run validate:scenarios
npm run lint
npm run typecheck
npm test
npm run test:legacy
npm run test:e2e
npm run build
npm run calibrate:v10:workforce -- --runs=10000
```

The workforce calibration command compares seven policies across all three scenario/jurisdiction combinations. It is a subsystem calibration and deliberately does not claim that a full campaign reached a healthy ending.

Public rollout is still blocked until full-campaign 10,000 matched-seed runs per scenario, sampled trace review and written finance, employment-law, People Ops and founder-operator sign-off are complete. Passing the automated suite makes this implementation testable; it does not substitute for those review gates.
