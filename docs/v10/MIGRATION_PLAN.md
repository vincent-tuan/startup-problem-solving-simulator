# V9 to V10 migration plan

## Strategy

V10 is a parallel compatibility path. Do not semantically migrate existing v7, v8 or v9 runs. The current engine, scenario versions, snapshots and replay checksums remain frozen.

The current implementation adds:

- V10 kernel and namespaced feature-head state.
- Strict V10 run schema with one challenge profile and no difficulty/personal-runway fields.
- Feature dependency, command/effect ownership, query-cycle and projection-leak validation.
- Deterministic versioned RNG.
- Command-boundary clock, period-close boundary and bounded scheduler.
- Correlated external-world feature and typed domain multipliers.
- Versioned jurisdiction, founder/management, workforce, employment-case and finance/treasury features.
- Finite hiring, delayed onboarding, performance periods, manager actor policies, social memory, attrition and causal employment exposures.
- Atomic feature-head persistence, content-addressed snapshots, idempotent command responses and checkpoint forks.
- A public-only workforce projection, People workspace and bounded candidate/employee/manager dialogue envelope.
- Per-feature and overall checksums.
- 30-year bounded-state test.
- Engine `10.1.x` routing for immutable scenario `3.1.x` competitive-world runs.
- Four fictional competitor organizations with independent ledger, team pods, capability graph, pipeline, initiatives and lifecycle.
- Finite shared account, talent, channel, vendor and capital inventory with consideration sets and allocation conservation.
- Content-addressed external board-plan tape, idempotent agent turns and checkpoint-fork inheritance.
- Engine `10.2.x` routing for immutable scenario `3.2.x` cross-domain causal-stress runs.
- Causal event/effect context, ordered close phases, invoice subledger, customer settlement, delivery obligations, covenant cure windows and commercial-case lifecycle.
- Engine `10.3.x` routing for draft scenario `3.3.x` customer-procurement runs.
- Named buying committees, independent discovery evidence, procurement dependency graphs, immutable contract drafts, signatory authority and acceptance-gated billing.

## Integration sequence

1. Route only scenario versions `3.x` to V10. Leave all previous routes untouched.
2. Add V10 persistence tables for kernel heads, feature heads and content-addressed snapshots.
3. Implement idempotency and sorted row locking in the store before exposing V10 commands publicly.
4. Build the accounting/treasury feature first; every other monetary effect must emit a typed economic transaction to it. **Implemented for workforce transactions.**
5. Add assumptions as a separate analytical workspace outside the simulation checksum.
6. Port customers, evidence and product as feature heads and connect them through typed queries and events.
7. Add workforce and founder plus the employment-case legal lifecycle. **Implemented.** Contracts, insurance, vendors and incidents remain separate future features.
8. Add capital, governance, macro-sensitive competitors, M&A and public-company stages. **Independent competitor business physics, board planning and distress lifecycle implemented for V10.1; player-domain participation remains version-pinned to later feature ports.**
9. Replace full-state API responses with changed projections and cursor-based workspace reads.
10. Remove coaching fields from V10 catalog and projections while preserving accessibility and factual definitions.

## Persistence boundary

The pure engine does not own duplicate-command storage or row locks. The store must:

1. Lock the kernel head.
2. Check command ID and expected version.
3. Resolve affected feature IDs.
4. Lock feature heads in sorted ID order.
5. Materialize state and call the pure engine.
6. Append command, events and external-input references.
7. Persist changed feature blobs and checksums.
8. Update heads and commit.

A duplicate command returns the original stored response. A stale version returns HTTP 409 and the canonical version.

## Definition of done for the foundation slice

- Existing v7–v9 tests and checksums are unchanged.
- V10 create-run validation rejects `difficulty`, `personalRunway` and scenario-physics overrides.
- Same seed, commands and external tape produce the same checksum.
- No feature can mutate another feature head directly through the public contract.
- No private object reference or denied key reaches a projection.
- External-world changes are coherent, bounded, versioned and replayable.
- Thirty simulated years do not terminate because of a max-day rule or produce unbounded head growth.
