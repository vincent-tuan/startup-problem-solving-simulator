import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCommandV10,
  createInitialStateV10,
  createProductionFeatureConfigV10_1,
  createProductionFeatureRegistryV10_1,
  generateAuthoredCompetitorPlanV10,
  pendingCompetitorDecisionEnvelopeV10,
  type CompetitorDecisionEnvelopeV10,
  type EngineCommandV10,
} from "@sim/engine";
import { generateCompetitorStrategicPlanV10 } from "./competitor-strategy";

function envelope(): CompetitorDecisionEnvelopeV10 {
  const registry = createProductionFeatureRegistryV10_1();
  let state = createInitialStateV10(
    {
      scenarioVersionId: "local-services-saas@3.1.0",
      setup: {
        companyName: "AI Boundary Test",
        founderProfileId: "commercial_hunter",
      },
    },
    {
      now: "2026-08-20T00:00:00.000Z",
      seed: 55_021,
      engineVersion: "10.1.0-alpha.1",
      jurisdictionRuleVersionId: "sea_like_v1@1.0.0",
    },
    registry,
    createProductionFeatureConfigV10_1({
      jurisdiction: "sea_like",
      openingCash: 500,
    }),
  );
  for (let step = 0; step < 30; step += 1) {
    const pending = pendingCompetitorDecisionEnvelopeV10(state);
    if (pending) return pending;
    state = applyCommandV10(
      state,
      {
        commandId: `83000000-0000-4000-8000-${String(step + 1).padStart(12, "0")}`,
        expectedVersion: state.kernel.version,
        type: "operations.advance_to_next_material_event",
        payload: { horizonDays: 90 },
        actor: "player",
      } as EngineCommandV10,
      { runId: "ai-boundary-test", now: "2026-08-20T00:00:00.000Z" },
      registry,
    ).state;
  }
  throw new Error("TEST_COMPETITOR_TURN_NOT_CREATED");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("V10.1 competitor strategy AI boundary", () => {
  it("uses deterministic authored policy when AI is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_COMPETITOR_STRATEGY_MODEL", "");
    const input = envelope();
    const result = await generateCompetitorStrategicPlanV10(input);

    expect(result.provider).toBe("authored");
    expect(result.fallbackReason).toBe("AI_NOT_CONFIGURED");
    expect(result.plan.firmId).toBe(input.firmId);
  });

  it("accepts only a schema-valid and engine-feasible structured plan", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_COMPETITOR_STRATEGY_MODEL", "pinned-test-model");
    const input = envelope();
    const plan = generateAuthoredCompetitorPlanV10(input);
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify(plan),
      usage: { input_tokens: 120, output_tokens: 80 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCompetitorStrategicPlanV10(input);

    expect(result.provider).toBe("openai");
    expect(result.model).toBe("pinned-test-model");
    expect(result.inputTokens).toBe(120);
    expect(result.plan).toEqual(plan);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.reasoning).toEqual({ effort: "none" });
    expect(request.text.verbosity).toBe("low");
  });

  it("rejects a forbidden target and falls back without applying model output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_COMPETITOR_STRATEGY_MODEL", "pinned-test-model");
    const input = envelope();
    const forbidden = generateAuthoredCompetitorPlanV10(input);
    forbidden.initiatives[0].target = { kind: "player_hidden_state", id: "cash" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(forbidden),
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const result = await generateCompetitorStrategicPlanV10(input);

    expect(result.provider).toBe("authored");
    expect(result.fallbackReason).toContain("COMPETITOR_PLAN_TARGET_FORBIDDEN");
    expect(result.plan.initiatives[0].target).not.toEqual(forbidden.initiatives[0].target);
  });

  it("falls back immediately after provider failure", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_COMPETITOR_STRATEGY_MODEL", "pinned-test-model");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("PROVIDER_OUTAGE");
    }));

    const result = await generateCompetitorStrategicPlanV10(envelope());

    expect(result.provider).toBe("authored");
    expect(result.fallbackReason).toBe("PROVIDER_OUTAGE");
  });
});
