import { describe, expect, it } from "vitest";
import {
  createProductionFeatureConfigV10_2,
  createProductionFeatureRegistryV10,
  createProductionFeatureRegistryV10_1,
  createProductionFeatureRegistryV10_2,
} from "./feature-set";
import { applyCommandV10, createInitialStateV10 } from "./kernel";
import { generateAuthoredCompetitorPlanV10, pendingCompetitorDecisionEnvelopeV10 } from "./competitor-strategy";
import type { EngineCommandV10, PublicHistoryEventV10, SimulationStateV10 } from "./types";
import { V10_2_ENGINE_VERSION } from "./types";
import type { FinanceTreasuryPublicStateV10_2 } from "./finance-treasury-v10-2";
import type { CreditCovenantsPublicStateV10_2 } from "./credit-covenants";
import type { CommercialCasesPublicStateV10_2 } from "./commercial-cases";
import type { CommercialObligationsPublicStateV10_2 } from "./commercial-obligations";

const registry = createProductionFeatureRegistryV10_2();

function initial(seed = 1): SimulationStateV10 {
  return createInitialStateV10(
    { scenarioVersionId: "ai-workflow-automation@3.2.0", setup: { companyName: "Causal Systems", founderProfileId: "technical_builder" } },
    { now: "2026-08-20T00:00:00.000Z", seed, engineVersion: V10_2_ENGINE_VERSION, jurisdictionRuleVersionId: "us_like_v1@1.0.0" },
    registry,
    createProductionFeatureConfigV10_2({ jurisdiction: "us_like", openingCash: 500, profile: "ai_workflow" }),
  );
}

type Harness = { state: SimulationStateV10; events: PublicHistoryEventV10[]; serial: number };

function apply(harness: Harness, type: EngineCommandV10["type"], payload: unknown, actor: EngineCommandV10["actor"] = "player"): void {
  harness.serial += 1;
  const result = applyCommandV10(
    harness.state,
    { commandId: `92000000-0000-4000-8000-${String(harness.serial).padStart(12, "0")}`, expectedVersion: harness.state.kernel.version, type, payload, actor } as EngineCommandV10,
    { runId: "causal-stress-test", now: "2026-08-20T00:00:00.000Z" },
    registry,
  );
  harness.state = result.state;
  harness.events.push(...result.response.events);
}

function resolvePending(harness: Harness): boolean {
  const envelope = pendingCompetitorDecisionEnvelopeV10(harness.state);
  if (!envelope) return false;
  apply(harness, "system.competitor_plan_fallback", { externalInputId: `authored:${envelope.turnId}`, turnId: envelope.turnId, inputHash: envelope.worldInputHash, provider: "authored", plan: generateAuthoredCompetitorPlanV10(envelope) }, "system");
  return true;
}

function advanceTo(harness: Harness, targetDay: number): void {
  for (let step = 0; step < 1_000 && harness.state.kernel.simulationDay < targetDay; step += 1) {
    if (!resolvePending(harness)) apply(harness, "operations.advance_to_next_material_event", { horizonDays: 90 });
  }
  while (resolvePending(harness)) {
    // Resolve a board turn requested exactly on the target decision point.
  }
  if (harness.state.kernel.simulationDay < targetDay) throw new Error("TARGET_DAY_NOT_REACHED");
}

function run(seed: number, targetDay: number): Harness {
  const harness = { state: initial(seed), events: [], serial: 0 };
  advanceTo(harness, targetDay);
  return harness;
}

describe("V10.2 cross-domain causal stress", () => {
  it("keeps old registries frozen and pins the V10.2 feature set", () => {
    expect(createProductionFeatureRegistryV10().getFeature("finance-and-treasury").version).toBe("1.0.0");
    expect(createProductionFeatureRegistryV10_1().getFeature("finance-and-treasury").version).toBe("1.1.0");
    expect(registry.getFeature("finance-and-treasury").version).toBe("1.2.0");
    expect(registry.getFeature("workforce-and-organization").version).toBe("1.1.0");
    expect(registry.getFeature("customers-and-revenue").version).toBe("1.0.0");
    expect(registry.getFeature("credit-and-covenants").version).toBe("1.0.0");
  });

  it("replays the same command policy to the same checksum and causal graph", () => {
    const left = run(42, 90);
    const right = run(42, 90);
    expect(left.state.kernel.overallChecksum).toBe(right.state.kernel.overallChecksum);
    expect(left.events).toEqual(right.events);
    const exposure = left.events.find((event) => event.type === "commercial-obligations.exposure_created");
    expect(exposure).toBeDefined();
    const parentIds = exposure?.causality?.parentEventIds ?? [];
    expect(parentIds.length).toBeGreaterThan(0);
    expect(left.events.some((event) => parentIds.includes(event.id) && event.type === "delivery-and-service.sla_missed")).toBe(true);
  });

  it("does not change player cash when only macro observations and invoices are recorded", () => {
    const harness = run(73, 14);
    const finance = harness.state.features["finance-and-treasury"].public as FinanceTreasuryPublicStateV10_2;
    expect(harness.events.some((event) => event.type === "external-world.observation_published")).toBe(true);
    expect(finance.cash).toBe(500);
    expect(finance.accountsReceivable).toBeGreaterThan(0);
  });

  it("creates covenant breach and a player cure window only after a funded facility fails a real test", () => {
    const harness: Harness = { state: initial(1), events: [], serial: 0 };
    apply(harness, "credit.facility.negotiate", { lenderId: "lender-venture", facilityType: "working_capital", requestedAmount: 5_000, maturityDays: 360 });
    advanceTo(harness, 31);
    const credit = harness.state.features["credit-and-covenants"].public as CreditCovenantsPublicStateV10_2;
    const facility = credit.facilities[0];
    expect(facility.status).toBe("breached");
    expect(facility.outstandingPrincipal).toBe(5_000);
    expect(facility.cureDeadlineDay).not.toBeNull();
    expect(harness.events.some((event) => event.type === "credit-and-covenants.covenant_breached")).toBe(true);
    expect(harness.events.some((event) => event.type === "credit-and-covenants.lender_notice_received")).toBe(true);
  });

  it("allows remediation to interrupt exposure before a commercial notice", () => {
    const untreated = run(42, 45);
    const treated: Harness = { state: initial(42), events: [], serial: 0 };
    advanceTo(treated, 30);
    apply(treated, "customer.remediation.commit", { accountId: "account-design-1", action: "recovery_plan" });
    apply(treated, "customer.remediation.commit", { accountId: "account-design-2", action: "recovery_plan" });
    advanceTo(treated, 45);
    const untreatedCases = untreated.state.features["commercial-cases"].public as CommercialCasesPublicStateV10_2;
    const treatedCases = treated.state.features["commercial-cases"].public as CommercialCasesPublicStateV10_2;
    const treatedObligations = treated.state.features["commercial-obligations"].public as CommercialObligationsPublicStateV10_2;
    expect(untreatedCases.openCaseCount).toBeGreaterThan(0);
    expect(treatedCases.openCaseCount).toBe(0);
    expect(treatedObligations.exposures.every((exposure) => exposure.status === "cured")).toBe(true);
  });

  it("never projects payment, churn, lender or litigation hidden thresholds", () => {
    const state = initial(9);
    const serialized = JSON.stringify({
      customers: registry.project(state, "customers-and-revenue"),
      credit: registry.project(state, "credit-and-covenants"),
      cases: registry.project(state, "commercial-cases"),
    });
    for (const forbidden of ["liquidityResilience", "renewalQuantile", "lenderFlexibility", "claimQuantile", "defenseStrength", "settlementFloor"]) expect(serialized).not.toContain(forbidden);
  });
});
