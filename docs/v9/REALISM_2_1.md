# Scenario 2.1 anti-exploit realism gate

Scenario version `2.1.0` is the first V9 content line that treats acquisition, receivables, debt and equity as contingent processes instead of direct resource grants. Existing `1.x` and `2.0.0` campaigns remain pinned to their original checksums and command semantics.

## Release invariants

A `2.1.0` campaign must satisfy all of the following:

1. `account.manage/source` never creates an account synchronously. It consumes a finite segment reach pool, company cash and founder capacity, then resolves through a delayed outreach effect.
2. Contacted accounts never exceed the scenario's `reachableAccounts`. Repeated outreach loses efficiency through saturation and reputation.
3. A debt request never creates cash. Underwriting determines eligibility, facility limit, APR, maturity, payment schedule, guarantee and covenants before any draw is possible.
4. Debt interest accrues at month close. Missed payments and covenant failures freeze the facility and can produce default and founder-guarantee exposure.
5. Starting or repeating a fundraise never creates cash. Diligence, stage capacity, cooldowns and offer expiry apply before the existing `$100k / 18%` term sheet can be accepted.
6. Issuing an invoice creates accounts receivable and deferred revenue, not guaranteed future cash. Collection can be full, partial, late, disputed or written off.
7. `finance.manage/collect_invoice` only prioritizes a collection attempt. It cannot directly post cash.
8. A bad-debt write-off clears receivables through a balanced journal entry and can churn the customer.
9. Debt service is included in runway and burn estimates for `2.1.0` runs.
10. Private payer risk and capital-market appetite never reach the client projection.

## Compatibility boundary

The feature IDs remain stable, but the new state machines initialize only for scenario `2.1.0`. Schema-3 runs on `2.0.0` continue through explicit compatibility handlers that preserve immediate sourcing, legacy collection and legacy capital behavior. Schema-2 and V7/V8 paths are unchanged.

## Verification

`anti-exploit.test.ts` covers:

- finite delayed sourcing and pending-campaign rejection;
- no cash from an unapproved debt request;
- delayed, non-repeatable active fundraising;
- contingent collections and no instant cash from collection work;
- aged receivable write-off and customer consequences;
- monthly interest plus covenant freeze;
- frozen `2.0.0` behavior.

This release removes the highest-impact resource-farming paths. It does not by itself certify the repository's full V10 `85/100` realism standard, which still requires trace review, calibration, expert sign-off and player validation across the other realism dimensions.
