import { describe, expect, it } from "vitest";
import {
  assertScenarioVersionTransition,
  getScenarioReleaseRecord,
  scenarioReleaseContentHash,
  scenarioReleaseRecordSchema,
  scenarioReleaseRecords,
} from "./scenario-releases";
import { getCatalogScenarios, getScenario, publicScenarios } from "./scenarios";

describe("scenario release catalog", () => {
  it("pins every public V10.3 draft to an immutable release hash", () => {
    expect(publicScenarios).toHaveLength(3);
    for (const scenario of publicScenarios) {
      const versionId = `${scenario.id}@${scenario.version}`;
      const release = getScenarioReleaseRecord(versionId);
      expect(scenario.version).toBe("3.3.0");
      expect(scenario.status).toBe("draft");
      expect(release?.status).toBe("draft");
      expect(release?.contentHash).toBe(scenarioReleaseContentHash(scenario));
    }
    expect(scenarioReleaseRecords).toHaveLength(3);
  });

  it("keeps production catalogs on the latest published version until graduation", () => {
    expect(getCatalogScenarios(false).map((scenario) => scenario.version)).toEqual(["2.0.0", "2.0.0", "2.0.0"]);
    expect(getCatalogScenarios(true).map((scenario) => scenario.version)).toEqual(["3.3.0", "3.3.0", "3.3.0"]);
  });

  it("allows promotion without allowing immutable scenario content to change", () => {
    const draft = getScenario("ai-workflow-automation", "3.3.0")!;
    expect(() => assertScenarioVersionTransition(draft, { ...draft, status: "published" })).not.toThrow();
    expect(() => assertScenarioVersionTransition(draft, { ...draft, description: `${draft.description} changed` })).toThrow("SCENARIO_VERSION_IMMUTABLE_CONTENT_CHANGED");
    expect(() => assertScenarioVersionTransition({ ...draft, status: "published" }, draft)).toThrow("SCENARIO_RELEASE_STATUS_REGRESSION");
  });

  it("rejects published metadata without calibration, realism and expert evidence", () => {
    const draft = scenarioReleaseRecords[0];
    expect(() => scenarioReleaseRecordSchema.parse({
      ...draft,
      status: "published",
      publishedAt: "2026-08-20T00:00:00.000Z",
    })).toThrow();
  });
});
