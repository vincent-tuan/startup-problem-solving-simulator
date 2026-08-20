import { z } from "zod";
import type { SimulationFeatureV10 } from "./contracts";

export const employmentJurisdictionSchemaV10 = z.enum([
  "us_like",
  "eu_like",
  "sea_like",
]);
export type EmploymentJurisdictionV10 = z.infer<
  typeof employmentJurisdictionSchemaV10
>;

export const employmentRuleSetSchemaV10 = z.object({
  archetype: employmentJurisdictionSchemaV10,
  version: z.literal("1.0.0"),
  employeeNoticeDays: z.number().int().min(0).max(120),
  contractorNoticeDays: z.number().int().min(0).max(90),
  probationDays: z.number().int().min(0).max(365),
  severanceWeeksPerYear: z.number().min(0).max(8),
  employerPayrollTaxRate: z.number().min(0).max(0.5),
  benefitsRate: z.number().min(0).max(0.6),
  investigationTargetDays: z.number().int().min(1).max(120),
  claimWindowDays: z.number().int().min(30).max(1_500),
  documentationRequired: z.boolean(),
  consultationRequiredForLayoff: z.boolean(),
  privacySensitivity: z.number().min(0).max(1),
  misclassificationSensitivity: z.number().min(0).max(1),
});
export type EmploymentRuleSetV10 = z.infer<typeof employmentRuleSetSchemaV10>;

const publicStateSchema = z.object({
  archetype: employmentJurisdictionSchemaV10,
  version: z.literal("1.0.0"),
  label: z.string(),
  disclaimer: z.literal("Simulation archetype — not legal advice."),
  knownProcedures: z.array(z.string()).max(12),
});
export type JurisdictionPublicStateV10 = z.infer<typeof publicStateSchema>;

const privateStateSchema = z.object({ rules: employmentRuleSetSchemaV10 });
export type JurisdictionPrivateStateV10 = z.infer<typeof privateStateSchema>;

const CONFIG = z
  .object({ archetype: employmentJurisdictionSchemaV10.optional() })
  .default({});

const RULES: Record<EmploymentJurisdictionV10, EmploymentRuleSetV10> = {
  us_like: {
    archetype: "us_like",
    version: "1.0.0",
    employeeNoticeDays: 0,
    contractorNoticeDays: 7,
    probationDays: 90,
    severanceWeeksPerYear: 0.5,
    employerPayrollTaxRate: 0.115,
    benefitsRate: 0.14,
    investigationTargetDays: 14,
    claimWindowDays: 300,
    documentationRequired: true,
    consultationRequiredForLayoff: false,
    privacySensitivity: 0.55,
    misclassificationSensitivity: 0.75,
  },
  eu_like: {
    archetype: "eu_like",
    version: "1.0.0",
    employeeNoticeDays: 30,
    contractorNoticeDays: 14,
    probationDays: 180,
    severanceWeeksPerYear: 1.5,
    employerPayrollTaxRate: 0.24,
    benefitsRate: 0.22,
    investigationTargetDays: 21,
    claimWindowDays: 365,
    documentationRequired: true,
    consultationRequiredForLayoff: true,
    privacySensitivity: 0.95,
    misclassificationSensitivity: 0.9,
  },
  sea_like: {
    archetype: "sea_like",
    version: "1.0.0",
    employeeNoticeDays: 30,
    contractorNoticeDays: 14,
    probationDays: 60,
    severanceWeeksPerYear: 1,
    employerPayrollTaxRate: 0.12,
    benefitsRate: 0.1,
    investigationTargetDays: 21,
    claimWindowDays: 180,
    documentationRequired: true,
    consultationRequiredForLayoff: false,
    privacySensitivity: 0.7,
    misclassificationSensitivity: 0.7,
  },
};

function archetypeFromVersion(versionId: string): EmploymentJurisdictionV10 {
  const normalized = versionId.toLowerCase().replaceAll("-", "_");
  if (normalized.includes("eu_like")) return "eu_like";
  if (normalized.includes("us_like")) return "us_like";
  return "sea_like";
}

export function createJurisdictionRulesFeatureV10(): SimulationFeatureV10<
  JurisdictionPublicStateV10,
  JurisdictionPrivateStateV10,
  z.infer<typeof CONFIG>
> {
  return {
    id: "jurisdiction-rules",
    version: "1.0.0",
    dependencies: [],
    compatibleEngineRange: ">=10.0.0 <11.0.0",
    configSchema: CONFIG,
    publicStateSchema,
    privateStateSchema,
    initialize: ({ kernel, config }) => {
      const archetype =
        config.archetype ??
        archetypeFromVersion(kernel.jurisdictionRuleVersionId);
      const rules = structuredClone(RULES[archetype]);
      return {
        public: {
          archetype,
          version: "1.0.0",
          label: `${archetype.replaceAll("_", "-")} employment rules`,
          disclaimer: "Simulation archetype — not legal advice.",
          knownProcedures: [
            `Employee notice baseline: ${rules.employeeNoticeDays} days`,
            `Contractor notice baseline: ${rules.contractorNoticeDays} days`,
            `Probation window: ${rules.probationDays} days`,
            "Document performance and preserve case evidence before irreversible decisions.",
            rules.consultationRequiredForLayoff
              ? "Collective layoff consultation is modeled."
              : "Collective consultation is not a default requirement in this archetype.",
          ],
        },
        private: { rules },
      };
    },
    commands: {},
    effects: {},
    queries: [
      {
        id: "jurisdiction-rules.employment",
        resolve: ({ ownState }) => structuredClone(ownState.private.rules),
      },
    ],
    eventSubscriptions: [],
    invariants: [
      {
        id: "jurisdiction-rules-version-is-pinned",
        check: ({ ownState }) => {
          if (ownState.public.archetype !== ownState.private.rules.archetype)
            throw new Error("JURISDICTION_RULE_MISMATCH");
        },
      },
    ],
    projectionPolicy: {
      schema: publicStateSchema,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: ["rules", "claimProbability", "private"],
    },
    snapshotPolicy: {
      mode: "every_material_command",
      maximumCommandsBetweenSnapshots: 100,
    },
    retentionPolicy: {
      maximumHeadBytes: 100_000,
      maximumMaterialRecords: 24,
      archiveClosedRecords: true,
    },
  };
}
