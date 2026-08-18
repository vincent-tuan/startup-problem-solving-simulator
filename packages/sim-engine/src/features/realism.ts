import type { SimulationState } from "../types";

export const REALISM_SCENARIO_VERSION = "2.1.0";

export function realism85Enabled(state: SimulationState) {
  return state.schemaVersion === 3 && state.scenarioVersion.endsWith(`@${REALISM_SCENARIO_VERSION}`);
}
