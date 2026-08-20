import { describe, expect, it } from "vitest";
import { createProductionFeatureConfigV10_3, createProductionFeatureRegistryV10_2, createProductionFeatureRegistryV10_3 } from "./feature-set";
import { applyCommandV10, createInitialStateV10 } from "./kernel";
import { generateAuthoredCompetitorPlanV10, pendingCompetitorDecisionEnvelopeV10 } from "./competitor-strategy";
import type { CommercialOpportunitiesPublicStateV10_3 } from "./commercial-opportunities";
import type { ContractLifecyclePublicStateV10_3 } from "./contract-lifecycle";
import type { ProcurementProcessesPublicStateV10_3 } from "./procurement-processes";
import type { CustomersRevenuePublicStateV10_2 } from "./customers-revenue";
import type { FinanceTreasuryPublicStateV10_2 } from "./finance-treasury-v10-2";
import type { CommercialObligationsPublicStateV10_2 } from "./commercial-obligations";
import { V10_3_ENGINE_VERSION, type EngineCommandV10, type PublicHistoryEventV10, type SimulationStateV10 } from "./types";

const registry = createProductionFeatureRegistryV10_3();
type Harness = { state: SimulationStateV10; events: PublicHistoryEventV10[]; serial: number };

function initial(seed = 51): SimulationStateV10 {
  return createInitialStateV10(
    { scenarioVersionId: "ai-workflow-automation@3.3.0", setup: { companyName: "Procurement Systems", founderProfileId: "commercial_hunter" } },
    { now: "2026-08-20T00:00:00.000Z", seed, engineVersion: V10_3_ENGINE_VERSION, jurisdictionRuleVersionId: "us_like_v1@1.0.0" },
    registry,
    createProductionFeatureConfigV10_3({ jurisdiction: "us_like", openingCash: 500, profile: "ai_workflow" }),
  );
}

function apply(harness: Harness, type: EngineCommandV10["type"], payload: unknown, actor: EngineCommandV10["actor"] = "player"): void {
  harness.serial += 1;
  const result = applyCommandV10(harness.state, { commandId: `94000000-0000-4000-8000-${String(harness.serial).padStart(12, "0")}`, expectedVersion: harness.state.kernel.version, type, payload, actor } as EngineCommandV10, { runId: "customer-procurement-test", now: "2026-08-20T00:00:00.000Z" }, registry);
  harness.state = result.state; harness.events.push(...result.response.events);
}

function resolvePending(harness: Harness): boolean {
  const envelope = pendingCompetitorDecisionEnvelopeV10(harness.state); if (!envelope) return false;
  apply(harness, "system.competitor_plan_fallback", { externalInputId: `authored:${envelope.turnId}`, turnId: envelope.turnId, inputHash: envelope.worldInputHash, provider: "authored", plan: generateAuthoredCompetitorPlanV10(envelope) }, "system"); return true;
}

function advanceOnce(harness: Harness): void { if (!resolvePending(harness)) apply(harness, "operations.advance_to_next_material_event", { horizonDays: 90 }); }
function advanceTo(harness: Harness, day: number): void {
  for (let step = 0; step < 1_500 && harness.state.kernel.simulationDay < day; step += 1) advanceOnce(harness);
  while (resolvePending(harness)) { /* recorded fallback resolves all coalesced board turns */ }
  if (harness.state.kernel.simulationDay < day) throw new Error("TARGET_DAY_NOT_REACHED");
}

function prepareProposal(harness: Harness): void {
  apply(harness, "sales.discovery.record", { opportunityId: "opp-lattice", actorId: "actor-lattice-ops", method: "interview", problemSignal: "Manual exception handling consumes operations capacity." });
  advanceTo(harness, harness.state.kernel.simulationDay + 2);
  apply(harness, "sales.discovery.record", { opportunityId: "opp-lattice", actorId: "actor-lattice-security", method: "technical_workshop", problemSignal: "Access control evidence is required before production integration." });
  advanceTo(harness, harness.state.kernel.simulationDay + 4);
  const opportunities = harness.state.features["commercial-opportunities"].public as CommercialOpportunitiesPublicStateV10_3;
  const evidenceIds = opportunities.evidence.filter((item) => item.opportunityId === "opp-lattice").map((item) => item.id);
  apply(harness, "sales.business_case.prepare", { opportunityId: "opp-lattice", annualValue: 30_000, implementationDays: 30, evidenceIds });
  apply(harness, "sales.proposal.submit", { opportunityId: "opp-lattice", monthlyPrice: 1_250, implementationFee: 750, termMonths: 12, purchasePath: "annual_prepaid" });
}

function approveProcurement(harness: Harness): string {
  for (let step = 0; step < 300; step += 1) {
    const state = harness.state.features["procurement-processes"].public as ProcurementProcessesPublicStateV10_3; const procurementCase = state.cases[0];
    if (procurementCase.status === "approved") return procurementCase.id;
    const gate = state.gates.find((item) => item.caseId === procurementCase.id && ["open", "rejected"].includes(item.status));
    if (gate) apply(harness, "procurement.requirement.respond", { caseId: procurementCase.id, gateId: gate.id, action: gate.status === "rejected" ? "remediate" : "submit_evidence", evidenceIds: Array.from({ length: gate.requiredEvidenceCount }, (_, index) => `test-document-${gate.id}-${gate.attempts}-${index}`) });
    else advanceOnce(harness);
  }
  throw new Error("PROCUREMENT_DID_NOT_COMPLETE");
}

function negotiateAndSign(harness: Harness, caseId: string): string {
  apply(harness, "contract.draft.create", { procurementCaseId: caseId, billingModel: "annual_prepaid", monthlyPrice: 1_250, implementationFee: 750, termMonths: 12, paymentTermsDays: 60, serviceLevel: "standard" });
  for (let step = 0; step < 100; step += 1) {
    const state = harness.state.features["contract-lifecycle"].public as ContractLifecyclePublicStateV10_3; const agreement = state.agreements[0];
    if (agreement.status === "approved") { apply(harness, "contract.sign", { agreementId: agreement.id, signatoryActorId: "actor-lattice-cfo" }); return agreement.id; }
    if (agreement.status === "negotiating") {
      const current = state.drafts.find((item) => item.id === agreement.latestDraftId)!; const playerStandard = current.clauses.find((item) => item.position === "player_standard");
      if (agreement.knownBlocker && playerStandard) apply(harness, "contract.clause.propose", { agreementId: agreement.id, clause: playerStandard.kind, position: "customer_favorable" });
      else apply(harness, "contract.approval.request", { agreementId: agreement.id });
    } else advanceOnce(harness);
  }
  throw new Error("AGREEMENT_DID_NOT_REACH_SIGNATURE");
}

function activate(harness: Harness, agreementId: string): void {
  for (let step = 0; step < 200; step += 1) {
    const contracts = harness.state.features["contract-lifecycle"].public as ContractLifecyclePublicStateV10_3; const agreement = contracts.agreements.find((item) => item.id === agreementId)!;
    if (agreement.status === "active") return;
    if (["signed_pending_implementation", "acceptance_disputed"].includes(agreement.status) && (agreement.implementationReadyDay ?? Number.MAX_SAFE_INTEGER) <= harness.state.kernel.simulationDay && (agreement.lastAcceptanceRequestDay === null || harness.state.kernel.simulationDay - agreement.lastAcceptanceRequestDay >= 7)) apply(harness, "customer.acceptance.request", { agreementId });
    else advanceOnce(harness);
  }
  throw new Error("AGREEMENT_DID_NOT_ACTIVATE");
}

function fullRun(seed = 51): Harness {
  const harness = { state: initial(seed), events: [], serial: 0 }; prepareProposal(harness); const caseId = approveProcurement(harness); const agreementId = negotiateAndSign(harness, caseId); activate(harness, agreementId); advanceOnce(harness); return harness;
}

describe("V10.3 customer procurement and contract lifecycle", () => {
  it("pins V10.3 features without changing the V10.2 registry", () => {
    expect(createProductionFeatureRegistryV10_2().getFeature("customers-and-revenue").version).toBe("1.0.0");
    expect(registry.getFeature("customer-organizations").version).toBe("1.0.0");
    expect(registry.getFeature("procurement-processes").version).toBe("1.0.0");
    expect(registry.getFeature("contract-lifecycle").version).toBe("1.0.0");
    expect(registry.getFeature("customers-and-revenue").version).toBe("2.0.0");
  });

  it("requires independent discovery evidence and an approved procurement graph", () => {
    const harness = { state: initial(), events: [], serial: 0 };
    apply(harness, "sales.discovery.record", { opportunityId: "opp-lattice", actorId: "actor-lattice-ops", method: "interview", problemSignal: "A first observed workflow signal." }); advanceTo(harness, 2);
    const opportunities = harness.state.features["commercial-opportunities"].public as CommercialOpportunitiesPublicStateV10_3;
    expect(() => apply(harness, "sales.business_case.prepare", { opportunityId: "opp-lattice", annualValue: 20_000, implementationDays: 30, evidenceIds: opportunities.evidence.map((item) => item.id) })).toThrow("BUSINESS_CASE_EVIDENCE_TOO_CORRELATED");
    apply(harness, "sales.discovery.record", { opportunityId: "opp-lattice", actorId: "actor-lattice-security", method: "technical_workshop", problemSignal: "A second independently observed security constraint." }); advanceTo(harness, 6);
    const updated = harness.state.features["commercial-opportunities"].public as CommercialOpportunitiesPublicStateV10_3;
    expect(updated.opportunities[0].status).toBe("qualified");
  });

  it("does not create revenue or a customer account at proposal or signature", () => {
    const harness = { state: initial(71), events: [], serial: 0 }; prepareProposal(harness); const caseId = approveProcurement(harness); const agreementId = negotiateAndSign(harness, caseId);
    const customers = harness.state.features["customers-and-revenue"].public as CustomersRevenuePublicStateV10_2; const finance = harness.state.features["finance-and-treasury"].public as FinanceTreasuryPublicStateV10_2;
    expect(customers.accounts.some((item) => item.agreementId === agreementId)).toBe(false);
    expect(finance.invoices.some((item) => item.accountId === `account-${agreementId}`)).toBe(false);
    expect(() => apply(harness, "contract.sign", { agreementId, signatoryActorId: "actor-lattice-security" })).toThrow();
  });

  it("activates billing, delivery and typed obligations only after acceptance", () => {
    const harness = fullRun(51); const contracts = harness.state.features["contract-lifecycle"].public as ContractLifecyclePublicStateV10_3; const agreement = contracts.agreements[0];
    const customers = harness.state.features["customers-and-revenue"].public as CustomersRevenuePublicStateV10_2; const obligations = harness.state.features["commercial-obligations"].public as CommercialObligationsPublicStateV10_2;
    expect(agreement.status).toBe("active"); expect(customers.accounts.some((item) => item.agreementId === agreement.id)).toBe(true); expect(obligations.obligations.some((item) => item.accountId === agreement.accountId)).toBe(true);
    expect(harness.events.some((event) => event.type === "contract-lifecycle.agreement_activated")).toBe(true);
  });

  it("replays the same procurement policy to the same checksum without leaking thresholds", () => {
    const left = fullRun(88); const right = fullRun(88); expect(left.state.kernel.overallChecksum).toBe(right.state.kernel.overallChecksum); expect(left.events).toEqual(right.events);
    const serialized = JSON.stringify({ organizations: registry.project(left.state, "customer-organizations"), opportunities: registry.project(left.state, "commercial-opportunities"), procurement: registry.project(left.state, "procurement-processes"), contracts: registry.project(left.state, "contract-lifecycle") });
    for (const forbidden of ["willingnessToPay", "decisionQuantile", "budgetFlexibility", "approvalFriction", "gateTruth", "commercialThreshold", "acceptanceThreshold"]) expect(serialized).not.toContain(forbidden);
  });
});
