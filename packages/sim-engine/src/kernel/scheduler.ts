import { postJournal } from "../domains/finance";
import { clamp, round } from "./math";
import { random } from "../rng";
import type { HistoryCategory, HistoryEventType, ScheduledEffect, SimulationState } from "../types";

export type DomainEmitter = (type: HistoryEventType, category: HistoryCategory, summary: string, actor?: "player" | "system" | "ai") => void;

export function scheduleEffect(state: SimulationState, type: ScheduledEffect["type"], dueDay: number, sourceId: string, payload: ScheduledEffect["payload"] = {}) {
  state.scheduledEffects.push({ id: `scheduled_${state.sequence}_${state.scheduledEffects.length + 1}`, dueDay, type, sourceId, payload, sampledOutcome: random(state) });
  state.scheduledEffects.sort((a, b) => a.dueDay - b.dueDay || a.id.localeCompare(b.id));
}

export function nextScheduledDay(state: SimulationState) {
  return state.scheduledEffects.find((effect) => effect.dueDay > state.calendar.absoluteDay)?.dueDay ?? Number.POSITIVE_INFINITY;
}

export function processDueEffects(state: SimulationState, emit: DomainEmitter, dispatchFeatureEffect?: (effect: ScheduledEffect) => boolean) {
  const due = state.scheduledEffects.filter((effect) => effect.dueDay <= state.calendar.absoluteDay);
  state.scheduledEffects = state.scheduledEffects.filter((effect) => effect.dueDay > state.calendar.absoluteDay);
  for (const effect of due) {
    if (effect.type === "invoice_due") {
      const account = state.market.accounts.find((item) => item.id === effect.sourceId && item.stage === "customer");
      const amount = Number(effect.payload.amount ?? 0); const monthsRemaining = Number(effect.payload.monthsRemaining ?? 0);
      if (account && amount > 0 && monthsRemaining > 0) {
        postJournal(state, `Recurring invoice issued to ${account.name}`, effect.id, [{ account: "accounts_receivable", debit: amount, credit: 0 }, { account: "deferred_revenue", debit: 0, credit: amount }]);
        scheduleEffect(state, "payment_received", state.calendar.absoluteDay + account.collectionDelayDays, account.id, { amount });
        if (monthsRemaining > 1) scheduleEffect(state, "invoice_due", state.calendar.absoluteDay + 30, account.id, { amount, monthsRemaining: monthsRemaining - 1 });
        emit("invoice_issued", "finance", `Issued recurring $${round(amount)} invoice to ${account.name}; collection remains delayed.`, "system");
      }
    } else if (effect.type === "payment_received") {
      const amount = Math.min(state.finance.accountsReceivable, Number(effect.payload.amount ?? 0));
      if (amount > 0) {
        postJournal(state, "Customer payment received", effect.sourceId, [{ account: "cash", debit: amount, credit: 0 }, { account: "accounts_receivable", debit: 0, credit: amount }]);
        emit("payment_received", "finance", `Received $${round(amount)} against an issued invoice.`, "system");
      }
    } else if (effect.type === "account_followup") {
      const account = state.market.accounts.find((item) => item.id === effect.sourceId);
      if (!account || ["lost", "customer", "churned"].includes(account.stage)) continue;
      const stages = ["lead", "discovery", "qualified", "pilot", "negotiation"] as const;
      const index = stages.indexOf(account.stage as typeof stages[number]);
      const truth = state.hidden.segmentTruth[account.segmentId];
      const intent = String(effect.payload.intent ?? "next_step");
      const stakeholder = state.stakeholders.find((item) => item.id === effect.payload.stakeholderId) ?? state.stakeholders.find((item) => item.accountId === account.id && item.discovered);
      const engagementProbability = clamp(0.32 + (stakeholder?.trust ?? account.trust) * 0.005 + account.championStrength * 0.002 - account.blockerRisk * 0.001, 0.18, 0.86);
      const engaged = effect.sampledOutcome < engagementProbability;
      if (stakeholder) {
        stakeholder.memory.push(`${intent.replaceAll("_", " ")} on day ${state.calendar.absoluteDay}: ${engaged ? "engaged" : "resisted"}`);
        stakeholder.memory = stakeholder.memory.slice(-20); stakeholder.trust = clamp(stakeholder.trust + (engaged ? 3 : -2));
      }
      if (engaged) {
        if (intent === "map_committee" || intent === "prove_roi" || intent === "risk_review" || intent === "procurement") {
          const role = intent === "prove_roi" ? "buyer" : intent === "risk_review" ? "blocker" : intent === "procurement" ? "approver" : undefined;
          const unknown = state.stakeholders.find((item) => item.accountId === account.id && !item.discovered && (!role || item.role === role)) ?? state.stakeholders.find((item) => item.accountId === account.id && !item.discovered);
          if (unknown) { unknown.discovered = true; account.knownStakeholderIds = [...new Set([...(account.knownStakeholderIds ?? []), unknown.id])]; account.committeeCoverage = clamp((account.committeeCoverage ?? 20) + 20); }
        }
        if (intent === "user_discovery") { account.valueCase = clamp((account.valueCase ?? 0) + 9); state.evidence.problem = clamp(state.evidence.problem + 2); }
        else if (intent === "build_champion") { account.championStrength = clamp(account.championStrength + 10); account.trust = clamp(account.trust + 5); }
        else if (intent === "prove_roi") { account.valueCase = clamp((account.valueCase ?? 0) + 13); state.evidence.budget = clamp(state.evidence.budget + 2); }
        else if (intent === "risk_review") { account.riskClearance = clamp((account.riskClearance ?? 0) + 14 + state.product.security * 0.05); account.blockerRisk = clamp(account.blockerRisk - 5); }
        else if (intent === "procurement") { account.procurementProgress = clamp((account.procurementProgress ?? 0) + 16); account.buyerAccess = clamp(account.buyerAccess + 6); }
        else if (intent === "next_step") {
          if (account.stage === "discovery") account.valueCase = clamp((account.valueCase ?? 0) + 6);
          if (account.stage === "qualified") account.implementationReadiness = clamp((account.implementationReadiness ?? 0) + 8);
          if (account.stage === "pilot") account.riskClearance = clamp((account.riskClearance ?? 0) + 7);
          if (account.stage === "negotiation") account.procurementProgress = clamp((account.procurementProgress ?? 0) + 8);
        }
      }
      const coreReleased = state.product.capabilities.some((capability) => capability.status === "released" && ["core", "integration"].includes(capability.kind));
      const prerequisiteReady = account.stage === "lead" ||
        (account.stage === "discovery" && (account.committeeCoverage ?? 0) >= 40 && (account.valueCase ?? 0) >= 18) ||
        (account.stage === "qualified" && coreReleased && (account.implementationReadiness ?? 0) >= 20) ||
        (account.stage === "pilot" && (account.riskClearance ?? 0) >= 24) || account.stage === "negotiation";
      const difficultyMultiplier = state.meta.difficulty === "guided" ? 1.15 : state.meta.difficulty === "brutal" ? 0.86 : 1;
      const probability = clamp(((truth?.fit ?? 45) * 0.0055 + account.trust * 0.004 + state.evidence.buyerClarity * 0.0025 - account.blockerRisk * 0.0012) * difficultyMultiplier, 0.1, 0.84);
      const progressRoll = (effect.sampledOutcome * 1.61803398875) % 1;
      if (engaged && prerequisiteReady && progressRoll < probability && index >= 0) {
        account.stage = stages[Math.min(stages.length - 1, index + 1)]; account.stageEnteredDay = state.calendar.absoluteDay;
        account.trust = clamp(account.trust + 4); emit("account_stage_changed", "customer", `${account.name} advanced to ${account.stage}.`, "system");
      } else if (!engaged && progressRoll > 1 - clamp(0.08 + account.blockerRisk * 0.0015 - account.trust * 0.0008, 0.05, 0.22)) {
        account.stage = "lost"; account.lossReason = account.buyerAccess < 40 ? "No economic buyer access" : account.blockerRisk > 60 ? "Unresolved adoption risk" : "Insufficient urgency";
        emit("account_stage_changed", "customer", `${account.name} was lost: ${account.lossReason}.`, "system");
      } else {
        account.trust = clamp(account.trust - 1);
        const reason = prerequisiteReady ? "the stakeholder did not make the next commitment" : account.stage === "discovery" ? "the committee or value case is incomplete" : account.stage === "qualified" ? "implementation readiness or a core capability is missing" : account.stage === "pilot" ? "risk clearance is incomplete" : "procurement remains unresolved";
        emit("decision_recorded", "customer", `${account.name} stalled at ${account.stage}: ${reason}.`, "system");
      }
    } else if (effect.type === "churn_check") {
      const account = state.market.accounts.find((item) => item.id === effect.sourceId && item.stage === "customer");
      if (!account) continue;
      const truth = state.hidden.segmentTruth[account.segmentId];
      const churn = clamp((truth?.churnRisk ?? 10) / 100 + state.market.supportLoad / 500 + (100 - state.product.reliability) / 600 - account.trust / 800, 0.01, 0.65);
      if (effect.sampledOutcome < churn) {
        account.stage = "churned"; state.finance.mrr = Math.max(0, round(state.finance.mrr - (account.offeredPrice ?? 0)));
        emit("customer_churned", "customer", `${account.name} churned after accumulated value, reliability, and support signals fell below its threshold.`, "system");
      } else scheduleEffect(state, "churn_check", state.calendar.absoluteDay + 30, account.id);
    } else if (effect.type === "contract_renewal") {
      const account = state.market.accounts.find((item) => item.id === effect.sourceId && item.stage === "customer");
      if (!account) continue;
      const amount = Number(effect.payload.amount ?? account.offeredPrice ?? 0); const renewalMonths = Number(effect.payload.renewalMonths ?? 3);
      const truth = state.hidden.segmentTruth[account.segmentId];
      const renewalProbability = clamp((truth?.fit ?? 45) * 0.004 + state.product.reliability * 0.0025 + account.trust * 0.002 - state.market.supportLoad * 0.002, 0.12, 0.88);
      if (effect.sampledOutcome < renewalProbability && amount > 0) {
        account.contractMonths += renewalMonths;
        postJournal(state, `Renewal invoice issued to ${account.name}`, effect.id, [{ account: "accounts_receivable", debit: amount, credit: 0 }, { account: "deferred_revenue", debit: 0, credit: amount }]);
        scheduleEffect(state, "payment_received", state.calendar.absoluteDay + account.collectionDelayDays, account.id, { amount });
        if (renewalMonths > 1) scheduleEffect(state, "invoice_due", state.calendar.absoluteDay + 30, account.id, { amount, monthsRemaining: renewalMonths - 1 });
        scheduleEffect(state, "contract_renewal", state.calendar.absoluteDay + renewalMonths * 30, account.id, { amount, renewalMonths });
        emit("contract_renewed", "customer", `${account.name} renewed for ${renewalMonths} months at $${round(amount)}/month.`, "system");
      } else {
        account.stage = "churned"; state.finance.mrr = Math.max(0, round(state.finance.mrr - amount));
        emit("customer_churned", "customer", `${account.name} did not renew after value, reliability, trust, and support load were evaluated.`, "system");
      }
    } else if (effect.type === "hire_progress") {
      const hiring = state.organization.hiring.find((item) => item.id === effect.sourceId && item.stage !== "closed");
      if (!hiring) continue;
      const path = ["sourcing", "interview", "offer", "onboarding", "closed"] as const;
      const next = path[Math.min(path.length - 1, path.indexOf(hiring.stage) + 1)]; hiring.stage = next;
      if (next === "closed") {
        state.organization.members.push({ id: `member_${state.organization.members.length + 1}`, name: `${hiring.role} hire`, role: hiring.role, employment: "employee", skill: hiring.candidateQuality, capacity: 28, morale: 72, trust: 55, monthlyCost: 1_200, onboardingRemaining: 0 });
        state.organization.teamSize += 1;
      } else scheduleEffect(state, "hire_progress", state.calendar.absoluteDay + (next === "onboarding" ? 14 : 7), hiring.id);
      emit("hiring_updated", "people", `${hiring.role} hiring moved to ${next}.`, "system");
    } else if (effect.type === "obligation_due") {
      const obligation = state.obligations.find((item) => item.id === effect.sourceId && item.status === "open");
      if (obligation) {
        obligation.status = "missed"; state.relationships.openPromises = Math.max(0, state.relationships.openPromises - 1); state.relationships.overduePromises += 1; state.relationships.trust = clamp(state.relationships.trust - obligation.severity * 4);
        emit("obligation_updated", "stakeholder", `Missed obligation: ${obligation.title}.`, "system");
      }
    } else if (effect.type === "risk_check") {
      const risk = state.risks.find((item) => item.id === effect.sourceId && ["latent", "open"].includes(item.status));
      if (risk && effect.sampledOutcome < risk.likelihood / 100) {
        risk.status = "realized"; risk.exposure = clamp(risk.exposure + risk.impact * 0.5); state.relationships.trust = clamp(state.relationships.trust - risk.impact * 0.15);
        emit("risk_updated", "risk", `${risk.title} materialized; impact ${Math.round(risk.impact)}/100.`, "system");
      }
    } else if (effect.type === "fundraise_progress") {
      if (state.capital.fundraising === "preparing") {
        state.capital.fundraising = "diligence"; state.capital.investorPipeline = clamp(state.capital.investorPipeline + 24);
        scheduleEffect(state, "fundraise_progress", state.calendar.absoluteDay + 21, "capital", {});
        emit("decision_recorded", "capital", "Fundraising entered diligence; evidence quality and founder focus now affect the outcome.", "system");
      } else if (state.capital.fundraising === "diligence") {
        const readiness = clamp(state.evidence.quality * 0.3 + state.evidence.budget * 0.3 + state.relationships.trust * 0.2 + state.market.accounts.filter((account) => account.stage === "customer").length * 8);
        if (effect.sampledOutcome < readiness / 100) { state.capital.fundraising = "term_sheet"; emit("decision_recorded", "capital", "Diligence produced a term sheet; financing terms now require a decision.", "system"); }
        else { state.capital.fundraising = "none"; state.founder.energy = clamp(state.founder.energy - 8); emit("decision_recorded", "capital", "The raise ended without a term sheet; investor objections remain evidence, not cash.", "system"); }
      }
    } else if (!dispatchFeatureEffect?.(effect)) throw new Error(`SCHEDULED_EFFECT_UNHANDLED:${effect.type}`);
  }
}
