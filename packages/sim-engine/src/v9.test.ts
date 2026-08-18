import { describe, expect, it } from "vitest";
import { getScenario } from "../../../src/content/scenarios";
import { applyCommand, applySystemCommand, createInitialState } from "./engine";
import { projectState } from "./projection/client";
import { FeatureRegistry } from "./features/registry";
import { buildAgentDecisionEnvelope, competitorPublic, marketIntelligencePublic } from "./features/competitors";
import { ENGINE_VERSION, type AgentDecision, type SimulationFeature, type SimulationState } from "./index";

const scenario = getScenario("ai-workflow-automation")!;
const context = (state: SimulationState, now = "2026-08-18T00:00:00.000Z") => ({ seed: state.seed, now, engineVersion: state.engineVersion, scenarioVersion: state.scenarioVersion });
const fresh = () => createInitialState(scenario, { companyName: "V9 Test", founderArchetype: "builder", difficulty: "realistic", personalRunway: "standard" }, { seed: 9917, now: "2026-08-18T00:00:00.000Z", engineVersion: ENGINE_VERSION, scenarioVersion: `${scenario.id}@${scenario.version}` });

function pendingState() {
  const state = fresh(); state.calendar.absoluteDay = 20; state.problems.forEach((problem) => { problem.deadlineDay = 120; });
  return applyCommand(state, { commandId: "advance-v9-test", type: "operations.advance_to_decision", payload: { maxDays: 1 } }, context(state)).state;
}

describe("v9 modular startup world", () => {
  it("rejects broken feature graphs and duplicate command ownership", () => {
    const bare = (id: string, dependencies: string[] = []): SimulationFeature => ({ id, version: "1.0.0", dependencies });
    expect(() => new FeatureRegistry([bare("alpha", ["missing"])])) .toThrow("MISSING_FEATURE_DEPENDENCY");
    expect(() => new FeatureRegistry([bare("alpha", ["beta"]), bare("beta", ["alpha"])])) .toThrow("FEATURE_DEPENDENCY_CYCLE");
    const first = { ...bare("alpha"), commands: { "competitor.respond": () => undefined } } satisfies SimulationFeature;
    const second = { ...bare("beta"), commands: { "competitor.respond": () => undefined } } satisfies SimulationFeature;
    expect(() => new FeatureRegistry([first, second])).toThrow("DUPLICATE_COMMAND_OWNER");
    expect(() => new FeatureRegistry([{ ...bare("alpha"), effects: { "wrong.tick": () => undefined } }])).toThrow("FEATURE_EFFECT_NOT_NAMESPACED");
  });

  it("initializes namespaced competitor physics and never projects private policy", () => {
    const state = fresh(); const publicState = competitorPublic(state); const dossier = marketIntelligencePublic(state).dossier;
    expect(state.schemaVersion).toBe(3); expect(publicState.profiles).toHaveLength(4); expect(dossier.facts.length).toBeGreaterThanOrEqual(4);
    expect(dossier.facts.every((fact) => fact.status !== "verified" || fact.sourceIds.every((id) => dossier.sources.some((source) => source.id === id)))).toBe(true);
    expect(projectState(state).features).not.toHaveProperty("private");
  });

  it("accepts only an allowed, cited external decision and replays it deterministically", () => {
    const applyTape = () => {
      const state = pendingState(); const envelope = buildAgentDecisionEnvelope(state);
      const decision: AgentDecision = { selectedActionId: envelope.allowedActionIds[0], publicRationale: "SIMULATED policy response based only on cited public signals.", citedSourceIds: envelope.observedFacts.flatMap((fact) => fact.sourceIds).slice(0, 1) };
      return applySystemCommand(state, { commandId: "system-agent-v9-test", type: "system.agent_decision.apply", payload: { externalInputId: "11111111-1111-4111-8111-111111111111", turnId: envelope.turnId, decision, provider: "authored", inputHash: envelope.worldInputHash } }, context(state));
    };
    const first = applyTape(); const second = applyTape();
    expect(first.checksum).toBe(second.checksum); expect(competitorPublic(first.state).moves[0].publicSummary).toContain("SIMULATED");
    expect(first.state.externalInputRefs?.at(-1)?.kind).toBe("agent_decision");
  });

  it("rejects an action outside the engine-generated allowlist", () => {
    const state = pendingState(); const envelope = buildAgentDecisionEnvelope(state);
    const forbidden = (["change_pricing", "launch_capability", "add_integration", "bundle_services", "channel_partnership", "exit_segment"] as const).find((action) => !envelope.allowedActionIds.includes(action)) ?? "exit_segment";
    expect(() => applySystemCommand(state, { commandId: "system-agent-invalid", type: "system.agent_decision.apply", payload: { externalInputId: "22222222-2222-4222-8222-222222222222", turnId: envelope.turnId, decision: { selectedActionId: forbidden, publicRationale: "SIMULATED invalid move.", citedSourceIds: [] }, provider: "authored", inputHash: envelope.worldInputHash } }, context(state))).toThrow("AGENT_ACTION_FORBIDDEN");
  });

  it("locks player mutations while a critical external turn is pending", () => {
    const state = pendingState();
    expect(() => applyCommand(state, { commandId: "player-during-agent-turn", type: "planning.update", payload: { key: "founderDraw", value: 0 } }, context(state))).toThrow("AGENT_TURN_PENDING");
  });

  it("routes every sixth regular competitor cycle through the bounded deep-turn budget", () => {
    const state = fresh(); const competitors = competitorPublic(state); competitors.regularTurnsUsed = 6; competitors.nextTurnDay = 21;
    state.calendar.absoluteDay = 20; state.problems.forEach((problem) => { problem.deadlineDay = 120; });
    const pending = applyCommand(state, { commandId: "advance-to-deep-turn", type: "operations.advance_to_decision", payload: { maxDays: 1 } }, context(state)).state;
    expect(buildAgentDecisionEnvelope(pending).turnKind).toBe("deep");
  });

  it("allows exactly one player response per simulated competitor move", () => {
    const state = pendingState(); const envelope = buildAgentDecisionEnvelope(state);
    const moved = applySystemCommand(state, { commandId: "system-agent-response", type: "system.agent_decision.apply", payload: { externalInputId: "33333333-3333-4333-8333-333333333333", turnId: envelope.turnId, decision: { selectedActionId: envelope.allowedActionIds[0], publicRationale: "SIMULATED response test.", citedSourceIds: [] }, provider: "authored", inputHash: envelope.worldInputHash } }, context(state)).state;
    const competitorId = competitorPublic(moved).moves[0].competitorId;
    const answered = applyCommand(moved, { commandId: "answer-competitor-once", type: "competitor.respond", payload: { competitorId, response: "ignore" } }, context(moved)).state;
    expect(competitorPublic(answered).moves[0].playerResponse).toBe("ignore");
    expect(() => applyCommand(answered, { commandId: "answer-competitor-twice", type: "competitor.respond", payload: { competitorId, response: "differentiate" } }, context(answered))).toThrow("COMPETITOR_MOVE_ALREADY_ANSWERED");
  });

  it("activates a sampled competitor consequence through the namespaced effect bus after seven days", () => {
    const state = pendingState(); const envelope = buildAgentDecisionEnvelope(state);
    let moved = applySystemCommand(state, { commandId: "system-agent-delay", type: "system.agent_decision.apply", payload: { externalInputId: "44444444-4444-4444-8444-444444444444", turnId: envelope.turnId, decision: { selectedActionId: envelope.allowedActionIds[0], publicRationale: "SIMULATED delayed move.", citedSourceIds: [] }, provider: "authored", inputHash: envelope.worldInputHash } }, context(state)).state;
    expect(moved.scheduledEffects.some((effect) => effect.type === "competitors.activate_move")).toBe(true);
    moved = applyCommand(moved, { commandId: "advance-before-effect", type: "operations.advance_to_decision", payload: { maxDays: 6 } }, context(moved)).state;
    expect(competitorPublic(moved).moves[0].status).toBe("announced");
    moved = applyCommand(moved, { commandId: "advance-to-effect", type: "operations.advance_to_decision", payload: { maxDays: 6 } }, context(moved)).state;
    expect(competitorPublic(moved).moves[0].status).toBe("active");
  });
});
