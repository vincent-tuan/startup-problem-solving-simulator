import type { ClientSimulationState, MetricEstimate, SimulationState } from "../types";
import { clamp, clone, round } from "../kernel/math";
import { monthlyBurn } from "../domains/finance";

function estimate(value: number, uncertainty: number, confidenceScore: number): MetricEstimate {
  return {
    low: round(Math.max(0, value * (1 - uncertainty))), expected: round(Math.max(0, value)), high: round(Math.max(0, value * (1 + uncertainty))),
    confidence: confidenceScore >= 65 ? "high" : confidenceScore >= 35 ? "medium" : "low",
  };
}

export function projectState(state: SimulationState): ClientSimulationState {
  const visible = clone(state) as SimulationState & { hidden?: SimulationState["hidden"] };
  Reflect.deleteProperty(visible, "hidden");
  if (visible.features) visible.features = { versions: visible.features.versions, public: visible.features.public, private: {} };
  visible.stakeholders = visible.stakeholders.filter((stakeholder) => stakeholder.discovered !== false);
  const evidenceConfidence = clamp((state.evidence.quality + state.evidence.diversity + state.evidence.buyerClarity) / 3);
  const uncertainty = clamp(0.62 - evidenceConfidence / 160, 0.12, 0.58);
  const burn = monthlyBurn(state);
  const runway = burn <= 0 ? 24 : state.finance.companyCash / burn;
  const pipeline = state.market.accounts.filter((account) => ["qualified", "pilot", "negotiation"].includes(account.stage)).reduce((sum, account) => sum + account.expectedValue, 0);
  const customerScore = clamp(state.market.accounts.filter((account) => account.stage === "customer").length * 12 + state.evidence.budget * 0.35);
  const retentionScore = clamp((1 - state.market.monthlyChurn) * 70);
  const pmf = clamp(customerScore * 0.35 + retentionScore * 0.25 + state.product.quality * 0.2 + state.evidence.problem * 0.2);
  return {
    ...visible,
    features: visible.features ? { versions: visible.features.versions, public: visible.features.public } : undefined,
    forecasts: {
      runwayMonths: estimate(runway, Math.min(0.7, uncertainty + 0.08), evidenceConfidence),
      nextMonthCash: estimate(state.finance.companyCash - burn, uncertainty * 0.55, evidenceConfidence),
      pipelineRevenue: estimate(pipeline * Math.max(0.05, state.market.winRate), uncertainty, state.evidence.buyerClarity),
      pmfReadiness: estimate(pmf, uncertainty * 0.45, evidenceConfidence),
    },
  } as ClientSimulationState;
}
