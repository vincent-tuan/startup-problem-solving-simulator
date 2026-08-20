import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyCommandV10, createInitialStateV10 } from "./kernel";
import {
  createProductionFeatureConfigV10,
  createProductionFeatureRegistryV10,
} from "./feature-set";
import type {
  EngineCommandV10,
  SimulationCommandV10,
  SimulationStateV10,
} from "./types";
import type {
  WorkforcePrivateStateV10,
  WorkforcePublicStateV10,
} from "./workforce";
import type {
  FinanceTreasuryPrivateStateV10,
  FinanceTreasuryPublicStateV10,
} from "./finance-treasury";
import type { EmploymentCasesPublicStateV10 } from "./employment-cases";

const runRequest = {
  scenarioVersionId: "ai-workflow-automation@3.0.0",
  setup: {
    companyName: "Workforce Systems",
    founderProfileId: "technical_builder" as const,
  },
};

function initial(
  seed = 314_159,
  jurisdiction: "us_like" | "eu_like" | "sea_like" = "sea_like",
): SimulationStateV10 {
  const registry = createProductionFeatureRegistryV10();
  return createInitialStateV10(
    runRequest,
    {
      now: "2026-08-20T00:00:00.000Z",
      seed,
      jurisdictionRuleVersionId: `${jurisdiction}_v1@1.0.0`,
    },
    registry,
    createProductionFeatureConfigV10({ jurisdiction, openingCash: 250_000 }),
  );
}

let commandSerial = 0;
function execute<T extends SimulationCommandV10["type"]>(
  state: SimulationStateV10,
  type: T,
  payload: Extract<SimulationCommandV10, { type: T }>["payload"],
): SimulationStateV10 {
  commandSerial += 1;
  const command = {
    commandId: `10000000-0000-4000-8000-${String(commandSerial).padStart(12, "0")}`,
    expectedVersion: state.kernel.version,
    type,
    payload,
    actor: "player",
  } as EngineCommandV10;
  return applyCommandV10(
    state,
    command,
    {
      runId: "run-workforce-test",
      now: "2026-08-20T00:00:00.000Z",
    },
    createProductionFeatureRegistryV10(),
  ).state;
}

function workforce(state: SimulationStateV10): WorkforcePublicStateV10 {
  return state.features["workforce-and-organization"]
    .public as WorkforcePublicStateV10;
}

function hireFirstCandidate(
  stateInput: SimulationStateV10,
): SimulationStateV10 {
  let state = execute(stateInput, "workforce.role.open", {
    title: "Founding engineer",
    role: "engineering",
    level: "individual",
    employmentType: "employee",
    headcount: 1,
    salaryMin: 30_000,
    salaryMax: 75_000,
    optionBpsMax: 500,
  });
  state = execute(state, "workforce.candidate.source", {
    roleId: "role-1",
    channel: "network",
    count: 5,
  });
  for (const candidate of workforce(state).candidates) {
    state = execute(state, "workforce.offer.make", {
      candidateId: candidate.id,
      salary: 75_000,
      optionBps: 500,
      startDelayDays: 1,
    });
    state = execute(state, "operations.advance_to_next_material_event", {
      horizonDays: 30,
    });
    const updated = workforce(state).candidates.find(
      (item) => item.id === candidate.id,
    );
    if (updated && ["notice", "hired"].includes(updated.stage)) break;
  }
  for (
    let step = 0;
    step < 20 && workforce(state).employees.length === 1;
    step += 1
  ) {
    state = execute(state, "operations.advance_to_next_material_event", {
      horizonDays: 30,
    });
  }
  expect(workforce(state).employees.length).toBeGreaterThan(1);
  return state;
}

describe("v10 workforce simulation", () => {
  it("runs a finite hiring workflow with delayed start and economic postings", () => {
    let state = initial();
    const openingCash = (
      state.features["finance-and-treasury"]
        .public as FinanceTreasuryPublicStateV10
    ).cash;
    state = hireFirstCandidate(state);

    const people = workforce(state);
    const hire = people.employees.find((employee) => employee.id !== "founder");
    expect(hire).toBeDefined();
    expect(["onboarding", "active"]).toContain(hire!.status);
    expect(hire!.onboardingProgress).toBeLessThanOrEqual(100);

    const finance = state.features["finance-and-treasury"]
      .public as FinanceTreasuryPublicStateV10;
    const financePrivate = state.features["finance-and-treasury"]
      .private as FinanceTreasuryPrivateStateV10;
    expect(finance.cash).toBeLessThan(openingCash);
    expect(new Set(financePrivate.recognizedTransactionIds).size).toBe(
      financePrivate.recognizedTransactionIds.length,
    );
    expect(
      financePrivate.settledTransactionIds.every((id) =>
        financePrivate.recognizedTransactionIds.includes(id),
      ),
    ).toBe(true);
  });

  it("penalizes correlated interview evidence and never projects latent traits", () => {
    let state = initial(271_828);
    state = execute(state, "workforce.role.open", {
      title: "Customer operator",
      role: "customer_success",
      level: "individual",
      employmentType: "employee",
      headcount: 1,
      salaryMin: 24_000,
      salaryMax: 45_000,
      optionBpsMax: 150,
    });
    state = execute(state, "workforce.candidate.source", {
      roleId: "role-1",
      channel: "inbound",
      count: 1,
    });
    state = execute(state, "workforce.candidate.assess", {
      candidateId: "candidate-1",
      method: "structured_interview",
      panelCluster: "founder-panel",
    });
    state = execute(state, "operations.advance_to_next_material_event", {
      horizonDays: 30,
    });
    const firstConfidence = workforce(state).candidates[0].estimate.confidence;
    state = execute(state, "workforce.candidate.assess", {
      candidateId: "candidate-1",
      method: "structured_interview",
      panelCluster: "founder-panel",
    });
    state = execute(state, "operations.advance_to_next_material_event", {
      horizonDays: 30,
    });
    const secondConfidence = workforce(state).candidates[0].estimate.confidence;

    expect(secondConfidence - firstConfidence).toBeLessThan(
      firstConfidence - 12,
    );
    const projection = JSON.stringify(
      createProductionFeatureRegistryV10().project(
        state,
        "workforce-and-organization",
      ),
    );
    for (const hiddenKey of [
      "candidateTruth",
      "employeeTruth",
      "misconductPropensity",
      "managementPropensities",
      "communicationStyle",
      "exitThreshold",
      "actualContribution",
    ]) {
      expect(projection).not.toContain(hiddenKey);
    }
  });

  it("does not permit concurrent offers to overfill an opening", () => {
    let state = initial(12_345);
    state = execute(state, "workforce.role.open", {
      title: "Operations lead",
      role: "operations",
      level: "lead",
      employmentType: "employee",
      headcount: 1,
      salaryMin: 30_000,
      salaryMax: 60_000,
      optionBpsMax: 250,
    });
    state = execute(state, "workforce.candidate.source", {
      roleId: "role-1",
      channel: "network",
      count: 2,
    });
    state = execute(state, "workforce.offer.make", {
      candidateId: "candidate-1",
      salary: 60_000,
      optionBps: 250,
      startDelayDays: 7,
    });

    expect(() =>
      execute(state, "workforce.offer.make", {
        candidateId: "candidate-2",
        salary: 60_000,
        optionBps: 250,
        startDelayDays: 7,
      }),
    ).toThrow("ROLE_OFFER_CAPACITY_FILLED");
  });

  it("creates a causal employment exposure for an undocumented termination", () => {
    let state = hireFirstCandidate(initial(161_803, "eu_like"));
    const hire = workforce(state).employees.find(
      (employee) => employee.id !== "founder",
    )!;
    state = execute(state, "workforce.termination.plan", {
      employeeId: hire.id,
      reason: "performance",
      documentationIds: [],
    });
    state = execute(state, "operations.advance_to_next_material_event", {
      horizonDays: 30,
    });

    const cases = state.features["employment-cases"]
      .public as EmploymentCasesPublicStateV10;
    const terminationCase = cases.cases.find(
      (item) =>
        item.type === "wrongful_termination" &&
        item.subjectEmployeeId === hire.id,
    );
    expect(terminationCase).toBeDefined();
    expect(cases.disclaimer).toContain("not legal advice");
    state = execute(state, "employment_case.triage", {
      caseId: terminationCase!.id,
      action: "preserve_evidence",
    });
    expect(() =>
      execute(state, "employment_case.triage", {
        caseId: terminationCase!.id,
        action: "preserve_evidence",
      }),
    ).toThrow("EMPLOYMENT_CASE_NOT_TRIAGEABLE");
  });

  it("prevents same-day management signal farming", () => {
    let state = hireFirstCandidate(initial(44_221));
    const hire = workforce(state).employees.find(
      (employee) => employee.id !== "founder",
    )!;
    state = execute(state, "workforce.one_on_one.hold", {
      employeeId: hire.id,
      focus: "performance",
    });
    expect(() =>
      execute(state, "workforce.one_on_one.hold", {
        employeeId: hire.id,
        focus: "career",
      }),
    ).toThrow("ONE_ON_ONE_ALREADY_RECORDED_TODAY");
    state = execute(state, "workforce.feedback.record", {
      employeeId: hire.id,
      style: "coaching",
      topic: "Delivery expectations",
    });
    expect(() =>
      execute(state, "workforce.feedback.record", {
        employeeId: hire.id,
        style: "direct",
        topic: "A different topic",
      }),
    ).toThrow("FEEDBACK_ALREADY_RECORDED_TODAY");
  });

  it("preserves deterministic replay across the complete workforce feature set", () => {
    const registry = createProductionFeatureRegistryV10();
    const config = createProductionFeatureConfigV10({ openingCash: 50_000 });
    let left = createInitialStateV10(
      runRequest,
      {
        now: "2026-08-20T00:00:00.000Z",
        seed: 99,
        jurisdictionRuleVersionId: "sea_like_v1@1.0.0",
      },
      registry,
      config,
    );
    let right = structuredClone(left);
    const stream: Array<{
      type: SimulationCommandV10["type"];
      payload: object;
    }> = [
      {
        type: "workforce.role.open",
        payload: {
          title: "Revenue lead",
          role: "sales",
          level: "lead",
          employmentType: "employee",
          headcount: 1,
          salaryMin: 20_000,
          salaryMax: 50_000,
          optionBpsMax: 250,
        },
      },
      {
        type: "workforce.candidate.source",
        payload: { roleId: "role-1", channel: "outbound", count: 2 },
      },
      {
        type: "operations.advance_to_next_material_event",
        payload: { horizonDays: 30 },
      },
      {
        type: "operations.advance_to_next_material_event",
        payload: { horizonDays: 30 },
      },
    ];
    stream.forEach((item, index) => {
      const deterministicCommand = {
        commandId: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        expectedVersion: index,
        type: item.type,
        payload: item.payload,
        actor: "player",
      } as EngineCommandV10;
      left = applyCommandV10(
        left,
        deterministicCommand,
        { runId: "left", now: "2026-08-20T00:00:00.000Z" },
        registry,
      ).state;
      right = applyCommandV10(
        right,
        deterministicCommand,
        { runId: "right", now: "2026-08-20T00:00:00.000Z" },
        registry,
      ).state;
    });
    expect(left.kernel.overallChecksum).toBe(right.kernel.overallChecksum);
    expect(left.features["workforce-and-organization"].checksum).toBe(
      right.features["workforce-and-organization"].checksum,
    );
    const privateState = left.features["workforce-and-organization"]
      .private as WorkforcePrivateStateV10;
    expect(Object.keys(privateState.candidateTruth)).toHaveLength(2);
  });

  it("keeps workforce and treasury state finite across generated seeds", () => {
    const registry = createProductionFeatureRegistryV10();
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_147_483_647 }), (seed) => {
        let state = createInitialStateV10(
          runRequest,
          {
            now: "2026-08-20T00:00:00.000Z",
            seed,
            jurisdictionRuleVersionId: "sea_like_v1@1.0.0",
          },
          registry,
          createProductionFeatureConfigV10({ openingCash: 100_000 }),
        );
        for (let index = 0; index < 18; index += 1) {
          state = applyCommandV10(
            state,
            {
              commandId: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
              expectedVersion: state.kernel.version,
              type: "operations.advance_to_next_material_event",
              payload: { horizonDays: 90 },
              actor: "player",
            },
            { runId: "property-run", now: "2026-08-20T00:00:00.000Z" },
            registry,
          ).state;
        }
        const serialized = JSON.stringify(state);
        const numericValues =
          serialized.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        expect(numericValues.every(Number.isFinite)).toBe(true);
        expect(workforce(state).employees.length).toBeLessThanOrEqual(25);
        const treasury = state.features["finance-and-treasury"]
          .public as FinanceTreasuryPublicStateV10;
        expect(treasury.cash).toBeGreaterThanOrEqual(0);
        expect(treasury.peoplePayable).toBeGreaterThanOrEqual(0);
        expect(treasury.overduePeoplePayable).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 75 },
    );
  });
});
