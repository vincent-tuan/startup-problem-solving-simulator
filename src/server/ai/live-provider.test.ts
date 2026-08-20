import { describe, expect, it } from "vitest";
import {
  applyCommandV10,
  createInitialStateV10,
  createProductionFeatureConfigV10_1,
  createProductionFeatureRegistryV10_1,
  pendingCompetitorDecisionEnvelopeV10,
  type CompetitorDecisionEnvelopeV10,
  type EngineCommandV10,
} from "@sim/engine";
import { generateCompetitorStrategicPlanV10 } from "./competitor-strategy";
import { openAiEndpoint } from "./openai-endpoint";

const describeLive = process.env.RUN_LIVE_AI === "1" ? describe : describe.skip;

function createLiveEnvelope(): CompetitorDecisionEnvelopeV10 {
  const registry = createProductionFeatureRegistryV10_1();
  let state = createInitialStateV10(
    {
      scenarioVersionId: "local-services-saas@3.1.0",
      setup: {
        companyName: "Live Provider Boundary Test",
        founderProfileId: "commercial_hunter",
      },
    },
    {
      now: "2026-08-20T00:00:00.000Z",
      seed: 95_035,
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
        commandId: `9503539a-0000-4000-8000-${String(step + 1).padStart(12, "0")}`,
        expectedVersion: state.kernel.version,
        type: "operations.advance_to_next_material_event",
        payload: { horizonDays: 90 },
        actor: "player",
      } as EngineCommandV10,
      {
        runId: "live-provider-boundary-test",
        now: "2026-08-20T00:00:00.000Z",
      },
      registry,
    ).state;
  }
  throw new Error("LIVE_TEST_COMPETITOR_TURN_NOT_CREATED");
}

describeLive("live OpenAI-compatible provider", () => {
  it(
    "returns a schema-valid and engine-feasible competitor portfolio",
    async () => {
      expect(process.env.OPENAI_API_KEY).toBeTruthy();
      expect(process.env.OPENAI_COMPETITOR_STRATEGY_MODEL).toBeTruthy();
      expect(openAiEndpoint("responses")).toMatch(/^https:\/\//);

      const input = createLiveEnvelope();
      const result = await generateCompetitorStrategicPlanV10(input, {
        timeoutMs: Number(process.env.OPENAI_LIVE_TEST_TIMEOUT_MS ?? 90_000),
      });

      console.info(
        JSON.stringify({
          provider: result.provider,
          model: result.model,
          latencyMs: result.latencyMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          initiatives: result.plan.initiatives.length,
          fallbackReason: result.fallbackReason,
        }),
      );

      expect(result.provider, result.fallbackReason ?? undefined).toBe("openai");
      expect(result.fallbackReason).toBeNull();
      expect(result.plan.firmId).toBe(input.firmId);
      expect(result.plan.planningCycleId).toBe(input.planningCycleId);
      expect(result.plan.initiatives.length).toBeGreaterThanOrEqual(1);
      expect(result.plan.initiatives.length).toBeLessThanOrEqual(4);
    },
    100_000,
  );
});
