import { z } from "zod";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";
import type { EconomicTransactionV10_2, TreasuryInvoiceV10_2 } from "./finance-treasury-v10-2";

const accountSchema = z.object({
  id: z.string(), name: z.string(), segment: z.string(),
  status: z.enum(["pilot", "active", "at_risk", "churned"]),
  monthlyPrice: z.number().finite().positive(), paymentTermsDays: z.number().int().nonnegative(),
  serviceLevel: z.enum(["best_effort", "standard", "critical"]),
  trustSignal: z.enum(["strong", "stable", "strained", "damaged"]),
  budgetSignal: z.enum(["funded", "watch", "stressed", "frozen"]),
  paymentSignal: z.enum(["unbilled", "current", "late", "partial", "disputed", "defaulted"]),
  valueSignal: z.enum(["clear", "mixed", "weak"]),
  switchingFriction: z.enum(["low", "material", "high"]),
  contractStartDay: z.number().int().nonnegative(), nextRenewalDay: z.number().int().nonnegative(),
  collectionActions: z.number().int().nonnegative(),
  agreementId: z.string().optional(),
  billingModel: z.enum(["monthly_advance", "monthly_arrears", "annual_prepaid", "milestone"]).optional(),
  termMonths: z.number().int().positive().optional(),
  implementationFeeUnbilled: z.number().finite().nonnegative().optional(),
}).strict();
export type CustomerAccountV10_2 = z.infer<typeof accountSchema>;

const paymentRecordSchema = z.object({
  invoiceId: z.string(), accountId: z.string(), dueDay: z.number().int().nonnegative(),
  status: z.enum(["issued", "paid", "partial", "late", "disputed", "defaulted", "written_off"]),
  observedDay: z.number().int().nonnegative(),
}).strict();

export const customersRevenuePublicStateSchemaV10_2 = z.object({
  accounts: z.array(accountSchema).max(120),
  cohorts: z.array(z.object({ id: z.string(), accountIds: z.array(z.string()), startingRevenue: z.number().nonnegative(), retainedRevenue: z.number().nonnegative() }).strict()).max(40),
  paymentRecords: z.array(paymentRecordSchema).max(500),
  concentrationSignal: z.enum(["diversified", "material", "concentrated", "critical"]),
  revenueSignal: z.enum(["pre_revenue", "fragile", "developing", "repeatable"]),
}).strict();
export type CustomersRevenuePublicStateV10_2 = z.infer<typeof customersRevenuePublicStateSchemaV10_2>;

const accountTruthSchema = z.object({
  accountId: z.string(), liquidityResilience: z.number().min(0).max(1),
  valueThreshold: z.number().min(0).max(1), churnSensitivity: z.number().min(0).max(1),
  collectionPressure: z.number().min(0).max(1), relationshipTrust: z.number().min(0).max(1),
  renewalQuantile: z.number().min(0).max(1), suspensionPermitted: z.boolean(),
});
const privateSchema = z.object({
  accountTruth: z.record(z.string(), accountTruthSchema),
  nextInvoiceSequence: z.number().int().positive(),
  profile: z.enum(["ai_workflow", "local_services", "healthcare"]),
}).strict();
export type CustomersRevenuePrivateStateV10_2 = z.infer<typeof privateSchema>;

const configSchema = z.object({ profile: z.enum(["ai_workflow", "local_services", "healthcare"]) }).default({ profile: "ai_workflow" });
type Context = FeatureRuntimeContextV10<CustomersRevenuePublicStateV10_2, CustomersRevenuePrivateStateV10_2>;
const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));
const round = (value: number): number => Math.round(value * 100) / 100;

function accountTemplates(profile: z.infer<typeof configSchema>["profile"]): CustomerAccountV10_2[] {
  const common = { status: "active" as const, trustSignal: "stable" as const, paymentSignal: "unbilled" as const, valueSignal: "mixed" as const, collectionActions: 0, contractStartDay: 0 };
  if (profile === "local_services") return [
    { ...common, id: "account-design-1", name: "Northside Field Services", segment: "local_operator", monthlyPrice: 140, paymentTermsDays: 30, serviceLevel: "standard", budgetSignal: "watch", switchingFriction: "material", nextRenewalDay: 90 },
    { ...common, id: "account-design-2", name: "Harbor Home Repair", segment: "local_operator", monthlyPrice: 110, paymentTermsDays: 30, serviceLevel: "best_effort", budgetSignal: "funded", switchingFriction: "low", nextRenewalDay: 90 },
  ];
  if (profile === "healthcare") return [
    { ...common, id: "account-design-1", name: "Meridian Care Network", segment: "regional_provider", monthlyPrice: 1_800, paymentTermsDays: 90, serviceLevel: "critical", budgetSignal: "funded", switchingFriction: "high", nextRenewalDay: 180 },
    { ...common, id: "account-design-2", name: "Sable Clinical Operations", segment: "specialty_clinic", monthlyPrice: 950, paymentTermsDays: 60, serviceLevel: "critical", budgetSignal: "watch", switchingFriction: "high", nextRenewalDay: 180 },
  ];
  return [
    { ...common, id: "account-design-1", name: "Beacon Workflow Partners", segment: "smb_operations", monthlyPrice: 850, paymentTermsDays: 30, serviceLevel: "standard", budgetSignal: "funded", switchingFriction: "material", nextRenewalDay: 120 },
    { ...common, id: "account-design-2", name: "Cedar Backoffice", segment: "mid_market_operations", monthlyPrice: 1_250, paymentTermsDays: 60, serviceLevel: "critical", budgetSignal: "watch", switchingFriction: "material", nextRenewalDay: 120 },
  ];
}

function economic(context: Context, transaction: EconomicTransactionV10_2, causality?: { obligationIds?: string[]; exposureIds?: string[] }): void {
  context.emit({ type: "customers-and-revenue.economic_transaction_requested", sourceId: transaction.transactionId, payload: transaction, causality });
}

function findAccount(context: Context, accountId: string): CustomerAccountV10_2 {
  const found = context.ownState.public.accounts.find((item) => item.id === accountId);
  if (!found) throw new Error("CUSTOMER_ACCOUNT_NOT_FOUND");
  return found;
}

function updateSummary(context: Context): void {
  const live = context.ownState.public.accounts.filter((item) => item.status !== "churned");
  const total = live.reduce((sum, item) => sum + item.monthlyPrice, 0);
  const largest = Math.max(0, ...live.map((item) => item.monthlyPrice));
  const concentration = total > 0 ? largest / total : 0;
  context.ownState.public.concentrationSignal = concentration > 0.7 ? "critical" : concentration > 0.5 ? "concentrated" : concentration > 0.3 ? "material" : "diversified";
  context.ownState.public.revenueSignal = total <= 0 ? "pre_revenue" : live.length < 2 ? "fragile" : live.length < 5 ? "developing" : "repeatable";
  for (const cohort of context.ownState.public.cohorts) cohort.retainedRevenue = round(cohort.accountIds.reduce((sum, id) => sum + (context.ownState.public.accounts.find((item) => item.id === id && item.status !== "churned")?.monthlyPrice ?? 0), 0));
}

function setPaymentRecord(context: Context, invoiceId: string, accountId: string, dueDay: number, status: z.infer<typeof paymentRecordSchema>["status"]): void {
  const existing = context.ownState.public.paymentRecords.find((item) => item.invoiceId === invoiceId);
  if (existing) {
    existing.status = status;
    existing.observedDay = context.kernel.simulationDay;
  } else context.ownState.public.paymentRecords.push({ invoiceId, accountId, dueDay, status, observedDay: context.kernel.simulationDay });
  context.ownState.public.paymentRecords = context.ownState.public.paymentRecords.slice(-500);
}

function scheduleRecovery(context: Context, invoiceId: string, accountId: string, dueDay: number, quantile: number, delayDays: number): void {
  context.schedule({
    type: "customers-and-revenue.payment_recovery", dueDay: context.kernel.simulationDay + Math.max(1, delayDays), sourceId: invoiceId,
    payload: { invoiceId, accountId, originalDueDay: dueDay }, sampledOutcome: { settlementQuantile: quantile },
    causality: { obligationIds: [`payment:${invoiceId}`] },
  });
}

function attemptSettlement(context: Context, invoiceId: string, accountId: string, originalDueDay: number, quantile: number, recovery: boolean): void {
  const account = findAccount(context, accountId);
  const item = context.query("finance-and-treasury.invoice", { invoiceId }) as TreasuryInvoiceV10_2 | null;
  if (!item || item.openBalance <= 0 || account.status === "churned") return;
  const factors = context.query("external-world.domain-factors") as { customerLiquidity: number; collectionDelay: number };
  const truth = context.ownState.private.accountTruth[accountId];
  const elapsed = Math.max(0, context.kernel.simulationDay - originalDueDay);
  const timelyThreshold = clamp(0.62 * factors.customerLiquidity / factors.collectionDelay * truth.liquidityResilience + truth.collectionPressure * 0.22 + (recovery ? elapsed / 240 : 0), 0.05, 0.92);
  if (quantile <= timelyThreshold) {
    economic(context, { transactionId: `payment:${invoiceId}:${context.kernel.simulationDay}`, kind: "customer_payment", invoiceId, accountId, amount: item.openBalance, memo: `Collection from ${account.name}`, dueDay: context.kernel.simulationDay }, { obligationIds: [`payment:${invoiceId}`] });
    setPaymentRecord(context, invoiceId, accountId, item.dueDay, "paid");
    account.paymentSignal = "current";
    truth.collectionPressure = clamp(truth.collectionPressure * 0.45);
    context.emit({ type: "customers-and-revenue.payment_received", visibility: "public", sourceId: invoiceId, payload: { invoiceId, accountId, amount: item.openBalance }, causality: { obligationIds: [`payment:${invoiceId}`] } });
    return;
  }
  if (quantile <= timelyThreshold + 0.2 && item.openBalance > 1) {
    const amount = round(item.openBalance * (0.35 + (1 - quantile) * 0.25));
    economic(context, { transactionId: `partial-payment:${invoiceId}:${context.kernel.simulationDay}`, kind: "customer_payment", invoiceId, accountId, amount, memo: `Partial collection from ${account.name}`, dueDay: context.kernel.simulationDay }, { obligationIds: [`payment:${invoiceId}`] });
    setPaymentRecord(context, invoiceId, accountId, item.dueDay, "partial");
    account.paymentSignal = "partial";
    context.emit({ type: "customers-and-revenue.partial_payment_received", visibility: "public", sourceId: invoiceId, payload: { invoiceId, accountId, amount }, causality: { obligationIds: [`payment:${invoiceId}`] } });
    scheduleRecovery(context, invoiceId, accountId, originalDueDay, quantile, Math.round(12 * factors.collectionDelay));
    return;
  }
  const age = context.kernel.simulationDay - originalDueDay;
  account.paymentSignal = age > 75 ? "defaulted" : "late";
  setPaymentRecord(context, invoiceId, accountId, item.dueDay, age > 75 ? "defaulted" : "late");
  if (age > 75) {
    economic(context, { transactionId: `allowance:${invoiceId}`, kind: "receivable_allowance", invoiceId, accountId, amount: item.openBalance * 0.75, memo: `Expected credit loss for ${account.name}`, dueDay: context.kernel.simulationDay }, { exposureIds: [`credit-loss:${invoiceId}`], obligationIds: [`payment:${invoiceId}`] });
    context.emit({ type: "customers-and-revenue.receivable_defaulted", visibility: "public", sourceId: invoiceId, payload: { invoiceId, accountId, openBalance: item.openBalance }, causality: { exposureIds: [`credit-loss:${invoiceId}`], obligationIds: [`payment:${invoiceId}`] } });
    return;
  }
  if (quantile > 0.9 && age >= 30) {
    account.paymentSignal = "disputed";
    setPaymentRecord(context, invoiceId, accountId, item.dueDay, "disputed");
    context.emit({ type: "customers-and-revenue.invoice_disputed", visibility: "public", sourceId: invoiceId, payload: { invoiceId, accountId, disputedAmount: item.openBalance }, causality: { exposureIds: [`billing-dispute:${invoiceId}`], obligationIds: [`payment:${invoiceId}`] } });
  } else {
    context.emit({ type: "customers-and-revenue.payment_delayed", visibility: "public", sourceId: invoiceId, payload: { invoiceId, accountId, daysLate: age }, causality: { obligationIds: [`payment:${invoiceId}`] } });
    scheduleRecovery(context, invoiceId, accountId, originalDueDay, quantile, Math.round(15 * factors.collectionDelay));
  }
}

export function createCustomersRevenueFeatureV10_2(options: { contractLifecycle?: boolean } = {}): SimulationFeatureV10<CustomersRevenuePublicStateV10_2, CustomersRevenuePrivateStateV10_2, z.infer<typeof configSchema>> {
  return {
    id: "customers-and-revenue", version: options.contractLifecycle ? "2.0.0" : "1.0.0",
    dependencies: [
      { id: "external-world", versionRange: "^1.0.0" },
      { id: "finance-and-treasury", versionRange: "^1.2.0" },
      { id: "delivery-and-service", versionRange: "^1.0.0" },
    ],
    compatibleEngineRange: ">=10.2.0 <11.0.0", configSchema,
    publicStateSchema: customersRevenuePublicStateSchemaV10_2, privateStateSchema: privateSchema,
    initialize: ({ config, rng, schedule }) => {
      const accounts = accountTemplates(config.profile);
      for (const account of accounts) schedule({ type: "customers-and-revenue.billing_cycle", dueDay: 1, sourceId: account.id, payload: { accountId: account.id }, sampledOutcome: { settlementQuantile: rng.nextFloat() }, causality: { obligationIds: [`contract:${account.id}`] } });
      const total = accounts.reduce((sum, item) => sum + item.monthlyPrice, 0);
      return {
        public: { accounts, cohorts: [{ id: "cohort-design-partners", accountIds: accounts.map((item) => item.id), startingRevenue: total, retainedRevenue: total }], paymentRecords: [], concentrationSignal: accounts.length === 2 ? "concentrated" : "material", revenueSignal: "developing" },
        private: {
          accountTruth: Object.fromEntries(accounts.map((account, index) => [account.id, { accountId: account.id, liquidityResilience: clamp(0.58 + rng.normal(0, 0.14)), valueThreshold: clamp(0.55 + rng.normal(0, 0.12)), churnSensitivity: clamp(0.52 + rng.normal(0, 0.15)), collectionPressure: 0, relationshipTrust: 0.68 - index * 0.05, renewalQuantile: rng.nextFloat(), suspensionPermitted: account.serviceLevel !== "critical" }])),
          nextInvoiceSequence: 1, profile: config.profile,
        },
      };
    },
    commands: {
      "treasury.collection.act": (context) => {
        if (context.command.type !== "treasury.collection.act") return;
        const item = context.query("finance-and-treasury.invoice", { invoiceId: context.command.payload.invoiceId }) as TreasuryInvoiceV10_2 | null;
        if (!item || item.openBalance <= 0) throw new Error("OPEN_INVOICE_NOT_FOUND");
        const account = findAccount(context, item.accountId);
        const truth = context.ownState.private.accountTruth[account.id];
        account.collectionActions += 1;
        const action = context.command.payload.action;
        let delay = 7;
        if (action === "contact_buyer") truth.collectionPressure = clamp(truth.collectionPressure + 0.08);
        if (action === "request_payment_plan") { truth.collectionPressure = clamp(truth.collectionPressure + 0.13); truth.relationshipTrust = clamp(truth.relationshipTrust + 0.02); delay = 15; }
        if (action === "offer_early_pay_discount" || action === "accept_settlement") {
          const percent = context.command.payload.discountPercent ?? (action === "accept_settlement" ? 20 : 5);
          const amount = round(item.openBalance * clamp(percent / 100, 0, 0.5));
          if (amount <= 0) throw new Error("DISCOUNT_REQUIRED");
          economic(context, { transactionId: `credit:${item.id}:${context.command.commandId}`, kind: "credit_note", invoiceId: item.id, accountId: account.id, amount, memo: `${action.replaceAll("_", " ")} for ${account.name}`, dueDay: context.kernel.simulationDay }, { obligationIds: [`payment:${item.id}`] });
          truth.collectionPressure = clamp(truth.collectionPressure + 0.25); delay = 3;
        }
        if (action === "suspend_service") {
          if (!truth.suspensionPermitted) throw new Error("SERVICE_SUSPENSION_NOT_PERMITTED");
          truth.collectionPressure = clamp(truth.collectionPressure + 0.28);
          truth.relationshipTrust = clamp(truth.relationshipTrust - 0.18);
        }
        if (action === "engage_collections_partner") {
          economic(context, { transactionId: `collections-cost:${item.id}:${context.command.commandId}`, kind: "expense", category: "collections", amount: Math.max(25, item.openBalance * 0.08), memo: `Collections partner for ${account.name}`, dueDay: context.kernel.simulationDay });
          truth.collectionPressure = clamp(truth.collectionPressure + 0.34); truth.relationshipTrust = clamp(truth.relationshipTrust - 0.12);
        }
        if (action === "write_off") {
          economic(context, { transactionId: `writeoff:${item.id}`, kind: "receivable_write_off", invoiceId: item.id, accountId: account.id, amount: item.openBalance, memo: `Write off ${account.name} receivable`, dueDay: context.kernel.simulationDay }, { exposureIds: [`credit-loss:${item.id}`], obligationIds: [`payment:${item.id}`] });
          setPaymentRecord(context, item.id, account.id, item.dueDay, "written_off");
        } else scheduleRecovery(context, item.id, account.id, item.dueDay, clamp(0.98 - truth.collectionPressure * 0.55), delay);
        context.emit({ type: "customers-and-revenue.collection_action_recorded", visibility: "public", sourceId: item.id, payload: { invoiceId: item.id, accountId: account.id, action }, causality: { obligationIds: [`payment:${item.id}`] } });
      },
      "treasury.invoice.dispute_respond": (context) => {
        if (context.command.type !== "treasury.invoice.dispute_respond") return;
        const item = context.query("finance-and-treasury.invoice", { invoiceId: context.command.payload.invoiceId }) as TreasuryInvoiceV10_2 | null;
        if (!item || item.disputedAmount <= 0) throw new Error("DISPUTED_INVOICE_NOT_FOUND");
        const account = findAccount(context, item.accountId);
        if (context.command.payload.action === "issue_credit") {
          const amount = Math.min(item.openBalance, context.command.payload.amount ?? item.disputedAmount);
          economic(context, { transactionId: `dispute-credit:${item.id}:${context.command.commandId}`, kind: "credit_note", invoiceId: item.id, accountId: account.id, amount, memo: `Billing dispute credit for ${account.name}`, dueDay: context.kernel.simulationDay });
        }
        const truth = context.ownState.private.accountTruth[account.id];
        truth.collectionPressure = clamp(truth.collectionPressure + (context.command.payload.action === "provide_evidence" ? 0.18 : 0.08));
        truth.relationshipTrust = clamp(truth.relationshipTrust + (context.command.payload.action === "negotiate" ? 0.05 : context.command.payload.action === "defend" ? -0.08 : 0));
        scheduleRecovery(context, item.id, account.id, item.dueDay, clamp(0.9 - truth.collectionPressure * 0.5), 10);
      },
      "customer.contract.amend": (context) => {
        if (context.command.type !== "customer.contract.amend") return;
        const account = findAccount(context, context.command.payload.accountId);
        account.paymentTermsDays = context.command.payload.paymentTermsDays;
        account.serviceLevel = context.command.payload.serviceLevel;
        account.monthlyPrice = context.command.payload.monthlyPrice;
        context.emit({ type: "customers-and-revenue.contract_amended", visibility: "public", sourceId: account.id, payload: structuredClone(context.command.payload), causality: { obligationIds: [`contract:${account.id}`] } });
        updateSummary(context);
        return { checkpointRequired: true };
      },
      "customer.remediation.commit": (context) => {
        if (context.command.type !== "customer.remediation.commit") return;
        const account = findAccount(context, context.command.payload.accountId);
        const truth = context.ownState.private.accountTruth[account.id];
        if (context.command.payload.action === "accept_churn") account.status = "churned";
        else truth.relationshipTrust = clamp(truth.relationshipTrust + (context.command.payload.action === "executive_review" ? 0.08 : 0.12));
        if (context.command.payload.action === "service_credit") {
          const invoices = context.query("finance-and-treasury.account-invoices", { accountId: account.id }) as TreasuryInvoiceV10_2[];
          const item = invoices.find((candidate) => candidate.openBalance > 0);
          if (!item) throw new Error("OPEN_INVOICE_NOT_FOUND");
          const amount = Math.min(item.openBalance, context.command.payload.amount ?? item.openBalance * 0.1);
          economic(context, { transactionId: `remediation-credit:${item.id}:${context.command.commandId}`, kind: "credit_note", invoiceId: item.id, accountId: account.id, amount, memo: `Service remediation credit for ${account.name}`, dueDay: context.kernel.simulationDay });
        }
        context.emit({ type: "customers-and-revenue.remediation_committed", visibility: "public", sourceId: account.id, payload: { accountId: account.id, action: context.command.payload.action }, causality: { obligationIds: [`contract:${account.id}`] } });
        updateSummary(context);
      },
    },
    effects: {
      "customers-and-revenue.billing_cycle": (context) => {
        const payload = context.effect.payload as { accountId: string };
        const account = findAccount(context, payload.accountId);
        if (account.status === "churned") return;
        const invoiceId = `invoice-${context.ownState.private.nextInvoiceSequence++}`;
        const annualPrepaid = account.billingModel === "annual_prepaid";
        const implementationFee = account.implementationFeeUnbilled ?? 0;
        const invoiceAmount = round(account.monthlyPrice * (annualPrepaid ? Math.min(12, account.termMonths ?? 12) : 1) + implementationFee);
        account.implementationFeeUnbilled = 0;
        const dueDay = context.kernel.simulationDay + account.paymentTermsDays;
        economic(context, { transactionId: `issued:${invoiceId}`, kind: "invoice_issued", invoiceId, accountId: account.id, amount: invoiceAmount, memo: `${annualPrepaid ? "Annual prepaid" : "Service"} invoice for ${account.name}`, dueDay }, { obligationIds: [`contract:${account.id}`, `payment:${invoiceId}`] });
        setPaymentRecord(context, invoiceId, account.id, dueDay, "issued");
        context.emit({ type: "customers-and-revenue.invoice_issued", visibility: "public", sourceId: invoiceId, payload: { invoiceId, accountId: account.id, amount: invoiceAmount, dueDay }, causality: { obligationIds: [`contract:${account.id}`, `payment:${invoiceId}`] } });
        context.schedule({ type: "customers-and-revenue.payment_due", dueDay: Math.max(context.kernel.simulationDay + 1, dueDay), sourceId: invoiceId, payload: { invoiceId, accountId: account.id, originalDueDay: dueDay }, sampledOutcome: { settlementQuantile: context.rng.nextFloat() }, causality: { obligationIds: [`payment:${invoiceId}`] } });
        if (annualPrepaid) {
          const recognitionMonths = Math.min(12, account.termMonths ?? 12);
          for (let month = 1; month <= recognitionMonths; month += 1) context.schedule({ type: "customers-and-revenue.revenue_recognition", dueDay: context.kernel.simulationDay + month * 30, sourceId: invoiceId, payload: { invoiceId, amount: account.monthlyPrice + (month === 1 ? implementationFee : 0), recognitionId: `${invoiceId}:${month}` }, causality: { obligationIds: [`contract:${account.id}`] } });
        } else context.schedule({ type: "customers-and-revenue.revenue_recognition", dueDay: context.kernel.simulationDay + 30, sourceId: invoiceId, payload: { invoiceId, amount: account.monthlyPrice + implementationFee }, causality: { obligationIds: [`contract:${account.id}`] } });
        context.schedule({ type: "customers-and-revenue.billing_cycle", dueDay: context.kernel.simulationDay + (annualPrepaid ? 360 : 30), sourceId: account.id, payload: { accountId: account.id }, sampledOutcome: { settlementQuantile: context.rng.nextFloat() }, causality: { obligationIds: [`contract:${account.id}`] } });
      },
      "customers-and-revenue.payment_due": (context) => {
        const payload = context.effect.payload as { invoiceId: string; accountId: string; originalDueDay: number };
        const sampled = context.effect.sampledOutcome as { settlementQuantile: number };
        attemptSettlement(context, payload.invoiceId, payload.accountId, payload.originalDueDay, sampled.settlementQuantile, false);
      },
      "customers-and-revenue.payment_recovery": (context) => {
        const payload = context.effect.payload as { invoiceId: string; accountId: string; originalDueDay: number };
        const sampled = context.effect.sampledOutcome as { settlementQuantile: number };
        attemptSettlement(context, payload.invoiceId, payload.accountId, payload.originalDueDay, sampled.settlementQuantile, true);
      },
      "customers-and-revenue.revenue_recognition": (context) => {
        const payload = context.effect.payload as { invoiceId: string; amount: number; recognitionId?: string };
        economic(context, { transactionId: `recognized:${payload.recognitionId ?? payload.invoiceId}`, kind: "revenue_recognized", invoiceId: payload.invoiceId, amount: payload.amount, memo: `Service revenue recognized for ${payload.invoiceId}`, dueDay: context.kernel.simulationDay });
      },
    },
    queries: [{ id: "customers-and-revenue.account", resolve: ({ ownState }, input) => structuredClone(ownState.public.accounts.find((item) => item.id === (input as { accountId?: string } | undefined)?.accountId) ?? null) }],
    eventSubscriptions: options.contractLifecycle ? [{
      id: "customer-account-from-activated-agreement", eventType: "contract-lifecycle.agreement_activated",
      handle: (context, event) => {
        const payload = event.payload as { agreementId: string; organizationId: string; accountId: string; acceptanceDay: number; nextRenewalDay: number; terms: { billingModel: "monthly_advance" | "monthly_arrears" | "annual_prepaid" | "milestone"; monthlyPrice: number; implementationFee: number; termMonths: number; paymentTermsDays: 0 | 15 | 30 | 60 | 90 | 120; serviceLevel: "best_effort" | "standard" | "critical" } };
        if (context.ownState.public.accounts.some((account) => account.id === payload.accountId)) return;
        const organization = context.query("customer-organizations.organization", { organizationId: payload.organizationId }) as { name: string; segment: string } | null;
        if (!organization) throw new Error("ACTIVATED_AGREEMENT_ORGANIZATION_MISSING");
        const account: CustomerAccountV10_2 = {
          id: payload.accountId, name: organization.name, segment: organization.segment, status: "active",
          monthlyPrice: payload.terms.monthlyPrice, paymentTermsDays: payload.terms.paymentTermsDays, serviceLevel: payload.terms.serviceLevel,
          trustSignal: "stable", budgetSignal: "funded", paymentSignal: "unbilled", valueSignal: "mixed", switchingFriction: payload.terms.termMonths >= 12 ? "high" : "material",
          contractStartDay: payload.acceptanceDay, nextRenewalDay: payload.nextRenewalDay, collectionActions: 0,
          agreementId: payload.agreementId, billingModel: payload.terms.billingModel, termMonths: payload.terms.termMonths, implementationFeeUnbilled: payload.terms.implementationFee,
        };
        context.ownState.public.accounts.push(account); context.ownState.private.accountTruth[account.id] = { accountId: account.id, liquidityResilience: clamp(0.62 + context.rng.normal(0, 0.12)), valueThreshold: clamp(0.58 + context.rng.normal(0, 0.1)), churnSensitivity: clamp(0.5 + context.rng.normal(0, 0.14)), collectionPressure: 0, relationshipTrust: 0.67, renewalQuantile: context.rng.nextFloat(), suspensionPermitted: account.serviceLevel !== "critical" };
        context.ownState.public.cohorts.push({ id: `cohort-${payload.acceptanceDay}-${payload.agreementId}`, accountIds: [account.id], startingRevenue: account.monthlyPrice, retainedRevenue: account.monthlyPrice });
        context.schedule({ type: "customers-and-revenue.billing_cycle", dueDay: context.kernel.simulationDay + (account.billingModel === "monthly_arrears" ? 30 : 1), sourceId: account.id, payload: { accountId: account.id }, sampledOutcome: { settlementQuantile: context.rng.nextFloat() }, causality: { obligationIds: [`agreement:${payload.agreementId}`] } });
        context.emit({ type: "customers-and-revenue.account_activated", visibility: "public", sourceId: account.id, payload: { accountId: account.id, agreementId: payload.agreementId, organizationId: payload.organizationId, billingModel: account.billingModel }, causality: { obligationIds: [`agreement:${payload.agreementId}`] } });
        updateSummary(context);
      },
    }] : [],
    hooks: {
      after_commercial_close: (context) => {
        const factors = context.query("external-world.domain-factors") as { customerLiquidity: number; churnPressure: number };
        for (const account of context.ownState.public.accounts.filter((item) => item.status !== "churned")) {
          const truth = context.ownState.private.accountTruth[account.id];
          const delivery = context.query("delivery-and-service.account-health", { accountId: account.id }) as { reliability: number; backlogPressure: number };
          truth.relationshipTrust = clamp(truth.relationshipTrust - delivery.backlogPressure * 0.08 + delivery.reliability * 0.025);
          const hazard = clamp((1 - delivery.reliability) * 0.28 + delivery.backlogPressure * 0.2 + (factors.churnPressure - 1) * 0.18 + (1 - factors.customerLiquidity) * 0.12 + (1 - truth.relationshipTrust) * truth.churnSensitivity * 0.18, 0.01, 0.65);
          if (truth.renewalQuantile < hazard && context.kernel.simulationDay >= account.nextRenewalDay) {
            account.status = "churned";
            context.emit({ type: "customers-and-revenue.customer_churned", visibility: "public", sourceId: account.id, payload: { accountId: account.id, deliverySignal: delivery, paymentSignal: account.paymentSignal }, causality: { exposureIds: [`customer-loss:${account.id}`], obligationIds: [`contract:${account.id}`] } });
          } else {
            account.status = hazard > 0.35 ? "at_risk" : "active";
            account.trustSignal = truth.relationshipTrust < 0.3 ? "damaged" : truth.relationshipTrust < 0.5 ? "strained" : truth.relationshipTrust < 0.75 ? "stable" : "strong";
            account.budgetSignal = factors.customerLiquidity < 0.55 ? "frozen" : factors.customerLiquidity < 0.8 ? "stressed" : factors.customerLiquidity < 1 ? "watch" : "funded";
          }
          truth.renewalQuantile = context.rng.nextFloat();
        }
        updateSummary(context);
      },
    },
    invariants: [{
      id: "customers-v10-2-identities-and-payment-links",
      check: ({ ownState }) => {
        const ids = ownState.public.accounts.map((item) => item.id);
        if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_CUSTOMER_ACCOUNT");
        for (const id of ids) if (!ownState.private.accountTruth[id]) throw new Error(`CUSTOMER_TRUTH_MISSING:${id}`);
        for (const record of ownState.public.paymentRecords) if (!ids.includes(record.accountId)) throw new Error("PAYMENT_ACCOUNT_MISSING");
      },
    }],
    projectionPolicy: { schema: customersRevenuePublicStateSchemaV10_2, project: ({ publicState }) => structuredClone(publicState), denyKeys: ["liquidityResilience", "valueThreshold", "churnSensitivity", "renewalQuantile", "relationshipTrust"] },
    snapshotPolicy: { mode: "period_close", maximumCommandsBetweenSnapshots: 30 },
    retentionPolicy: { maximumHeadBytes: 2_500_000, maximumMaterialRecords: 4_000, archiveClosedRecords: true },
  };
}
