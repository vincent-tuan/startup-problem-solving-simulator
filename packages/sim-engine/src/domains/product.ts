import type { HistoryEvent, SimulationAction, SimulationState } from "../types";
import { clamp, round } from "../kernel/math";

type Emit = (type: HistoryEvent["type"], category: HistoryEvent["category"], summary: string, actor?: HistoryEvent["actor"]) => void;

export function completeProductWork(state: SimulationState, action: SimulationAction, quality: number, emit: Emit) {
  const capability = state.product.capabilities.find((item) => item.id === action.targetId);
  if (!capability) {
    const progress = 7 * quality; state.product.mvpProgress = clamp(state.product.mvpProgress + progress);
    state.product.quality = clamp(state.product.quality + progress * 0.35); state.product.rework = clamp(state.product.rework + Math.max(0, 0.72 - quality) * 10);
    action.result = `Product progress +${round(progress, 1)} points; quality reflected execution load.`; return;
  }
  const dependencyReady = capability.dependencies.every((id) => state.product.capabilities.find((item) => item.id === id)?.status === "released");
  const effectiveQuality = dependencyReady ? quality : quality * 0.58;
  capability.progress = 100; capability.quality = clamp(35 + effectiveQuality * 60); capability.status = "released";
  if (capability.kind === "reliability") state.product.reliability = clamp(state.product.reliability + 24 * effectiveQuality);
  if (capability.kind === "security") state.product.security = clamp(state.product.security + 26 * effectiveQuality);
  if (capability.kind === "compliance") state.product.compliance = clamp(state.product.compliance + 26 * effectiveQuality);
  if (capability.kind === "onboarding") state.product.usability = clamp(state.product.usability + 20 * effectiveQuality);
  if (capability.kind === "core" || capability.kind === "integration") state.product.mvpProgress = clamp(state.product.mvpProgress + 20 * effectiveQuality);
  state.product.technicalDebt = clamp(state.product.technicalDebt + (dependencyReady ? 2 : 14) + Math.max(0, 0.7 - quality) * 20);
  state.product.quality = clamp((state.product.reliability + state.product.usability + 100 - state.product.technicalDebt) / 3);
  action.result = `${capability.label} released at ${round(capability.quality)} quality; ${dependencyReady ? "dependencies were ready" : "missing dependencies created rework"}.`;
  emit("capability_released", "product", action.result, "system");
}

export function resolveIncident(state: SimulationState, incidentId: string, response: "contain" | "communicate" | "fix_root" | "accept_risk", emit: Emit) {
  const incident = state.product.incidents.find((item) => item.id === incidentId && item.status !== "resolved");
  if (!incident) throw new Error("INCIDENT_NOT_FOUND");
  if (response === "contain") { incident.status = "contained"; state.product.reliability = clamp(state.product.reliability + 4); }
  if (response === "communicate") { incident.status = "contained"; state.relationships.trust = clamp(state.relationships.trust + 3); }
  if (response === "fix_root") { incident.status = "resolved"; state.product.reliability = clamp(state.product.reliability + 12); state.product.technicalDebt = clamp(state.product.technicalDebt - 10); }
  if (response === "accept_risk") { state.product.technicalDebt = clamp(state.product.technicalDebt + 8); }
  emit(incident.status === "resolved" ? "incident_resolved" : "decision_recorded", "product", `${response.replaceAll("_", " ")} response recorded for ${incident.type} incident.`);
}
