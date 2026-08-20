import {
  V10_2_ENGINE_VERSION,
  applyCommandV10,
  createInitialStateV10,
  createProductionFeatureConfigV10_2,
  createProductionFeatureRegistryV10_2,
  generateAuthoredCompetitorPlanV10,
  pendingCompetitorDecisionEnvelopeV10,
  type CommercialCasesPublicStateV10_2,
  type CreditCovenantsPublicStateV10_2,
  type CustomersRevenuePublicStateV10_2,
  type DeliveryServicePublicStateV10_2,
  type EngineCommandV10,
  type FinanceTreasuryPublicStateV10_2,
  type SimulationStateV10,
} from "../packages/sim-engine/src/v10/index";

type Policy = "naive" | "liquidity_first" | "retention_first" | "delivery_protection";
type Profile = "ai_workflow" | "local_services" | "healthcare";
const policies: Policy[] = ["naive", "liquidity_first", "retention_first", "delivery_protection"];
const registry = createProductionFeatureRegistryV10_2();

function argument(name: string, fallback: number): number {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
  return value ? Number(value) : fallback;
}

function profileArgument(): Profile {
  const value = process.argv.find((item) => item.startsWith("--profile="))?.split("=")[1];
  return value === "local_services" || value === "healthcare" ? value : "ai_workflow";
}

function scenario(profile: Profile): string {
  return profile === "local_services" ? "local-services-saas@3.2.0" : profile === "healthcare" ? "healthcare-operations@3.2.0" : "ai-workflow-automation@3.2.0";
}

function apply(state: SimulationStateV10, serial: number, type: EngineCommandV10["type"], payload: unknown, actor: EngineCommandV10["actor"] = "player"): SimulationStateV10 {
  return applyCommandV10(state, { commandId: `97000000-0000-4000-8000-${String(serial).padStart(12, "0")}`, expectedVersion: state.kernel.version, type, payload, actor } as EngineCommandV10, { runId: "calibration", now: "2026-08-20T00:00:00.000Z" }, registry).state;
}

function policyAction(state: SimulationStateV10, policy: Policy): { type: EngineCommandV10["type"]; payload: unknown } | null {
  const finance = state.features["finance-and-treasury"].public as FinanceTreasuryPublicStateV10_2;
  const customers = state.features["customers-and-revenue"].public as CustomersRevenuePublicStateV10_2;
  const delivery = state.features["delivery-and-service"].public as DeliveryServicePublicStateV10_2;
  if (policy === "liquidity_first") {
    const invoice = finance.invoices.find((item) => item.openBalance > 0 && ["overdue", "partial", "disputed"].includes(item.status));
    if (invoice) return { type: "treasury.collection.act", payload: { invoiceId: invoice.id, action: "request_payment_plan" } };
  }
  if (policy === "retention_first") {
    const account = customers.accounts.find((item) => item.status === "at_risk" || ["strained", "damaged"].includes(item.trustSignal));
    if (account) return { type: "customer.remediation.commit", payload: { accountId: account.id, action: "recovery_plan" } };
  }
  if (policy === "delivery_protection") {
    const commitment = delivery.commitments.find((item) => item.status === "at_risk" || item.backlogHours > 0) ?? delivery.commitments[0];
    if (commitment && finance.cash >= 900) return { type: "delivery.plan.reallocate", payload: { commitmentId: commitment.id, mode: "outsource", capacityHours: 20 } };
    if (commitment) return { type: "delivery.plan.reallocate", payload: { commitmentId: commitment.id, mode: "protect", capacityHours: 20 } };
  }
  return null;
}

function simulate(seed: number, profile: Profile, policy: Policy, targetDay: number) {
  let state = createInitialStateV10(
    { scenarioVersionId: scenario(profile), setup: { companyName: "Calibration Company", founderProfileId: "technical_builder" } },
    { now: "2026-08-20T00:00:00.000Z", seed, engineVersion: V10_2_ENGINE_VERSION, jurisdictionRuleVersionId: `${profile === "healthcare" ? "eu_like" : profile === "local_services" ? "sea_like" : "us_like"}_v1@1.0.0` },
    registry,
    createProductionFeatureConfigV10_2({ profile, openingCash: 500 }),
  );
  let serial = seed * 10_000;
  let actionFailures = 0;
  for (let step = 0; step < 2_500 && state.kernel.simulationDay < targetDay; step += 1) {
    const envelope = pendingCompetitorDecisionEnvelopeV10(state);
    if (envelope) {
      state = apply(state, ++serial, "system.competitor_plan_fallback", { externalInputId: `authored:${envelope.turnId}`, turnId: envelope.turnId, inputHash: envelope.worldInputHash, provider: "authored", plan: generateAuthoredCompetitorPlanV10(envelope) }, "system");
      continue;
    }
    const action = policyAction(state, policy);
    if (action) {
      try { state = apply(state, ++serial, action.type, action.payload); }
      catch { actionFailures += 1; }
    }
    state = apply(state, ++serial, "operations.advance_to_next_material_event", { horizonDays: 90 });
  }
  const finance = state.features["finance-and-treasury"].public as FinanceTreasuryPublicStateV10_2;
  const customers = state.features["customers-and-revenue"].public as CustomersRevenuePublicStateV10_2;
  const delivery = state.features["delivery-and-service"].public as DeliveryServicePublicStateV10_2;
  const credit = state.features["credit-and-covenants"].public as CreditCovenantsPublicStateV10_2;
  const cases = state.features["commercial-cases"].public as CommercialCasesPublicStateV10_2;
  return {
    healthy: finance.cash > 0 && customers.accounts.some((item) => item.status !== "churned") && credit.covenantSignal !== "defaulted",
    cash: finance.cash, liveAccounts: customers.accounts.filter((item) => item.status !== "churned").length,
    backlog: delivery.totalBacklogHours, openCases: cases.openCaseCount,
    covenantBreach: ["breached", "defaulted"].includes(credit.covenantSignal), actionFailures,
  };
}

const runs = Math.max(1, Math.floor(argument("runs", 100)));
const days = Math.max(30, Math.floor(argument("days", 540)));
const profile = profileArgument();
const report = policies.map((policy) => {
  const outcomes = Array.from({ length: runs }, (_, index) => simulate(index + 1, profile, policy, days));
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    policy,
    runs,
    healthyRate: outcomes.filter((item) => item.healthy).length / runs,
    covenantBreachRate: outcomes.filter((item) => item.covenantBreach).length / runs,
    averageCash: average(outcomes.map((item) => item.cash)),
    averageLiveAccounts: average(outcomes.map((item) => item.liveAccounts)),
    averageBacklog: average(outcomes.map((item) => item.backlog)),
    averageOpenCases: average(outcomes.map((item) => item.openCases)),
    actionFailures: outcomes.reduce((sum, item) => sum + item.actionFailures, 0),
  };
});

process.stdout.write(`${JSON.stringify({ engineVersion: V10_2_ENGINE_VERSION, scenario: scenario(profile), days, report }, null, 2)}\n`);
