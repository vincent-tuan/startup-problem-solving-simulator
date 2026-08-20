import { execFileSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { scenarioDefinitionSchema } from "@sim/engine";
import {
  scenarioReleaseRecordSchema,
  scenarioReleaseContentHash,
} from "../src/content/scenario-releases";
import {
  parseArgument,
  scenarioCalibrationReportSchema,
  scenarioExpertSignoffSchema,
  scenarioRealismReportSchema,
  sha256File,
  verifyScenarioPromotion,
} from "./scenario-release-lib";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const scenarioId = parseArgument("scenario");
const version = parseArgument("version");
if (!scenarioId || !version) throw new Error("USAGE: --scenario=<id> --version=<semver>");
const versionId = `${scenarioId}@${version}`;
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: workspaceRoot, encoding: "utf8" }).trim();
if (dirty) throw new Error("SCENARIO_PUBLISH_REQUIRES_CLEAN_WORKTREE");

const scenarioPath = path.join(workspaceRoot, "content", "scenarios", scenarioId, `${version}.json`);
const manifestPath = path.join(workspaceRoot, "content", "scenario-releases.json");
const reportDirectory = parseArgument("evidence") ?? `reports/scenarios/${scenarioId}/${version}`;
const calibrationPath = path.join(workspaceRoot, reportDirectory, "calibration.json");
const realismPath = path.join(workspaceRoot, reportDirectory, "realism.json");
const signoffPath = path.join(workspaceRoot, reportDirectory, "expert-signoff.json");

const scenario = scenarioDefinitionSchema.parse(JSON.parse(await readFile(scenarioPath, "utf8")));
if (scenario.status !== "draft") throw new Error(`SCENARIO_NOT_DRAFT:${versionId}`);
const calibration = scenarioCalibrationReportSchema.parse(JSON.parse(await readFile(calibrationPath, "utf8")));
const realism = scenarioRealismReportSchema.parse(JSON.parse(await readFile(realismPath, "utf8")));
const signoff = scenarioExpertSignoffSchema.parse(JSON.parse(await readFile(signoffPath, "utf8")));
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { schemaVersion: 1; records: unknown[] };
const index = manifest.records.findIndex((value) => (value as { scenarioVersionId?: string }).scenarioVersionId === versionId);
if (index < 0) throw new Error(`SCENARIO_RELEASE_RECORD_NOT_FOUND:${versionId}`);
const publishedAt = new Date().toISOString();
const relative = (filePath: string) => path.relative(workspaceRoot, filePath).replaceAll(path.sep, "/");
const candidate = scenarioReleaseRecordSchema.parse({
  ...(manifest.records[index] as object),
  status: "published",
  contentHash: scenarioReleaseContentHash(scenario),
  calibrationReport: { path: relative(calibrationPath), sha256: await sha256File(calibrationPath) },
  realismReport: { path: relative(realismPath), sha256: await sha256File(realismPath) },
  expertSignoff: { path: relative(signoffPath), sha256: await sha256File(signoffPath) },
  realismScore: realism.weightedScore,
  reviewerSignoffIds: signoff.reviewers.map((reviewer) => reviewer.reviewerId),
  publishedAt,
});
if (calibration.scenarioVersionId !== versionId) throw new Error("CALIBRATION_REPORT_TARGET_MISMATCH");
await verifyScenarioPromotion(workspaceRoot, scenario, candidate);

const nextScenario = { ...scenario, status: "published" as const };
manifest.records[index] = candidate;
const scenarioTemporary = `${scenarioPath}.publish-tmp`;
const manifestTemporary = `${manifestPath}.publish-tmp`;
await writeFile(scenarioTemporary, `${JSON.stringify(nextScenario, null, 2)}\n`, { flag: "wx" });
await writeFile(manifestTemporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
await rename(scenarioTemporary, scenarioPath);
await rename(manifestTemporary, manifestPath);
console.log(`${versionId}\tpublished\t${candidate.contentHash}\t${publishedAt}`);
