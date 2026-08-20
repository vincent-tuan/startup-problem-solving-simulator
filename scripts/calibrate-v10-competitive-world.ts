import {
  applyCommandV10,
  createInitialStateV10,
  createProductionFeatureConfigV10_1,
  createProductionFeatureRegistryV10_1,
  generateAuthoredCompetitorPlanV10,
  pendingCompetitorDecisionEnvelopeV10,
  type CompetitorOrganizationsPrivateStateV10,
  type EngineCommandV10,
  type SimulationStateV10,
} from "@sim/engine";
import { getScenario, scenarioVersionId } from "@/content/scenarios";

const requestedRuns = process.argv.find((item) => item.startsWith("--runs="));
const requestedDays = process.argv.find((item) => item.startsWith("--days="));
const runsPerScenario = Math.max(
  1,
  Number(requestedRuns?.split("=")[1] ?? 10_000),
);
const horizonDays = Math.max(30, Number(requestedDays?.split("=")[1] ?? 540));
const registry = createProductionFeatureRegistryV10_1();
const scenarios = [
  getScenario("ai-workflow-automation", "3.1.0")!,
  getScenario("local-services-saas", "3.1.0")!,
  getScenario("healthcare-operations", "3.1.0")!,
];

function commandId(seed: number, version: number): string {
  const serial = String((seed * 1_000 + version) % 1_000_000_000_000).padStart(
    12,
    "0",
  );
  return `72000000-0000-4000-8000-${serial}`;
}

function apply(
  state: SimulationStateV10,
  type: EngineCommandV10["type"],
  payload: unknown,
  actor: EngineCommandV10["actor"],
): SimulationStateV10 {
  return applyCommandV10(
    state,
    {
      commandId: commandId(state.kernel.seed, state.kernel.version),
      expectedVersion: state.kernel.version,
      type,
      payload,
      actor,
    } as EngineCommandV10,
    {
      runId: `competitive-calibration-${state.kernel.seed}`,
      now: "2026-08-20T00:00:00.000Z",
    },
    registry,
  ).state;
}

function simulate(scenarioIndex: number, seed: number) {
  const scenario = scenarios[scenarioIndex];
  const jurisdiction = scenario.simulation?.jurisdictionArchetype ?? "sea_like";
  let state = createInitialStateV10(
    {
      scenarioVersionId: scenarioVersionId(scenario),
      setup: {
        companyName: "Matched Seed Competitive Lab",
        founderProfileId: "domain_insider",
      },
    },
    {
      now: "2026-08-20T00:00:00.000Z",
      seed,
      engineVersion: "10.1.0-alpha.1",
      jurisdictionRuleVersionId: `${jurisdiction}_v1@1.0.0`,
    },
    registry,
    createProductionFeatureConfigV10_1({
      jurisdiction: jurisdiction === "legacy" ? "sea_like" : jurisdiction,
      openingCash: scenario.initial.companyCash,
    }),
  );

  for (let step = 0; step < 2_000 && state.kernel.simulationDay < horizonDays; step += 1) {
    const envelope = pendingCompetitorDecisionEnvelopeV10(state);
    if (envelope) {
      const plan = generateAuthoredCompetitorPlanV10(envelope);
      state = apply(
        state,
        "system.competitor_plan_fallback",
        {
          externalInputId: `calibration:${envelope.turnId}`,
          turnId: envelope.turnId,
          inputHash: envelope.worldInputHash,
          provider: "authored",
          plan,
        },
        "system",
      );
    } else {
      state = apply(
        state,
        "operations.advance_to_next_material_event",
        { horizonDays: 90 },
        "player",
      );
    }
  }

  const organizations = state.features["competitor-organizations"]
    .private as CompetitorOrganizationsPrivateStateV10;
  const firms = Object.values(organizations.firms);
  const leader = firms
    .slice()
    .sort(
      (left, right) =>
        right.pipeline.filter((item) => item.stage === "won").length -
          left.pipeline.filter((item) => item.stage === "won").length ||
        right.completedInitiativeIds.length - left.completedInitiativeIds.length ||
        left.id.localeCompare(right.id),
    )[0];
  return {
    leaderDoctrine: leader.doctrine,
    firms: firms.map((firm) => ({
      doctrine: firm.doctrine,
      lifecycle: firm.lifecycle,
      customers: firm.customers,
      contestedWins: firm.pipeline.filter((item) => item.stage === "won").length,
      initiativesCompleted: firm.completedInitiativeIds.length,
      initiativesFailed: firm.initiatives.filter((item) => item.status === "failed").length,
    })),
  };
}

for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex += 1) {
  const leaders: Record<string, number> = {};
  const allocations: Record<string, number> = {};
  const lifecycle: Record<string, number> = {};
  let completed = 0;
  let failed = 0;
  for (let run = 0; run < runsPerScenario; run += 1) {
    const outcome = simulate(scenarioIndex, 10_000 + run);
    leaders[outcome.leaderDoctrine] = (leaders[outcome.leaderDoctrine] ?? 0) + 1;
    for (const firm of outcome.firms) {
      allocations[firm.doctrine] =
        (allocations[firm.doctrine] ?? 0) + firm.contestedWins;
      lifecycle[firm.lifecycle] = (lifecycle[firm.lifecycle] ?? 0) + 1;
      completed += firm.initiativesCompleted;
      failed += firm.initiativesFailed;
    }
  }
  const totalAllocations = Object.values(allocations).reduce((sum, value) => sum + value, 0);
  const dominant = totalAllocations
    ? Math.max(...Object.values(allocations)) / totalAllocations
    : 0;
  console.log(
    JSON.stringify({
      scenario: scenarioVersionId(scenarios[scenarioIndex]),
      runs: runsPerScenario,
      horizonDays,
      runLeaderShareByDoctrine: Object.fromEntries(
        Object.entries(leaders).map(([doctrine, count]) => [
          doctrine,
          Number((count / runsPerScenario).toFixed(4)),
        ]),
      ),
      allocationShareByDoctrine: Object.fromEntries(
        Object.entries(allocations).map(([doctrine, count]) => [
          doctrine,
          Number((count / Math.max(1, totalAllocations)).toFixed(4)),
        ]),
      ),
      dominantDoctrineAllocationShare: Number(dominant.toFixed(4)),
      lifecycle,
      initiativeOutcomes: { completed, failed },
    }),
  );
}
