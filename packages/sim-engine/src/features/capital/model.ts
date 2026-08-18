import type { SimulationState } from "../../types";

export type DebtStatus = "none" | "pending" | "available" | "active" | "frozen" | "rejected" | "defaulted" | "closed";
export type DebtFacility = {
  id: string | null; status: DebtStatus; requestedAmount: number; limit: number; balance: number;
  accruedInterest: number; apr: number; monthlyPayment: number; applicationDay: number | null;
  maturityDay: number | null; nextPaymentDay: number | null; minCashCovenant: number; maxDebtToMrr: number;
  covenantBreaches: number; delinquencyCount: number; frozen: boolean; personalGuarantee: boolean; cooldownUntilDay: number;
};
export type EquityOffer = {
  amount: number; dilution: number; expiresDay: number;
  investorType: "angel" | "accelerator" | "seed_fund" | "strategic"; liquidationPreference: number;
};
export type CapitalHistoryItem = { day: number; kind: "equity" | "debt"; amount: number };
export type CapitalPublicState = {
  mode: "scarce";
  debt: DebtFacility;
  equity: {
    status: "none" | "preparing" | "diligence" | "term_sheet";
    offer: EquityOffer | null; cooldownUntilDay: number; attempts: number; history: CapitalHistoryItem[];
  };
};
export type CapitalPrivateState = { creditAppetite: number; equityAppetite: number; riskSpread: number };

export function boundedSeed(seed: number, index: number, low: number, high: number) {
  let value = (seed ^ Math.imul(index + 101, 0x9e3779b9)) >>> 0 || 1;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return low + ((value >>> 0) / 4_294_967_296) * (high - low);
}
export function capitalPublic(state: SimulationState): CapitalPublicState {
  const value = state.features?.public["capital-and-governance"];
  if (!value) throw new Error("CAPITAL_FEATURE_STATE_MISSING");
  return value as CapitalPublicState;
}
export function capitalPrivate(state: SimulationState): CapitalPrivateState {
  const value = state.features?.private["capital-and-governance"];
  if (!value) throw new Error("CAPITAL_PRIVATE_STATE_MISSING");
  return value as CapitalPrivateState;
}
export function customerConcentration(state: SimulationState) {
  const values = state.market.accounts.filter((account) => account.stage === "customer").map((account) => Math.max(0, account.offeredPrice ?? 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? Math.max(...values, 0) / total : 1;
}
export function complianceExposure(state: SimulationState) {
  return state.risks.filter((risk) => ["legal", "compliance", "security"].includes(risk.domain) && risk.status !== "mitigated")
    .reduce((highest, risk) => Math.max(highest, risk.exposure), 0);
}
export function stageDebtCap(state: SimulationState) {
  if (state.stage === "discovery") return 2_500;
  if (state.stage === "validation") return 6_000;
  if (state.stage === "pilot") return 18_000;
  if (state.stage === "productization") return 50_000;
  return 120_000;
}
export function stageEquityCap(state: SimulationState) {
  if (state.stage === "discovery") return 100_000;
  if (state.stage === "validation") return 200_000;
  if (state.stage === "pilot") return 400_000;
  if (state.stage === "productization") return 800_000;
  return 1_500_000;
}
