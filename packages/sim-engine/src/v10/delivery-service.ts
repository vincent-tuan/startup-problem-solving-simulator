import { z } from "zod";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";
import type { EconomicTransactionV10_2 } from "./finance-treasury-v10-2";

const commitmentSchema = z.object({
  id: z.string(), accountId: z.string(), label: z.string(),
  status: z.enum(["active", "at_risk", "delayed", "completed", "cancelled"]),
  dueDay: z.number().int().nonnegative(), recurringDays: z.number().int().nonnegative(),
  requiredHours: z.number().finite().nonnegative(), completedHours: z.number().finite().nonnegative(),
  backlogHours: z.number().finite().nonnegative(), protectedHours: z.number().finite().nonnegative(),
  requiredRoles: z.array(z.enum(["engineering", "product", "operations", "customer_success", "founder"])).min(1).max(5),
  reliabilitySignal: z.enum(["controlled", "watch", "strained", "failing"]),
  qualitySignal: z.enum(["credible", "mixed", "weak"]),
  priority: z.number().int().min(1).max(5),
}).strict();
export type DeliveryCommitmentV10_2 = z.infer<typeof commitmentSchema>;

export const deliveryServicePublicStateSchemaV10_2 = z.object({
  commitments: z.array(commitmentSchema).max(300),
  totalBacklogHours: z.number().finite().nonnegative(),
  deliverySignal: z.enum(["controlled", "loaded", "strained", "failing"]),
  busFactorSignal: z.enum(["distributed", "material", "concentrated", "critical"]),
  recentFailures: z.array(z.object({ id: z.string(), accountId: z.string(), day: z.number().int().nonnegative(), summary: z.string() }).strict()).max(100),
}).strict();
export type DeliveryServicePublicStateV10_2 = z.infer<typeof deliveryServicePublicStateSchemaV10_2>;

const privateSchema = z.object({
  accountReliability: z.record(z.string(), z.number().min(0).max(1)),
  accountQuality: z.record(z.string(), z.number().min(0).max(1)),
  outsourcedHours: z.record(z.string(), z.number().finite().nonnegative()),
  recoveryBoost: z.record(z.string(), z.number().min(0).max(1)),
  processedPeriodKeys: z.array(z.string()).max(2_000),
  profile: z.enum(["ai_workflow", "local_services", "healthcare"]),
}).strict();
type PrivateState = z.infer<typeof privateSchema>;
const configSchema = z.object({ profile: z.enum(["ai_workflow", "local_services", "healthcare"]) }).default({ profile: "ai_workflow" });
type Context = FeatureRuntimeContextV10<DeliveryServicePublicStateV10_2, PrivateState>;
const round = (value: number): number => Math.round(value * 10) / 10;
const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));

function initialCommitments(profile: z.infer<typeof configSchema>["profile"]): DeliveryCommitmentV10_2[] {
  const requirements = profile === "healthcare" ? 130 : profile === "ai_workflow" ? 95 : 62;
  return ["account-design-1", "account-design-2"].map((accountId, index) => ({
    id: `delivery-${accountId}`, accountId, label: profile === "healthcare" ? "Safe workflow operation and implementation" : profile === "ai_workflow" ? "Workflow integration and support" : "Onboarding, availability and support",
    status: "active", dueDay: 30, recurringDays: 30, requiredHours: requirements + index * 18,
    completedHours: 0, backlogHours: 0, protectedHours: 0,
    requiredRoles: profile === "healthcare" ? ["engineering", "operations", "customer_success"] : profile === "ai_workflow" ? ["engineering", "product", "customer_success"] : ["operations", "customer_success", "engineering"],
    reliabilitySignal: "controlled", qualitySignal: "credible", priority: index === 0 ? 4 : 3,
  }));
}

function economic(context: Context, transaction: EconomicTransactionV10_2): void {
  context.emit({ type: "delivery-and-service.economic_transaction_requested", sourceId: transaction.transactionId, payload: transaction });
}

function commitment(context: Context, id: string): DeliveryCommitmentV10_2 {
  const found = context.ownState.public.commitments.find((item) => item.id === id);
  if (!found) throw new Error("DELIVERY_COMMITMENT_NOT_FOUND");
  return found;
}

function refresh(context: Context): void {
  const active = context.ownState.public.commitments.filter((item) => !["completed", "cancelled"].includes(item.status));
  const backlog = active.reduce((sum, item) => sum + item.backlogHours, 0);
  context.ownState.public.totalBacklogHours = round(backlog);
  const ratio = backlog / Math.max(1, active.reduce((sum, item) => sum + item.requiredHours, 0));
  context.ownState.public.deliverySignal = ratio > 1 ? "failing" : ratio > 0.55 ? "strained" : ratio > 0.2 ? "loaded" : "controlled";
}

export function createDeliveryServiceFeatureV10_2(options: { contractLifecycle?: boolean } = {}): SimulationFeatureV10<DeliveryServicePublicStateV10_2, PrivateState, z.infer<typeof configSchema>> {
  return {
    id: "delivery-and-service", version: options.contractLifecycle ? "1.1.0" : "1.0.0",
    dependencies: [{ id: "workforce-and-organization", versionRange: "^1.1.0" }, { id: "commercial-obligations", versionRange: "^1.0.0" }],
    compatibleEngineRange: ">=10.2.0 <11.0.0", configSchema,
    publicStateSchema: deliveryServicePublicStateSchemaV10_2, privateStateSchema: privateSchema,
    initialize: ({ config, rng }) => {
      const commitments = initialCommitments(config.profile);
      return {
        public: { commitments, totalBacklogHours: 0, deliverySignal: "controlled", busFactorSignal: "critical", recentFailures: [] },
        private: {
          accountReliability: Object.fromEntries(commitments.map((item) => [item.accountId, clamp(0.75 + rng.normal(0, 0.06))])),
          accountQuality: Object.fromEntries(commitments.map((item) => [item.accountId, clamp(0.72 + rng.normal(0, 0.08))])),
          outsourcedHours: {}, recoveryBoost: {}, processedPeriodKeys: [], profile: config.profile,
        },
      };
    },
    commands: {
      "delivery.plan.reallocate": (context) => {
        if (context.command.type !== "delivery.plan.reallocate") return;
        const item = commitment(context, context.command.payload.commitmentId);
        const { mode, capacityHours } = context.command.payload;
        if (mode === "protect") item.protectedHours = round(capacityHours);
        if (mode === "defer") { item.dueDay += 14; item.status = "at_risk"; }
        if (mode === "reduce_scope") {
          item.requiredHours = round(item.requiredHours * 0.8);
          context.emit({ type: "delivery-and-service.scope_reduced", visibility: "public", sourceId: item.id, payload: { commitmentId: item.id, accountId: item.accountId, unilateral: true }, causality: { exposureIds: [`scope-change:${item.id}:${context.kernel.simulationDay}`], obligationIds: [`obligation-sla-${item.accountId}`] } });
        }
        if (mode === "outsource") {
          if (capacityHours <= 0) throw new Error("OUTSOURCE_CAPACITY_REQUIRED");
          context.ownState.private.outsourcedHours[item.id] = round((context.ownState.private.outsourcedHours[item.id] ?? 0) + capacityHours);
          economic(context, { transactionId: `outsource:${item.id}:${context.command.commandId}`, kind: "expense", category: "vendor", amount: capacityHours * 45, memo: `External delivery capacity for ${item.accountId}`, dueDay: context.kernel.simulationDay });
        }
        context.emit({ type: "delivery-and-service.plan_reallocated", visibility: "public", sourceId: item.id, payload: { commitmentId: item.id, accountId: item.accountId, mode, capacityHours }, causality: { obligationIds: [`obligation-sla-${item.accountId}`] } });
      },
      "delivery.commitment.renegotiate": (context) => {
        if (context.command.type !== "delivery.commitment.renegotiate") return;
        const item = commitment(context, context.command.payload.commitmentId);
        item.dueDay += context.command.payload.requestedExtensionDays;
        item.requiredHours = round(item.requiredHours * (1 - context.command.payload.scopeReductionPercent / 100));
        item.status = "at_risk";
        context.emit({ type: "delivery-and-service.commitment_renegotiated", visibility: "public", sourceId: item.id, payload: { ...context.command.payload, accountId: item.accountId }, causality: { obligationIds: [`obligation-sla-${item.accountId}`] } });
        return { checkpointRequired: true };
      },
    },
    effects: {},
    queries: [{
      id: "delivery-and-service.account-health",
      resolve: ({ ownState }, input) => {
        const accountId = (input as { accountId?: string } | undefined)?.accountId ?? "";
        const items = ownState.public.commitments.filter((item) => item.accountId === accountId && item.status !== "cancelled");
        const required = Math.max(1, items.reduce((sum, item) => sum + item.requiredHours, 0));
        return { reliability: ownState.private.accountReliability[accountId] ?? 0.5, quality: ownState.private.accountQuality[accountId] ?? 0.5, backlogPressure: clamp(items.reduce((sum, item) => sum + item.backlogHours, 0) / required) };
      },
    }],
    eventSubscriptions: [{
      id: "delivery-customer-remediation", eventType: "customers-and-revenue.remediation_committed",
      handle: (context, event) => {
        const payload = event.payload as { accountId: string; action: string };
        if (payload.action === "recovery_plan" || payload.action === "executive_review") context.ownState.private.recoveryBoost[payload.accountId] = clamp((context.ownState.private.recoveryBoost[payload.accountId] ?? 0) + 0.12);
      },
    }, {
      id: "delivery-close-on-customer-churn", eventType: "customers-and-revenue.customer_churned",
      handle: (context, event) => {
        const accountId = (event.payload as { accountId: string }).accountId;
        for (const item of context.ownState.public.commitments.filter((candidate) => candidate.accountId === accountId)) item.status = "cancelled";
        refresh(context);
      },
    }, ...(options.contractLifecycle ? [{
      id: "delivery-from-signed-agreement", eventType: "contract-lifecycle.agreement_signed" as const,
      handle: (context: Context, event: { payload: unknown }) => {
        const payload = event.payload as { agreementId: string; accountId: string; implementationReadyDay: number; terms: { serviceLevel: "best_effort" | "standard" | "critical" } };
        const id = `implementation-${payload.agreementId}`;
        if (context.ownState.public.commitments.some((item) => item.id === id)) return;
        const requiredHours = context.ownState.private.profile === "healthcare" ? 150 : context.ownState.private.profile === "ai_workflow" ? 110 : 68;
        const item: DeliveryCommitmentV10_2 = {
          id, accountId: payload.accountId, label: "Contract implementation and acceptance", status: "active",
          dueDay: payload.implementationReadyDay, recurringDays: 30, requiredHours, completedHours: 0, backlogHours: 0, protectedHours: 0,
          requiredRoles: context.ownState.private.profile === "healthcare" ? ["engineering", "operations", "customer_success"] : context.ownState.private.profile === "ai_workflow" ? ["engineering", "product", "customer_success"] : ["operations", "customer_success", "engineering"],
          reliabilitySignal: "watch", qualitySignal: "mixed", priority: payload.terms.serviceLevel === "critical" ? 5 : 4,
        };
        context.ownState.public.commitments.push(item); context.ownState.private.accountReliability[payload.accountId] = 0.5; context.ownState.private.accountQuality[payload.accountId] = 0.52;
        context.emit({ type: "delivery-and-service.implementation_started", visibility: "public", sourceId: id, payload: { agreementId: payload.agreementId, accountId: payload.accountId, commitmentId: id, dueDay: item.dueDay }, causality: { obligationIds: [`agreement:${payload.agreementId}`, `acceptance:${payload.agreementId}`] } });
        refresh(context);
      },
    }] : [])],
    hooks: {
      after_operations_close: (context) => {
        const periodKey = `${context.kernel.fiscalPeriod}`;
        if (context.ownState.private.processedPeriodKeys.includes(periodKey)) return;
        context.ownState.private.processedPeriodKeys.push(periodKey);
        const capacity = context.query("workforce-and-organization.delivery-capacity") as { byRole: Record<string, { hours: number; quality: number }>; ownership: Record<string, number> };
        const remaining = Object.fromEntries(Object.entries(capacity.byRole).map(([role, value]) => [role, value.hours])) as Record<string, number>;
        const ordered = context.ownState.public.commitments.filter((item) => !["completed", "cancelled"].includes(item.status)).sort((left, right) => right.priority - left.priority || right.protectedHours - left.protectedHours || left.id.localeCompare(right.id));
        for (const item of ordered) {
          const roleShares = item.requiredRoles.map((role) => Math.max(0, remaining[role] ?? 0));
          const internalAvailable = roleShares.reduce((sum, value) => sum + value, 0) / item.requiredRoles.length;
          const outsource = context.ownState.private.outsourcedHours[item.id] ?? 0;
          const needed = item.requiredHours + item.backlogHours;
          const delivered = Math.min(needed, internalAvailable + outsource + item.protectedHours * 0.2);
          const consumedPerRole = Math.max(0, delivered - outsource) / item.requiredRoles.length;
          for (const role of item.requiredRoles) remaining[role] = Math.max(0, (remaining[role] ?? 0) - consumedPerRole);
          const quality = item.requiredRoles.reduce((sum, role) => sum + (capacity.byRole[role]?.quality ?? 0.55), 0) / item.requiredRoles.length;
          const boost = context.ownState.private.recoveryBoost[item.accountId] ?? 0;
          const reliability = clamp(delivered / Math.max(1, needed) * 0.72 + quality * 0.23 + boost);
          context.ownState.private.accountReliability[item.accountId] = reliability;
          context.ownState.private.accountQuality[item.accountId] = clamp(quality + boost * 0.5);
          item.completedHours = round(delivered);
          item.backlogHours = round(Math.max(0, needed - delivered));
          item.reliabilitySignal = reliability < 0.35 ? "failing" : reliability < 0.55 ? "strained" : reliability < 0.75 ? "watch" : "controlled";
          item.qualitySignal = quality < 0.45 ? "weak" : quality < 0.7 ? "mixed" : "credible";
          if (item.backlogHours > 0) {
            item.status = item.backlogHours > item.requiredHours * 0.5 ? "delayed" : "at_risk";
            context.emit({ type: "delivery-and-service.commitment_at_risk", visibility: "public", sourceId: item.id, payload: { commitmentId: item.id, accountId: item.accountId, backlogHours: item.backlogHours, reliabilitySignal: item.reliabilitySignal }, causality: { obligationIds: [`obligation-sla-${item.accountId}`] } });
          } else item.status = "active";
          if (context.kernel.simulationDay >= item.dueDay && (item.backlogHours > 0 || reliability < 0.52)) {
            const failureId = `delivery-failure:${item.id}:${context.kernel.simulationDay}`;
            context.ownState.public.recentFailures.push({ id: failureId, accountId: item.accountId, day: context.kernel.simulationDay, summary: `${item.label} missed its committed service threshold.` });
            context.emit({ type: "delivery-and-service.sla_missed", visibility: "public", sourceId: failureId, payload: { accountId: item.accountId, commitmentId: item.id, backlogHours: item.backlogHours, reliability }, causality: { exposureIds: [failureId], obligationIds: [`obligation-sla-${item.accountId}`] } });
          }
          if (quality < 0.5) context.emit({ type: "delivery-and-service.quality_failure_observed", visibility: "public", sourceId: item.id, payload: { accountId: item.accountId, commitmentId: item.id, qualitySignal: item.qualitySignal }, causality: { exposureIds: [`quality:${item.id}:${context.kernel.simulationDay}`], obligationIds: [`obligation-sla-${item.accountId}`] } });
          item.dueDay = Math.max(item.dueDay + item.recurringDays, context.kernel.simulationDay + item.recurringDays);
          item.completedHours = 0;
          item.protectedHours = 0;
          context.ownState.private.outsourcedHours[item.id] = 0;
          context.ownState.private.recoveryBoost[item.accountId] = clamp(boost * 0.5);
        }
        const owners = Object.values(capacity.ownership);
        const maxOwnership = owners.length ? Math.max(...owners) : 0;
        context.ownState.public.busFactorSignal = maxOwnership >= 3 ? "distributed" : maxOwnership === 2 ? "material" : maxOwnership === 1 ? "concentrated" : "critical";
        context.ownState.public.recentFailures = context.ownState.public.recentFailures.slice(-100);
        context.ownState.private.processedPeriodKeys = context.ownState.private.processedPeriodKeys.slice(-2_000);
        refresh(context);
      },
    },
    invariants: [{ id: "delivery-commitment-identities-and-finite-capacity", check: ({ ownState }) => {
      const ids = ownState.public.commitments.map((item) => item.id);
      if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_DELIVERY_COMMITMENT");
      for (const item of ownState.public.commitments) if (![item.requiredHours, item.completedHours, item.backlogHours, item.protectedHours].every(Number.isFinite)) throw new Error("NON_FINITE_DELIVERY_STATE");
    } }],
    projectionPolicy: { schema: deliveryServicePublicStateSchemaV10_2, project: ({ publicState }) => structuredClone(publicState), denyKeys: ["accountReliability", "accountQuality", "recoveryBoost"] },
    snapshotPolicy: { mode: "period_close", maximumCommandsBetweenSnapshots: 30 }, retentionPolicy: { maximumHeadBytes: 1_500_000, maximumMaterialRecords: 2_000, archiveClosedRecords: true },
  };
}
