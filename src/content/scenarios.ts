import aiWorkflowV1 from "../../content/scenarios/ai-workflow-automation/1.0.0.json";
import aiWorkflow from "../../content/scenarios/ai-workflow-automation/2.0.0.json";
import localServicesV1 from "../../content/scenarios/local-services-saas/1.0.0.json";
import localServices from "../../content/scenarios/local-services-saas/2.0.0.json";
import healthcareV1 from "../../content/scenarios/healthcare-operations/1.0.0.json";
import healthcare from "../../content/scenarios/healthcare-operations/2.0.0.json";
import aiWorkflowV10_3Artifact from "../../content/scenarios/ai-workflow-automation/3.3.0.json";
import localServicesV10_3Artifact from "../../content/scenarios/local-services-saas/3.3.0.json";
import healthcareV10_3Artifact from "../../content/scenarios/healthcare-operations/3.3.0.json";
import legacy from "../../content/scenarios/legacy-v6-free-setup/6.0.0.json";
import { scenarioDefinitionSchema, stateChecksum, type ScenarioDefinition } from "@sim/engine";
import { assertScenarioReleaseCatalog } from "./scenario-releases";

function workforceV10(source: typeof aiWorkflow, options: { jurisdiction: "us_like" | "eu_like" | "sea_like"; version?: "3.0.0" | "3.1.0" | "3.2.0" | "3.3.0"; competitiveWorld?: boolean; causalStress?: boolean; customerProcurement?: boolean }): ScenarioDefinition {
  return scenarioDefinitionSchema.parse({
    ...source,
    version: options.version ?? "3.0.0",
    status: "draft",
    difficultyLabel: "Maximum realism · V10",
    estimatedMinutes: 360,
    jurisdiction: options.jurisdiction,
    tags: [...new Set([...source.tags, "workforce actors", "employment risk", ...(options.competitiveWorld ? ["independent competitors", "shared market ecology"] : []), ...(options.causalStress ? ["causal stress", "credit covenants", "commercial disputes"] : []), ...(options.customerProcurement ? ["buying committees", "procurement workflows", "contract negotiation"] : [])])].slice(0, 12),
  });
}

const aiWorkflowV10 = workforceV10(aiWorkflow, { jurisdiction: "us_like" });
const localServicesV10 = workforceV10(localServices, { jurisdiction: "sea_like" });
const healthcareV10 = workforceV10(healthcare, { jurisdiction: "eu_like" });
const aiWorkflowV10_1 = workforceV10(aiWorkflow, { jurisdiction: "us_like", version: "3.1.0", competitiveWorld: true });
const localServicesV10_1 = workforceV10(localServices, { jurisdiction: "sea_like", version: "3.1.0", competitiveWorld: true });
const healthcareV10_1 = workforceV10(healthcare, { jurisdiction: "eu_like", version: "3.1.0", competitiveWorld: true });
const aiWorkflowV10_2 = workforceV10(aiWorkflow, { jurisdiction: "us_like", version: "3.2.0", competitiveWorld: true, causalStress: true });
const localServicesV10_2 = workforceV10(localServices, { jurisdiction: "sea_like", version: "3.2.0", competitiveWorld: true, causalStress: true });
const healthcareV10_2 = workforceV10(healthcare, { jurisdiction: "eu_like", version: "3.2.0", competitiveWorld: true, causalStress: true });
const aiWorkflowV10_3 = scenarioDefinitionSchema.parse(aiWorkflowV10_3Artifact);
const localServicesV10_3 = scenarioDefinitionSchema.parse(localServicesV10_3Artifact);
const healthcareV10_3 = scenarioDefinitionSchema.parse(healthcareV10_3Artifact);

const parsed = [
  aiWorkflowV1, aiWorkflow, aiWorkflowV10, aiWorkflowV10_1, aiWorkflowV10_2, aiWorkflowV10_3,
  localServicesV1, localServices, localServicesV10, localServicesV10_1, localServicesV10_2, localServicesV10_3,
  healthcareV1, healthcare, healthcareV10, healthcareV10_1, healthcareV10_2, healthcareV10_3,
  legacy,
].map((scenario) => scenarioDefinitionSchema.parse(scenario));

export const scenarios: ScenarioDefinition[] = parsed;
assertScenarioReleaseCatalog(scenarios);

export function getCatalogScenarios(includeDrafts = false): ScenarioDefinition[] {
  const allowed = parsed.filter((scenario) => !scenario.hidden && (scenario.status === "published" || (includeDrafts && scenario.status === "draft")));
  const latestById = new Map<string, ScenarioDefinition>();
  for (const scenario of allowed.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))) {
    if (!latestById.has(scenario.id)) latestById.set(scenario.id, scenario);
  }
  return [...latestById.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function getCatalogScenario(slugOrId: string, includeDrafts = false): ScenarioDefinition | undefined {
  return getCatalogScenarios(includeDrafts).find((scenario) => scenario.slug === slugOrId || scenario.id === slugOrId);
}

export const publicScenarios = getCatalogScenarios(true);

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
