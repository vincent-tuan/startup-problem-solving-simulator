import type { SimulationFeatureV10 } from "./contracts";
import {
  createEmploymentCasesFeatureV10,
  type EmploymentCasesPrivateStateV10,
  type EmploymentCasesPublicStateV10,
} from "./employment-cases";

type EmploymentCasesConfigV10_2 = { signalDelayMinDays: number; signalDelayMaxDays: number };

export function createEmploymentCasesFeatureV10_2(): SimulationFeatureV10<EmploymentCasesPublicStateV10, EmploymentCasesPrivateStateV10, EmploymentCasesConfigV10_2> {
  const base = createEmploymentCasesFeatureV10();
  return {
    ...base,
    version: "1.1.0",
    dependencies: base.dependencies.map((dependency) => dependency.id === "workforce-and-organization" ? { ...dependency, versionRange: "^1.1.0" } : dependency),
    compatibleEngineRange: ">=10.2.0 <11.0.0",
  };
}
