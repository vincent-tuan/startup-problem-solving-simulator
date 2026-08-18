import { scenarios, scenarioContentHash } from "../src/content/scenarios";

const ids = new Set<string>();
for (const scenario of scenarios) {
  const versionId = `${scenario.id}@${scenario.version}`;
  if (ids.has(versionId)) throw new Error(`Duplicate scenario version: ${versionId}`);
  ids.add(versionId);
  console.log(`${versionId}\t${scenarioContentHash(scenario)}\t${scenario.status}${scenario.hidden ? " (hidden)" : ""}`);
}

console.log(`Validated ${scenarios.length} scenario versions.`);
