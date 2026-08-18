import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { SimulationFeatureV10 } from "./contracts";
import { createExternalWorldFeatureV10 } from "./external-world";
import { applyCommandV10, createInitialStateV10 } from "./kernel";
import { FeatureRegistryV10 } from "./registry";
import { createRunV10RequestSchema } from "./schemas";
import { V10_ENGINE_VERSION, type EngineCommandV10 } from "./types";

const runRequest = {
  scenarioVersionId: "ai-workflow-automation@3.0.0",
  setup: {
    companyName: "Causal Systems",
    founderProfileId: "technical_builder" as const,
  },
};

function command(sequence: number): EngineCommandV10 {
  return {
    commandId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    expectedVersion: sequence - 1,
    type: "operations.advance_to_next_material_event",
    payload: { horizonDays: 90 },
    actor: "player",
  };
}

describe("v10 production foundation", () => {
  it("rejects v9 difficulty and personal-runway controls", () => {
    const parsed = createRunV10RequestSchema.safeParse({
      ...runRequest,
      setup: {
        ...runRequest.setup,
        difficulty: "guided",
        personalRunway: "stable",
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("replays the same seed and command stream to the same checksum", () => {
    const registry = new FeatureRegistryV10([createExternalWorldFeatureV10()], V10_ENGINE_VERSION);
    const first = createInitialStateV10(runRequest, {
      now: "2026-08-18T00:00:00.000Z",
      seed: 918273,
      jurisdictionRuleVersionId: "sea_like_v1@1.0.0",
    }, registry);
    const second = createInitialStateV10(runRequest, {
      now: "2026-08-18T00:00:00.000Z",
      seed: 918273,
      jurisdictionRuleVersionId: "sea_like_v1@1.0.0",
    }, registry);

    let left = first;
    let right = second;
    for (let sequence = 1; sequence <= 24; sequence += 1) {
      left = applyCommandV10(left, command(sequence), {
        runId: "run-left",
        now: "2026-08-18T00:00:00.000Z",
      }, registry).state;
      right = applyCommandV10(right, command(sequence), {
        runId: "run-right",
        now: "2026-08-18T00:00:00.000Z",
      }, registry).state;
    }

    expect(left.kernel.overallChecksum).toBe(right.kernel.overallChecksum);
    expect(left.kernel.rng).toEqual(right.kernel.rng);
  });

  it("keeps a 30-year world finite, bounded and free of a max-days terminal", () => {
    const registry = new FeatureRegistryV10([createExternalWorldFeatureV10()], V10_ENGINE_VERSION);
    let state = createInitialStateV10(runRequest, {
      now: "2026-08-18T00:00:00.000Z",
      seed: 42,
      jurisdictionRuleVersionId: "sea_like_v1@1.0.0",
    }, registry);

    for (let sequence = 1; sequence <= 360; sequence += 1) {
      state = applyCommandV10(state, command(sequence), {
        runId: "run-soak",
        now: "2026-08-18T00:00:00.000Z",
      }, registry).state;
    }

    expect(state.kernel.simulationDay).toBe(10_800);
    expect(state.kernel.status).toBe("active");
    expect(JSON.stringify(state).length).toBeLessThan(1_500_000);
    const privateState = state.features["external-world"].private as {
      factors: Record<string, number>;
      history: unknown[];
    };
    expect(privateState.history.length).toBeLessThanOrEqual(36);
    expect(Object.values(privateState.factors).every((value) => Number.isFinite(value) && value >= -3 && value <= 3)).toBe(true);
  });

  it("does not project latent factors or transition mechanics", () => {
    const registry = new FeatureRegistryV10([createExternalWorldFeatureV10()], V10_ENGINE_VERSION);
    const state = createInitialStateV10(runRequest, {
      now: "2026-08-18T00:00:00.000Z",
      seed: 17,
      jurisdictionRuleVersionId: "sea_like_v1@1.0.0",
    }, registry);
    const projection = JSON.stringify(registry.project(state, "external-world"));
    expect(projection).not.toContain('"factors"');
    expect(projection).not.toContain("transitionWeights");
    expect(projection).not.toContain("probability");
  });

  it("rejects feature dependency cycles before a run can start", () => {
    const schema = z.object({ value: z.number() });
    const feature = (id: string, dependency: string): SimulationFeatureV10<{ value: number }, { value: number }, Record<string, never>> => ({
      id,
      version: "1.0.0",
      dependencies: [{ id: dependency, versionRange: "^1.0.0" }],
      compatibleEngineRange: ">=10.0.0 <11.0.0",
      configSchema: z.object({}),
      publicStateSchema: schema,
      privateStateSchema: schema,
      initialize: () => ({ public: { value: 0 }, private: { value: 0 } }),
      invariants: [],
      projectionPolicy: { schema, project: ({ publicState }) => publicState },
      snapshotPolicy: { mode: "adaptive", maximumCommandsBetweenSnapshots: 100 },
      retentionPolicy: { maximumHeadBytes: 1000, maximumMaterialRecords: 10, archiveClosedRecords: true },
    });

    expect(() => new FeatureRegistryV10([feature("alpha", "beta"), feature("beta", "alpha")], V10_ENGINE_VERSION))
      .toThrow("FEATURE_DEPENDENCY_CYCLE");
  });
});
