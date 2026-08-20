import { fileURLToPath } from "node:url";
import { scenarios } from "../src/content/scenarios";
import {
  scenarioReleaseRecords,
  scenarioReleaseContentHash,
} from "../src/content/scenario-releases";
import { parseArgument, verifyScenarioPromotion } from "./scenario-release-lib";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const promotionTarget = parseArgument("promotion");
const scenariosByVersion = new Map(scenarios.map((scenario) => [`${scenario.id}@${scenario.version}`, scenario]));

for (const record of scenarioReleaseRecords) {
  const scenario = scenariosByVersion.get(record.scenarioVersionId);
  if (!scenario) throw new Error(`SCENARIO_RELEASE_TARGET_MISSING:${record.scenarioVersionId}`);
  if (scenario.status !== record.status)
    throw new Error(`SCENARIO_RELEASE_STATUS_MISMATCH:${record.scenarioVersionId}`);
  if (scenarioReleaseContentHash(scenario) !== record.contentHash)
    throw new Error(`SCENARIO_RELEASE_HASH_MISMATCH:${record.scenarioVersionId}`);
  if (record.status === "published" || promotionTarget === record.scenarioVersionId) {
    const result = await verifyScenarioPromotion(workspaceRoot, scenario, record);
    console.log(`${record.scenarioVersionId}\tpromotion-ready\t${result.contentHash}`);
  } else {
    console.log(`${record.scenarioVersionId}\tdraft-locked\t${record.contentHash}`);
  }
}

if (promotionTarget && !scenarioReleaseRecords.some((record) => record.scenarioVersionId === promotionTarget))
  throw new Error(`SCENARIO_RELEASE_RECORD_NOT_FOUND:${promotionTarget}`);
