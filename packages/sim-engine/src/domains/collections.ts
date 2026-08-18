import { clamp, round } from "../kernel/math";
import { scheduleEffect } from "../kernel/scheduler";
import type { DomainEmitter } from "../features/contracts";
import { realism85Enabled } from "../features/realism";
import type { ScenarioDefinition, ScheduledEffect, SimulationCommand, SimulationState } from "../types";
import { negotiateContract } from "./market";
import { postJournal } from "./finance";

export type InvoiceStatus = "issued" | "due" | "late" | "partial" | "disputed" | "paid" | "written_off";

export type InvoiceRecord = {
  id: string;
  accountId: string;
  issuedDay: number;
  dueDay: number;
  originalAmount: number;
  outstandingAmount: number;
  status: InvoiceStatus;
  attempts: number;
  lastAttemptDay: number | null;
};

type CollectionsPublicState = {
  mode: "credit-risk";
  invoices: InvoiceRecord[];
  badDebtExpense: number;
  arAging: { current: number; days31To60: number; days61To90: number; over90: number };
};

type InvoiceRisk = {
  payerReliability: number;
  disputePropensity: number;
  liquidityStress: number;
};

type CollectionsPrivateState = {
  invoiceRisk: Record<string, InvoiceRisk>;
};

export function initializeCollections(scenario: ScenarioDefinition) {
  if (scenario.version !== "2.1.0") return {};
  return {
    public: {
      mode: "credit-risk",
      invoices: [],
      badDebtExpense: 0,
      arAging: { current: 0, days31To60: 0, days61To90: 0, over90: 0 },
    } satisfies CollectionsPublicState,
    private: { invoiceRisk: {} } satisfies CollectionsPrivateState,
  };
}

export function collectionsPublic(state: SimulationState): CollectionsPublicState {
  const value = state.features?.public["customers-and-sales"];
  if (!value) throw new Error("COLLECTIONS_PUBLIC_STATE_MISSING");
  return value as CollectionsPublicState;
}

function collectionsPrivate(state: SimulationState): CollectionsPrivateState {
  const value = state.features?.private["customers-and-sales"];
  if (!value) throw new Error("COLLECTIONS_PRIVATE_STATE_MISSING");
  return value as CollectionsPrivateState;
}

function hashUnit(value: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4_294_967_296;
}

function nextInvoiceId(state: SimulationState, accountId: string) {
  return `invoice_${accountId}_${collectionsPublic(state).invoices.length + 1}`;
}

function createInvoiceFromPaymentEffect(state: SimulationState, effect: ScheduledEffect) {
  const publicState = collectionsPublic(state);
  const privateState = collectionsPrivate(state);
  const accountId = String(effect.payload.accountId ?? effect.sourceId);
  const amount = round(Number(effect.payload.amount ?? 0));
  if (!Number.isFinite(amount) || amount <= 0) return;
  const invoiceId = nextInvoiceId(state, accountId);
  const account = state.market.accounts.find((item) => item.id === accountId);
  const invoice: InvoiceRecord = {
    id: invoiceId,
    accountId,
    issuedDay: state.calendar.absoluteDay,
    dueDay: effect.dueDay,
    originalAmount: amount,
    outstandingAmount: amount,
    status: "issued",
    attempts: 0,
    lastAttemptDay: null,
  };
  publicState.invoices.push(invoice);
  const reliabilityNoise = hashUnit(`${state.seed}:${invoiceId}`, 11) * 0.2 - 0.1;
  const disputeNoise = hashUnit(`${state.seed}:${invoiceId}`, 29) * 0.1;
  const liquidityNoise = hashUnit(`${state.seed}:${invoiceId}`, 47) * 0.18;
  privateState.invoiceRisk[invoiceId] = {
    payerReliability: clamp(0.5 + (account?.trust ?? 24) / 260 + (account?.procurementProgress ?? 0) / 500 - (account?.blockerRisk ?? 45) / 650 + reliabilityNoise, 0.18, 0.94),
    disputePropensity: clamp(0.04 + (100 - (account?.riskClearance ?? 20)) / 650 + (account?.dealTerms?.onboardingMode === "custom" ? 0.06 : 0) + disputeNoise, 0.03, 0.34),
    liquidityStress: clamp(0.03 + liquidityNoise + (account?.collectionDelayDays ?? 30) / 600, 0.03, 0.34),
  };
  effect.type = "customers-and-sales.collection_attempt";
  effect.sourceId = invoiceId;
  effect.payload = { invoiceId, accountId, amount };
}

export function capturePendingCollections(state: SimulationState) {
  if (!realism85Enabled(state)) return;
  for (const effect of state.scheduledEffects.filter((item) => item.type === "payment_received")) createInvoiceFromPaymentEffect(state, effect);
  updateArAging(state);
}

export function negotiateContractWithCreditRisk(
  state: SimulationState,
  input: Extract<SimulationCommand, { type: "contract.negotiate" }>["payload"],
  emit: DomainEmitter,
) {
  const existingEffectIds = new Set(state.scheduledEffects.map((effect) => effect.id));
  negotiateContract(state, input.accountId, input.price, input.contractMonths, input.discountForPrepay, {
    paymentTermsDays: input.paymentTermsDays,
    onboardingMode: input.onboardingMode,
    supportSlaHours: input.supportSlaHours,
    dataTerms: input.dataTerms,
  }, emit);
  if (!realism85Enabled(state)) return;
  for (const effect of state.scheduledEffects.filter((item) => !existingEffectIds.has(item.id) && item.type === "payment_received")) {
    createInvoiceFromPaymentEffect(state, effect);
  }
  updateArAging(state);
}

function postCollection(state: SimulationState, invoice: InvoiceRecord, amount: number, emit: DomainEmitter) {
  const collected = round(Math.min(amount, invoice.outstandingAmount, state.finance.accountsReceivable));
  if (collected <= 0) return 0;
  postJournal(state, "Customer payment received", invoice.id, [
    { account: "cash", debit: collected, credit: 0 },
    { account: "accounts_receivable", debit: 0, credit: collected },
  ]);
  invoice.outstandingAmount = round(Math.max(0, invoice.outstandingAmount - collected));
  if (invoice.outstandingAmount <= 0.02) {
    invoice.outstandingAmount = 0;
    invoice.status = "paid";
  } else invoice.status = "partial";
  emit("payment_received", "finance", `Received $${collected} against ${invoice.id}; $${round(invoice.outstandingAmount)} remains outstanding.`, "system");
  return collected;
}

function scheduleCollectionRetry(state: SimulationState, invoice: InvoiceRecord, delayDays: number) {
  if (invoice.outstandingAmount <= 0 || invoice.status === "written_off") return;
  scheduleEffect(state, "customers-and-sales.collection_attempt", state.calendar.absoluteDay + delayDays, invoice.id, {
    invoiceId: invoice.id,
    accountId: invoice.accountId,
    amount: invoice.outstandingAmount,
  });
}

function writeOffInvoice(state: SimulationState, invoice: InvoiceRecord, emit: DomainEmitter) {
  const publicState = collectionsPublic(state);
  const amount = round(Math.min(invoice.outstandingAmount, state.finance.accountsReceivable));
  if (amount > 0) {
    postJournal(state, "Bad debt write-off", invoice.id, [
      { account: "bad_debt_expense", debit: amount, credit: 0 },
      { account: "accounts_receivable", debit: 0, credit: amount },
    ]);
    publicState.badDebtExpense = round(publicState.badDebtExpense + amount);
  }
  invoice.outstandingAmount = 0;
  invoice.status = "written_off";
  const account = state.market.accounts.find((item) => item.id === invoice.accountId);
  if (account) {
    account.trust = clamp(account.trust - 10);
    if (account.stage === "customer") {
      account.stage = "churned";
      state.finance.mrr = Math.max(0, round(state.finance.mrr - (account.offeredPrice ?? 0)));
    }
  }
  state.relationships.trust = clamp(state.relationships.trust - 5);
  emit("risk_updated", "finance", `${invoice.id} was written off after repeated collection failure; $${amount} became bad-debt expense.`, "system");
}

export function handleCollectionAttempt(state: SimulationState, effect: ScheduledEffect, emit: DomainEmitter) {
  if (!realism85Enabled(state)) return;
  const publicState = collectionsPublic(state);
  const privateState = collectionsPrivate(state);
  const invoiceId = String(effect.payload.invoiceId ?? effect.sourceId);
  const invoice = publicState.invoices.find((item) => item.id === effect.sourceId || item.id === invoiceId);
  if (!invoice || invoice.status === "paid" || invoice.status === "written_off") return;
  const risk = privateState.invoiceRisk[invoice.id];
  if (!risk) throw new Error(`INVOICE_RISK_MISSING:${invoice.id}`);
  const account = state.market.accounts.find((item) => item.id === invoice.accountId);
  invoice.attempts += 1;
  invoice.lastAttemptDay = state.calendar.absoluteDay;
  invoice.status = "due";
  const age = Math.max(0, state.calendar.absoluteDay - invoice.issuedDay);

  const fullChance = clamp(
    risk.payerReliability - risk.liquidityStress - risk.disputePropensity * 0.45
      + (account?.trust ?? 20) / 500 + (account?.procurementProgress ?? 0) / 750
      - state.market.supportLoad / 1_400 + Math.min(0.12, invoice.attempts * 0.025),
    0.06,
    0.88,
  );
  const rawPartialChance = clamp(0.08 + risk.liquidityStress * 0.35 + invoice.attempts * 0.015, 0.06, 0.2);
  const rawDisputeChance = clamp(risk.disputePropensity - (account?.riskClearance ?? 0) / 1_200, 0.03, 0.2);
  const nonLateTotal = fullChance + rawPartialChance + rawDisputeChance;
  const probabilityScale = nonLateTotal > 0.94 ? 0.94 / nonLateTotal : 1;
  const adjustedFullChance = fullChance * probabilityScale;
  const partialChance = rawPartialChance * probabilityScale;
  const disputeChance = rawDisputeChance * probabilityScale;
  const roll = effect.sampledOutcome;
  const requestedAmount = Math.min(invoice.outstandingAmount, Math.max(0, Number(effect.payload.requestedAmount ?? invoice.outstandingAmount)));

  if (roll < adjustedFullChance) {
    postCollection(state, invoice, requestedAmount, emit);
    if (invoice.outstandingAmount > 0) scheduleCollectionRetry(state, invoice, 14);
  } else if (roll < adjustedFullChance + partialChance) {
    const fraction = 0.35 + hashUnit(`${effect.id}:${invoice.attempts}`, 71) * 0.4;
    postCollection(state, invoice, requestedAmount * fraction, emit);
    if (invoice.outstandingAmount > 0) scheduleCollectionRetry(state, invoice, 14);
  } else if (roll < adjustedFullChance + partialChance + disputeChance) {
    invoice.status = "disputed";
    if (account) account.trust = clamp(account.trust - 3);
    state.founder.stress = clamp(state.founder.stress + 2);
    emit("risk_updated", "finance", `${invoice.id} was disputed; collection is delayed while scope and approval evidence are reviewed.`, "system");
    if (age >= 90 || invoice.attempts >= 5) writeOffInvoice(state, invoice, emit);
    else scheduleCollectionRetry(state, invoice, 21);
  } else {
    invoice.status = "late";
    emit("finance_posted", "finance", `${invoice.id} remained unpaid after collection attempt ${invoice.attempts}.`, "system");
    if (age >= 90 || invoice.attempts >= 5) writeOffInvoice(state, invoice, emit);
    else scheduleCollectionRetry(state, invoice, 15);
  }
  updateArAging(state);
}

export function updateArAging(state: SimulationState) {
  if (!realism85Enabled(state)) return;
  const publicState = collectionsPublic(state);
  const aging = { current: 0, days31To60: 0, days61To90: 0, over90: 0 };
  for (const invoice of publicState.invoices.filter((item) => item.outstandingAmount > 0)) {
    const age = Math.max(0, state.calendar.absoluteDay - invoice.issuedDay);
    if (age <= 30) aging.current += invoice.outstandingAmount;
    else if (age <= 60) aging.days31To60 += invoice.outstandingAmount;
    else if (age <= 90) aging.days61To90 += invoice.outstandingAmount;
    else aging.over90 += invoice.outstandingAmount;
  }
  publicState.arAging = {
    current: round(aging.current),
    days31To60: round(aging.days31To60),
    days61To90: round(aging.days61To90),
    over90: round(aging.over90),
  };
}

function legacyFinanceManage(state: SimulationState, command: Extract<SimulationCommand, { type: "finance.manage" }>, emit: DomainEmitter) {
  const amount = round(command.payload.amount);
  if (command.payload.operation === "cut_cost") {
    const beforeSavings = state.finance.monthlyFixedSavings;
    state.finance.monthlyFixedSavings = Math.min(state.finance.reducibleFixedCosts, state.finance.monthlyFixedSavings + amount);
    const actual = round(state.finance.monthlyFixedSavings - beforeSavings);
    emit("finance_posted", "finance", `Reduced verified monthly commitments by $${actual} within the reducible cap.`);
  } else if (command.payload.operation === "founder_injection") {
    if (state.finance.personalCash < amount) throw new Error("INSUFFICIENT_PERSONAL_CASH");
    state.finance.personalCash -= amount;
    postJournal(state, "Founder injection", command.commandId, [
      { account: "cash", debit: amount, credit: 0 },
      { account: "founder_loan", debit: 0, credit: amount },
    ]);
    emit("finance_posted", "finance", `Founder injected $${amount}; founder-loan liability increased equally.`);
    return { checkpoint: true };
  } else if (command.payload.operation === "reserve_tax") {
    postJournal(state, "Tax reserve recognized", command.commandId, [
      { account: "tax_expense", debit: amount, credit: 0 },
      { account: "tax_reserve", debit: 0, credit: amount },
    ]);
    emit("finance_posted", "finance", `Recognized a $${amount} tax reserve without treating it as free cash.`);
  } else {
    const collected = Math.min(amount, state.finance.accountsReceivable);
    if (collected <= 0) throw new Error("NO_RECEIVABLE_TO_COLLECT");
    postJournal(state, "Invoice collection", command.payload.sourceId ?? command.commandId, [
      { account: "cash", debit: collected, credit: 0 },
      { account: "accounts_receivable", debit: 0, credit: collected },
    ]);
    emit("payment_received", "finance", `Collected $${round(collected)} from accounts receivable.`);
  }
  return { checkpoint: false };
}

export function manageFinanceWithCreditRisk(
  state: SimulationState,
  command: Extract<SimulationCommand, { type: "finance.manage" }>,
  emit: DomainEmitter,
) {
  if (!realism85Enabled(state)) return legacyFinanceManage(state, command, emit);
  const amount = round(command.payload.amount);
  if (command.payload.operation !== "collect_invoice") return legacyFinanceManage(state, command, emit);
  if (amount <= 0) throw new Error("COLLECTION_AMOUNT_REQUIRED");
  const publicState = collectionsPublic(state);
  const requestedSource = command.payload.sourceId;
  const invoice = publicState.invoices
    .filter((item) => item.outstandingAmount > 0 && item.status !== "written_off")
    .filter((item) => !requestedSource || item.id === requestedSource || item.accountId === requestedSource)
    .sort((a, b) => a.dueDay - b.dueDay)[0];
  if (!invoice) throw new Error("NO_RECEIVABLE_TO_COLLECT");
  const pending = state.scheduledEffects.find((effect) => effect.type === "customers-and-sales.collection_attempt" && effect.sourceId === invoice.id);
  if (pending) {
    if (pending.dueDay <= state.calendar.absoluteDay + 1) throw new Error("COLLECTION_FOLLOWUP_ALREADY_PRIORITIZED");
    pending.dueDay = state.calendar.absoluteDay + 1;
    pending.payload.requestedAmount = Math.min(amount, invoice.outstandingAmount);
  } else {
    scheduleEffect(state, "customers-and-sales.collection_attempt", state.calendar.absoluteDay + 1, invoice.id, {
      invoiceId: invoice.id, accountId: invoice.accountId, amount: invoice.outstandingAmount, requestedAmount: Math.min(amount, invoice.outstandingAmount),
    });
  }
  state.scheduledEffects.sort((a, b) => a.dueDay - b.dueDay || a.id.localeCompare(b.id));
  state.founder.energy = clamp(state.founder.energy - 1);
  state.founder.stress = clamp(state.founder.stress + 1);
  emit("decision_recorded", "finance", `Prioritized collection on ${invoice.id}; cash remains contingent on the payer response.`);
  return { checkpoint: false };
}

export function validateCollections(state: SimulationState) {
  if (!realism85Enabled(state)) return;
  const publicState = collectionsPublic(state);
  const privateState = collectionsPrivate(state);
  const ids = new Set<string>();
  let outstanding = 0;
  for (const invoice of publicState.invoices) {
    if (ids.has(invoice.id)) throw new Error(`DUPLICATE_INVOICE:${invoice.id}`);
    ids.add(invoice.id);
    if (!Number.isFinite(invoice.originalAmount) || !Number.isFinite(invoice.outstandingAmount) || invoice.originalAmount < 0 || invoice.outstandingAmount < 0 || invoice.outstandingAmount > invoice.originalAmount + 0.02) {
      throw new Error(`INVOICE_BALANCE_INVALID:${invoice.id}`);
    }
    if (!privateState.invoiceRisk[invoice.id]) throw new Error(`INVOICE_RISK_MISSING:${invoice.id}`);
    outstanding += invoice.outstandingAmount;
  }
  if (outstanding > state.finance.accountsReceivable + 0.02) throw new Error("INVOICE_AR_EXCEEDS_LEDGER");
  if (!Number.isFinite(publicState.badDebtExpense) || publicState.badDebtExpense < 0) throw new Error("BAD_DEBT_INVALID");
}
