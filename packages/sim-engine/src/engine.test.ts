import { describe, expect, it } from "vitest";
import type { ScenarioDefinition, SimulationCommand, SimulationState } from "./types";
import { ENGINE_VERSION } from "./types";
import { applyCommand, createInitialState } from "./engine";
import { stateChecksum } from "./checksum";

const scenario: ScenarioDefinition = {
  id: "test", slug: "test", version: "1.0.0", status: "published", hidden: false,
  title: "Test scenario", subtitle: "A deterministic test scenario.", description: "A deterministic scenario used by the engine test suite.",
  vertical: "test", jurisdiction: "test", architecture: "concierge", strategy: "smb", difficultyLabel: "Test", estimatedMinutes: 30,
  tags: ["test"], learningObjectives: ["Test deterministic behavior"],
  initial: { companyCash: 500, personalCash: 1_900, livingCost: 750, monthlyFixedCosts: 58, reducibleFixedCosts: 38, founderEnergy: 82, founderHealth: 80, founderBurnout: 18, problemEvidence: 4, budgetEvidence: 1, buyerClarity: 4, mvpProgress: 2, productQuality: 8 },
  problems: [{ key: "unclear", domain: "evidence", title: "Unclear customer problem", summary: "The target problem is not validated.", severity: 3, deadlineDay: 30, hypotheses: ["Pain is frequent", "Pain is optional"] }],
};
const setup = { companyName: "TestCo", founderArchetype: "builder", difficulty: "realistic", personalRunway: "standard" } as const;
const context = (state: SimulationState, now = "2026-01-01T00:00:00.000Z") => ({ seed: state.seed, now, engineVersion: state.engineVersion, scenarioVersion: state.scenarioVersion });
const initial = (seed = 42) => createInitialState(scenario, setup, { seed, now: "2026-01-01T00:00:00.000Z", engineVersion: ENGINE_VERSION, scenarioVersion: "test@1.0.0" });
let id = 0;
const apply = (state: SimulationState, type: SimulationCommand["type"], payload: unknown, now?: string) => applyCommand(state, { commandId: `command-${++id}-fixed`, type, payload } as SimulationCommand, context(state, now));

describe("deterministic simulation engine", () => {
  it("replays the same command stream to the same checksum", () => {
    const play = () => {
      let state = initial(8877);
      state = apply(state, "problem.hypothesis.set", { problemId: "problem_1", hypothesisId: "problem_1_hypothesis_1" }, "2026-01-01T00:00:01.000Z").state;
      state = apply(state, "problem.action.commit", { problemId: "problem_1", kind: "research", intensity: "sustainable", researchDesign: { question: "severity", sample: "existing_users", method: "interview", count: 8 } }, "2026-01-01T00:00:02.000Z").state;
      state = apply(state, "operations.advance", {}, "2026-01-01T00:00:03.000Z").state;
      return stateChecksum(state);
    };
    id = 0; const first = play(); id = 0; const second = play(); expect(second).toBe(first);
  });

  it("applies verified fixed savings before the solvency check", () => {
    const state = initial(); state.finance.companyCash = 10; state.finance.monthlyFixedCosts = 50; state.finance.reducibleFixedCosts = 40; state.finance.monthlyFixedSavings = 40;
    const result = apply(state, "operations.advance", {});
    expect(result.state.calendar.month).toBe(1); expect(result.state.finance.companyCash).toBe(0); expect(result.state.status).toBe("active");
  });

  it("never lets tool cuts exceed actually reducible fixed costs", () => {
    let state = initial(); state.finance.monthlyFixedSavings = 37;
    state = apply(state, "problem.action.commit", { problemId: "problem_1", kind: "cut_tools", intensity: "sustainable" }).state;
    state = apply(state, "operations.advance", {}).state;
    expect(state.finance.monthlyFixedSavings).toBeLessThanOrEqual(38);
  });

  it("records founder cash injection as a company liability, not personal debt", () => {
    let state = initial(); const debt = state.finance.personalDebt; const company = state.finance.companyCash; const personal = state.finance.personalCash;
    state = apply(state, "problem.action.commit", { problemId: "problem_1", kind: "personal_injection", intensity: "sustainable" }).state;
    state = apply(state, "operations.advance", {}).state;
    expect(state.finance.personalDebt).toBe(debt); expect(state.finance.founderLoanBalance).toBeGreaterThan(0);
    expect(state.finance.companyCash).toBeGreaterThan(company); expect(state.finance.personalCash).toBeLessThan(personal);
  });

  it("records access but no target evidence for zero usable research", () => {
    let state = initial(123_456_789); const before = state.evidence.problem;
    state = apply(state, "problem.action.commit", { problemId: "problem_1", kind: "research", intensity: "sustainable", researchDesign: { question: "severity", sample: "convenience", method: "survey", count: 1 } }).state;
    state = apply(state, "operations.advance", {}).state;
    expect(state.evidence.ledger[0]?.summary).toMatch(/^0\/1/); expect(state.evidence.problem).toBe(before); expect(state.evidence.ledger[0]?.direction).toBe("neutral");
  });

  it("does not fake diversity when a research design is repeated", () => {
    let state = initial(9981); const design = { question: "severity", sample: "existing_users", method: "observation", count: 20 };
    state = apply(state, "problem.action.commit", { problemId: "problem_1", kind: "research", intensity: "sustainable", researchDesign: design }).state;
    state = apply(state, "operations.advance", {}).state; const afterFirst = state.evidence.diversity;
    state = apply(state, "problem.action.commit", { problemId: "problem_1", kind: "research", intensity: "sustainable", researchDesign: design }).state;
    state = apply(state, "operations.advance", {}).state;
    expect(afterFirst).toBe(9); expect(state.evidence.diversity).toBe(afterFirst); expect(state.evidence.designHistory).toEqual(["existing_users:observation"]);
  });

  it("accumulates overload quality before an action completes", () => {
    let state = initial(77); state.problems[0].deadlineDay = 8;
    for (let index = 0; index < 3; index += 1) state = apply(state, "problem.action.commit", { problemId: "problem_1", kind: "build", intensity: "crunch" }).state;
    state = apply(state, "operations.advance", {}).state;
    expect(state.actions.some((action) => action.status === "active")).toBe(true);
    for (const action of state.actions) { expect(action.executionWorkDone).toBeGreaterThan(0); expect(action.executionQualityWeighted).toBeGreaterThan(0); }
    expect(state.founder.burnout).toBeGreaterThan(18);
  });
});
