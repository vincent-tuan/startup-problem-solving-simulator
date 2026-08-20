import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ScenarioDefinition } from "@sim/engine";
import {
  scenarioReleaseContentHash,
  type ScenarioReleaseRecord,
} from "../src/content/scenario-releases";

export const calibrationPolicySchema = z.enum([
  "structured_discovery",
  "champion_led",
  "procurement_first",
  "security_first",
  "paid_pilot_first",
  "price_concession",
  "delivery_protection",
  "liquidity_first",
  "capital_aggressive",
  "naive_growth",
  "adversarial",
]);

export const scenarioCalibrationReportSchema = z.object({
  schemaVersion: z.literal(1),
  scenarioVersionId: z.string(),
  engineVersion: z.string(),
  contentHash: z.string(),
  generatedAt: z.iso.datetime(),
  horizonDays: z.number().int().min(540),
  runsPerPolicy: z.number().int().positive(),
  policies: z.array(z.object({
    policy: calibrationPolicySchema,
    runs: z.number().int().positive(),
    terminalRate: z.number().min(0).max(1),
    healthyEndingRate: z.number().min(0).max(1),
    successfulCommercialPathRate: z.number().min(0).max(1),
    deadEndRate: z.number().min(0).max(1),
    invalidCommandRate: z.number().min(0).max(1),
    averageDecisionPoints: z.number().nonnegative(),
    averageSimulationDay: z.number().nonnegative(),
    replayMismatchCount: z.number().int().nonnegative(),
  })).min(7),
  gates: z.object({
    minimumRunsPerPolicy: z.boolean(),
    atLeastThreeViableStrategies: z.boolean(),
    noDominantStrategy: z.boolean(),
    dominantStrategyShare: z.number().min(0).max(1),
    zeroDeadEnds: z.boolean(),
    deterministicReplay: z.boolean(),
    exploitSuitePassed: z.boolean(),
    passed: z.boolean(),
  }),
});

export const scenarioRealismReportSchema = z.object({
  schemaVersion: z.literal(1),
  scenarioVersionId: z.string(),
  engineVersion: z.string(),
  contentHash: z.string(),
  generatedAt: z.iso.datetime(),
  weightedScore: z.number().min(0).max(100),
  dimensions: z.array(z.object({
    id: z.string().min(2),
    weight: z.number().positive(),
    score: z.number().min(0).max(100),
    evidence: z.array(z.string().min(3)).min(1),
  })).min(10),
  hardGates: z.array(z.object({
    id: z.string().min(2),
    passed: z.boolean(),
    evidence: z.string().min(3),
  })).min(10),
  passed: z.boolean(),
});

export const scenarioExpertSignoffSchema = z.object({
  schemaVersion: z.literal(1),
  scenarioVersionId: z.string(),
  engineVersion: z.string(),
  contentHash: z.string(),
  generatedAt: z.iso.datetime(),
  reviewers: z.array(z.object({
    reviewerId: z.string().min(3),
    role: z.enum([
      "founder_operator",
      "finance",
      "sales_procurement",
      "commercial_legal",
      "people_operations",
      "security_privacy",
      "healthcare_operations",
    ]),
    decision: z.enum(["approved", "rejected"]),
    signedAt: z.iso.datetime(),
    traceIds: z.array(z.string().min(3)).min(3),
    openBlockers: z.number().int().nonnegative(),
  })).min(4),
  passed: z.boolean(),
});

export type ScenarioCalibrationReport = z.infer<typeof scenarioCalibrationReportSchema>;
export type ScenarioRealismReport = z.infer<typeof scenarioRealismReportSchema>;
export type ScenarioExpertSignoff = z.infer<typeof scenarioExpertSignoffSchema>;
type ReviewerRole = ScenarioExpertSignoff["reviewers"][number]["role"];

export type ReleaseVerification = {
  scenarioVersionId: string;
  contentHash: string;
  promotionReady: boolean;
  checks: string[];
};

function ensureInsideWorkspace(workspaceRoot: string, relativePath: string): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`))
    throw new Error(`SCENARIO_EVIDENCE_PATH_OUTSIDE_WORKSPACE:${relativePath}`);
  return resolved;
}

export async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function loadEvidence<T>(
  workspaceRoot: string,
  reference: NonNullable<ScenarioReleaseRecord["calibrationReport"]>,
  schema: z.ZodType<T>,
): Promise<T> {
  const filePath = ensureInsideWorkspace(workspaceRoot, reference.path);
  const actualHash = await sha256File(filePath);
  if (actualHash !== reference.sha256)
    throw new Error(`SCENARIO_EVIDENCE_HASH_MISMATCH:${reference.path}`);
  return schema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

function assertReportIdentity(
  report: { scenarioVersionId: string; engineVersion: string; contentHash: string },
  record: ScenarioReleaseRecord,
): void {
  if (report.scenarioVersionId !== record.scenarioVersionId)
    throw new Error(`SCENARIO_EVIDENCE_VERSION_MISMATCH:${record.scenarioVersionId}`);
  if (report.engineVersion !== record.engineVersion)
    throw new Error(`SCENARIO_EVIDENCE_ENGINE_MISMATCH:${record.scenarioVersionId}`);
  if (report.contentHash !== record.contentHash)
    throw new Error(`SCENARIO_EVIDENCE_CONTENT_MISMATCH:${record.scenarioVersionId}`);
}

export async function verifyScenarioPromotion(
  workspaceRoot: string,
  scenario: ScenarioDefinition,
  record: ScenarioReleaseRecord,
): Promise<ReleaseVerification> {
  const versionId = `${scenario.id}@${scenario.version}`;
  if (record.scenarioVersionId !== versionId)
    throw new Error(`SCENARIO_RELEASE_TARGET_MISMATCH:${versionId}`);
  const contentHash = scenarioReleaseContentHash(scenario);
  if (record.contentHash !== contentHash)
    throw new Error(`SCENARIO_RELEASE_HASH_MISMATCH:${versionId}:${contentHash}`);
  if (!record.calibrationReport || !record.realismReport || !record.expertSignoff)
    throw new Error(`SCENARIO_RELEASE_EVIDENCE_INCOMPLETE:${versionId}`);

  const calibration = await loadEvidence(workspaceRoot, record.calibrationReport, scenarioCalibrationReportSchema);
  const realism = await loadEvidence(workspaceRoot, record.realismReport, scenarioRealismReportSchema);
  const signoff = await loadEvidence(workspaceRoot, record.expertSignoff, scenarioExpertSignoffSchema);
  assertReportIdentity(calibration, record);
  assertReportIdentity(realism, record);
  assertReportIdentity(signoff, record);

  if (calibration.runsPerPolicy < 10_000 || !calibration.gates.passed)
    throw new Error(`SCENARIO_CALIBRATION_GATE_FAILED:${versionId}`);
  if (calibration.policies.some((policy) => policy.runs < 10_000 || policy.deadEndRate > 0 || policy.replayMismatchCount > 0))
    throw new Error(`SCENARIO_CALIBRATION_POLICY_GATE_FAILED:${versionId}`);
  if (!realism.passed || realism.weightedScore < 85 || realism.hardGates.some((gate) => !gate.passed))
    throw new Error(`SCENARIO_REALISM_GATE_FAILED:${versionId}`);
  if (!signoff.passed || signoff.reviewers.some((reviewer) => reviewer.decision !== "approved" || reviewer.openBlockers > 0))
    throw new Error(`SCENARIO_EXPERT_SIGNOFF_FAILED:${versionId}`);

  const requiredRoles = new Set<ReviewerRole>(["founder_operator", "finance", "sales_procurement", "commercial_legal"]);
  if (scenario.id === "healthcare-operations") requiredRoles.add("healthcare_operations");
  const actualRoles = new Set(signoff.reviewers.map((reviewer) => reviewer.role));
  for (const role of requiredRoles)
    if (!actualRoles.has(role)) throw new Error(`SCENARIO_REVIEW_ROLE_MISSING:${versionId}:${role}`);

  return {
    scenarioVersionId: versionId,
    contentHash,
    promotionReady: true,
    checks: [
      "immutable-content-hash",
      "10000-runs-per-policy",
      "deterministic-replay",
      "zero-dead-ends",
      "realism-score-85",
      "hard-gates",
      "expert-signoff",
    ],
  };
}

export function parseArgument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}
