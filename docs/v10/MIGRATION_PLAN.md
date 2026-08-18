# V9 to V10 migration plan

## Strategy

V10 is a parallel compatibility path. Do not semantically migrate existing v7, v8 or v9 runs. The current engine, scenario versions, snapshots and replay checksums remain frozen.

The first implementation slice adds:

- V10 kernel and namespaced feature-head state.
- Strict V10 run schema with one challenge profile and no difficulty/personal-runway fields.
- Feature dependency, command/effect ownership, query-cycle and projection-leak validation.
- Deterministic versioned RNG.
- Command-boundary clock, period-close boundary and bounded scheduler.
- Correlated external-world feature and typed domain multipliers.
- Per-feature and overall checksums.
- 30-year bounded-state test.

## Integration sequence

1. Route only scenario versions `3.x` to V10. Leave all previous routes untouched.
2. Add V10 persistence tables for kernel heads, feature heads and content-addressed snapshots.
3. Implement idempotency and sorted row locking in the store before exposing V10 commands publicly.
4. Build the accounting/treasury feature first; every other monetary effect must emit a typed economic transaction to it.
5. Add assumptions as a separate analytical workspace outside the simulation checksum.
6. Port customers, evidence and product as feature heads and connect them through typed queries and events.
7. Add workforce, founder, contracts/legal, insurance, vendors and incidents.
8. Add capital, governance, macro-sensitive competitors, M&A and public-company stages.
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
