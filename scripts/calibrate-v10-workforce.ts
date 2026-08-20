import {
  applyCommandV10,
  createInitialStateV10,
  createProductionFeatureConfigV10,
  createProductionFeatureRegistryV10,
  type EmploymentCasesPublicStateV10,
  type EmploymentJurisdictionV10,
  type EngineCommandV10,
  type FinanceTreasuryPublicStateV10,
  type SimulationCommandV10,
  type SimulationStateV10,
  type WorkforcePublicStateV10,
} from "@sim/engine";
import { getScenario, scenarioVersionId } from "@/content/scenarios";

type Policy =
  | "structured_hiring"
  | "fast_hiring"
  | "compensation_led"
  | "coaching_led"
  | "delegation_heavy"
  | "founder_controlled"
  | "adversarial";

const policies: Policy[] = [
  "structured_hiring",
  "fast_hiring",
  "compensation_led",
  "coaching_led",
  "delegation_heavy",
  "founder_controlled",
  "adversarial",
];
const requestedRuns = process.argv.find((item) => item.startsWith("--runs="));
const requestedCash = process.argv.find((item) =>
  item.startsWith("--opening-cash="),
);
const runsPerCell = Math.max(1, Number(requestedRuns?.split("=")[1] ?? 10_000));
const openingCashOverride = requestedCash
  ? Math.max(0, Number(requestedCash.split("=")[1]))
  : null;
const registry = createProductionFeatureRegistryV10();
const workforceScenarios = [
  getScenario("ai-workflow-automation", "3.0.0")!,
  getScenario("local-services-saas", "3.0.0")!,
  getScenario("healthcare-operations", "3.0.0")!,
];

function workforce(state: SimulationStateV10): WorkforcePublicStateV10 {
  return state.features["workforce-and-organization"]
    .public as WorkforcePublicStateV10;
}

function cases(state: SimulationStateV10): EmploymentCasesPublicStateV10 {
  return state.features["employment-cases"]
    .public as EmploymentCasesPublicStateV10;
}

function finance(state: SimulationStateV10): FinanceTreasuryPublicStateV10 {
  return state.features["finance-and-treasury"]
    .public as FinanceTreasuryPublicStateV10;
}

function commandId(serial: number): string {
  return `70000000-0000-4000-8000-${String(serial).padStart(12, "0")}`;
}

function apply(
  state: SimulationStateV10,
  type: SimulationCommandV10["type"],
  payload: unknown,
  serial: number,
): { state: SimulationStateV10; eventTypes: string[] } {
  try {
    const result = applyCommandV10(
      state,
      {
        commandId: commandId(serial),
        expectedVersion: state.kernel.version,
        type,
        payload,
        actor: "player",
      } as EngineCommandV10,
      {
        runId: `calibration-${state.kernel.seed}`,
        now: "2026-08-20T00:00:00.000Z",
      },
      registry,
    );
    return {
      state: result.state,
      eventTypes: result.response.events.map((event) => event.type),
    };
  } catch {
    return { state, eventTypes: [] };
  }
}

function simulate(
  scenarioIndex: number,
  policy: Policy,
  seed: number,
): {
  stable: boolean;
  hired: number;
  active: number;
  departures: number;
  cases: number;
  claims: number;
  cash: number;
  simulationDay: number;
  eventCounts: Record<string, number>;
} {
  const scenario = workforceScenarios[scenarioIndex];
  const jurisdiction = scenario.jurisdiction as EmploymentJurisdictionV10;
  const openingCash = openingCashOverride ?? scenario.initial.companyCash;
  let state = createInitialStateV10(
    {
      scenarioVersionId: scenarioVersionId(scenario),
      setup: {
        companyName: "Matched Seed Workforce Lab",
        founderProfileId:
          policy === "founder_controlled"
            ? "technical_builder"
            : "domain_insider",
      },
    },
    {
      now: "2026-08-20T00:00:00.000Z",
      seed,
      jurisdictionRuleVersionId: `${jurisdiction}_v1@1.0.0`,
    },
    registry,
    createProductionFeatureConfigV10({
      jurisdiction,
      openingCash,
    }),
  );
  let serial = 0;
  const eventCounts: Record<string, number> = {};
  const act = (type: SimulationCommandV10["type"], payload: unknown) => {
    const result = apply(state, type, payload, ++serial);
    state = result.state;
    for (const eventType of result.eventTypes) {
      eventCounts[eventType] = (eventCounts[eventType] ?? 0) + 1;
    }
  };

  act("workforce.role.open", {
    title:
      policy === "delegation_heavy"
        ? "Operations manager"
        : "Founding operator",
    role: policy === "founder_controlled" ? "engineering" : "operations",
    level: policy === "delegation_heavy" ? "manager" : "individual",
    employmentType: "employee",
    headcount: 1,
    salaryMin: 24_000,
    salaryMax: 60_000,
    optionBpsMax: 400,
  });
  act("workforce.candidate.source", {
    roleId: "role-1",
    channel: policy === "fast_hiring" ? "inbound" : "network",
    count: policy === "fast_hiring" ? 1 : 3,
  });

  if (policy !== "fast_hiring" && policy !== "compensation_led") {
    for (const candidate of workforce(state).candidates) {
      const methods =
        policy === "adversarial"
          ? (["structured_interview", "structured_interview"] as const)
          : (["work_sample", "reference"] as const);
      for (const method of methods) {
        act("workforce.candidate.assess", {
          candidateId: candidate.id,
          method,
          panelCluster:
            policy === "adversarial" ? "same-panel" : `${method}-independent`,
        });
        act("operations.advance_to_next_material_event", { horizonDays: 30 });
      }
    }
  }

  const ranked = workforce(state)
    .candidates.slice()
    .sort(
      (left, right) =>
        right.estimate.low +
        right.estimate.high -
        (left.estimate.low + left.estimate.high),
    );
  for (const candidate of ranked) {
    if (!["screened", "assessed"].includes(candidate.stage)) continue;
    const salary =
      policy === "compensation_led"
        ? 60_000
        : Math.max(24_000, Math.min(54_000, candidate.salaryExpectation));
    act("workforce.offer.make", {
      candidateId: candidate.id,
      salary,
      optionBps:
        policy === "compensation_led"
          ? 400
          : Math.min(250, candidate.optionExpectationBps),
      startDelayDays: 7,
    });
    act("operations.advance_to_next_material_event", { horizonDays: 30 });
    const updated = workforce(state).candidates.find(
      (item) => item.id === candidate.id,
    );
    if (updated && ["notice", "hired"].includes(updated.stage)) break;
  }

  while (state.kernel.simulationDay < 360 && serial < 120) {
    const employee = workforce(state).employees.find(
      (item) => item.id !== "founder" && item.status !== "departed",
    );
    if (employee && ["active", "onboarding"].includes(employee.status)) {
      act("workforce.assignment.set", {
        employeeId: employee.id,
        workload: policy === "adversarial" ? 1.5 : 0.9,
        ownership: ["delivery", "customer-handoff"],
      });
      if (policy === "coaching_led") {
        act("workforce.one_on_one.hold", {
          employeeId: employee.id,
          focus: "performance",
        });
        act("workforce.feedback.record", {
          employeeId: employee.id,
          style: "coaching",
          topic: "Delivery quality and ownership evidence",
        });
      }
      if (
        policy === "delegation_heavy" &&
        employee.level === "manager" &&
        employee.delegatedMandates.length === 0
      ) {
        act("workforce.delegation.set", {
          managerId: employee.id,
          mandate: "people",
          budgetLimit: 5_000,
          escalationThreshold: "material",
        });
      }
    }

    const notice = workforce(state).employees.find(
      (item) => item.id !== "founder" && item.status === "notice",
    );
    if (notice) {
      act("workforce.resignation.respond", {
        employeeId: notice.id,
        response:
          policy === "compensation_led"
            ? "counteroffer"
            : policy === "coaching_led"
              ? "change_role"
              : "negotiate_handoff",
        salary:
          policy === "compensation_led"
            ? Math.round(notice.annualSalary * 1.2)
            : undefined,
      });
    }

    const openCase = cases(state).cases.find((item) =>
      ["reported", "triaged", "finding_ready", "claim", "remediating"].includes(
        item.status,
      ),
    );
    if (openCase?.status === "reported") {
      act("employment_case.triage", {
        caseId: openCase.id,
        action: policy === "adversarial" ? "monitor" : "preserve_evidence",
      });
    } else if (openCase?.status === "triaged") {
      act("employment_case.investigate", {
        caseId: openCase.id,
        approach: policy === "structured_hiring" ? "independent" : "internal",
      });
    } else if (
      openCase &&
      ["finding_ready", "claim", "remediating"].includes(openCase.status)
    ) {
      act("employment_case.respond", {
        caseId: openCase.id,
        action: openCase.status === "claim" ? "defend" : "warning",
      });
    }
    act("operations.advance_to_next_material_event", { horizonDays: 30 });
  }

  const people = workforce(state).employees.filter(
    (item) => item.id !== "founder",
  );
  const active = people.filter((item) => item.status === "active").length;
  const claims = cases(state).cases.filter(
    (item) => item.status === "claim",
  ).length;
  const unresolved = cases(state).cases.filter(
    (item) => item.status !== "resolved",
  ).length;
  const cash = finance(state).cash;
  return {
    stable:
      active > 0 &&
      unresolved === 0 &&
      cash >= 0 &&
      finance(state).runwaySignal !== "insolvent",
    hired: people.length,
    active,
    departures: people.filter((item) => item.status === "departed").length,
    cases: cases(state).cases.length,
    claims,
    cash,
    simulationDay: state.kernel.simulationDay,
    eventCounts,
  };
}

const results = [];
for (
  let scenarioIndex = 0;
  scenarioIndex < workforceScenarios.length;
  scenarioIndex += 1
) {
  for (const policy of policies) {
    let stable = 0;
    let hired = 0;
    let active = 0;
    let departures = 0;
    let employmentCases = 0;
    let claims = 0;
    let cash = 0;
    const eventCounts: Record<string, number> = {};
    for (let run = 0; run < runsPerCell; run += 1) {
      const outcome = simulate(
        scenarioIndex,
        policy,
        scenarioIndex * 100_000_000 + run * 17 + 1,
      );
      stable += Number(outcome.stable);
      hired += outcome.hired;
      active += outcome.active;
      departures += outcome.departures;
      employmentCases += outcome.cases;
      claims += outcome.claims;
      cash += outcome.cash;
      for (const [eventType, count] of Object.entries(outcome.eventCounts)) {
        eventCounts[eventType] = (eventCounts[eventType] ?? 0) + count;
      }
    }
    results.push({
      scenario: workforceScenarios[scenarioIndex].slug,
      jurisdiction: workforceScenarios[scenarioIndex].jurisdiction,
      policy,
      stableRate: stable / runsPerCell,
      averageHired: hired / runsPerCell,
      averageActive: active / runsPerCell,
      averageDepartures: departures / runsPerCell,
      averageCases: employmentCases / runsPerCell,
      averageClaims: claims / runsPerCell,
      averageEndingCash: cash / runsPerCell,
      eventCounts,
    });
  }
}

console.log(
  JSON.stringify(
    {
      engineVersion: "10.0.0-alpha.1",
      scope:
        "workforce subsystem calibration; not a full-campaign healthy-ending claim",
      runsPerScenarioPolicy: runsPerCell,
      totalRuns: runsPerCell * workforceScenarios.length * policies.length,
      openingCashOverride,
      results,
    },
    null,
    2,
  ),
);
