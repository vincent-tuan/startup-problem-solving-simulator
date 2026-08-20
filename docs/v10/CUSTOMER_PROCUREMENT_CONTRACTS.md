# V10.3 Customer Procurement and Contract Lifecycle

## Compatibility boundary

Engine `10.3.x` and scenario `3.3.x` add customer organizations, commercial
opportunities, procurement cases and immutable agreement drafts. Earlier V10
registries remain version-pinned and are not semantically migrated.

## Runtime ownership

- `customer-organizations@1.0.0` owns organizations, named buying actors,
  decision authority, fiscal/budget signals and private organizational policy.
- `commercial-opportunities@1.0.0` owns discovery evidence, business cases,
  proposals, sales effort and pipeline state.
- `procurement-processes@1.0.0` owns the prerequisite graph, review queue,
  retries, waivers, deadlines and deterministic review outcomes.
- `contract-lifecycle@1.0.0` owns immutable draft versions, typed clauses,
  approval, authorized signature, implementation readiness and acceptance.

Agreement signature creates a delivery implementation commitment but does not
create a customer account, invoice, revenue or cash. Customer activation,
commercial obligations and billing begin only after deterministic acceptance.
Annual prepayment is invoiced separately from monthly revenue recognition.

## Public workflow

```text
independent discovery evidence
→ business case
→ commercial proposal
→ procurement dependency graph
→ immutable agreement drafts and counteroffers
→ authorized signature
→ implementation
→ acceptance
→ account activation, obligations and billing
```

The workspace exposes Deal Room, Procurement and Contracts views. It shows
known actors, documents, gates, deadlines, term versions and blockers, but not
willingness-to-pay, approval thresholds, gate quantiles or acceptance
probabilities. Mutations continue to use the canonical typed command endpoint.

## Verification boundary

`customer-procurement.test.ts` verifies evidence independence, procurement
prerequisites, signature authority, signature/revenue separation,
acceptance-gated activation, typed obligations, deterministic replay and
private-state projection isolation.

Scenario `3.3.0` remains draft until the automated and human gates in
[`SCENARIO_RELEASE_PROCESS.md`](./SCENARIO_RELEASE_PROCESS.md) pass. The catalog,
database seeder and guarded publish command enforce that boundary; changing a
status string alone is not a release path.
