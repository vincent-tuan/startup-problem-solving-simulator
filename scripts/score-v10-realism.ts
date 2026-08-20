import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { getScenario, scenarioVersionId } from "../src/content/scenarios";
import { getScenarioReleaseRecord } from "../src/content/scenario-releases";
import { parseArgument, scenarioRealismReportSchema } from "./scenario-release-lib";

const dimensions = [
  ["causal_fidelity", 18],
  ["accounting_treasury_capital", 14],
  ["customer_contract_revenue", 11],
  ["product_security_operations", 10],
  ["workforce_founder", 10],
  ["legal_regulatory_governance", 10],
  ["external_world", 12],
  ["information_asymmetry", 7],
  ["bounded_ai", 4],
  ["replay_calibration_anti_exploit", 4],
] as const;

const hardGateIds = [
  "accounting_reconciles",
  "cross_user_and_private_state_isolated",
  "material_events_have_exposure",
  "replay_checksum_matches",
  "ai_web_outage_non_blocking",
  "real_world_facts_have_citations",
  "simulated_behavior_labeled",
  "nonterminal_states_have_legal_command",
  "no_infinite_resource_exploit",
  "no_hidden_probability_or_recommendation",
] as const;

const assessmentSchema = z.object({
  dimensions: z.array(z.object({
    id: z.string(),
    score: z.number().min(0).max(100),
    evidence: z.array(z.string().min(3)).min(1),
  })).length(dimensions.length),
  hardGates: z.array(z.object({
    id: z.string(),
    passed: z.boolean(),
    evidence: z.string().min(3),
  })).length(hardGateIds.length),
});

const scenarioId = parseArgument("scenario");
const version = parseArgument("version") ?? "3.3.0";
const assessmentPath = parseArgument("assessment");
if (!scenarioId || !assessmentPath)
  throw new Error("USAGE: --scenario=<id> --version=3.3.0 --assessment=<path> [--output=<path>]");
const scenario = getScenario(scenarioId, version);
if (!scenario) throw new Error(`SCENARIO_NOT_FOUND:${scenarioId}@${version}`);
const versionId = scenarioVersionId(scenario);
const release = getScenarioReleaseRecord(versionId);
if (!release) throw new Error(`SCENARIO_RELEASE_RECORD_NOT_FOUND:${versionId}`);
const assessment = assessmentSchema.parse(JSON.parse(await readFile(assessmentPath, "utf8")));

const dimensionById = new Map(assessment.dimensions.map((item) => [item.id, item]));
const scoredDimensions = dimensions.map(([id, weight]) => {
  const assessmentDimension = dimensionById.get(id);
  if (!assessmentDimension) throw new Error(`REALISM_DIMENSION_MISSING:${id}`);
  return { id, weight, score: assessmentDimension.score, evidence: assessmentDimension.evidence };
});
if (dimensionById.size !== dimensions.length) throw new Error("REALISM_DIMENSION_UNKNOWN");
const hardGateById = new Map(assessment.hardGates.map((item) => [item.id, item]));
const scoredHardGates = hardGateIds.map((id) => {
  const gate = hardGateById.get(id);
  if (!gate) throw new Error(`REALISM_HARD_GATE_MISSING:${id}`);
  return { id, passed: gate.passed, evidence: gate.evidence };
});
if (hardGateById.size !== hardGateIds.length) throw new Error("REALISM_HARD_GATE_UNKNOWN");

const weightedScore = Number((scoredDimensions.reduce((sum, item) => sum + item.weight * item.score / 100, 0)).toFixed(2));
const passed = weightedScore >= 85 && scoredDimensions.every((item) => item.score >= 60) && scoredHardGates.every((gate) => gate.passed);
const report = scenarioRealismReportSchema.parse({
  schemaVersion: 1,
  scenarioVersionId: versionId,
  engineVersion: release.engineVersion,
  contentHash: release.contentHash,
  generatedAt: new Date().toISOString(),
  weightedScore,
  dimensions: scoredDimensions,
  hardGates: scoredHardGates,
  passed,
});
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const output = parseArgument("output");
if (output) await writeFile(output, serialized, { flag: "wx" });
else process.stdout.write(serialized);
