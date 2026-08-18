import { describe, expect, it } from "vitest";
import { getScenario } from "@/content/scenarios";
import { createV7InitialState, v7StateChecksum, type SimulationState, type V7ScenarioDefinition } from "@sim/engine";
import { applyVersionedCommand, isV7State, projectVersionedState } from "./versioning";

describe("frozen v7 compatibility", () => {
  it("replays v7 with its original engine and exposes only a read projection", () => {
    const scenario = getScenario("ai-workflow-automation", "1.0.0") as unknown as V7ScenarioDefinition;
    const context = { seed: 73, now: "2026-01-01T00:00:00.000Z", engineVersion: "7.0.0-beta.1", scenarioVersion: `${scenario.id}@${scenario.version}` };
    const first = createV7InitialState(scenario, { companyName: "Frozen Co", founderArchetype: "builder", difficulty: "realistic", personalRunway: "standard" }, context);
    const second = structuredClone(first);
    const request = { commandId: "v7-replay-command", type: "operations.advance", payload: {} };
    const a = applyVersionedCommand(first as unknown as SimulationState, request, context);
    const b = applyVersionedCommand(second as unknown as SimulationState, request, context);
    expect(isV7State(a.state)).toBe(true); expect(a.checksum).toBe(b.checksum); expect(a.checksum).toBe(v7StateChecksum(a.state));
    const projection = projectVersionedState(a.state);
    expect(projection.engineVersion).toBe("7.0.0-beta.1"); expect(projection.market.segments).toHaveLength(1);
  });
});
