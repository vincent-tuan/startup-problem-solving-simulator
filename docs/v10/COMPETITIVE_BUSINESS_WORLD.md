# V10.1 Competitive Business World

## Compatibility boundary

Competitive Business World is enabled only for engine `10.1.x` with scenario
versions `3.1.x`. V10 scenario `3.0.x` continues to use the workforce registry at
`10.0.x`; V7–V9 state, replay and snapshot paths are unchanged. A published run
is never semantically migrated between these registries.

## Runtime topology

The V10.1 registry adds four versioned feature heads:

- `market-intelligence@2.0.0` keeps cited verified facts separate from fictional
  twin templates.
- `competitive-market@1.0.0` owns finite accounts, talent, channel, vendor and
  capital capacity. It resolves typed bids and is the sole allocation authority.
- `competitor-organizations@1.0.0` operates four synthetic businesses with an
  independent double-entry ledger, team pods, executive actor, product graph,
  pipeline, customers, initiatives and lifecycle.
- `competitor-strategy@1.0.0` requests board cycles, validates portfolios against
  observed targets and reserved resources, and records immutable plan history.

It also pins `finance-and-treasury@1.1.0`, a generalized double-entry player
treasury contract for expenses, invoices, collections, deferred revenue, debt and
equity. Scenario `3.0.x` remains pinned to the original workforce treasury
`1.0.0`, so the compatibility checksum path is unchanged.

Feature heads communicate with typed queries and domain events. No feature can
receive a mutable reference to another feature's state. Public projection schemas
exclude treasury, exact revenue/burn, pipeline, resource reservations, executive
traits, strategic memory, decision envelopes and world input hashes.

## Operating clock

Competitor operations accrue collections, burn and initiative work whenever the
world clock advances. Firms submit bids weekly; shared resources clear weekly;
accounts are never allocated twice. Renewable non-account capacity re-enters the
market after its lease. New account opportunities are created under a hard
120-opportunity cap.

At period close, observations update only as estimate bands and qualitative
signals. Distress, insolvency and platform-unit deprioritization follow treasury
and payable conditions. Initiative stop conditions release unused reservations
and can trigger an early board review. Material shocks are coalesced by a 21-day
cooldown; normal board cycles occur after 60–90 simulation days.

## Board-plan authority boundary

The engine creates a strict `CompetitorDecisionEnvelopeV10` containing only the
fictional firm's synthetic internal decision view, observed signals, feasible
targets and resource ceilings. It never sends player hidden state or untrusted web
content as instructions.

The OpenAI Responses adapter requests a strict JSON Schema portfolio with one to
four initiatives. The engine then applies its own Zod and feasibility validation.
Schema error, refusal, timeout, forbidden target or unavailable configuration
uses the deterministic authored portfolio policy. A plan is rejected as a whole
when it overspends, overbooks capacity or attention, introduces a dependency cycle
or references an unavailable target.

Model or web access never occurs in a simulation transaction. A command commits
the pending turn first; a durable workflow generates the plan; an internal typed
system command applies it. Replay and fork consume the recorded plan and never
call the network.

## Persistence

Migration `0004_v10_competitive_world.sql` adds:

- `external_input_blobs`, content-addressed by the normalized plan and metadata;
- `run_v10_external_input_refs`, ordered at the effective event sequence;
- `run_v10_agent_turns`, uniquely keyed by run and turn.

Records store the envelope version, public plan, provider, pinned model metadata,
latency, token usage and fallback reason. They never store chain-of-thought. Forks
reuse immutable blobs up to the checkpoint and mark the source run on inherited
references.

## Public surfaces

The Intelligence Center exposes competitive positioning, estimate ranges,
qualitative commercial and implementation signals, shared-resource availability,
contested opportunities, observed plans and a provenance-tagged signal tape.
Verified facts retain publisher, URL and retrieval timestamp. Every synthetic
firm and simulated move carries a disclaimer and is never presented as real-world
company behavior.

Read APIs:

- `GET /api/v1/runs/:runId/competitors?view=map|firms|signals|moves`
- `GET /api/v1/runs/:runId/agent-turns/:turnId`
- `GET /api/v1/runs/:runId/external-inputs`

The client cannot submit competitor system commands.

## Verification and calibration

`competitive-world.test.ts` covers four-firm initialization, projection isolation,
portfolio overspend rejection, 180-day no-player operation, deterministic replay,
ledger balance and capacity bounds. Store tests cover idempotent resolution,
external-tape persistence and fork inheritance.

Run the bounded calibration harness with:

```bash
npm run calibrate:v10:competitors -- --runs=10000 --days=540
```

The report separates per-run leaders from allocation share by doctrine so resource
competition is not confused with starting installed base. Short smoke calibration
is available by reducing both flags; release calibration must retain 10,000 runs
per scenario and the full 540-day horizon.
