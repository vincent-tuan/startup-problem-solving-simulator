# V10.3 scenario graduation and immutable release process

## Release boundary

Scenario `3.3.0` is a controlled calibration candidate. A scenario remains
`draft` until automated calibration, realism scoring and independent expert
review all pass. Runtime code must never promote a scenario merely to make it
playable in production.

Each V10.3 scenario is a standalone artifact:

```text
content/scenarios/<scenario-id>/3.3.0.json
content/scenario-releases.json
reports/scenarios/<scenario-id>/3.3.0/
  calibration.json
  realism.json
  expert-signoff.json
```

`content/scenario-releases.json` pins the engine version and an immutable hash
that excludes only release status. Moving from `draft` to `published` therefore
does not change the business physics hash. Any other content change requires a
new scenario version.

## Local and CI checks

```bash
npm run validate:scenarios
npm run verify:scenario-releases
npm run calibrate:v10:procurement:smoke -- --profile=ai_workflow
npm run calibrate:v10:procurement:smoke -- --profile=local_services
npm run calibrate:v10:procurement:smoke -- --profile=healthcare
```

The smoke harness proves that each profile can traverse discovery, procurement,
agreement approval, authorized signature and acceptance deterministically. It
is not release evidence.

## Calibration evidence

Run the full harness separately for each scenario. The release verifier requires
at least 10,000 matched seeds for every recorded policy.

```bash
npm run calibrate:v10:procurement -- \
  --profile=ai_workflow \
  --runs=10000 \
  --days=540 \
  --output=reports/scenarios/ai-workflow-automation/3.3.0/calibration.json
```

Release calibration records terminal and healthy outcomes, commercial-path
completion, dead ends, invalid commands, replay mismatch and matched-seed
strategy dominance. The report cannot pass when fewer than three strategies are
viable, a strategy exceeds 60% of matched wins, any dead end exists, replay
diverges or the exploit suite fails.

The full 10,000-run policy matrix is intentionally a release/nightly workload,
not a pull-request job. Pull requests execute the bounded smoke harness.

## Realism evidence

Prepare a reviewer assessment containing all dimensions and hard gates from
`REALISM_ACCEPTANCE.md`, then generate the canonical score:

```bash
npm run score:v10:realism -- \
  --scenario=ai-workflow-automation \
  --version=3.3.0 \
  --assessment=review-inputs/ai-workflow-automation-3.3.0.json \
  --output=reports/scenarios/ai-workflow-automation/3.3.0/realism.json
```

The scorer blocks release below 85/100, when any dimension is below 60, or when
any hard gate fails. The assessment is evidence-backed human judgment; the
script does not invent scores.

## Expert sign-off

`expert-signoff.json` contains pseudonymous reviewer IDs, roles, signed trace
IDs, decisions and remaining blocker counts. Every scenario requires approved
reviews from:

- founder/operator;
- finance;
- B2B sales/procurement;
- commercial law.

Healthcare additionally requires a healthcare-operations reviewer. Every
reviewer must cite at least three complete causal traces and have zero open
blockers. Names, private contact details and unstructured legal case content do
not belong in the artifact.

## Promotion

Promotion requires a clean Git worktree and complete evidence already checked
into the release branch:

```bash
npm run scenario:publish -- \
  --scenario=ai-workflow-automation \
  --version=3.3.0 \
  --evidence=reports/scenarios/ai-workflow-automation/3.3.0
```

The command verifies evidence file SHA-256 hashes, report identity, content
hash, engine version, calibration gates, realism gates and required reviewer
roles. It then atomically prepares the scenario and manifest status changes.
It refuses a dirty worktree, missing report, hash mismatch or failed gate.

PostgreSQL seeding independently compares immutable content. It permits only
`draft → published`, `draft → deprecated` and `published → deprecated` status
transitions. A changed payload for an existing scenario version fails startup
instead of silently retaining old database content.

## Production behavior

Without `ALLOW_DRAFT_SCENARIOS=1`, the catalog serves the latest published
version for each scenario. Preview and development environments may expose the
latest draft. Production must never set the draft flag for public traffic.

Once published, behavioral changes create a new version. Existing runs remain
pinned to their original engine, feature manifest, scenario content and
external-input tape.
