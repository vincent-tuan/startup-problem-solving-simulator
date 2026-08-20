import { z } from "zod";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";

const clauseKindSchema = z.enum(["liability_cap", "termination_convenience", "data_processing", "sla_credit", "ip_ownership", "acceptance", "auto_renewal"]);
const clausePositionSchema = z.enum(["player_standard", "balanced", "customer_favorable"]);
const clauseSchema = z.object({ kind: clauseKindSchema, position: clausePositionSchema }).strict();
export type ContractClauseV10_3 = z.infer<typeof clauseSchema>;

const termsSchema = z.object({
  billingModel: z.enum(["monthly_advance", "monthly_arrears", "annual_prepaid", "milestone"]),
  monthlyPrice: z.number().finite().positive(), implementationFee: z.number().finite().nonnegative(),
  termMonths: z.number().int().min(1).max(60), paymentTermsDays: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  serviceLevel: z.enum(["best_effort", "standard", "critical"]),
}).strict();
export type ContractCommercialTermsV10_3 = z.infer<typeof termsSchema>;

const draftSchema = z.object({
  id: z.string(), agreementId: z.string(), version: z.number().int().positive(), proposedBy: z.enum(["player", "customer"]),
  createdDay: z.number().int().nonnegative(), status: z.enum(["draft", "in_review", "approved", "countered", "superseded", "withdrawn"]),
  terms: termsSchema, clauses: z.array(clauseSchema).min(1).max(30), expiresDay: z.number().int().nonnegative(),
  knownCounterRequests: z.array(z.string()).max(12),
}).strict();
export type AgreementDraftV10_3 = z.infer<typeof draftSchema>;

const agreementSchema = z.object({
  id: z.string(), procurementCaseId: z.string(), opportunityId: z.string(), organizationId: z.string(), accountId: z.string(),
  status: z.enum(["negotiating", "approval_pending", "approved", "signed_pending_implementation", "acceptance_review", "acceptance_disputed", "active", "abandoned", "expired", "terminated"]),
  latestDraftId: z.string(), draftIds: z.array(z.string()).min(1).max(100), requiredSignatoryRoles: z.array(z.string()).min(1).max(8),
  customerSignatoryActorId: z.string().nullable(), signedDay: z.number().int().nonnegative().nullable(), implementationReadyDay: z.number().int().nonnegative().nullable(),
  acceptanceDay: z.number().int().nonnegative().nullable(), nextRenewalDay: z.number().int().nonnegative().nullable(),
  lastAcceptanceRequestDay: z.number().int().nonnegative().nullable(), knownBlocker: z.string().nullable(),
}).strict();
export type AgreementV10_3 = z.infer<typeof agreementSchema>;

export const contractLifecyclePublicStateSchemaV10_3 = z.object({
  agreements: z.array(agreementSchema).max(100), drafts: z.array(draftSchema).max(1_000),
  activeAgreementCount: z.number().int().nonnegative(), negotiationCount: z.number().int().nonnegative(),
  disclaimer: z.literal("Contract semantics are simulation archetypes — not legal advice."),
}).strict();
export type ContractLifecyclePublicStateV10_3 = z.infer<typeof contractLifecyclePublicStateSchemaV10_3>;

const privateSchema = z.object({
  agreementTruth: z.record(z.string(), z.object({
    commercialThreshold: z.number().min(0).max(1), riskThreshold: z.number().min(0).max(1),
    acceptanceThreshold: z.number().min(0).max(1), negotiationQuantile: z.number().min(0).max(1),
    reopeningMemory: z.number().min(0).max(1),
  }).strict()), nextAgreementSequence: z.number().int().positive(), processedActivationIds: z.array(z.string()).max(500),
  profile: z.enum(["ai_workflow", "local_services", "healthcare"]),
}).strict();
type PrivateState = z.infer<typeof privateSchema>;
const configSchema = z.object({ profile: z.enum(["ai_workflow", "local_services", "healthcare"]) }).default({ profile: "ai_workflow" });
type Context = FeatureRuntimeContextV10<ContractLifecyclePublicStateV10_3, PrivateState>;

function agreement(context: Context, id: string): AgreementV10_3 {
  const item = context.ownState.public.agreements.find((candidate) => candidate.id === id); if (!item) throw new Error("AGREEMENT_NOT_FOUND"); return item;
}
function draft(context: Context, id: string): AgreementDraftV10_3 {
  const item = context.ownState.public.drafts.find((candidate) => candidate.id === id); if (!item) throw new Error("AGREEMENT_DRAFT_NOT_FOUND"); return item;
}
function latestDraft(context: Context, item: AgreementV10_3): AgreementDraftV10_3 { return draft(context, item.latestDraftId); }
function refresh(context: Context): void {
  context.ownState.public.activeAgreementCount = context.ownState.public.agreements.filter((item) => item.status === "active").length;
  context.ownState.public.negotiationCount = context.ownState.public.agreements.filter((item) => ["negotiating", "approval_pending", "approved"].includes(item.status)).length;
}
function initialClauses(profile: z.infer<typeof configSchema>["profile"]): ContractClauseV10_3[] {
  return [
    { kind: "liability_cap", position: "player_standard" }, { kind: "termination_convenience", position: "balanced" },
    { kind: "data_processing", position: profile === "healthcare" ? "customer_favorable" : "balanced" },
    { kind: "sla_credit", position: "balanced" }, { kind: "ip_ownership", position: "player_standard" },
    { kind: "acceptance", position: "balanced" }, { kind: "auto_renewal", position: "balanced" },
  ];
}

export function createContractLifecycleFeatureV10_3(): SimulationFeatureV10<ContractLifecyclePublicStateV10_3, PrivateState, z.infer<typeof configSchema>> {
  return {
    id: "contract-lifecycle", version: "1.0.0", dependencies: [{ id: "procurement-processes", versionRange: "^1.0.0" }, { id: "customer-organizations", versionRange: "^1.0.0" }, { id: "commercial-opportunities", versionRange: "^1.0.0" }, { id: "delivery-and-service", versionRange: "^1.1.0" }], compatibleEngineRange: ">=10.3.0 <11.0.0",
    configSchema, publicStateSchema: contractLifecyclePublicStateSchemaV10_3, privateStateSchema: privateSchema,
    initialize: ({ config }) => ({ public: { agreements: [], drafts: [], activeAgreementCount: 0, negotiationCount: 0, disclaimer: "Contract semantics are simulation archetypes — not legal advice." }, private: { agreementTruth: {}, nextAgreementSequence: 1, processedActivationIds: [], profile: config.profile } }),
    commands: {
      "contract.draft.create": (context) => {
        if (context.command.type !== "contract.draft.create") return;
        const procurementCase = context.query("procurement-processes.case", { caseId: context.command.payload.procurementCaseId }) as { id: string; status: string; opportunityId: string; organizationId: string } | null;
        if (!procurementCase || procurementCase.status !== "approved") throw new Error("APPROVED_PROCUREMENT_CASE_REQUIRED");
        if (context.ownState.public.agreements.some((item) => item.procurementCaseId === procurementCase.id && item.status !== "abandoned")) throw new Error("PROCUREMENT_CASE_ALREADY_HAS_AGREEMENT");
        const id = `agreement-${context.ownState.private.nextAgreementSequence++}`; const draftId = `${id}:v1`;
        const agreementValue: AgreementV10_3 = { id, procurementCaseId: procurementCase.id, opportunityId: procurementCase.opportunityId, organizationId: procurementCase.organizationId, accountId: `account-${id}`, status: "negotiating", latestDraftId: draftId, draftIds: [draftId], requiredSignatoryRoles: ["sign"], customerSignatoryActorId: null, signedDay: null, implementationReadyDay: null, acceptanceDay: null, nextRenewalDay: null, lastAcceptanceRequestDay: null, knownBlocker: null };
        const draftValue: AgreementDraftV10_3 = { id: draftId, agreementId: id, version: 1, proposedBy: "player", createdDay: context.kernel.simulationDay, status: "draft", terms: { billingModel: context.command.payload.billingModel, monthlyPrice: context.command.payload.monthlyPrice, implementationFee: context.command.payload.implementationFee, termMonths: context.command.payload.termMonths, paymentTermsDays: context.command.payload.paymentTermsDays, serviceLevel: context.command.payload.serviceLevel }, clauses: initialClauses(context.ownState.private.profile), expiresDay: context.kernel.simulationDay + 30, knownCounterRequests: [] };
        context.ownState.public.agreements.push(agreementValue); context.ownState.public.drafts.push(draftValue);
        context.ownState.private.agreementTruth[id] = { commercialThreshold: Math.max(0.2, Math.min(0.9, 0.54 + context.rng.normal(0, 0.12))), riskThreshold: Math.max(0.2, Math.min(0.95, (context.ownState.private.profile === "healthcare" ? 0.76 : 0.56) + context.rng.normal(0, 0.1))), acceptanceThreshold: Math.max(0.35, Math.min(0.9, 0.62 + context.rng.normal(0, 0.1))), negotiationQuantile: context.rng.nextFloat(), reopeningMemory: 0 };
        context.emit({ type: "contract-lifecycle.draft_created", visibility: "public", sourceId: draftId, payload: { agreementId: id, draftId, procurementCaseId: procurementCase.id, opportunityId: procurementCase.opportunityId, organizationId: procurementCase.organizationId }, causality: { obligationIds: [`agreement:${id}`] } });
        refresh(context); return { checkpointRequired: true };
      },
      "contract.clause.propose": (context) => {
        if (context.command.type !== "contract.clause.propose") return;
        const payload = context.command.payload;
        const item = agreement(context, payload.agreementId); if (!["negotiating", "approved"].includes(item.status)) throw new Error("AGREEMENT_NOT_NEGOTIABLE");
        const previous = latestDraft(context, item); const reopenedApprovedDraft = previous.status === "approved"; previous.status = "superseded";
        const clauses = previous.clauses.map((clause) => clause.kind === payload.clause ? { ...clause, position: payload.position } : clause);
        if (!clauses.some((clause) => clause.kind === payload.clause)) clauses.push({ kind: payload.clause, position: payload.position });
        const version = item.draftIds.length + 1; const id = `${item.id}:v${version}`;
        const next: AgreementDraftV10_3 = { ...structuredClone(previous), id, version, proposedBy: "player", createdDay: context.kernel.simulationDay, status: "draft", clauses, expiresDay: context.kernel.simulationDay + 30, knownCounterRequests: [] };
        item.latestDraftId = id; item.draftIds.push(id); item.status = "negotiating"; item.knownBlocker = null; context.ownState.public.drafts.push(next);
        context.ownState.private.agreementTruth[item.id].reopeningMemory = Math.min(1, context.ownState.private.agreementTruth[item.id].reopeningMemory + (reopenedApprovedDraft ? 0.18 : 0.04));
        context.emit({ type: "contract-lifecycle.clause_proposed", visibility: "public", sourceId: id, payload: { agreementId: item.id, draftId: id, version, clause: payload.clause, position: payload.position }, causality: { obligationIds: [`agreement:${item.id}`] } });
      },
      "contract.approval.request": (context) => {
        if (context.command.type !== "contract.approval.request") return;
        const item = agreement(context, context.command.payload.agreementId); if (item.status !== "negotiating") throw new Error("AGREEMENT_NOT_READY_FOR_APPROVAL");
        const current = latestDraft(context, item); if (current.expiresDay < context.kernel.simulationDay) throw new Error("AGREEMENT_DRAFT_EXPIRED");
        current.status = "in_review"; item.status = "approval_pending"; const dueDay = context.kernel.simulationDay + (context.ownState.private.profile === "healthcare" ? 12 : 7);
        context.schedule({ type: "contract-lifecycle.approval_review", dueDay, sourceId: item.id, payload: { agreementId: item.id, draftId: current.id }, sampledOutcome: { decisionQuantile: context.rng.nextFloat() }, causality: { obligationIds: [`agreement:${item.id}`] } });
        context.emit({ type: "contract-lifecycle.approval_requested", visibility: "public", sourceId: item.id, payload: { agreementId: item.id, draftId: current.id, dueDay }, causality: { obligationIds: [`agreement:${item.id}`] } });
      },
      "contract.sign": (context) => {
        if (context.command.type !== "contract.sign") return;
        const item = agreement(context, context.command.payload.agreementId); if (item.status !== "approved") throw new Error("AGREEMENT_APPROVAL_REQUIRED");
        const authority = context.query("customer-organizations.signatory-authority", { organizationId: item.organizationId, actorId: context.command.payload.signatoryActorId }) as { authorized: boolean };
        if (!authority.authorized) throw new Error("CUSTOMER_SIGNATORY_NOT_AUTHORIZED");
        const current = latestDraft(context, item); if (current.status !== "approved" || current.expiresDay < context.kernel.simulationDay) throw new Error("APPROVED_DRAFT_NOT_CURRENT");
        item.customerSignatoryActorId = context.command.payload.signatoryActorId; item.signedDay = context.kernel.simulationDay; item.implementationReadyDay = context.kernel.simulationDay + (context.ownState.private.profile === "healthcare" ? 30 : context.ownState.private.profile === "ai_workflow" ? 21 : 12); item.status = "signed_pending_implementation";
        context.emit({ type: "contract-lifecycle.agreement_signed", visibility: "public", sourceId: item.id, payload: { agreementId: item.id, opportunityId: item.opportunityId, organizationId: item.organizationId, accountId: item.accountId, signatoryActorId: item.customerSignatoryActorId, signedDay: item.signedDay, implementationReadyDay: item.implementationReadyDay, terms: structuredClone(current.terms), clauses: structuredClone(current.clauses) }, causality: { obligationIds: [`agreement:${item.id}`, `acceptance:${item.id}`] } });
        refresh(context); return { checkpointRequired: true };
      },
      "customer.acceptance.request": (context) => {
        if (context.command.type !== "customer.acceptance.request") return;
        const item = agreement(context, context.command.payload.agreementId); if (!["signed_pending_implementation", "acceptance_disputed"].includes(item.status)) throw new Error("AGREEMENT_NOT_READY_FOR_ACCEPTANCE");
        if ((item.implementationReadyDay ?? Number.MAX_SAFE_INTEGER) > context.kernel.simulationDay) throw new Error("IMPLEMENTATION_NOT_READY");
        if (item.lastAcceptanceRequestDay !== null && context.kernel.simulationDay - item.lastAcceptanceRequestDay < 7) throw new Error("ACCEPTANCE_REVIEW_COOLDOWN");
        item.status = "acceptance_review"; item.lastAcceptanceRequestDay = context.kernel.simulationDay; const dueDay = context.kernel.simulationDay + 7;
        context.schedule({ type: "contract-lifecycle.acceptance_review", dueDay, sourceId: item.id, payload: { agreementId: item.id }, sampledOutcome: { acceptanceQuantile: context.rng.nextFloat() }, causality: { obligationIds: [`agreement:${item.id}`, `acceptance:${item.id}`] } });
        context.emit({ type: "contract-lifecycle.acceptance_requested", visibility: "public", sourceId: item.id, payload: { agreementId: item.id, accountId: item.accountId, dueDay }, causality: { obligationIds: [`acceptance:${item.id}`] } });
      },
      "contract.walk_away": (context) => {
        if (context.command.type !== "contract.walk_away") return;
        const item = agreement(context, context.command.payload.agreementId); if (["active", "abandoned", "terminated"].includes(item.status)) throw new Error("AGREEMENT_CANNOT_BE_ABANDONED");
        item.status = "abandoned"; const current = latestDraft(context, item); if (!["superseded", "withdrawn"].includes(current.status)) current.status = "withdrawn";
        context.emit({ type: "contract-lifecycle.negotiation_abandoned", visibility: "public", sourceId: item.id, payload: { agreementId: item.id, opportunityId: item.opportunityId, organizationId: item.organizationId, reason: context.command.payload.reason }, causality: { exposureIds: [`lost-deal:${item.id}`], obligationIds: [`agreement:${item.id}`] } });
        refresh(context); return { checkpointRequired: true };
      },
    },
    effects: {
      "contract-lifecycle.approval_review": (context) => {
        const payload = context.effect.payload as { agreementId: string; draftId: string }; const item = agreement(context, payload.agreementId); const current = draft(context, payload.draftId);
        if (item.status !== "approval_pending" || item.latestDraftId !== current.id) return;
        const opportunity = context.query("commercial-opportunities.opportunity", { opportunityId: item.opportunityId }) as { valueRange: { upper: number }; purchaseClass: string } | null;
        const truth = context.ownState.private.agreementTruth[item.id]; const sampled = context.effect.sampledOutcome as { decisionQuantile: number };
        const annualPrice = current.terms.monthlyPrice * 12 + current.terms.implementationFee; const valueCoverage = opportunity ? Math.min(1, opportunity.valueRange.upper / Math.max(1, annualPrice) / 2) : 0.35;
        const customerFriendly = current.clauses.filter((clause) => clause.position === "customer_favorable").length / current.clauses.length;
        const balanced = current.clauses.filter((clause) => clause.position === "balanced").length / current.clauses.length;
        const commercialFit = valueCoverage * 0.48 + customerFriendly * 0.2 + balanced * 0.2 - truth.reopeningMemory * 0.18;
        const riskFit = customerFriendly * 0.5 + balanced * 0.35 + (current.terms.serviceLevel === "critical" ? 0.08 : 0);
        const accepted = commercialFit >= truth.commercialThreshold * sampled.decisionQuantile && riskFit >= truth.riskThreshold * sampled.decisionQuantile;
        if (accepted) { item.status = "approved"; current.status = "approved"; item.knownBlocker = null; context.emit({ type: "contract-lifecycle.approval_granted", visibility: "public", sourceId: item.id, payload: { agreementId: item.id, draftId: current.id, expiresDay: current.expiresDay }, causality: { obligationIds: [`agreement:${item.id}`] } }); }
        else { item.status = "negotiating"; current.status = "countered"; const blocker = riskFit < truth.riskThreshold * sampled.decisionQuantile ? "Customer counsel requested greater risk protection." : "Commercial approval did not clear the current price and commitment package."; current.knownCounterRequests = [blocker]; item.knownBlocker = blocker; context.emit({ type: "contract-lifecycle.clause_countered", visibility: "public", sourceId: item.id, payload: { agreementId: item.id, draftId: current.id, knownCounterRequests: current.knownCounterRequests }, causality: { obligationIds: [`agreement:${item.id}`] } }); }
        refresh(context);
      },
      "contract-lifecycle.acceptance_review": (context) => {
        const payload = context.effect.payload as { agreementId: string }; const item = agreement(context, payload.agreementId); if (item.status !== "acceptance_review") return;
        const health = context.query("delivery-and-service.account-health", { accountId: item.accountId }) as { reliability: number; quality: number; backlogPressure: number };
        const truth = context.ownState.private.agreementTruth[item.id]; const sampled = context.effect.sampledOutcome as { acceptanceQuantile: number };
        const readiness = health.reliability * 0.45 + health.quality * 0.4 + (1 - health.backlogPressure) * 0.15;
        if (readiness >= truth.acceptanceThreshold * sampled.acceptanceQuantile) {
          item.status = "active"; item.acceptanceDay = context.kernel.simulationDay; const current = latestDraft(context, item); item.nextRenewalDay = context.kernel.simulationDay + current.terms.termMonths * 30;
          const activationId = `activation:${item.id}`; if (context.ownState.private.processedActivationIds.includes(activationId)) throw new Error("DUPLICATE_AGREEMENT_ACTIVATION"); context.ownState.private.processedActivationIds.push(activationId);
          context.emit({ type: "contract-lifecycle.agreement_activated", visibility: "public", sourceId: item.id, payload: { agreementId: item.id, opportunityId: item.opportunityId, organizationId: item.organizationId, accountId: item.accountId, acceptanceDay: item.acceptanceDay, nextRenewalDay: item.nextRenewalDay, terms: structuredClone(current.terms), clauses: structuredClone(current.clauses) }, causality: { obligationIds: [`agreement:${item.id}`, `acceptance:${item.id}`] } });
        } else {
          item.status = "acceptance_disputed"; item.knownBlocker = health.backlogPressure > 0.35 ? "Implementation backlog remains above the acceptance tolerance." : "Observed quality or reliability did not meet the acceptance record.";
          context.emit({ type: "contract-lifecycle.acceptance_disputed", visibility: "public", sourceId: item.id, payload: { agreementId: item.id, accountId: item.accountId, knownBlocker: item.knownBlocker }, causality: { exposureIds: [`acceptance-dispute:${item.id}`], obligationIds: [`agreement:${item.id}`, `acceptance:${item.id}`] } });
        }
        refresh(context);
      },
    },
    queries: [
      { id: "contract-lifecycle.agreement", resolve: ({ ownState }, input) => structuredClone(ownState.public.agreements.find((item) => item.id === (input as { agreementId?: string } | undefined)?.agreementId) ?? null) },
      { id: "contract-lifecycle.for-account", resolve: ({ ownState }, input) => structuredClone(ownState.public.agreements.filter((item) => item.accountId === (input as { accountId?: string } | undefined)?.accountId)) },
    ],
    hooks: { after_commercial_close: (context) => {
      for (const item of context.ownState.public.agreements.filter((candidate) => ["negotiating", "approval_pending", "approved"].includes(candidate.status))) {
        const current = latestDraft(context, item); if (current.expiresDay < context.kernel.simulationDay && item.status !== "approval_pending") { item.status = "expired"; item.knownBlocker = "The current commercial offer expired before signature."; context.emit({ type: "contract-lifecycle.agreement_expired", visibility: "public", sourceId: item.id, payload: { agreementId: item.id, opportunityId: item.opportunityId, draftId: current.id }, causality: { exposureIds: [`expired-offer:${item.id}`], obligationIds: [`agreement:${item.id}`] } }); }
      }
      refresh(context);
    } },
    invariants: [{ id: "contract-draft-version-signature-and-activation", check: ({ ownState }) => {
      const agreementIds = ownState.public.agreements.map((item) => item.id); const draftIds = ownState.public.drafts.map((item) => item.id);
      if (new Set(agreementIds).size !== agreementIds.length) throw new Error("DUPLICATE_AGREEMENT"); if (new Set(draftIds).size !== draftIds.length) throw new Error("DUPLICATE_AGREEMENT_DRAFT");
      for (const item of ownState.public.agreements) { if (!item.draftIds.includes(item.latestDraftId)) throw new Error("AGREEMENT_LATEST_DRAFT_MISSING"); if (item.status === "active" && (item.signedDay === null || item.acceptanceDay === null)) throw new Error("ACTIVE_AGREEMENT_WITHOUT_SIGNATURE_OR_ACCEPTANCE"); if (item.customerSignatoryActorId && item.signedDay === null) throw new Error("SIGNATORY_WITHOUT_SIGNATURE"); }
      for (const item of ownState.public.drafts) if (!agreementIds.includes(item.agreementId)) throw new Error("AGREEMENT_DRAFT_ORPHANED");
    } }],
    projectionPolicy: { schema: contractLifecyclePublicStateSchemaV10_3, project: ({ publicState }) => structuredClone(publicState), denyKeys: ["agreementTruth", "commercialThreshold", "riskThreshold", "acceptanceThreshold", "negotiationQuantile"] },
    snapshotPolicy: { mode: "every_material_command", maximumCommandsBetweenSnapshots: 10 }, retentionPolicy: { maximumHeadBytes: 3_000_000, maximumMaterialRecords: 5_000, archiveClosedRecords: true },
  };
}
