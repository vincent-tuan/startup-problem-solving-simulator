import type { RandomSourceV10 } from "./contracts";
import { V10_DISTRIBUTION_VERSION, type RngStateV10 } from "./types";

const UINT32_RANGE = 0x1_0000_0000;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`NON_FINITE_RANDOM_VALUE:${label}`);
  return value;
}

export class SeededRngV10 implements RandomSourceV10 {
  private state: RngStateV10;

  constructor(input: number | RngStateV10) {
    const seed = typeof input === "number" ? input >>> 0 : input.state >>> 0;
    this.state = typeof input === "number"
      ? {
          algorithm: "xorshift32-v1",
          distributionVersion: V10_DISTRIBUTION_VERSION,
          state: seed || 0x6d2b79f5,
          draws: 0,
        }
      : {
          ...input,
          state: seed || 0x6d2b79f5,
        };
    if (this.state.algorithm !== "xorshift32-v1") throw new Error(`UNSUPPORTED_RNG:${this.state.algorithm}`);
    if (this.state.distributionVersion !== V10_DISTRIBUTION_VERSION) {
      throw new Error(`UNSUPPORTED_DISTRIBUTION_VERSION:${this.state.distributionVersion}`);
    }
  }

  nextFloat(): number {
    let value = this.state.state || 0x6d2b79f5;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state.state = value >>> 0;
    this.state.draws += 1;
    return this.state.state / UINT32_RANGE;
  }

  normal(mean = 0, standardDeviation = 1): number {
    if (standardDeviation < 0) throw new Error("NEGATIVE_STANDARD_DEVIATION");
    const u1 = Math.max(Number.EPSILON, this.nextFloat());
    const u2 = this.nextFloat();
    const standardNormal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return finite(mean + standardNormal * standardDeviation, "normal");
  }

  categorical<T extends string>(weights: Readonly<Record<T, number>>): T {
    const entries = Object.entries(weights) as Array<[T, number]>;
    if (entries.length === 0) throw new Error("EMPTY_CATEGORICAL_DISTRIBUTION");
    let total = 0;
    for (const [key, weight] of entries) {
      if (!Number.isFinite(weight) || weight < 0) throw new Error(`INVALID_CATEGORICAL_WEIGHT:${key}`);
      total += weight;
    }
    if (total <= 0) throw new Error("ZERO_CATEGORICAL_DISTRIBUTION");
    let cursor = this.nextFloat() * total;
    for (const [key, weight] of entries) {
      cursor -= weight;
      if (cursor <= 0) return key;
    }
    return entries.at(-1)![0];
  }

  correlated(commonLoading: number, idiosyncraticScale: number): number {
    const boundedLoading = Math.max(-1, Math.min(1, commonLoading));
    const idiosyncraticLoading = Math.sqrt(Math.max(0, 1 - boundedLoading ** 2));
    return this.normal() * boundedLoading + this.normal() * idiosyncraticLoading * idiosyncraticScale;
  }

  snapshot(): RngStateV10 {
    return { ...this.state };
  }
}
