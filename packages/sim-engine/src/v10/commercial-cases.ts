import { z } from "zod";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";
import type { EconomicTransactionV10_2 } from "./finance-treasury-v10-2";
import type { CommercialExposureV10_2 } from "./commercial-obligations";

const caseType = z.enum(["sla_service_credit", "breach_of_contract", "billing_dispute", "non_payment", "negligence", "security_privacy", "vendor_claim"]);
const caseSchema = z.object({
  id: z.string(), exposureId: z.string(), accountId: z.string(), type: caseType,
  status: z.enum(["notice", "triaged", "investigating", "negotiating", "claim", "resolved"]),
  openedDay: z.number().int().nonnegative(), proceduralDeadlineDay: z.number().int().nonnegative(),
  severitySignal: z.enum(["low", "material", "critical"]),
  knownEvidence: z.array(z.string()).max(30), actions: z.array(z.object({ day: z.number().int().nonnegative(), action: z.string(), knownOutcome: z.string() }).strict()).max(50),
  reserveSignal: z.enum(["none", "possible", "material", "severe"]), insurerStatus: z.enum(["not_notified", "notified", "coverage_review", "accepted", "denied"]),
}).strict();
export type CommercialCaseV10_2 = z.infer<typeof caseSchema>;

export const commercialCasesPublicStateSchemaV10_2 = z.object({
  cases: z.array(caseSchema).max(300), openCaseCount: z.number().int().nonnegative(),
  disclaimer: z.literal("Commercial-law simulation archetypes — not legal advice."),
}).strict();
export type CommercialCasesPublicStateV10_2 = z.infer<typeof commercialCasesPublicStateSchemaV10_2>;

const truthSchema = z.object({
  caseId: z.string(), actualSeverity: z.number().min(0).max(1), claimQuantile: z.number().min(0).max(1),
  defenseStrength: z.number().min(0).max(1), settlementFloor: z.number().finite().nonnegative(),
  evidencePreserved: z.boolean(), insurerCoverage: z.boolean(), insurerLimit: z.number().finite().nonnegative(), deductible: z.number().finite().nonnegative(),
});
const privateSchema = z.object({ truth: z.record(z.string(), truthSchema), exposureIds: z.array(z.string()).max(2_000), nextCaseId: z.number().int().positive() }).strict();
type PrivateState = z.infer<typeof privateSchema>;
const configSchema = z.object({ profile: z.enum(["ai_workflow", "local_services", "healthcare"]) }).default({ profile: "ai_workflow" });
type Context = FeatureRuntimeContextV10<CommercialCasesPublicStateV10_2, PrivateState>;
const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));
const round = (value: number): number => Math.round(value * 100) / 100;

function economic(context: Context, transaction: EconomicTransactionV10_2, caseId: string, exposureId: string): void {
  context.emit({ type: "commercial-cases.economic_transaction_requested", sourceId: transaction.transactionId, payload: transaction, causality: { exposureIds: [exposureId], obligationIds: [] } });
}

function findCase(context: Context, caseId: string): CommercialCaseV10_2 {
  const found = context.ownState.public.cases.find((item) => item.id === caseId);
  if (!found) throw new Error("COMMERCIAL_CASE_NOT_FOUND");
  return found;
}

function refresh(context: Context): void {
  context.ownState.public.openCaseCount = context.ownState.public.cases.filter((item) => item.status !== "resolved").length;
}

function openFromExposure(context: Context, exposure: CommercialExposureV10_2): void {
  if (context.ownState.private.exposureIds.includes(exposure.id)) return;
  context.ownState.private.exposureIds.push(exposure.id);
  const serial = context.ownState.private.nextCaseId++;
  const caseId = `commercial-case-${serial}`;
  const severity = exposure.severity === "critical" ? 0.82 : exposure.severity === "material" ? 0.58 : 0.3;
  const profile = context.ownState.private;
  const amountBase = exposure.severity === "critical" ? 8_000 : exposure.severity === "material" ? 2_500 : 500;
  profile.truth[caseId] = {
    caseId, actualSeverity: clamp(severity + context.rng.normal(0, 0.1)), claimQuantile: context.rng.nextFloat(),
    defenseStrength: clamp(0.48 + context.rng.normal(0, 0.14)), settlementFloor: round(amountBase * (0.7 + context.rng.nextFloat() * 0.8)),
    evidencePreserved: false, insurerCoverage: context.rng.nextFloat() > 0.35, insurerLimit: amountBase * 3, deductible: Math.max(250, amountBase * 0.1),
  };
  context.schedule({
    type: "commercial-cases.claim_notice", dueDay: context.kernel.simulationDay + (exposure.severity === "critical" ? 2 : 7), sourceId: caseId,
    payload: { caseId, exposure }, sampledOutcome: { noticeQuantile: context.rng.nextFloat() }, causality: { exposureIds: [exposure.id], obligationIds: [exposure.obligationId] },
  });
}

export function createCommercialCasesFeatureV10_2(): SimulationFeatureV10<CommercialCasesPublicStateV10_2, PrivateState, z.infer<typeof configSchema>> {
  return {
    id: "commercial-cases", version: "1.0.0",
    dependencies: [{ id: "commercial-obligations", versionRange: "^1.0.0" }, { id: "finance-and-treasury", versionRange: "^1.2.0" }],
    compatibleEngineRange: ">=10.2.0 <11.0.0", configSchema,
    publicStateSchema: commercialCasesPublicStateSchemaV10_2, privateStateSchema: privateSchema,
    initialize: () => ({ public: { cases: [], openCaseCount: 0, disclaimer: "Commercial-law simulation archetypes — not legal advice." }, private: { truth: {}, exposureIds: [], nextCaseId: 1 } }),
    commands: {
      "commercial_case.triage": (context) => {
        if (context.command.type !== "commercial_case.triage") return;
        const item = findCase(context, context.command.payload.caseId); const truth = context.ownState.private.truth[item.id];
        if (item.status === "resolved") throw new Error("COMMERCIAL_CASE_RESOLVED");
        item.status = "triaged";
        const action = context.command.payload.action;
        if (action === "preserve_evidence") { truth.evidencePreserved = true; truth.defenseStrength = clamp(truth.defenseStrength + 0.18); }
        if (action === "notify_insurer") {
          item.insurerStatus = "coverage_review";
          context.schedule({ type: "commercial-cases.insurance_review", dueDay: context.kernel.simulationDay + 10, sourceId: item.id, payload: { caseId: item.id }, causality: { exposureIds: [item.exposureId] } });
        }
        if (action === "limit_exposure") truth.actualSeverity = clamp(truth.actualSeverity - 0.12);
        item.actions.push({ day: context.kernel.simulationDay, action, knownOutcome: "Triage action recorded; downstream outcome remains unresolved." });
        economic(context, { transactionId: `case-triage:${item.id}:${context.command.commandId}`, kind: "expense", category: "legal", amount: action === "preserve_evidence" ? 180 : 90, memo: `Commercial case triage ${item.id}`, dueDay: context.kernel.simulationDay }, item.id, item.exposureId);
      },
      "commercial_case.investigate": (context) => {
        if (context.command.type !== "commercial_case.investigate") return;
        const item = findCase(context, context.command.payload.caseId);
        if (!['triaged', 'notice', 'claim'].includes(item.status)) throw new Error("COMMERCIAL_CASE_NOT_INVESTIGABLE");
        item.status = "investigating";
        const cost = context.command.payload.approach === "independent" ? 1_500 : context.command.payload.approach === "mediation" ? 800 : 350;
        economic(context, { transactionId: `case-investigation:${item.id}:${context.command.commandId}`, kind: "expense", category: "legal", amount: cost, memo: `${context.command.payload.approach} investigation for ${item.id}`, dueDay: context.kernel.simulationDay }, item.id, item.exposureId);
        context.schedule({ type: "commercial-cases.investigation_complete", dueDay: context.kernel.simulationDay + (context.command.payload.approach === "independent" ? 18 : 10), sourceId: item.id, payload: { caseId: item.id, approach: context.command.payload.approach }, sampledOutcome: { evidenceQuantile: context.rng.nextFloat() }, causality: { exposureIds: [item.exposureId] } });
      },
      "commercial_case.respond": (context) => {
        if (context.command.type !== "commercial_case.respond") return;
        const item = findCase(context, context.command.payload.caseId); const truth = context.ownState.private.truth[item.id];
        if (item.status === "resolved") throw new Error("COMMERCIAL_CASE_RESOLVED");
        const action = context.command.payload.action;
        if (action === "settle") {
          const amount = context.command.payload.amount ?? truth.settlementFloor;
          if (amount < truth.settlementFloor * 0.65) throw new Error("SETTLEMENT_OFFER_NOT_ACTIONABLE");
          economic(context, { transactionId: `case-settlement:${item.id}`, kind: "case_settlement", caseId: item.id, amount, memo: `Commercial settlement ${item.id}`, dueDay: context.kernel.simulationDay }, item.id, item.exposureId);
          item.status = "resolved"; item.reserveSignal = "none";
          context.emit({ type: "commercial-cases.case_settled", visibility: "public", sourceId: item.id, payload: { caseId: item.id, amount }, causality: { exposureIds: [item.exposureId] } });
        } else if (action === "defend") {
          item.status = "claim";
          economic(context, { transactionId: `case-defense:${item.id}:${context.command.commandId}`, kind: "expense", category: "legal", amount: 1_200, memo: `Defense preparation ${item.id}`, dueDay: context.kernel.simulationDay }, item.id, item.exposureId);
          context.schedule({ type: "commercial-cases.judgment", dueDay: context.kernel.simulationDay + 45, sourceId: item.id, payload: { caseId: item.id }, sampledOutcome: { judgmentQuantile: context.rng.nextFloat() }, causality: { exposureIds: [item.exposureId] } });
        } else {
          item.status = action === "negotiate" ? "negotiating" : item.status;
          if (action === "remediate") truth.actualSeverity = clamp(truth.actualSeverity - 0.2);
          if (action === "notify_regulator") truth.defenseStrength = clamp(truth.defenseStrength + 0.08);
          item.actions.push({ day: context.kernel.simulationDay, action, knownOutcome: "Response recorded; no immediate adjudication occurred." });
        }
        refresh(context);
        return { checkpointRequired: action === "settle" || action === "defend" };
      },
    },
    effects: {
      "commercial-cases.claim_notice": (context) => {
        const payload = context.effect.payload as { caseId: string; exposure: CommercialExposureV10_2 };
        const truth = context.ownState.private.truth[payload.caseId];
        const currentExposure = context.query("commercial-obligations.exposure", { exposureId: payload.exposure.id }) as CommercialExposureV10_2 | null;
        if (!currentExposure || ["cured", "closed"].includes(currentExposure.status)) return;
        const quantile = (context.effect.sampledOutcome as { noticeQuantile: number }).noticeQuantile;
        if (!truth || quantile > clamp(0.28 + truth.actualSeverity * 0.62)) return;
        const item: CommercialCaseV10_2 = {
          id: payload.caseId, exposureId: payload.exposure.id, accountId: payload.exposure.accountId,
          type: payload.exposure.kind === "billing_dispute" ? "billing_dispute" : payload.exposure.kind === "data_risk" ? "security_privacy" : payload.exposure.kind === "sla_failure" ? "sla_service_credit" : "breach_of_contract",
          status: "notice", openedDay: context.kernel.simulationDay, proceduralDeadlineDay: context.kernel.simulationDay + 21,
          severitySignal: payload.exposure.severity, knownEvidence: [...payload.exposure.knownFacts], actions: [],
          reserveSignal: payload.exposure.severity === "critical" ? "severe" : payload.exposure.severity === "material" ? "material" : "possible", insurerStatus: "not_notified",
        };
        context.ownState.public.cases.push(item);
        economic(context, { transactionId: `legal-reserve:${item.id}`, kind: "legal_reserve", caseId: item.id, amount: truth.settlementFloor, memo: `Commercial exposure reserve ${item.id}`, dueDay: context.kernel.simulationDay }, item.id, item.exposureId);
        context.emit({ type: "commercial-cases.claim_notice_received", visibility: "public", sourceId: item.id, payload: { caseId: item.id, accountId: item.accountId, proceduralDeadlineDay: item.proceduralDeadlineDay }, causality: { exposureIds: [item.exposureId] } });
        refresh(context);
      },
      "commercial-cases.insurance_review": (context) => {
        const item = findCase(context, (context.effect.payload as { caseId: string }).caseId); const truth = context.ownState.private.truth[item.id];
        item.insurerStatus = truth.insurerCoverage ? "accepted" : "denied";
        item.actions.push({ day: context.kernel.simulationDay, action: "insurance_review", knownOutcome: truth.insurerCoverage ? "Coverage accepted subject to deductible and limit." : "Coverage was denied under the simulated policy terms." });
      },
      "commercial-cases.investigation_complete": (context) => {
        const payload = context.effect.payload as { caseId: string; approach: string }; const item = findCase(context, payload.caseId); const truth = context.ownState.private.truth[item.id];
        const quantile = (context.effect.sampledOutcome as { evidenceQuantile: number }).evidenceQuantile;
        const clarity = clamp((truth.evidencePreserved ? 0.25 : 0) + (payload.approach === "independent" ? 0.25 : 0.12) + (1 - quantile) * 0.25);
        truth.defenseStrength = clamp(truth.defenseStrength + clarity * 0.25);
        item.status = "negotiating";
        item.knownEvidence.push(clarity > 0.45 ? "The investigation produced corroborated records." : "The investigation record remains incomplete or contradictory.");
      },
      "commercial-cases.judgment": (context) => {
        const item = findCase(context, (context.effect.payload as { caseId: string }).caseId); const truth = context.ownState.private.truth[item.id];
        const quantile = (context.effect.sampledOutcome as { judgmentQuantile: number }).judgmentQuantile;
        const adverse = quantile > truth.defenseStrength;
        const amount = adverse ? round(truth.settlementFloor * (1.3 + truth.actualSeverity)) : round(Math.max(100, truth.settlementFloor * 0.15));
        economic(context, { transactionId: `judgment:${item.id}`, kind: "case_settlement", caseId: item.id, amount, memo: `${adverse ? "Adverse" : "Defense-cost"} resolution ${item.id}`, dueDay: context.kernel.simulationDay }, item.id, item.exposureId);
        if (item.insurerStatus === "accepted" && adverse) {
          const recovery = Math.max(0, Math.min(truth.insurerLimit, amount) - truth.deductible);
          if (recovery > 0) economic(context, { transactionId: `insurance:${item.id}`, kind: "insurance_recovery", caseId: item.id, amount: recovery, memo: `Insurance recovery ${item.id}`, dueDay: context.kernel.simulationDay }, item.id, item.exposureId);
        }
        item.status = "resolved"; item.reserveSignal = "none";
        context.emit({ type: "commercial-cases.case_resolved", visibility: "public", sourceId: item.id, payload: { caseId: item.id, outcome: adverse ? "adverse" : "defended", amount }, causality: { exposureIds: [item.exposureId] } });
        refresh(context);
      },
    },
    queries: [{ id: "commercial-cases.open-summary", resolve: ({ ownState }) => ({ openCaseCount: ownState.public.openCaseCount, materialCases: ownState.public.cases.filter((item) => item.status !== "resolved" && ["material", "critical"].includes(item.severitySignal)).length }) }],
    eventSubscriptions: [{
      id: "commercial-cases-from-obligation-exposure", eventType: "commercial-obligations.exposure_created",
      handle: (context, event) => openFromExposure(context, event.payload as CommercialExposureV10_2),
    }, {
      id: "commercial-cases-from-billing-dispute", eventType: "customers-and-revenue.invoice_disputed",
      handle: (context, event) => {
        const payload = event.payload as { invoiceId: string; accountId: string; disputedAmount: number };
        openFromExposure(context, { id: `billing-dispute:${payload.invoiceId}`, obligationId: `payment:${payload.invoiceId}`, accountId: payload.accountId, openedDay: event.simulationDay, kind: "billing_dispute", severity: payload.disputedAmount > 5_000 ? "critical" : "material", status: "open", knownFacts: [`Invoice ${payload.invoiceId} was disputed for ${payload.disputedAmount}.`], cureDeadlineDay: event.simulationDay + 14 });
      },
    }],
    hooks: {
      after_risk_close: (context) => {
        for (const item of context.ownState.public.cases.filter((candidate) => candidate.status !== "resolved" && candidate.proceduralDeadlineDay < context.kernel.simulationDay)) {
          const truth = context.ownState.private.truth[item.id];
          truth.actualSeverity = clamp(truth.actualSeverity + 0.1);
          item.reserveSignal = truth.actualSeverity > 0.75 ? "severe" : "material";
          item.actions.push({ day: context.kernel.simulationDay, action: "deadline_missed", knownOutcome: "Procedural delay increased commercial exposure." });
        }
        context.ownState.public.cases = context.ownState.public.cases.slice(-300);
        context.ownState.private.exposureIds = context.ownState.private.exposureIds.slice(-2_000);
        refresh(context);
      },
    },
    invariants: [{ id: "commercial-case-exposure-and-truth", check: ({ ownState }) => {
      const ids = ownState.public.cases.map((item) => item.id);
      if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_COMMERCIAL_CASE");
      for (const item of ownState.public.cases) if (!ownState.private.truth[item.id] || !ownState.private.exposureIds.includes(item.exposureId)) throw new Error("COMMERCIAL_CASE_WITHOUT_EXPOSURE");
    } }],
    projectionPolicy: { schema: commercialCasesPublicStateSchemaV10_2, project: ({ publicState }) => structuredClone(publicState), denyKeys: ["actualSeverity", "claimQuantile", "defenseStrength", "settlementFloor", "insurerCoverage"] },
    snapshotPolicy: { mode: "every_material_command", maximumCommandsBetweenSnapshots: 15 }, retentionPolicy: { maximumHeadBytes: 1_500_000, maximumMaterialRecords: 2_000, archiveClosedRecords: true },
  };
}
