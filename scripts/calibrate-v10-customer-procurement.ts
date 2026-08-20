import { writeFile } from "node:fs/promises";
import {
  V10_3_ENGINE_VERSION,
  applyCommandV10,
  createInitialStateV10,
  createProductionFeatureConfigV10_3,
  createProductionFeatureRegistryV10_3,
  generateAuthoredCompetitorPlanV10,
  pendingCompetitorDecisionEnvelopeV10,
  type CommercialOpportunitiesPublicStateV10_3,
  type ContractLifecyclePublicStateV10_3,
  type CreditCovenantsPublicStateV10_2,
  type EngineCommandV10,
  type FinanceTreasuryPublicStateV10_2,
  type ProcurementProcessesPublicStateV10_3,
  type SimulationStateV10,
} from "@sim/engine";
import { getScenario, scenarioVersionId } from "../src/content/scenarios";
import { scenarioReleaseContentHash } from "../src/content/scenario-releases";
import {
  calibrationPolicySchema,
  parseArgument,
  scenarioCalibrationReportSchema,
  type ScenarioCalibrationReport,
} from "./scenario-release-lib";

type Policy = typeof calibrationPolicySchema._output;
type Profile = "ai_workflow" | "local_services" | "healthcare";
type RunResult = {
  checksum: string;
  terminal: boolean;
  healthy: boolean;
  successfulCommercialPath: boolean;
  deadEnd: boolean;
  invalidCommands: number;
  commandAttempts: number;
  decisionPoints: number;
  simulationDay: number;
  score: number;
};

const policies = calibrationPolicySchema.options;
const registry = createProductionFeatureRegistryV10_3();

const profiles: Record<Profile, {
  scenarioId: string;
  jurisdiction: "us_like" | "eu_like" | "sea_like";
  opportunityId: string;
  discoveryActors: [string, string];
  signatoryActorId: string;
  annualValue: number;
  monthlyPrice: number;
  implementationFee: number;
  implementationDays: number;
  purchasePath: "paid_pilot" | "subscription" | "annual_prepaid";
  billingModel: "monthly_advance" | "milestone" | "annual_prepaid";
  paymentTermsDays: 30 | 60 | 90;
  serviceLevel: "best_effort" | "standard" | "critical";
}> = {
  ai_workflow: {
    scenarioId: "ai-workflow-automation", jurisdiction: "us_like", opportunityId: "opp-lattice",
    discoveryActors: ["actor-lattice-ops", "actor-lattice-security"], signatoryActorId: "actor-lattice-cfo",
    annualValue: 30_000, monthlyPrice: 1_250, implementationFee: 750, implementationDays: 30,
    purchasePath: "annual_prepaid", billingModel: "annual_prepaid", paymentTermsDays: 60, serviceLevel: "standard",
  },
  local_services: {
    scenarioId: "local-services-saas", jurisdiction: "sea_like", opportunityId: "opp-riverbend",
    discoveryActors: ["actor-riverbend-ops", "actor-riverbend-owner"], signatoryActorId: "actor-riverbend-owner",
    annualValue: 8_400, monthlyPrice: 350, implementationFee: 180, implementationDays: 14,
    purchasePath: "subscription", billingModel: "monthly_advance", paymentTermsDays: 30, serviceLevel: "best_effort",
  },
  healthcare: {
    scenarioId: "healthcare-operations", jurisdiction: "eu_like", opportunityId: "opp-northstar",
    discoveryActors: ["actor-northstar-ops", "actor-northstar-privacy"], signatoryActorId: "actor-northstar-cfo",
    annualValue: 60_000, monthlyPrice: 2_500, implementationFee: 3_000, implementationDays: 60,
    purchasePath: "paid_pilot", billingModel: "milestone", paymentTermsDays: 90, serviceLevel: "critical",
  },
};

function numericArgument(name: string, fallback: number): number {
  const parsed = Number(parseArgument(name) ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`INVALID_ARGUMENT:${name}`);
  return Math.floor(parsed);
}

function profileArgument(): Profile {
  const value = parseArgument("profile") ?? "ai_workflow";
  if (!(value in profiles)) throw new Error(`INVALID_PROFILE:${value}`);
  return value as Profile;
}

function initial(profile: Profile, seed: number): SimulationStateV10 {
  const config = profiles[profile];
  return createInitialStateV10(
    {
      scenarioVersionId: `${config.scenarioId}@3.3.0`,
      setup: { companyName: "Procurement Calibration Company", founderProfileId: "commercial_hunter" },
    },
    {
      now: "2026-08-20T00:00:00.000Z", seed, engineVersion: V10_3_ENGINE_VERSION,
      jurisdictionRuleVersionId: `${config.jurisdiction}_v1@1.0.0`,
    },
    registry,
    createProductionFeatureConfigV10_3({ jurisdiction: config.jurisdiction, openingCash: 500, profile }),
  );
}

function simulate(profile: Profile, policy: Policy, seed: number, horizonDays: number, stopAfterCommercial = false): RunResult {
  const config = profiles[profile];
  let state = initial(profile, seed);
  let serial = 0;
  let invalidCommands = 0;
  let commandAttempts = 0;
  let deadEnd = false;

  const apply = (type: EngineCommandV10["type"], payload: unknown, actor: EngineCommandV10["actor"] = "player"): boolean => {
    commandAttempts += 1;
    serial += 1;
    try {
      state = applyCommandV10(
        state,
        {
          commandId: `96000000-0000-4000-8000-${String(seed * 10_000 + serial).slice(-12).padStart(12, "0")}`,
          expectedVersion: state.kernel.version, type, payload, actor,
        } as EngineCommandV10,
        { runId: `v10-3-calibration-${profile}-${policy}-${seed}`, now: "2026-08-20T00:00:00.000Z" },
        registry,
      ).state;
      return true;
    } catch {
      invalidCommands += 1;
      return false;
    }
  };

  const resolveOrAdvance = (): void => {
    const envelope = pendingCompetitorDecisionEnvelopeV10(state);
    if (envelope) {
      apply("system.competitor_plan_fallback", {
        externalInputId: `calibration:${envelope.turnId}`, turnId: envelope.turnId,
        inputHash: envelope.worldInputHash, provider: "authored", plan: generateAuthoredCompetitorPlanV10(envelope),
      }, "system");
    } else apply("operations.advance_to_next_material_event", { horizonDays: 90 });
  };

  const advanceUntil = (predicate: () => boolean, maximumSteps = 600): boolean => {
    for (let step = 0; step < maximumSteps && state.kernel.status === "active"; step += 1) {
      if (predicate()) return true;
      resolveOrAdvance();
    }
    return predicate();
  };

  const discoveryMethod = policy === "security_first" ? "technical_workshop" : policy === "structured_discovery" ? "workflow_observation" : "interview";
  apply("sales.discovery.record", {
    opportunityId: config.opportunityId, actorId: config.discoveryActors[0], method: discoveryMethod,
    problemSignal: "Observed workflow cost and decision pressure.",
  });
  advanceUntil(() => {
    const opportunities = state.features["commercial-opportunities"].public as CommercialOpportunitiesPublicStateV10_3;
    return opportunities.opportunities.find((item) => item.id === config.opportunityId)?.pendingActivityDay === null;
  });
  const secondActor = policy === "naive_growth" ? config.discoveryActors[0] : config.discoveryActors[1];
  apply("sales.discovery.record", {
    opportunityId: config.opportunityId, actorId: secondActor,
    method: policy === "security_first" ? "technical_workshop" : "interview",
    problemSignal: "Independent authority, budget, or risk signal.",
  });
  advanceUntil(() => {
    const opportunities = state.features["commercial-opportunities"].public as CommercialOpportunitiesPublicStateV10_3;
    return opportunities.opportunities.find((item) => item.id === config.opportunityId)?.pendingActivityDay === null;
  });

  const opportunities = state.features["commercial-opportunities"].public as CommercialOpportunitiesPublicStateV10_3;
  const evidenceIds = opportunities.evidence.filter((item) => item.opportunityId === config.opportunityId).map((item) => item.id);
  const valueMultiplier = policy === "price_concession" ? 0.72 : policy === "capital_aggressive" ? 1.2 : 1;
  const casePrepared = apply("sales.business_case.prepare", {
    opportunityId: config.opportunityId,
    annualValue: config.annualValue,
    implementationDays: policy === "delivery_protection" ? Math.ceil(config.implementationDays * 1.35) : config.implementationDays,
    evidenceIds,
  });
  if (casePrepared) apply("sales.proposal.submit", {
    opportunityId: config.opportunityId,
    monthlyPrice: Math.round(config.monthlyPrice * valueMultiplier), implementationFee: config.implementationFee,
    termMonths: policy === "paid_pilot_first" ? 3 : 12,
    purchasePath: policy === "paid_pilot_first" ? "paid_pilot" : config.purchasePath,
  });

  let procurement = state.features["procurement-processes"].public as ProcurementProcessesPublicStateV10_3;
  if (procurement.cases.length) {
    advanceUntil(() => {
      procurement = state.features["procurement-processes"].public as ProcurementProcessesPublicStateV10_3;
      const procurementCase = procurement.cases[0];
      if (!procurementCase || ["approved", "expired", "withdrawn"].includes(procurementCase.status)) return true;
      const gate = procurement.gates.find((item) => item.caseId === procurementCase.id && ["open", "rejected"].includes(item.status));
      if (gate) {
        const action = gate.status === "rejected"
          ? policy === "liquidity_first" && gate.materiality !== "critical" ? "request_waiver" : "remediate"
          : policy === "procurement_first" ? "escalate" : "submit_evidence";
        apply("procurement.requirement.respond", {
          caseId: procurementCase.id, gateId: gate.id, action,
          evidenceIds: Array.from({ length: gate.requiredEvidenceCount }, (_, index) => `calibration:${gate.id}:${gate.attempts}:${index}`),
        });
      } else resolveOrAdvance();
      return false;
    }, 1_200);
  }

  procurement = state.features["procurement-processes"].public as ProcurementProcessesPublicStateV10_3;
  const procurementCase = procurement.cases[0];
  if (procurementCase?.status === "approved") {
    apply("contract.draft.create", {
      procurementCaseId: procurementCase.id,
      billingModel: policy === "paid_pilot_first" ? "milestone" : config.billingModel,
      monthlyPrice: Math.round(config.monthlyPrice * valueMultiplier), implementationFee: config.implementationFee,
      termMonths: policy === "paid_pilot_first" ? 3 : 12, paymentTermsDays: config.paymentTermsDays,
      serviceLevel: policy === "delivery_protection" ? "best_effort" : config.serviceLevel,
    });
    advanceUntil(() => {
      const contracts = state.features["contract-lifecycle"].public as ContractLifecyclePublicStateV10_3;
      const agreement = contracts.agreements[0];
      if (!agreement || ["active", "abandoned", "expired", "terminated"].includes(agreement.status)) return true;
      if (agreement.status === "approved") {
        apply("contract.sign", { agreementId: agreement.id, signatoryActorId: config.signatoryActorId });
      } else if (agreement.status === "negotiating") {
        const current = contracts.drafts.find((item) => item.id === agreement.latestDraftId);
        const playerStandard = current?.clauses.find((clause) => clause.position === "player_standard");
        if (agreement.knownBlocker && playerStandard) {
          apply("contract.clause.propose", {
            agreementId: agreement.id, clause: playerStandard.kind,
            position: policy === "delivery_protection" ? "balanced" : "customer_favorable",
          });
        } else apply("contract.approval.request", { agreementId: agreement.id });
      } else if (["signed_pending_implementation", "acceptance_disputed"].includes(agreement.status)) {
        if ((agreement.implementationReadyDay ?? Number.MAX_SAFE_INTEGER) <= state.kernel.simulationDay &&
            (agreement.lastAcceptanceRequestDay === null || state.kernel.simulationDay - agreement.lastAcceptanceRequestDay >= 7))
          apply("customer.acceptance.request", { agreementId: agreement.id });
        else resolveOrAdvance();
      } else resolveOrAdvance();
      return false;
    }, 1_200);
  }

  if (!stopAfterCommercial) {
    for (let step = 0; step < 2_500 && state.kernel.status === "active" && state.kernel.simulationDay < horizonDays; step += 1)
      resolveOrAdvance();
    if (state.kernel.status === "active" && state.kernel.simulationDay < horizonDays) deadEnd = true;
  }

  const contracts = state.features["contract-lifecycle"].public as ContractLifecyclePublicStateV10_3;
  const finance = state.features["finance-and-treasury"].public as FinanceTreasuryPublicStateV10_2;
  const credit = state.features["credit-and-covenants"].public as CreditCovenantsPublicStateV10_2;
  const successfulCommercialPath = contracts.agreements.some((item) => item.status === "active");
  const terminal = state.kernel.status !== "active" || state.kernel.simulationDay >= horizonDays;
  const healthy = terminal && finance.cash > 0 && successfulCommercialPath && credit.covenantSignal !== "defaulted";
  const score = (healthy ? 10 : 0) + (successfulCommercialPath ? 4 : 0) + Math.max(-3, Math.min(3, finance.cash / 5_000)) - invalidCommands * 0.1;
  return {
    checksum: state.kernel.overallChecksum, terminal, healthy, successfulCommercialPath, deadEnd,
    invalidCommands, commandAttempts, decisionPoints: state.kernel.commandSequence,
    simulationDay: state.kernel.simulationDay, score,
  };
}

function exploitSuite(profile: Profile): boolean {
  let state = initial(profile, 991_337);
  const failures: boolean[] = [];
  const expectRejected = (type: EngineCommandV10["type"], payload: unknown): void => {
    try {
      state = applyCommandV10(state, {
        commandId: `99000000-0000-4000-8000-${String(failures.length + 1).padStart(12, "0")}`,
        expectedVersion: state.kernel.version, type, payload, actor: "player",
      } as EngineCommandV10, { runId: "v10-3-exploit-suite", now: "2026-08-20T00:00:00.000Z" }, registry).state;
      failures.push(false);
    } catch { failures.push(true); }
  };
  expectRejected("sales.business_case.prepare", { opportunityId: profiles[profile].opportunityId, annualValue: 10_000, implementationDays: 10, evidenceIds: [] });
  expectRejected("contract.draft.create", { procurementCaseId: "missing", billingModel: "annual_prepaid", monthlyPrice: 500, implementationFee: 0, termMonths: 12, paymentTermsDays: 30, serviceLevel: "standard" });
  expectRejected("contract.sign", { agreementId: "missing", signatoryActorId: profiles[profile].signatoryActorId });
  return failures.every(Boolean);
}

const smoke = process.argv.includes("--smoke");
const runsPerPolicy = numericArgument("runs", smoke ? 1 : 10_000);
const horizonDays = Math.max(540, numericArgument("days", 540));
const profile = profileArgument();
const scenario = getScenario(profiles[profile].scenarioId, "3.3.0");
if (!scenario) throw new Error("SCENARIO_NOT_FOUND");
const outcomes = new Map<Policy, RunResult[]>();
const activePolicies: Policy[] = smoke ? ["structured_discovery"] : policies;
for (const policy of activePolicies) {
  outcomes.set(policy, Array.from({ length: runsPerPolicy }, (_, index) => simulate(profile, policy, index + 1, horizonDays, smoke)));
}

if (smoke) {
  const first = outcomes.get("structured_discovery")![0];
  const replay = simulate(profile, "structured_discovery", 1, horizonDays, true);
  process.stdout.write(`${JSON.stringify({
    mode: "smoke", scenarioVersionId: scenarioVersionId(scenario), profile,
    successfulCommercialPath: first.successfulCommercialPath,
    deterministicReplay: first.checksum === replay.checksum,
    exploitSuitePassed: exploitSuite(profile),
    simulationDay: first.simulationDay,
    invalidCommands: first.invalidCommands,
  }, null, 2)}\n`);
  process.exit(0);
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const policyReports = policies.map((policy) => {
  const values = outcomes.get(policy)!;
  return {
    policy, runs: values.length,
    terminalRate: values.filter((item) => item.terminal).length / values.length,
    healthyEndingRate: values.filter((item) => item.healthy).length / values.length,
    successfulCommercialPathRate: values.filter((item) => item.successfulCommercialPath).length / values.length,
    deadEndRate: values.filter((item) => item.deadEnd).length / values.length,
    invalidCommandRate: values.reduce((sum, item) => sum + item.invalidCommands, 0) / Math.max(1, values.reduce((sum, item) => sum + item.commandAttempts, 0)),
    averageDecisionPoints: average(values.map((item) => item.decisionPoints)),
    averageSimulationDay: average(values.map((item) => item.simulationDay)),
    replayMismatchCount: 0,
  };
});

let replayMismatchCount = 0;
for (const policy of policies) {
  const values = outcomes.get(policy)!;
  let policyReplayMismatchCount = 0;
  for (let index = 0; index < Math.min(1, runsPerPolicy); index += 1) {
    if (simulate(profile, policy, index + 1, horizonDays).checksum !== values[index].checksum) {
      replayMismatchCount += 1;
      policyReplayMismatchCount += 1;
    }
  }
  policyReports.find((report) => report.policy === policy)!.replayMismatchCount = policyReplayMismatchCount;
}
const matchedWins = new Map<Policy, number>(policies.map((policy) => [policy, 0]));
for (let index = 0; index < runsPerPolicy; index += 1) {
  const best = Math.max(...policies.map((policy) => outcomes.get(policy)![index].score));
  const winners = policies.filter((policy) => outcomes.get(policy)![index].score === best);
  for (const winner of winners) matchedWins.set(winner, matchedWins.get(winner)! + 1 / winners.length);
}
const dominantStrategyShare = Math.max(...matchedWins.values()) / runsPerPolicy;
const viableStrategies = policyReports.filter((report) => report.healthyEndingRate >= 0.15 && report.successfulCommercialPathRate >= 0.15).length;
const gates = {
  minimumRunsPerPolicy: runsPerPolicy >= 10_000,
  atLeastThreeViableStrategies: viableStrategies >= 3,
  noDominantStrategy: dominantStrategyShare <= 0.6,
  dominantStrategyShare,
  zeroDeadEnds: policyReports.every((report) => report.deadEndRate === 0),
  deterministicReplay: replayMismatchCount === 0,
  exploitSuitePassed: exploitSuite(profile),
  passed: false,
};
gates.passed = gates.minimumRunsPerPolicy && gates.atLeastThreeViableStrategies && gates.noDominantStrategy && gates.zeroDeadEnds && gates.deterministicReplay && gates.exploitSuitePassed;

const report: ScenarioCalibrationReport = scenarioCalibrationReportSchema.parse({
  schemaVersion: 1, scenarioVersionId: scenarioVersionId(scenario), engineVersion: V10_3_ENGINE_VERSION,
  contentHash: scenarioReleaseContentHash(scenario), generatedAt: new Date().toISOString(),
  horizonDays, runsPerPolicy, policies: policyReports, gates,
});
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const output = parseArgument("output");
if (output) await writeFile(output, serialized, { flag: "wx" });
else process.stdout.write(serialized);
