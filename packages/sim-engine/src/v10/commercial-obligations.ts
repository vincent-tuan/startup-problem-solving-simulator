import { z } from "zod";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";
import type { DomainEventV10 } from "./types";

const obligationSchema = z.object({
  id: z.string(), accountId: z.string(), kind: z.enum(["service_level", "delivery_milestone", "data_processing", "acceptance", "payment"]),
  owner: z.string(), dueDay: z.number().int().nonnegative(), recurringDays: z.number().int().nonnegative(),
  materiality: z.enum(["low", "material", "critical"]), status: z.enum(["active", "at_risk", "missed", "cured", "closed"]),
  remedy: z.enum(["cure", "service_credit", "termination_right", "indemnity"]),
  cureDays: z.number().int().nonnegative(), dependencyIds: z.array(z.string()).max(12),
}).strict();
export type CommercialObligationV10_2 = z.infer<typeof obligationSchema>;

const exposureSchema = z.object({
  id: z.string(), obligationId: z.string(), accountId: z.string(), openedDay: z.number().int().nonnegative(),
  kind: z.enum(["sla_failure", "delivery_breach", "billing_dispute", "data_risk", "contract_breach"]),
  severity: z.enum(["low", "material", "critical"]), status: z.enum(["open", "cured", "escalated", "closed"]),
  knownFacts: z.array(z.string()).max(20), cureDeadlineDay: z.number().int().nonnegative(),
}).strict();
export type CommercialExposureV10_2 = z.infer<typeof exposureSchema>;

export const commercialObligationsPublicStateSchemaV10_2 = z.object({
  obligations: z.array(obligationSchema).max(500), exposures: z.array(exposureSchema).max(500),
  atRiskCount: z.number().int().nonnegative(), missedCount: z.number().int().nonnegative(),
  disclaimer: z.literal("Commercial-rule simulation archetypes — not legal advice."),
}).strict();
export type CommercialObligationsPublicStateV10_2 = z.infer<typeof commercialObligationsPublicStateSchemaV10_2>;

const privateSchema = z.object({ processedExposureKeys: z.array(z.string()).max(2_000) }).strict();
type PrivateState = z.infer<typeof privateSchema>;
type Context = FeatureRuntimeContextV10<CommercialObligationsPublicStateV10_2, PrivateState>;
const configSchema = z.object({ profile: z.enum(["ai_workflow", "local_services", "healthcare"]) }).default({ profile: "ai_workflow" });

function initialObligations(profile: z.infer<typeof configSchema>["profile"]): CommercialObligationV10_2[] {
  const critical = profile === "healthcare";
  return ["account-design-1", "account-design-2"].flatMap((accountId, index) => [
    { id: `obligation-sla-${accountId}`, accountId, kind: "service_level" as const, owner: "company", dueDay: 30, recurringDays: 30, materiality: critical || index === 1 ? "critical" as const : "material" as const, status: "active" as const, remedy: critical ? "indemnity" as const : "service_credit" as const, cureDays: critical ? 5 : 10, dependencyIds: [`delivery-${accountId}`] },
    ...(critical ? [{ id: `obligation-data-${accountId}`, accountId, kind: "data_processing" as const, owner: "company", dueDay: 30, recurringDays: 30, materiality: "critical" as const, status: "active" as const, remedy: "indemnity" as const, cureDays: 3, dependencyIds: [`delivery-${accountId}`] }] : []),
  ]);
}

function refresh(publicState: CommercialObligationsPublicStateV10_2): void {
  publicState.atRiskCount = publicState.obligations.filter((item) => item.status === "at_risk").length;
  publicState.missedCount = publicState.obligations.filter((item) => item.status === "missed").length;
}

export function createCommercialObligationsFeatureV10_2(options: { contractLifecycle?: boolean } = {}): SimulationFeatureV10<CommercialObligationsPublicStateV10_2, PrivateState, z.infer<typeof configSchema>> {
  return {
    id: "commercial-obligations", version: options.contractLifecycle ? "1.1.0" : "1.0.0", dependencies: [], compatibleEngineRange: ">=10.2.0 <11.0.0",
    configSchema, publicStateSchema: commercialObligationsPublicStateSchemaV10_2, privateStateSchema: privateSchema,
    initialize: ({ config }) => ({ public: { obligations: initialObligations(config.profile), exposures: [], atRiskCount: 0, missedCount: 0, disclaimer: "Commercial-rule simulation archetypes — not legal advice." }, private: { processedExposureKeys: [] } }),
    commands: {}, effects: {},
    queries: [{
      id: "commercial-obligations.for-account",
      resolve: ({ ownState }, input) => structuredClone(ownState.public.obligations.filter((item) => item.accountId === (input as { accountId?: string } | undefined)?.accountId && item.status !== "closed")),
    }, {
      id: "commercial-obligations.exposure",
      resolve: ({ ownState }, input) => structuredClone(ownState.public.exposures.find((item) => item.id === (input as { exposureId?: string } | undefined)?.exposureId) ?? null),
    }],
    eventSubscriptions: [{
      id: "obligations-track-contract-amendment", eventType: "customers-and-revenue.contract_amended",
      handle: (context, event) => {
        const payload = event.payload as { accountId: string; serviceLevel: "best_effort" | "standard" | "critical" };
        for (const obligation of context.ownState.public.obligations.filter((item) => item.accountId === payload.accountId && item.kind === "service_level")) {
          obligation.materiality = payload.serviceLevel === "critical" ? "critical" : payload.serviceLevel === "standard" ? "material" : "low";
          obligation.cureDays = payload.serviceLevel === "critical" ? 5 : payload.serviceLevel === "standard" ? 10 : 20;
        }
      },
    }, {
      id: "obligations-from-delivery-failure", eventType: "delivery-and-service.sla_missed",
      handle: (context, event) => {
        const payload = event.payload as { accountId: string; commitmentId: string; backlogHours: number };
        const obligation = context.ownState.public.obligations.find((item) => item.accountId === payload.accountId && item.kind === "service_level" && item.status !== "closed");
        if (!obligation) return;
        const existingExposure = context.ownState.public.exposures.find((item) => item.obligationId === obligation.id && ["open", "escalated"].includes(item.status));
        if (existingExposure) {
          existingExposure.knownFacts.push(`A further service threshold was missed on day ${event.simulationDay}.`);
          existingExposure.knownFacts = existingExposure.knownFacts.slice(-20);
          existingExposure.status = "escalated";
          obligation.status = "missed";
          refresh(context.ownState.public);
          return;
        }
        const key = `${obligation.id}:${event.simulationDay}`;
        if (context.ownState.private.processedExposureKeys.includes(key)) return;
        context.ownState.private.processedExposureKeys.push(key);
        obligation.status = "missed";
        const exposure: CommercialExposureV10_2 = {
          id: `exposure-${key}`, obligationId: obligation.id, accountId: payload.accountId,
          openedDay: event.simulationDay, kind: "sla_failure", severity: obligation.materiality,
          status: "open", knownFacts: [`Delivery commitment ${payload.commitmentId} missed its service threshold.`, `Recorded backlog: ${Math.round(payload.backlogHours)} hours.`],
          cureDeadlineDay: event.simulationDay + obligation.cureDays,
        };
        context.ownState.public.exposures.push(exposure);
        context.emit({
          type: "commercial-obligations.exposure_created", visibility: "public", sourceId: exposure.id,
          payload: structuredClone(exposure), causality: { exposureIds: [exposure.id], obligationIds: [obligation.id] },
        });
        refresh(context.ownState.public);
      },
    }, {
      id: "obligations-close-on-customer-churn", eventType: "customers-and-revenue.customer_churned",
      handle: (context, event) => {
        const accountId = (event.payload as { accountId: string }).accountId;
        for (const obligation of context.ownState.public.obligations.filter((item) => item.accountId === accountId)) obligation.status = "closed";
        refresh(context.ownState.public);
      },
    }, {
      id: "obligations-cure-from-remediation", eventType: "customers-and-revenue.remediation_committed",
      handle: (context, event) => {
        const payload = event.payload as { accountId: string; action: string };
        if (payload.action !== "recovery_plan") return;
        for (const exposure of context.ownState.public.exposures.filter((item) => item.accountId === payload.accountId && item.status === "open")) exposure.status = "cured";
        for (const obligation of context.ownState.public.obligations.filter((item) => item.accountId === payload.accountId && item.status === "missed")) obligation.status = "cured";
        refresh(context.ownState.public);
      },
    }, ...(options.contractLifecycle ? [{
      id: "obligations-from-activated-agreement", eventType: "contract-lifecycle.agreement_activated" as const,
      handle: (context: Context, event: DomainEventV10) => {
        const payload = event.payload as { agreementId: string; accountId: string; terms: { serviceLevel: "best_effort" | "standard" | "critical" }; clauses: Array<{ kind: string; position: string }> };
        if (context.ownState.public.obligations.some((item) => item.id === `obligation-sla-${payload.accountId}`)) return;
        const critical = payload.terms.serviceLevel === "critical";
        context.ownState.public.obligations.push({
          id: `obligation-sla-${payload.accountId}`, accountId: payload.accountId, kind: "service_level", owner: "company",
          dueDay: event.simulationDay + 30, recurringDays: 30, materiality: critical ? "critical" : payload.terms.serviceLevel === "standard" ? "material" : "low",
          status: "active", remedy: critical ? "indemnity" : "service_credit", cureDays: critical ? 5 : 10, dependencyIds: [`implementation-${payload.agreementId}`],
        });
        if (payload.clauses.some((clause) => clause.kind === "data_processing" && clause.position !== "player_standard")) context.ownState.public.obligations.push({
          id: `obligation-data-${payload.accountId}`, accountId: payload.accountId, kind: "data_processing", owner: "company",
          dueDay: event.simulationDay + 30, recurringDays: 30, materiality: "critical", status: "active", remedy: "indemnity", cureDays: 3, dependencyIds: [`implementation-${payload.agreementId}`],
        });
        refresh(context.ownState.public);
        context.emit({ type: "commercial-obligations.contract_obligations_created", visibility: "public", sourceId: payload.agreementId, payload: { agreementId: payload.agreementId, accountId: payload.accountId }, causality: { obligationIds: [`agreement:${payload.agreementId}`, `obligation-sla-${payload.accountId}`] } });
      },
    }] : [])],
    hooks: {
      after_risk_close: (context) => {
        for (const exposure of context.ownState.public.exposures.filter((item) => item.status === "open" && item.cureDeadlineDay < context.kernel.simulationDay)) exposure.status = "escalated";
        context.ownState.public.exposures = context.ownState.public.exposures.slice(-500);
        context.ownState.private.processedExposureKeys = context.ownState.private.processedExposureKeys.slice(-2_000);
      },
    },
    invariants: [{ id: "commercial-obligation-references", check: ({ ownState }) => {
      const obligationIds = ownState.public.obligations.map((item) => item.id);
      if (new Set(obligationIds).size !== obligationIds.length) throw new Error("DUPLICATE_COMMERCIAL_OBLIGATION");
      for (const exposure of ownState.public.exposures) if (!obligationIds.includes(exposure.obligationId)) throw new Error("COMMERCIAL_EXPOSURE_OBLIGATION_MISSING");
    } }],
    projectionPolicy: { schema: commercialObligationsPublicStateSchemaV10_2, project: ({ publicState }) => structuredClone(publicState) },
    snapshotPolicy: { mode: "period_close", maximumCommandsBetweenSnapshots: 30 }, retentionPolicy: { maximumHeadBytes: 1_500_000, maximumMaterialRecords: 2_000, archiveClosedRecords: true },
  };
}
