# V10.2 Cross-Domain Causal Stress

## Compatibility boundary

Cross-domain stress is enabled only for engine `10.2.x` and scenario versions
`3.2.x`. Earlier V10 registries remain immutable: `3.0.x` uses workforce V10,
and `3.1.x` uses the competitive business world. Existing runs are never
semantically migrated.

## Runtime model

V10.2 adds player-domain feature heads for customer revenue, commercial
obligations, delivery, credit covenants and commercial cases. Treasury is
upgraded to an invoice subledger and workforce exposes bounded, role-specific
delivery capacity. Features communicate through typed queries and immutable
events; no crisis chain is hard-coded.

At period close, V10.2 executes explicit phases after the legacy period hooks:

```text
operations → commercial → accounting → covenant → risk → stage evaluation
```

Invoices sample a deterministic settlement quantile when scheduled. The
quantile is evaluated against the account and macro state at settlement time,
which allows a later recession to delay collection without replay-time network
or random calls. Covenant tests use the reconciled treasury projection. Delivery
failures require a real commitment and capacity shortfall. Commercial cases
require an exposure created from a missed obligation.

## Causality and projection

Material V10.2 events and scheduled effects can carry parent event IDs, root
event IDs, exposure IDs and obligation IDs. Subscriber-emitted events inherit
the parent event automatically. The kernel rejects unknown parents and more than
eight direct parents, and keeps a bounded event-ID index in deterministic state.

Private payment thresholds, churn quantiles, lender flexibility and litigation
truth are excluded from public projections. The causal-chain API traverses only
public history. Full hidden truth remains reserved for an ended-run debrief.

## Public surfaces

- Treasury: cash forecast, AR aging, invoice collection, facilities and cure windows.
- Customers: account signals, payment records, contracts and cohorts.
- Delivery: commitments, backlog, service quality and commercial obligations.
- Risk room: commercial and employment cases with evidence and deadlines.

All mutations continue through `POST /api/v1/runs/:runId/commands`. Read-only
workspace endpoints are available under `treasury`, `customers`, `operations`,
`cases` and `causal-chain`.

## Verification

`causal-stress.test.ts` covers registry compatibility, golden replay, causal
parentage, macro/cash separation, funded-facility covenant breach, cure-window
creation, remediation counterfactuals and hidden-state projection isolation.

Run matched-policy calibration with:

```bash
npm run calibrate:v10:causal -- --profile=ai_workflow --runs=10000 --days=540
```
