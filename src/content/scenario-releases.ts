import { z } from "zod";
import {
  stateChecksum,
  type ScenarioDefinition,
} from "@sim/engine";
import releaseManifestJson from "../../content/scenario-releases.json";

const evidenceReferenceSchema = z.object({
  path: z.string().regex(/^reports\/scenarios\/[a-z0-9-]+\/3\.3\.0\/[a-z0-9-]+\.json$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const scenarioReleaseRecordSchema = z
  .object({
    scenarioVersionId: z.string().regex(/^[a-z0-9-]+@\d+\.\d+\.\d+$/),
    status: z.enum(["draft", "published", "deprecated"]),
    engineVersion: z.string().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{16}$/),
    calibrationReport: evidenceReferenceSchema.nullable(),
    realismReport: evidenceReferenceSchema.nullable(),
    expertSignoff: evidenceReferenceSchema.nullable(),
    realismScore: z.number().min(0).max(100).nullable(),
    reviewerSignoffIds: z.array(z.string().min(3)).max(16),
    publishedAt: z.iso.datetime().nullable(),
  })
  .superRefine((record, context) => {
    if (record.status !== "published") return;
    if (!record.calibrationReport)
      context.addIssue({ code: "custom", message: "Published scenario requires calibration evidence." });
    if (!record.realismReport || (record.realismScore ?? 0) < 85)
      context.addIssue({ code: "custom", message: "Published scenario requires a passing realism report." });
    if (!record.expertSignoff || record.reviewerSignoffIds.length < 4)
      context.addIssue({ code: "custom", message: "Published scenario requires at least four reviewer sign-offs." });
    if (!record.publishedAt)
      context.addIssue({ code: "custom", message: "Published scenario requires a publication timestamp." });
  });

const scenarioReleaseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  records: z.array(scenarioReleaseRecordSchema).min(1),
});

export type ScenarioReleaseRecord = z.infer<typeof scenarioReleaseRecordSchema>;

const parsedManifest = scenarioReleaseManifestSchema.parse(releaseManifestJson);
export const scenarioReleaseRecords: ScenarioReleaseRecord[] = parsedManifest.records;

export function scenarioReleaseContentHash(scenario: ScenarioDefinition): string {
  const immutableContent = Object.fromEntries(Object.entries(scenario).filter(([key]) => key !== "status"));
  return stateChecksum(immutableContent);
}

export function getScenarioReleaseRecord(scenarioVersionId: string): ScenarioReleaseRecord | undefined {
  return scenarioReleaseRecords.find((record) => record.scenarioVersionId === scenarioVersionId);
}

export function assertScenarioVersionTransition(
  existing: ScenarioDefinition,
  next: ScenarioDefinition,
): void {
  const existingVersionId = `${existing.id}@${existing.version}`;
  const nextVersionId = `${next.id}@${next.version}`;
  if (existingVersionId !== nextVersionId)
    throw new Error(`SCENARIO_VERSION_ID_MISMATCH:${existingVersionId}:${nextVersionId}`);
  if (scenarioReleaseContentHash(existing) !== scenarioReleaseContentHash(next))
    throw new Error(`SCENARIO_VERSION_IMMUTABLE_CONTENT_CHANGED:${nextVersionId}`);
  if (existing.status === next.status) return;
  const allowed =
    (existing.status === "draft" && ["published", "deprecated"].includes(next.status)) ||
    (existing.status === "published" && next.status === "deprecated");
  if (!allowed)
    throw new Error(`SCENARIO_RELEASE_STATUS_REGRESSION:${nextVersionId}:${existing.status}:${next.status}`);
}

export function assertScenarioReleaseCatalog(scenarios: ScenarioDefinition[]): void {
  const scenariosByVersion = new Map(scenarios.map((scenario) => [`${scenario.id}@${scenario.version}`, scenario]));
  const seen = new Set<string>();
  for (const record of scenarioReleaseRecords) {
    if (seen.has(record.scenarioVersionId))
      throw new Error(`DUPLICATE_SCENARIO_RELEASE_RECORD:${record.scenarioVersionId}`);
    seen.add(record.scenarioVersionId);
    const scenario = scenariosByVersion.get(record.scenarioVersionId);
    if (!scenario) throw new Error(`SCENARIO_RELEASE_TARGET_MISSING:${record.scenarioVersionId}`);
    if (scenario.status !== record.status)
      throw new Error(`SCENARIO_RELEASE_STATUS_MISMATCH:${record.scenarioVersionId}`);
    const actualHash = scenarioReleaseContentHash(scenario);
    if (actualHash !== record.contentHash)
      throw new Error(`SCENARIO_RELEASE_HASH_MISMATCH:${record.scenarioVersionId}:${actualHash}`);
  }
}
