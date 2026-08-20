import { z } from "zod";
import type {
  FeatureRuntimeContextV10,
  SimulationFeatureV10,
} from "./contracts";
import type { EmploymentRuleSetV10 } from "./jurisdiction-rules";
import type { WorkforceEconomicTransactionV10 } from "./finance-treasury";

const caseTypeSchema = z.enum([
  "expense_fraud",
  "falsified_work",
  "theft",
  "data_misuse",
  "credential_misuse",
  "ip_leakage",
  "negligent_security",
  "sabotage",
  "harassment_complaint",
  "discrimination_allegation",
  "conflict_of_interest",
  "retaliation",
  "privacy_complaint",
  "contractor_misclassification",
  "unpaid_wages",
  "unpaid_overtime",
  "leave_violation",
  "wrongful_termination",
  "employment_contract_dispute",
  "confidentiality_dispute",
  "invention_assignment_dispute",
]);
const caseStatusSchema = z.enum([
  "reported",
  "triaged",
  "investigating",
  "finding_ready",
  "remediating",
  "claim",
  "resolved",
]);
const findingSchema = z.enum([
  "pending",
  "substantiated",
  "inconclusive",
  "not_substantiated",
]);

const caseActionSchema = z.object({
  day: z.number().int().nonnegative(),
  action: z.string(),
  knownOutcome: z.string(),
});
const publicCaseSchema = z.object({
  id: z.string(),
  type: caseTypeSchema,
  subjectEmployeeId: z.string(),
  status: caseStatusSchema,
  reportedDay: z.number().int().nonnegative(),
  severitySignal: z.enum(["low", "material", "critical"]),
  allegation: z.string(),
  knownEvidence: z.array(z.string()).max(30),
  finding: findingSchema,
  proceduralDeadlineDay: z.number().int().nonnegative(),
  actions: z.array(caseActionSchema).max(50),
  reserveSignal: z.enum(["none", "possible", "material", "severe"]),
});
export type EmploymentCaseProjectionV10 = z.infer<typeof publicCaseSchema>;

export const employmentCasesPublicStateSchemaV10 = z.object({
  cases: z.array(publicCaseSchema).max(100),
  disclaimer: z.literal(
    "Employment-law simulation archetypes — not legal advice.",
  ),
  openCaseCount: z.number().int().nonnegative(),
});
export type EmploymentCasesPublicStateV10 = z.infer<
  typeof employmentCasesPublicStateSchemaV10
>;

const privateCaseSchema = z.object({
  caseId: z.string(),
  substantiatedTruth: z.boolean(),
  actualSeverity: z.number().min(0).max(1),
  claimRisk: z.number().min(0).max(1),
  retaliationRisk: z.number().min(0).max(1),
  evidenceQuality: z.number().min(0).max(1),
  preserved: z.boolean(),
  reported: z.boolean(),
  causalFactors: z.array(z.string()).max(20),
});
export const employmentCasesPrivateStateSchemaV10 = z.object({
  truth: z.record(z.string(), privateCaseSchema),
  nextCaseId: z.number().int().positive(),
  signalDelayMinDays: z.number().int().min(1).max(30),
  signalDelayMaxDays: z.number().int().min(2).max(60),
  resolvedArchive: z
    .array(
      z.object({
        caseId: z.string(),
        resolvedDay: z.number().int().nonnegative(),
        outcome: z.string(),
      }),
    )
    .max(200),
});
export type EmploymentCasesPrivateStateV10 = z.infer<
  typeof employmentCasesPrivateStateSchemaV10
>;

const configSchema = z
  .object({
    signalDelayMinDays: z.number().int().min(1).max(30).default(2),
    signalDelayMaxDays: z.number().int().min(2).max(60).default(10),
  })
  .default({ signalDelayMinDays: 2, signalDelayMaxDays: 10 });
type EmploymentContext = FeatureRuntimeContextV10<
  EmploymentCasesPublicStateV10,
  EmploymentCasesPrivateStateV10
>;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function rules(context: EmploymentContext): EmploymentRuleSetV10 {
  return context.query("jurisdiction-rules.employment") as EmploymentRuleSetV10;
}

function economic(
  context: EmploymentContext,
  transaction: WorkforceEconomicTransactionV10,
): void {
  context.emit({
    type: "employment-cases.economic_transaction_requested",
    sourceId: transaction.transactionId,
    payload: transaction,
  });
}

function caseView(
  context: EmploymentContext,
  caseId: string,
): EmploymentCaseProjectionV10 {
  const found = context.ownState.public.cases.find(
    (item) => item.id === caseId,
  );
  if (!found) throw new Error("EMPLOYMENT_CASE_NOT_FOUND");
  return found;
}

function updateCount(context: EmploymentContext): void {
  context.ownState.public.openCaseCount = context.ownState.public.cases.filter(
    (item) => item.status !== "resolved",
  ).length;
}

function allegation(type: z.infer<typeof caseTypeSchema>): string {
  const copy: Record<z.infer<typeof caseTypeSchema>, string> = {
    expense_fraud:
      "An expense pattern may not match documented business activity.",
    falsified_work:
      "A work record or delivery representation may not match the available evidence.",
    theft:
      "Company property or funds may have been taken outside an authorized business purpose.",
    data_misuse:
      "Access records suggest company or customer data may have been used outside its approved purpose.",
    credential_misuse:
      "A credential may have been shared or used outside its approved access boundary.",
    ip_leakage: "Confidential product material may have left approved systems.",
    negligent_security:
      "A security control appears to have been bypassed or ignored.",
    sabotage:
      "A deliberate change may have impaired a company system or operating process.",
    harassment_complaint:
      "A workplace-conduct complaint requires a fair, non-retaliatory review.",
    discrimination_allegation:
      "An employment decision is alleged to have been applied unfairly and requires an evidence-based review.",
    conflict_of_interest:
      "An undisclosed outside interest may conflict with company responsibilities.",
    retaliation:
      "A protected workplace report may have been followed by adverse treatment.",
    privacy_complaint:
      "Employee monitoring or personal-data handling may exceed the stated policy.",
    contractor_misclassification:
      "The working relationship may operate like employment despite contractor paperwork.",
    unpaid_wages:
      "Recorded working time and compensation obligations may not reconcile.",
    unpaid_overtime:
      "Recorded working time may create an overtime obligation that was not paid.",
    leave_violation:
      "A leave request or protected absence may not have followed the recorded procedure.",
    wrongful_termination:
      "The termination record may not support the stated process or reason.",
    employment_contract_dispute:
      "The parties disagree about a material employment or invention-assignment term.",
    confidentiality_dispute:
      "The parties disagree about the scope or enforcement of a confidentiality obligation.",
    invention_assignment_dispute:
      "The parties disagree about ownership of work created during the employment relationship.",
  };
  return copy[type];
}

function openHiddenExposure(
  context: EmploymentContext,
  input: {
    employeeId: string;
    type: z.infer<typeof caseTypeSchema>;
    severity: number;
    causalFactors: string[];
  },
  forceSignal = false,
): void {
  if (Object.keys(context.ownState.private.truth).length >= 100) return;
  const serial = context.ownState.private.nextCaseId++;
  const caseId = `employment-case-${serial}`;
  const severity = clamp(input.severity / 5, 0.1, 1);
  const substantiatedTruth =
    context.rng.nextFloat() < clamp(0.3 + severity * 0.45, 0.1, 0.9);
  context.ownState.private.truth[caseId] = {
    caseId,
    substantiatedTruth,
    actualSeverity: severity,
    claimRisk: clamp(
      0.12 +
        severity * 0.55 +
        rules(context).misclassificationSensitivity *
          (input.type === "contractor_misclassification" ? 0.2 : 0),
    ),
    retaliationRisk: clamp(0.08 + severity * 0.3),
    evidenceQuality: clamp(0.28 + context.rng.normal(0, 0.12)),
    preserved: false,
    reported: false,
    causalFactors: input.causalFactors,
  };
  const delayRange = Math.max(
    1,
    context.ownState.private.signalDelayMaxDays -
      context.ownState.private.signalDelayMinDays +
      1,
  );
  const delay = forceSignal
    ? 1
    : context.ownState.private.signalDelayMinDays +
      Math.floor(context.rng.nextFloat() * delayRange);
  context.schedule({
    type: "employment-cases.case_signal",
    dueDay: context.kernel.simulationDay + delay,
    sourceId: caseId,
    payload: { employeeId: input.employeeId, type: input.type },
    sampledOutcome: {
      reported: true,
      severitySignal:
        severity > 0.72 ? "critical" : severity > 0.38 ? "material" : "low",
    },
  });
}

export function createEmploymentCasesFeatureV10(): SimulationFeatureV10<
  EmploymentCasesPublicStateV10,
  EmploymentCasesPrivateStateV10,
  z.infer<typeof configSchema>
> {
  return {
    id: "employment-cases",
    version: "1.0.0",
    dependencies: [
      { id: "jurisdiction-rules", versionRange: "^1.0.0" },
      { id: "workforce-and-organization", versionRange: "^1.0.0" },
      { id: "finance-and-treasury", versionRange: "^1.0.0" },
    ],
    compatibleEngineRange: ">=10.0.0 <11.0.0",
    configSchema,
    publicStateSchema: employmentCasesPublicStateSchemaV10,
    privateStateSchema: employmentCasesPrivateStateSchemaV10,
    initialize: ({ config }) => ({
      public: {
        cases: [],
        disclaimer: "Employment-law simulation archetypes — not legal advice.",
        openCaseCount: 0,
      },
      private: {
        truth: {},
        nextCaseId: 1,
        signalDelayMinDays: Math.min(
          config.signalDelayMinDays,
          config.signalDelayMaxDays,
        ),
        signalDelayMaxDays: Math.max(
          config.signalDelayMinDays,
          config.signalDelayMaxDays,
        ),
        resolvedArchive: [],
      },
    }),
    commands: {
      "employment_case.triage": (context) => {
        if (context.command.type !== "employment_case.triage") return;
        const item = caseView(context, context.command.payload.caseId);
        if (item.status !== "reported")
          throw new Error("EMPLOYMENT_CASE_NOT_TRIAGEABLE");
        const truth = context.ownState.private.truth[item.id];
        const action = context.command.payload.action;
        item.status = "triaged";
        item.actions.push({
          day: context.kernel.simulationDay,
          action,
          knownOutcome:
            action === "preserve_evidence"
              ? "Relevant records were placed on hold."
              : "An interim control was recorded.",
        });
        if (action === "preserve_evidence") {
          truth.preserved = true;
          truth.evidenceQuality = clamp(truth.evidenceQuality + 0.18);
          item.knownEvidence.push("Relevant records preserved at triage.");
        }
        if (action === "monitor")
          truth.retaliationRisk = clamp(truth.retaliationRisk + 0.12);
        if (action === "limit_access" || action === "interim_leave") {
          context.emit({
            type: "employment-cases.interim_measure_requested",
            sourceId: item.id,
            payload: { employeeId: item.subjectEmployeeId, action },
          });
        }
        context.emit({
          type: "employment-cases.case_triaged",
          visibility: "public",
          sourceId: item.id,
          payload: { caseId: item.id, action },
        });
      },
      "employment_case.investigate": (context) => {
        if (context.command.type !== "employment_case.investigate") return;
        const item = caseView(context, context.command.payload.caseId);
        if (
          !(["reported", "triaged"] as const).includes(
            item.status as "reported" | "triaged",
          )
        )
          throw new Error("EMPLOYMENT_CASE_NOT_INVESTIGATABLE");
        const truth = context.ownState.private.truth[item.id];
        const approach = context.command.payload.approach;
        const quality =
          approach === "independent"
            ? 0.86
            : approach === "internal"
              ? 0.62
              : 0.5;
        const cost =
          approach === "independent"
            ? 1_800
            : approach === "mediation"
              ? 900
              : 250;
        const duration =
          approach === "independent"
            ? rules(context).investigationTargetDays
            : approach === "mediation"
              ? 10
              : 14;
        const effectiveQuality = clamp(
          quality + (truth.preserved ? 0.1 : -0.12),
        );
        const accurate = context.rng.nextFloat() < effectiveQuality;
        const finding = accurate
          ? truth.substantiatedTruth
            ? "substantiated"
            : "not_substantiated"
          : "inconclusive";
        item.status = "investigating";
        item.actions.push({
          day: context.kernel.simulationDay,
          action: `investigate:${approach}`,
          knownOutcome: `Expected completion in approximately ${duration} days.`,
        });
        context.schedule({
          type: "employment-cases.investigation_complete",
          dueDay: context.kernel.simulationDay + duration,
          sourceId: item.id,
          payload: { approach },
          sampledOutcome: { finding, evidenceGain: effectiveQuality },
        });
        economic(context, {
          transactionId: `investigation-${context.command.commandId}`,
          kind: "legal",
          amount: cost,
          memo: `${approach} employment investigation`,
          dueDay: context.kernel.simulationDay,
        });
        context.emit({
          type: "employment-cases.investigation_opened",
          visibility: "public",
          sourceId: item.id,
          payload: {
            caseId: item.id,
            approach,
            targetDay: context.kernel.simulationDay + duration,
          },
        });
      },
      "employment_case.respond": (context) => {
        if (context.command.type !== "employment_case.respond") return;
        const item = caseView(context, context.command.payload.caseId);
        if (!["finding_ready", "claim"].includes(item.status))
          throw new Error("EMPLOYMENT_CASE_RESPONSE_NOT_AVAILABLE");
        const truth = context.ownState.private.truth[item.id];
        const action = context.command.payload.action;
        item.actions.push({
          day: context.kernel.simulationDay,
          action,
          knownOutcome:
            "Response accepted; downstream consequences remain uncertain.",
        });
        if (["coaching", "warning", "reassign", "terminate"].includes(action)) {
          item.status = "remediating";
          context.emit({
            type: "employment-cases.remediation_requested",
            sourceId: item.id,
            payload: {
              caseId: item.id,
              employeeId: item.subjectEmployeeId,
              action,
            },
          });
          if (action === "terminate")
            context.emit({
              type: "employment-cases.termination_authorized",
              sourceId: item.id,
              payload: {
                caseId: item.id,
                employeeId: item.subjectEmployeeId,
                finding: item.finding,
              },
            });
          context.schedule({
            type: "employment-cases.remediation_complete",
            dueDay:
              context.kernel.simulationDay +
              (action === "coaching" ? 30 : action === "warning" ? 14 : 7),
            sourceId: item.id,
            payload: { action },
            sampledOutcome: { completed: true },
          });
        }
        if (action === "settle") {
          const amount = Math.round(1_000 + truth.actualSeverity * 12_000);
          economic(context, {
            transactionId: `settlement-${context.command.commandId}`,
            kind: "settlement",
            amount,
            memo: `Settlement for ${item.id}`,
            dueDay: context.kernel.simulationDay,
          });
          item.status = "resolved";
          item.reserveSignal = "none";
        } else if (action === "defend") {
          item.status = "claim";
          const adverse =
            context.rng.nextFloat() <
            clamp(truth.claimRisk + (truth.preserved ? -0.16 : 0.14));
          context.schedule({
            type: "employment-cases.claim_outcome",
            dueDay: context.kernel.simulationDay + 45,
            sourceId: item.id,
            payload: {},
            sampledOutcome: {
              adverse,
              amount: Math.round(2_500 + truth.actualSeverity * 22_000),
            },
          });
          economic(context, {
            transactionId: `defense-${context.command.commandId}`,
            kind: "legal",
            amount: 2_500,
            memo: `Initial defense cost for ${item.id}`,
            dueDay: context.kernel.simulationDay,
          });
        } else if (action === "notify") {
          truth.claimRisk = clamp(truth.claimRisk - 0.08);
          item.status = "remediating";
          context.schedule({
            type: "employment-cases.remediation_complete",
            dueDay: context.kernel.simulationDay + 7,
            sourceId: item.id,
            payload: { action },
            sampledOutcome: { completed: true },
          });
        } else if (action === "no_action") {
          truth.claimRisk = clamp(
            truth.claimRisk + (item.finding === "substantiated" ? 0.28 : 0.08),
          );
          const claim = context.rng.nextFloat() < truth.claimRisk;
          if (claim)
            context.schedule({
              type: "employment-cases.claim_filed",
              dueDay: context.kernel.simulationDay + 14,
              sourceId: item.id,
              payload: {},
              sampledOutcome: { filed: true },
            });
          else item.status = "resolved";
        }
        if (item.status === "resolved") {
          context.ownState.private.resolvedArchive.push({
            caseId: item.id,
            resolvedDay: context.kernel.simulationDay,
            outcome: action,
          });
          context.emit({
            type: "employment-cases.employment_case_resolved",
            visibility: "public",
            sourceId: item.id,
            payload: {
              caseId: item.id,
              employeeId: item.subjectEmployeeId,
              action,
            },
          });
        } else {
          context.emit({
            type: "employment-cases.remediation_applied",
            visibility: "public",
            sourceId: item.id,
            payload: { caseId: item.id, action },
          });
        }
        updateCount(context);
        return {
          checkpointRequired: ["terminate", "settle", "defend"].includes(
            action,
          ),
        };
      },
    },
    effects: {
      "employment-cases.case_signal": (context) => {
        const truth = context.ownState.private.truth[context.effect.sourceId];
        if (!truth || truth.reported) return;
        const payload = context.effect.payload as {
          employeeId: string;
          type: z.infer<typeof caseTypeSchema>;
        };
        const outcome = context.effect.sampledOutcome as {
          reported: boolean;
          severitySignal: EmploymentCaseProjectionV10["severitySignal"];
        };
        if (!outcome.reported) return;
        truth.reported = true;
        const jurisdiction = rules(context);
        context.ownState.public.cases.push({
          id: truth.caseId,
          type: payload.type,
          subjectEmployeeId: payload.employeeId,
          status: "reported",
          reportedDay: context.kernel.simulationDay,
          severitySignal: outcome.severitySignal,
          allegation: allegation(payload.type),
          knownEvidence: [
            "A report or observable control signal exists; underlying truth remains unknown.",
          ],
          finding: "pending",
          proceduralDeadlineDay:
            context.kernel.simulationDay + jurisdiction.investigationTargetDays,
          actions: [],
          reserveSignal:
            truth.claimRisk > 0.68
              ? "severe"
              : truth.claimRisk > 0.4
                ? "material"
                : "possible",
        });
        updateCount(context);
        context.emit({
          type: "employment-cases.misconduct_reported",
          visibility: "public",
          sourceId: truth.caseId,
          payload: {
            caseId: truth.caseId,
            type: payload.type,
            employeeId: payload.employeeId,
            severitySignal: outcome.severitySignal,
          },
        });
      },
      "employment-cases.investigation_complete": (context) => {
        const item = context.ownState.public.cases.find(
          (candidate) =>
            candidate.id === context.effect.sourceId &&
            candidate.status === "investigating",
        );
        if (!item) return;
        const outcome = context.effect.sampledOutcome as {
          finding: EmploymentCaseProjectionV10["finding"];
          evidenceGain: number;
        };
        item.finding = outcome.finding;
        item.status = "finding_ready";
        item.knownEvidence.push(
          outcome.finding === "inconclusive"
            ? "The investigation produced conflicting evidence."
            : `The investigation recorded a ${outcome.finding.replaceAll("_", " ")} finding.`,
        );
        context.emit({
          type: "employment-cases.finding_recorded",
          visibility: "public",
          sourceId: item.id,
          payload: { caseId: item.id, finding: item.finding },
        });
      },
      "employment-cases.claim_filed": (context) => {
        const item = context.ownState.public.cases.find(
          (candidate) => candidate.id === context.effect.sourceId,
        );
        if (!item || item.status === "resolved") return;
        item.status = "claim";
        item.reserveSignal = "severe";
        context.emit({
          type: "employment-cases.employment_claim_filed",
          visibility: "public",
          sourceId: item.id,
          payload: {
            caseId: item.id,
            claimWindowDays: rules(context).claimWindowDays,
          },
        });
        updateCount(context);
      },
      "employment-cases.claim_outcome": (context) => {
        const item = context.ownState.public.cases.find(
          (candidate) =>
            candidate.id === context.effect.sourceId &&
            candidate.status === "claim",
        );
        if (!item) return;
        const outcome = context.effect.sampledOutcome as {
          adverse: boolean;
          amount: number;
        };
        if (outcome.adverse)
          economic(context, {
            transactionId: `claim-${item.id}-${context.kernel.simulationDay}`,
            kind: "settlement",
            amount: outcome.amount,
            memo: `Adverse employment-case outcome for ${item.id}`,
            dueDay: context.kernel.simulationDay,
          });
        item.status = "resolved";
        item.reserveSignal = "none";
        context.ownState.private.resolvedArchive.push({
          caseId: item.id,
          resolvedDay: context.kernel.simulationDay,
          outcome: outcome.adverse ? "adverse" : "defended",
        });
        context.emit({
          type: "employment-cases.employment_case_resolved",
          visibility: "public",
          sourceId: item.id,
          payload: {
            caseId: item.id,
            employeeId: item.subjectEmployeeId,
            outcome: outcome.adverse ? "adverse" : "defended",
          },
        });
        updateCount(context);
      },
      "employment-cases.remediation_complete": (context) => {
        const item = context.ownState.public.cases.find(
          (candidate) =>
            candidate.id === context.effect.sourceId &&
            candidate.status === "remediating",
        );
        if (!item) return;
        const action =
          (context.effect.payload as { action?: string }).action ??
          "remediation";
        item.status = "resolved";
        item.reserveSignal = "none";
        item.actions.push({
          day: context.kernel.simulationDay,
          action: `${action}:completed`,
          knownOutcome: "The recorded remediation process reached completion.",
        });
        context.ownState.private.resolvedArchive.push({
          caseId: item.id,
          resolvedDay: context.kernel.simulationDay,
          outcome: action,
        });
        context.emit({
          type: "employment-cases.employment_case_resolved",
          visibility: "public",
          sourceId: item.id,
          payload: {
            caseId: item.id,
            employeeId: item.subjectEmployeeId,
            outcome: action,
          },
        });
        updateCount(context);
      },
    },
    queries: [
      {
        id: "employment-cases.open-summary",
        resolve: ({ ownState }) => ({
          openCaseCount: ownState.public.openCaseCount,
          materialCases: ownState.public.cases.filter(
            (item) =>
              item.status !== "resolved" &&
              ["material", "critical"].includes(item.severitySignal),
          ).length,
        }),
      },
    ],
    eventSubscriptions: [
      {
        id: "employment-cases-from-workforce-exposures",
        eventType: "workforce-and-organization.exposure_detected",
        handle: (context, event) => {
          const payload = event.payload as {
            employeeId: string;
            type: z.infer<typeof caseTypeSchema>;
            severity: number;
            causalFactors: string[];
          };
          openHiddenExposure(context, payload);
        },
      },
      {
        id: "employment-cases-from-undocumented-termination",
        eventType: "workforce-and-organization.termination_requested",
        handle: (context, event) => {
          const payload = event.payload as {
            employeeId: string;
            documented: boolean;
            reason: string;
          };
          if (!payload.documented)
            openHiddenExposure(
              context,
              {
                employeeId: payload.employeeId,
                type: "wrongful_termination",
                severity: 4,
                causalFactors: [
                  "insufficient_documentation",
                  `termination_reason:${payload.reason}`,
                ],
              },
              true,
            );
        },
      },
    ],
    hooks: {
      after_period_close: (context) => {
        for (const item of context.ownState.public.cases.filter(
          (candidate) =>
            candidate.status !== "resolved" &&
            candidate.proceduralDeadlineDay < context.kernel.simulationDay,
        )) {
          const truth = context.ownState.private.truth[item.id];
          truth.claimRisk = clamp(truth.claimRisk + 0.12);
          truth.retaliationRisk = clamp(truth.retaliationRisk + 0.06);
          item.reserveSignal = truth.claimRisk > 0.7 ? "severe" : "material";
          item.actions.push({
            day: context.kernel.simulationDay,
            action: "deadline_missed",
            knownOutcome: "Procedural delay increased dispute exposure.",
          });
        }
      },
    },
    invariants: [
      {
        id: "employment-case-identities-and-truth-match",
        check: ({ ownState }) => {
          const ids = ownState.public.cases.map((item) => item.id);
          if (new Set(ids).size !== ids.length)
            throw new Error("DUPLICATE_EMPLOYMENT_CASE");
          for (const item of ownState.public.cases)
            if (!ownState.private.truth[item.id])
              throw new Error(`EMPLOYMENT_CASE_TRUTH_MISSING:${item.id}`);
        },
      },
      {
        id: "employment-case-count-reconciles",
        check: ({ ownState }) => {
          const expected = ownState.public.cases.filter(
            (item) => item.status !== "resolved",
          ).length;
          if (expected !== ownState.public.openCaseCount)
            throw new Error("EMPLOYMENT_CASE_COUNT_MISMATCH");
        },
      },
    ],
    projectionPolicy: {
      schema: employmentCasesPublicStateSchemaV10,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: [
        "substantiatedTruth",
        "actualSeverity",
        "claimRisk",
        "retaliationRisk",
        "evidenceQuality",
        "causalFactors",
        "private",
        "probability",
      ],
    },
    snapshotPolicy: {
      mode: "every_material_command",
      maximumCommandsBetweenSnapshots: 20,
    },
    retentionPolicy: {
      maximumHeadBytes: 1_500_000,
      maximumMaterialRecords: 500,
      archiveClosedRecords: true,
    },
  };
}
