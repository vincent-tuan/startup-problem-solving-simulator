import aiWorkflowV1 from "../../content/scenarios/ai-workflow-automation/1.0.0.json";
import aiWorkflow from "../../content/scenarios/ai-workflow-automation/2.0.0.json";
import localServicesV1 from "../../content/scenarios/local-services-saas/1.0.0.json";
import localServices from "../../content/scenarios/local-services-saas/2.0.0.json";
import healthcareV1 from "../../content/scenarios/healthcare-operations/1.0.0.json";
import healthcare from "../../content/scenarios/healthcare-operations/2.0.0.json";
import legacy from "../../content/scenarios/legacy-v6-free-setup/6.0.0.json";
import { scenarioDefinitionSchema, stateChecksum, type ScenarioDefinition } from "@sim/engine";

const parsed = [aiWorkflowV1, aiWorkflow, localServicesV1, localServices, healthcareV1, healthcare, legacy].map((scenario) => scenarioDefinitionSchema.parse(scenario));

export const scenarios: ScenarioDefinition[] = parsed;
export const publicScenarios = [aiWorkflow, localServices, healthcare].map((scenario) => scenarioDefinitionSchema.parse(scenario));

export function getScenario(slugOrId: string, version?: string) {
  const matches = parsed.filter((scenario) => (scenario.slug === slugOrId || scenario.id === slugOrId) && (!version || scenario.version === version));
  return matches.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })).at(0);
}

export function scenarioVersionId(scenario: ScenarioDefinition) {
  return `${scenario.id}@${scenario.version}`;
}

export function scenarioContentHash(scenario: ScenarioDefinition) {
  return stateChecksum(scenario);
}
