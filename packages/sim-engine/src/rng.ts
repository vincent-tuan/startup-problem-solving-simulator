import type { SimulationState } from "./types";

export function random(state: SimulationState): number {
  let value = state.rng.state || 0x6d2b79f5;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rng.state = value >>> 0;
  state.rng.draws += 1;
  return state.rng.state / 0x1_0000_0000;
}

export function randomBetween(state: SimulationState, min: number, max: number): number {
  return min + random(state) * (max - min);
}
