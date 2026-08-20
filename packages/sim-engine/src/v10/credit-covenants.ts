import { z } from "zod";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";
import type { EconomicTransactionV10_2 } from "./finance-treasury-v10-2";

const covenantKind = z.enum(["minimum_liquidity", "maximum_burn", "minimum_recurring_revenue", "eligible_ar_borrowing_base", "dscr"]);
const covenantSchema = z.object({
  id: z.string(), kind: covenantKind, threshold: z.number().finite().nonnegative(),
  status: z.enum(["compliant", "at_risk", "breached", "cured", "waived"]),
  lastTestDay: z.number().int().nonnegative().nullable(), lastObservedValue: z.number().finite().nullable(),
}).strict();
const facilitySchema = z.object({
  id: z.string(), lenderId: z.string(), lenderName: z.string(), type: z.enum(["working_capital", "revenue_based", "term_loan"]),
  status: z.enum(["diligence", "active", "breached", "waived", "defaulted", "accelerated", "repaid", "declined"]),
  committedAmount: z.number().finite().nonnegative(), outstandingPrincipal: z.number().finite().nonnegative(),
  annualInterestRate: z.number().min(0).max(1), openedDay: z.number().int().nonnegative().nullable(),
  maturityDay: z.number().int().nonnegative(), cureDeadlineDay: z.number().int().nonnegative().nullable(),
  reportingDueDay: z.number().int().nonnegative(), covenants: z.array(covenantSchema).max(8),
  latestNotice: z.string().nullable(),
}).strict();
export type CreditFacilityV10_2 = z.infer<typeof facilitySchema>;

export const creditCovenantsPublicStateSchemaV10_2 = z.object({
  lenders: z.array(z.object({ id: z.string(), name: z.string(), mandate: z.string(), relationshipSignal: z.enum(["constructive", "watch", "strained", "adversarial"]) }).strict()).max(8),
  facilities: z.array(facilitySchema).max(12),
  covenantSignal: z.enum(["none", "compliant", "at_risk", "breached", "defaulted"]),
  nextDeadlineDay: z.number().int().nonnegative().nullable(),
  notices: z.array(z.object({ id: z.string(), facilityId: z.string(), day: z.number().int().nonnegative(), summary: z.string(), cureDeadlineDay: z.number().int().nonnegative().nullable() }).strict()).max(100),
}).strict();
export type CreditCovenantsPublicStateV10_2 = z.infer<typeof creditCovenantsPublicStateSchemaV10_2>;

const privateSchema = z.object({
  lenderFlexibility: z.record(z.string(), z.number().min(0).max(1)), reportingQuality: z.record(z.string(), z.number().min(0).max(1)),
  waivedUntilDay: z.record(z.string(), z.number().int().nonnegative()), processedTestKeys: z.array(z.string()).max(2_000), nextFacilityId: z.number().int().positive(),
}).strict();
type PrivateState = z.infer<typeof privateSchema>;
const configSchema = z.object({ profile: z.enum(["ai_workflow", "local_services", "healthcare"]) }).default({ profile: "ai_workflow" });
type Context = FeatureRuntimeContextV10<CreditCovenantsPublicStateV10_2, PrivateState>;
const round = (value: number): number => Math.round(value * 100) / 100;
const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));

function economic(context: Context, transaction: EconomicTransactionV10_2, facilityId: string): void {
  context.emit({ type: "credit-and-covenants.economic_transaction_requested", sourceId: transaction.transactionId, payload: transaction, causality: { obligationIds: [`facility:${facilityId}`] } });
}

function facility(context: Context, facilityId: string): CreditFacilityV10_2 {
  const found = context.ownState.public.facilities.find((item) => item.id === facilityId);
  if (!found) throw new Error("CREDIT_FACILITY_NOT_FOUND");
  return found;
}

function refresh(context: Context): void {
  const facilities = context.ownState.public.facilities;
  context.ownState.public.covenantSignal = facilities.some((item) => ["defaulted", "accelerated"].includes(item.status)) ? "defaulted"
    : facilities.some((item) => item.status === "breached") ? "breached"
      : facilities.some((item) => item.covenants.some((covenant) => covenant.status === "at_risk")) ? "at_risk"
        : facilities.some((item) => item.status === "active" || item.status === "waived") ? "compliant" : "none";
  const deadlines = facilities.flatMap((item) => [item.cureDeadlineDay, item.reportingDueDay, item.maturityDay]).filter((value): value is number => value !== null && value >= context.kernel.simulationDay);
  context.ownState.public.nextDeadlineDay = deadlines.length ? Math.min(...deadlines) : null;
}

function covenantValue(kind: z.infer<typeof covenantKind>, base: { cash: number; debt: number; recurringRevenue: number; monthlyBurn: number; eligibleReceivables: number }): number {
  if (kind === "minimum_liquidity") return base.cash;
  if (kind === "maximum_burn") return base.monthlyBurn;
  if (kind === "minimum_recurring_revenue") return base.recurringRevenue;
  if (kind === "eligible_ar_borrowing_base") return base.eligibleReceivables * 0.8;
  return base.monthlyBurn > 0 ? base.recurringRevenue / base.monthlyBurn : base.recurringRevenue;
}

function compliant(kind: z.infer<typeof covenantKind>, observed: number, threshold: number, principal: number): boolean {
  if (kind === "maximum_burn") return observed <= threshold;
  if (kind === "eligible_ar_borrowing_base") return principal <= observed;
  return observed >= threshold;
}

export function createCreditCovenantsFeatureV10_2(options: { customerProcurement?: boolean } = {}): SimulationFeatureV10<CreditCovenantsPublicStateV10_2, PrivateState, z.infer<typeof configSchema>> {
  return {
    id: "credit-and-covenants", version: options.customerProcurement ? "1.1.0" : "1.0.0",
    dependencies: [{ id: "external-world", versionRange: "^1.0.0" }, { id: "finance-and-treasury", versionRange: "^1.2.0" }, { id: "customers-and-revenue", versionRange: options.customerProcurement ? ">=1.0.0 <3.0.0" : "^1.0.0" }],
    compatibleEngineRange: ">=10.2.0 <11.0.0", configSchema,
    publicStateSchema: creditCovenantsPublicStateSchemaV10_2, privateStateSchema: privateSchema,
    initialize: ({ config, rng }) => {
      const lenders = config.profile === "local_services"
        ? [{ id: "lender-rbf", name: "Harbor Revenue Finance", mandate: "Revenue-based working capital", relationshipSignal: "constructive" as const }]
        : config.profile === "healthcare"
          ? [{ id: "lender-health", name: "Northbridge Health Credit", mandate: "Milestone and receivables finance", relationshipSignal: "watch" as const }]
          : [{ id: "lender-venture", name: "Pioneer Venture Debt", mandate: "Recurring-revenue technology credit", relationshipSignal: "constructive" as const }];
      return { public: { lenders, facilities: [], covenantSignal: "none", nextDeadlineDay: null, notices: [] }, private: { lenderFlexibility: Object.fromEntries(lenders.map((item) => [item.id, clamp(0.55 + rng.normal(0, 0.12))])), reportingQuality: {}, waivedUntilDay: {}, processedTestKeys: [], nextFacilityId: 1 } };
    },
    commands: {
      "credit.facility.negotiate": (context) => {
        if (context.command.type !== "credit.facility.negotiate") return;
        const payload = context.command.payload;
        const lender = context.ownState.public.lenders.find((item) => item.id === payload.lenderId);
        if (!lender) throw new Error("LENDER_NOT_FOUND");
        if (context.ownState.public.facilities.some((item) => item.status === "diligence")) throw new Error("CREDIT_DILIGENCE_ALREADY_PENDING");
        const id = `facility-${context.ownState.private.nextFacilityId++}`;
        const item: CreditFacilityV10_2 = { id, lenderId: lender.id, lenderName: lender.name, type: payload.facilityType, status: "diligence", committedAmount: payload.requestedAmount, outstandingPrincipal: 0, annualInterestRate: payload.facilityType === "revenue_based" ? 0.18 : 0.12, openedDay: null, maturityDay: context.kernel.simulationDay + payload.maturityDays, cureDeadlineDay: null, reportingDueDay: context.kernel.simulationDay + 30, covenants: [], latestNotice: "Diligence request submitted." };
        context.ownState.public.facilities.push(item);
        const base = context.query("finance-and-treasury.covenant-base") as { cash: number; recurringRevenue: number; monthlyBurn: number };
        const factors = context.query("external-world.domain-factors") as { investorRiskAppetite: number; interestRate: number };
        const scalePenalty = payload.requestedAmount / Math.max(500, base.cash + base.recurringRevenue * 3);
        const approvalThreshold = clamp(0.72 + factors.investorRiskAppetite * 0.15 - scalePenalty * 0.18 - factors.interestRate * 0.04, 0.08, 0.85);
        context.schedule({ type: "credit-and-covenants.facility_diligence_complete", dueDay: context.kernel.simulationDay + 21, sourceId: id, payload: { facilityId: id }, sampledOutcome: { quantile: context.rng.nextFloat(), approvalThreshold }, causality: { obligationIds: [`facility:${id}`] } });
        context.emit({ type: "credit-and-covenants.facility_diligence_started", visibility: "public", sourceId: id, payload: { facilityId: id, lenderId: lender.id, requestedAmount: item.committedAmount }, causality: { obligationIds: [`facility:${id}`] } });
      },
      "credit.covenant.respond": (context) => {
        if (context.command.type !== "credit.covenant.respond") return;
        const item = facility(context, context.command.payload.facilityId);
        const action = context.command.payload.action;
        if (!["active", "breached", "waived", "defaulted"].includes(item.status)) throw new Error("FACILITY_RESPONSE_NOT_AVAILABLE");
        if (action === "provide_reporting") {
          context.ownState.private.reportingQuality[item.id] = clamp((context.ownState.private.reportingQuality[item.id] ?? 0.45) + 0.2);
          item.latestNotice = "Updated reporting package delivered to lender.";
        } else if (action === "pay_down_principal") {
          const amount = context.command.payload.amount ?? 0;
          if (amount <= 0 || amount > item.outstandingPrincipal) throw new Error("INVALID_PRINCIPAL_PAYDOWN");
          economic(context, { transactionId: `paydown:${item.id}:${context.command.commandId}`, kind: "debt_principal_repaid", facilityId: item.id, amount, memo: `Principal paydown to ${item.lenderName}`, dueDay: context.kernel.simulationDay }, item.id);
          item.outstandingPrincipal = round(item.outstandingPrincipal - amount);
        } else if (["request_waiver", "request_amendment", "equity_cure", "refinance"].includes(action)) {
          const lenderFlexibility = context.ownState.private.lenderFlexibility[item.lenderId] ?? 0.5;
          const reporting = context.ownState.private.reportingQuality[item.id] ?? 0.35;
          context.schedule({ type: "credit-and-covenants.cure_response", dueDay: context.kernel.simulationDay + (action === "equity_cure" || action === "refinance" ? 21 : 7), sourceId: item.id, payload: { facilityId: item.id, action, amount: context.command.payload.amount ?? Math.max(500, item.outstandingPrincipal * 0.15) }, sampledOutcome: { quantile: context.rng.nextFloat(), successThreshold: clamp(lenderFlexibility * 0.55 + reporting * 0.35 + (action === "request_waiver" ? 0.08 : 0)) }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
          context.emit({ type: action === "request_waiver" ? "credit-and-covenants.waiver_requested" : "credit-and-covenants.cure_action_started", visibility: "public", sourceId: item.id, payload: { facilityId: item.id, action }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
        } else if (action === "controlled_default") {
          item.status = "defaulted";
          context.schedule({ type: "credit-and-covenants.facility_acceleration", dueDay: context.kernel.simulationDay + 1, sourceId: item.id, payload: { facilityId: item.id }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
        } else throw new Error("NO_ELIGIBLE_ASSET_TO_SELL");
        context.emit({ type: "credit-and-covenants.covenant_response_recorded", visibility: "public", sourceId: item.id, payload: { facilityId: item.id, action }, causality: { exposureIds: item.status === "breached" ? [`covenant-breach:${item.id}`] : [], obligationIds: [`facility:${item.id}`] } });
        refresh(context);
      },
    },
    effects: {
      "credit-and-covenants.facility_diligence_complete": (context) => {
        const item = facility(context, (context.effect.payload as { facilityId: string }).facilityId);
        const outcome = context.effect.sampledOutcome as { quantile: number; approvalThreshold: number };
        if (outcome.quantile > outcome.approvalThreshold) {
          item.status = "declined"; item.latestNotice = "The lender declined after diligence.";
          context.emit({ type: "credit-and-covenants.facility_declined", visibility: "public", sourceId: item.id, payload: { facilityId: item.id, lenderId: item.lenderId }, causality: { obligationIds: [`facility:${item.id}`] } });
          return;
        }
        item.status = "active"; item.openedDay = context.kernel.simulationDay; item.outstandingPrincipal = item.committedAmount;
        item.covenants = [
          { id: `${item.id}:liquidity`, kind: "minimum_liquidity", threshold: Math.max(250, item.committedAmount * 0.08), status: "compliant", lastTestDay: null, lastObservedValue: null },
          { id: `${item.id}:burn`, kind: "maximum_burn", threshold: Math.max(500, item.committedAmount * 0.18), status: "compliant", lastTestDay: null, lastObservedValue: null },
          { id: `${item.id}:revenue`, kind: "minimum_recurring_revenue", threshold: item.committedAmount * 0.025, status: "compliant", lastTestDay: null, lastObservedValue: null },
          ...(item.type === "working_capital" ? [{ id: `${item.id}:borrowing-base`, kind: "eligible_ar_borrowing_base" as const, threshold: 0, status: "compliant" as const, lastTestDay: null, lastObservedValue: null }] : []),
        ];
        economic(context, { transactionId: `debt-draw:${item.id}`, kind: "debt_received", facilityId: item.id, amount: item.committedAmount, memo: `${item.lenderName} facility funded`, dueDay: context.kernel.simulationDay }, item.id);
        context.emit({ type: "credit-and-covenants.facility_closed", visibility: "public", sourceId: item.id, payload: { facilityId: item.id, amount: item.committedAmount, maturityDay: item.maturityDay }, causality: { obligationIds: [`facility:${item.id}`] } });
        refresh(context);
      },
      "credit-and-covenants.lender_notice": (context) => {
        const item = facility(context, (context.effect.payload as { facilityId: string }).facilityId);
        if (item.status !== "breached") return;
        item.cureDeadlineDay = context.kernel.simulationDay + 14;
        item.latestNotice = `Formal covenant notice; cure deadline day ${item.cureDeadlineDay}.`;
        context.ownState.public.notices.push({ id: `notice:${item.id}:${context.kernel.simulationDay}`, facilityId: item.id, day: context.kernel.simulationDay, summary: item.latestNotice, cureDeadlineDay: item.cureDeadlineDay });
        context.schedule({ type: "credit-and-covenants.facility_acceleration", dueDay: item.cureDeadlineDay + 1, sourceId: item.id, payload: { facilityId: item.id }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
        context.emit({ type: "credit-and-covenants.lender_notice_received", visibility: "public", sourceId: item.id, payload: { facilityId: item.id, cureDeadlineDay: item.cureDeadlineDay }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
        refresh(context);
      },
      "credit-and-covenants.cure_response": (context) => {
        const payload = context.effect.payload as { facilityId: string; action: string; amount: number };
        const item = facility(context, payload.facilityId);
        const outcome = context.effect.sampledOutcome as { quantile: number; successThreshold: number };
        if (outcome.quantile > outcome.successThreshold) {
          item.latestNotice = `${payload.action.replaceAll("_", " ")} did not close before lender review.`;
          context.emit({ type: "credit-and-covenants.cure_action_failed", visibility: "public", sourceId: item.id, payload: { facilityId: item.id, action: payload.action }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
          return;
        }
        if (payload.action === "equity_cure") economic(context, { transactionId: `equity-cure:${item.id}:${context.kernel.simulationDay}`, kind: "equity_received", amount: payload.amount, memo: `Delayed equity cure for ${item.id}`, dueDay: context.kernel.simulationDay }, item.id);
        if (payload.action === "refinance") economic(context, { transactionId: `refinance:${item.id}:${context.kernel.simulationDay}`, kind: "equity_received", amount: Math.min(payload.amount, item.outstandingPrincipal), memo: `Replacement capital closed for ${item.id}`, dueDay: context.kernel.simulationDay }, item.id);
        if (payload.action === "request_waiver" || payload.action === "request_amendment") {
          const fee = round(Math.max(50, item.outstandingPrincipal * 0.01));
          economic(context, { transactionId: `waiver-fee:${item.id}:${context.kernel.simulationDay}`, kind: "expense", category: "interest", amount: fee, memo: `${item.lenderName} waiver/amendment fee`, dueDay: context.kernel.simulationDay }, item.id);
        }
        item.status = "waived"; item.cureDeadlineDay = null; context.ownState.private.waivedUntilDay[item.id] = context.kernel.simulationDay + 30;
        for (const covenant of item.covenants.filter((candidate) => candidate.status === "breached")) covenant.status = "waived";
        context.emit({ type: "credit-and-covenants.covenant_cured", visibility: "public", sourceId: item.id, payload: { facilityId: item.id, method: payload.action, waivedUntilDay: context.ownState.private.waivedUntilDay[item.id] }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
        refresh(context);
      },
      "credit-and-covenants.facility_acceleration": (context) => {
        const item = facility(context, (context.effect.payload as { facilityId: string }).facilityId);
        if (!["breached", "defaulted"].includes(item.status) || (item.cureDeadlineDay !== null && context.kernel.simulationDay <= item.cureDeadlineDay)) return;
        item.status = "accelerated"; item.latestNotice = "Outstanding principal has been accelerated after an uncured default.";
        context.emit({ type: "credit-and-covenants.facility_accelerated", visibility: "public", sourceId: item.id, payload: { facilityId: item.id, outstandingPrincipal: item.outstandingPrincipal }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
        refresh(context);
      },
    },
    queries: [{ id: "credit-and-covenants.summary", resolve: ({ ownState }) => ({ covenantSignal: ownState.public.covenantSignal, activeDebtFacilities: ownState.public.facilities.filter((item) => ["active", "breached", "waived", "defaulted", "accelerated"].includes(item.status)).length }) }],
    hooks: {
      after_covenant_close: (context) => {
        const base = context.query("finance-and-treasury.covenant-base") as { cash: number; debt: number; recurringRevenue: number; monthlyBurn: number; eligibleReceivables: number };
        for (const item of context.ownState.public.facilities.filter((candidate) => ["active", "breached", "waived"].includes(candidate.status))) {
          const testKey = `${item.id}:${context.kernel.fiscalPeriod}`;
          if (context.ownState.private.processedTestKeys.includes(testKey)) continue;
          context.ownState.private.processedTestKeys.push(testKey);
          if ((context.ownState.private.waivedUntilDay[item.id] ?? -1) >= context.kernel.simulationDay) continue;
          let failed = false;
          for (const covenant of item.covenants) {
            const observed = round(covenantValue(covenant.kind, base));
            covenant.lastTestDay = context.kernel.simulationDay; covenant.lastObservedValue = observed;
            const pass = compliant(covenant.kind, observed, covenant.threshold, item.outstandingPrincipal);
            covenant.status = pass ? "compliant" : "breached";
            failed ||= !pass;
            context.emit({ type: "credit-and-covenants.covenant_tested", visibility: "public", sourceId: covenant.id, payload: { facilityId: item.id, covenantId: covenant.id, kind: covenant.kind, status: covenant.status, observedValue: observed, threshold: covenant.threshold }, causality: { obligationIds: [`facility:${item.id}`] } });
          }
          if (failed && item.status !== "breached") {
            item.status = "breached";
            context.emit({ type: "credit-and-covenants.covenant_breached", visibility: "public", sourceId: item.id, payload: { facilityId: item.id, failedCovenantIds: item.covenants.filter((candidate) => candidate.status === "breached").map((candidate) => candidate.id) }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
            context.schedule({ type: "credit-and-covenants.lender_notice", dueDay: context.kernel.simulationDay + 1, sourceId: item.id, payload: { facilityId: item.id }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
          } else if (!failed && item.status === "breached") {
            item.status = "active"; item.cureDeadlineDay = null;
            context.emit({ type: "credit-and-covenants.covenant_cured", visibility: "public", sourceId: item.id, payload: { facilityId: item.id, method: "operating_performance" }, causality: { exposureIds: [`covenant-breach:${item.id}`], obligationIds: [`facility:${item.id}`] } });
          }
        }
        context.ownState.private.processedTestKeys = context.ownState.private.processedTestKeys.slice(-2_000);
        context.ownState.public.notices = context.ownState.public.notices.slice(-100);
        refresh(context);
      },
    },
    invariants: [{ id: "credit-facility-covenants-and-principal", check: ({ ownState }) => {
      const ids = ownState.public.facilities.map((item) => item.id);
      if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_CREDIT_FACILITY");
      for (const item of ownState.public.facilities) {
        if (item.outstandingPrincipal < 0 || item.outstandingPrincipal > item.committedAmount + 0.005) throw new Error("INVALID_FACILITY_PRINCIPAL");
        if (new Set(item.covenants.map((covenant) => covenant.id)).size !== item.covenants.length) throw new Error("DUPLICATE_COVENANT");
      }
    } }],
    projectionPolicy: { schema: creditCovenantsPublicStateSchemaV10_2, project: ({ publicState }) => structuredClone(publicState), denyKeys: ["lenderFlexibility", "reportingQuality", "processedTestKeys"] },
    snapshotPolicy: { mode: "every_material_command", maximumCommandsBetweenSnapshots: 15 }, retentionPolicy: { maximumHeadBytes: 1_500_000, maximumMaterialRecords: 2_000, archiveClosedRecords: true },
  };
}
