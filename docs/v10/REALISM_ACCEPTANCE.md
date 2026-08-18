# V10 realism acceptance standard

## Purpose

“85%+ realism” is a release gate, not a marketing assertion. It means the simulator reaches at least 85/100 on the weighted model below, passes every hard invariant, and receives written sign-off from finance, legal, employment, security and founder-operator reviewers.

The score measures causal and operational fidelity within the declared simulation archetypes. It does not claim that the simulator predicts a specific real company or gives financial, legal, employment or investment advice.

## Weighted score

| Dimension | Weight | Evidence required |
|---|---:|---|
| Causal fidelity and delayed consequences | 18 | Every material outcome has exposure, signal, trigger, response window, immediate effect, delayed effect and resolution records. |
| Accounting, treasury and capital integrity | 14 | Double-entry, reconciliation, recognition, liquidity, financing and cap-table property tests; CPA review. |
| Customer, contract and revenue lifecycle | 11 | Account committees, procurement, delivery, invoicing, collection, renewal, expansion, churn and dispute paths. |
| Product, reliability, security and operations | 10 | Capability dependencies, technical debt, incidents, controls, vendors and operational queues. |
| Workforce and founder behavior | 10 | No instant capacity; noisy hiring evidence; onboarding, performance, burnout persistence, delegation and key-person risk. |
| Legal, regulatory, insurance and governance | 10 | No claim without exposure; deadline, document, reserve, insurance, board and control-state consistency. |
| External-world coherence | 12 | Correlated macro, credit, FX, labor, vendor, regulatory, platform, cyber, reputation and supply-chain variables. |
| Information asymmetry and provenance | 7 | Hidden truth is never projected; facts, estimates, assumptions and simulated actions have distinct provenance. |
| Actor behavior and bounded AI | 4 | Actors observe only allowed facts; actions satisfy capacity, incentive, cooldown and legality constraints; deterministic fallback. |
| Replay, calibration and anti-exploit quality | 4 | Golden replay, long-horizon soak, matched-seed policy comparison and adversarial exploit suites. |

Release score must be at least 85. A dimension scoring below 60% of its available points blocks public beta regardless of the aggregate score.

## Hard gates

The score cannot compensate for any of the following:

- Accounting equation or cash reconciliation violation.
- Cross-user or private-state leakage.
- Material event without a causal exposure.
- Replay checksum mismatch for a pinned scenario, command stream and external-input tape.
- AI or web outage blocking canonical gameplay.
- Real-world competitor claim without source metadata and a clickable citation.
- Simulated behavior represented as verified real behavior.
- Nonterminal state with no legal command, restructuring path or controlled shutdown.
- Infinite cash, evidence, financing, tax, contract, workforce or litigation exploit.
- Probability, hidden eligibility or engine recommendation exposed to the player.

## External-world coverage

The external-world feature owns latent conditions and exposes typed domain multipliers. It must not directly mutate finance, customers, product, workforce or legal state.

Minimum correlated factors:

1. Demand and segment willingness to spend.
2. Customer liquidity, collection delay and bad-debt pressure.
3. Churn and procurement delay.
4. Wage pressure and talent availability.
5. Interest rates, credit availability and covenant pressure.
6. FX volatility and multi-currency effects.
7. Cloud/vendor inflation, concentration and outage pressure.
8. Investor risk appetite and valuation multiples.
9. Regulatory enforcement and sector scrutiny.
10. Competitor distress and acquisition opportunities.
11. Platform/channel policy risk.
12. Cyber-threat intensity.
13. Reputation/media volatility.
14. Supply-chain and implementation delay.

Regime transitions must be persistent and correlated. A recession, for example, must alter demand, collections, churn, hiring, funding, valuation, procurement and competitor distress in a coherent direction while still creating plausible opportunities such as easier hiring, vendor leverage or distressed acquisition targets.

## Validation protocol

### Automated

- Deterministic seeded replay with external-input tape disabled during replay.
- 30-year no-content and full-content soak tests.
- Property tests for finance, cap table, contracts, deadlines, legal exposure and state bounds.
- Matched-seed comparisons across research-led, product-led, sales-led, service-led, capital-conservative, capital-aggressive and adversarial policies.
- Distribution drift snapshots for every versioned stochastic model.
- Hidden-state and anti-guidance projection tests.

### Expert review

Reviewers score sampled campaign traces, not isolated constants. Each review must cite the command/event evidence and produce an issue for disagreements. Reviewers do not edit calibration constants directly.

### Player validation

Expert alpha participants classify outcomes as plausible, implausible or indeterminate and identify missing causal links. A campaign is not considered validated merely because its ending distribution looks balanced.

## Versioning rule

Any change to transition matrices, distributions, legal rules, accounting policies, scenario physics, actor policies or projection semantics creates a new version. Existing campaigns remain pinned to the versions with which they started.
