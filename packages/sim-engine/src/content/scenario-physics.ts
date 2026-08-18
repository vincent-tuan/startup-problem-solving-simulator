import type { ScenarioDefinition } from "../types";

export type ScenarioPhysics = NonNullable<ScenarioDefinition["simulation"]>;

export function scenarioPhysics(scenario: ScenarioDefinition): ScenarioPhysics {
  if (scenario.simulation) return scenario.simulation;
  return {
    jurisdictionArchetype: scenario.id === "legacy-v6-free-setup" ? "legacy" : "sea_like",
    maxDays: 540, defaultPrice: 120, onboardingCost: 40, variableCostRate: 0.18, collectionDelayDays: 30, supportHoursPerAccount: 4,
    pressureProfile: "integration",
    segments: [{ id: "early_adopters", label: "Reachable early adopters", urgency: 55, willingnessToPay: 160, switchingFriction: 45, budgetCycleDays: 30, adoptionRisk: 45, reachableAccounts: 80, responseRate: 0.18, baseMonthlyChurn: 0.09 }],
    capabilities: [
      { id: "core_workflow", label: "Narrow core workflow", kind: "core", dependencies: [], effort: 10 },
      { id: "reliable_delivery", label: "Reliable delivery", kind: "reliability", dependencies: ["core_workflow"], effort: 14 },
      { id: "safe_data", label: "Safe data handling", kind: "security", dependencies: ["core_workflow"], effort: 16 },
    ],
  };
}
