import { z } from "zod";
import type { CreateRunV10Request, EngineCommandV10, SimulationCommandV10 } from "./types";
import { competitorStrategicPlanSchemaV10 } from "./strategy-grammar";

export const founderProfileIdSchemaV10 = z.enum([
  "technical_builder",
  "commercial_hunter",
  "domain_insider",
  "community_operator",
]);

export const createRunV10RequestSchema = z.object({
  scenarioVersionId: z.string().trim().min(3).max(200),
  setup: z.object({
    companyName: z.string().trim().min(2).max(80),
    founderProfileId: founderProfileIdSchemaV10,
  }).strict(),
}).strict() satisfies z.ZodType<CreateRunV10Request>;

const commandBase = {
  commandId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
};

export const operationsAdvanceCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("operations.advance_to_next_material_event"),
  payload: z.object({
    horizonDays: z.number().int().min(1).max(365).optional(),
  }).strict(),
}).strict();

export const requestFinalAuditCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("campaign.request_final_audit"),
  payload: z.object({ confirmation: z.literal("FINAL_AUDIT") }).strict(),
}).strict();

export const controlledShutdownCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("campaign.controlled_shutdown"),
  payload: z.object({ reason: z.string().trim().min(3).max(500) }).strict(),
}).strict();

const publicFactSchema = z.object({
  id: z.string().min(3).max(160),
  sourceType: z.literal("verified_public_fact"),
  subjectId: z.string().min(1).max(160),
  kind: z.string().min(1).max(80),
  statement: z.string().min(3).max(1200),
  title: z.string().min(1).max(300),
  publisher: z.string().min(1).max(160),
  url: z.string().url().max(2048),
  observedAt: z.string().min(10).max(64),
  retrievedAt: z.string().min(10).max(64),
}).strict();

export const recordPublicFactCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("external_world.record_public_fact"),
  payload: z.object({
    fact: publicFactSchema,
    externalInputRef: z.string().min(3).max(200),
  }).strict(),
}).strict();

export const completeFinalAuditCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("campaign.complete_final_audit"),
  payload: z.object({ auditId: z.string().min(3).max(200) }).strict(),
}).strict();

const competitorPlanPayloadSchemaV10 = z.object({
  externalInputId: z.string().min(3).max(200),
  turnId: z.string().min(3).max(160),
  inputHash: z.string().min(8).max(200),
  provider: z.enum(["openai", "authored"]),
  plan: competitorStrategicPlanSchemaV10,
}).strict();

export const applyCompetitorPlanCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("system.competitor_plan.apply"),
  payload: competitorPlanPayloadSchemaV10,
}).strict();

export const applyCompetitorFallbackCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("system.competitor_plan_fallback"),
  payload: competitorPlanPayloadSchemaV10,
}).strict();

export const applyMarketDossierCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("system.market_dossier.apply_v10"),
  payload: z.object({
    externalInputId: z.string().min(3).max(200),
    dossierId: z.string().min(3).max(200),
    inputHash: z.string().min(8).max(200),
    facts: z.array(publicFactSchema).max(100),
  }).strict(),
}).strict();

const workforceRoleSchema = z.enum(["engineering", "product", "sales", "operations", "customer_success", "finance"]);
const workforceLevelSchema = z.enum(["individual", "lead", "manager"]);
const employmentTypeSchema = z.enum(["employee", "contractor"]);
const entityId = z.string().trim().min(3).max(160);
const money = z.number().finite().nonnegative().max(10_000_000);

export const workforceRoleOpenCommandSchemaV10 = z.object({
  ...commandBase,
  type: z.literal("workforce.role.open"),
  payload: z.object({
    title: z.string().trim().min(2).max(100), role: workforceRoleSchema, level: workforceLevelSchema,
    employmentType: employmentTypeSchema, headcount: z.number().int().min(1).max(5),
    salaryMin: money, salaryMax: money, optionBpsMax: z.number().int().min(0).max(2_000),
  }).strict().refine((value) => value.salaryMax >= value.salaryMin, "Salary band is invalid"),
}).strict();

export const workforceCandidateSourceCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.candidate.source"),
  payload: z.object({ roleId: entityId, channel: z.enum(["network", "inbound", "outbound", "agency"]), count: z.number().int().min(1).max(5) }).strict(),
}).strict();

export const workforceCandidateAssessCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.candidate.assess"),
  payload: z.object({ candidateId: entityId, method: z.enum(["structured_interview", "work_sample", "reference", "portfolio_review"]), panelCluster: z.string().trim().min(2).max(80) }).strict(),
}).strict();

export const workforceOfferMakeCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.offer.make"),
  payload: z.object({ candidateId: entityId, salary: money, optionBps: z.number().int().min(0).max(2_000), startDelayDays: z.number().int().min(0).max(120) }).strict(),
}).strict();

export const workforceOfferWithdrawCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.offer.withdraw"), payload: z.object({ candidateId: entityId }).strict(),
}).strict();

export const workforceAssignmentSetCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.assignment.set"),
  payload: z.object({ employeeId: entityId, workload: z.number().min(0).max(1.5), ownership: z.array(z.string().trim().min(2).max(100)).max(12) }).strict(),
}).strict();

export const workforceManagerAssignCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.manager.assign"), payload: z.object({ employeeId: entityId, managerId: entityId }).strict(),
}).strict();

export const workforceOneOnOneCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.one_on_one.hold"),
  payload: z.object({ employeeId: entityId, focus: z.enum(["performance", "career", "conflict", "retention"]) }).strict(),
}).strict();

export const workforceFeedbackCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.feedback.record"),
  payload: z.object({ employeeId: entityId, style: z.enum(["direct", "coaching", "ambiguous"]), topic: z.string().trim().min(2).max(240) }).strict(),
}).strict();

export const workforceCompensationCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.compensation.change"),
  payload: z.object({ employeeId: entityId, salary: money, optionBps: z.number().int().min(0).max(2_000) }).strict(),
}).strict();

export const workforceRoleChangeCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.role.change"),
  payload: z.object({ employeeId: entityId, role: workforceRoleSchema, level: workforceLevelSchema }).strict(),
}).strict();

export const workforcePerformanceProcessCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.performance_process.start"),
  payload: z.object({ employeeId: entityId, expectations: z.string().trim().min(3).max(500), reviewDays: z.number().int().min(14).max(90) }).strict(),
}).strict();

export const workforceDelegationCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.delegation.set"),
  payload: z.object({ managerId: entityId, mandate: z.enum(["delivery", "hiring", "people", "commercial"]), budgetLimit: money, escalationThreshold: z.enum(["low", "material", "critical"]) }).strict(),
}).strict();

export const workforceResignationRespondCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.resignation.respond"),
  payload: z.object({ employeeId: entityId, response: z.enum(["accept", "counteroffer", "change_role", "negotiate_handoff"]), salary: money.optional() }).strict(),
}).strict();

export const workforceTerminationPlanCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.termination.plan"),
  payload: z.object({ employeeId: entityId, reason: z.enum(["performance", "misconduct", "role_eliminated"]), documentationIds: z.array(entityId).max(20) }).strict(),
}).strict();

export const workforceLayoffPlanCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("workforce.layoff.plan"),
  payload: z.object({ employeeIds: z.array(entityId).min(1).max(24), reason: z.string().trim().min(3).max(300) }).strict(),
}).strict();

export const employmentCaseTriageCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("employment_case.triage"),
  payload: z.object({ caseId: entityId, action: z.enum(["preserve_evidence", "limit_access", "interim_leave", "monitor"]) }).strict(),
}).strict();

export const employmentCaseInvestigateCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("employment_case.investigate"),
  payload: z.object({ caseId: entityId, approach: z.enum(["internal", "independent", "mediation"]) }).strict(),
}).strict();

export const employmentCaseRespondCommandSchemaV10 = z.object({
  ...commandBase, type: z.literal("employment_case.respond"),
  payload: z.object({ caseId: entityId, action: z.enum(["no_action", "coaching", "warning", "reassign", "terminate", "settle", "defend", "notify"]) }).strict(),
}).strict();

export const treasuryCollectionCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("treasury.collection.act"),
  payload: z.object({
    invoiceId: entityId,
    action: z.enum(["contact_buyer", "request_payment_plan", "offer_early_pay_discount", "suspend_service", "engage_collections_partner", "accept_settlement", "write_off"]),
    discountPercent: z.number().finite().min(0).max(50).optional(),
  }).strict(),
}).strict();

export const treasuryInvoiceDisputeCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("treasury.invoice.dispute_respond"),
  payload: z.object({
    invoiceId: entityId,
    action: z.enum(["provide_evidence", "issue_credit", "negotiate", "defend"]),
    amount: money.optional(),
  }).strict(),
}).strict();

export const creditFacilityNegotiateCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("credit.facility.negotiate"),
  payload: z.object({
    lenderId: entityId,
    facilityType: z.enum(["working_capital", "revenue_based", "term_loan"]),
    requestedAmount: money.refine((value) => value > 0),
    maturityDays: z.number().int().min(90).max(1_800),
  }).strict(),
}).strict();

export const creditCovenantRespondCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("credit.covenant.respond"),
  payload: z.object({
    facilityId: entityId,
    action: z.enum(["provide_reporting", "pay_down_principal", "request_waiver", "request_amendment", "equity_cure", "refinance", "sell_eligible_asset", "controlled_default"]),
    amount: money.optional(),
  }).strict(),
}).strict();

export const deliveryPlanReallocateCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("delivery.plan.reallocate"),
  payload: z.object({
    commitmentId: entityId,
    mode: z.enum(["protect", "defer", "outsource", "reduce_scope"]),
    capacityHours: z.number().finite().min(0).max(500),
  }).strict(),
}).strict();

export const deliveryCommitmentRenegotiateCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("delivery.commitment.renegotiate"),
  payload: z.object({
    commitmentId: entityId,
    requestedExtensionDays: z.number().int().min(1).max(180),
    scopeReductionPercent: z.number().finite().min(0).max(80),
  }).strict(),
}).strict();

export const customerContractAmendCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("customer.contract.amend"),
  payload: z.object({
    accountId: entityId,
    paymentTermsDays: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
    serviceLevel: z.enum(["best_effort", "standard", "critical"]),
    monthlyPrice: money.refine((value) => value > 0),
  }).strict(),
}).strict();

export const customerRemediationCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("customer.remediation.commit"),
  payload: z.object({
    accountId: entityId,
    action: z.enum(["service_credit", "executive_review", "recovery_plan", "accept_churn"]),
    amount: money.optional(),
  }).strict(),
}).strict();

export const commercialCaseTriageCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("commercial_case.triage"),
  payload: z.object({ caseId: entityId, action: z.enum(["preserve_evidence", "notify_insurer", "limit_exposure", "monitor"]) }).strict(),
}).strict();

export const commercialCaseInvestigateCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("commercial_case.investigate"),
  payload: z.object({ caseId: entityId, approach: z.enum(["internal", "independent", "mediation"]) }).strict(),
}).strict();

export const commercialCaseRespondCommandSchemaV10_2 = z.object({
  ...commandBase, type: z.literal("commercial_case.respond"),
  payload: z.object({
    caseId: entityId,
    action: z.enum(["remediate", "negotiate", "settle", "defend", "notify_regulator"]),
    amount: money.optional(),
  }).strict(),
}).strict();

export const salesDiscoveryRecordCommandSchemaV10_3 = z.object({
  ...commandBase, type: z.literal("sales.discovery.record"),
  payload: z.object({
    opportunityId: entityId, actorId: entityId,
    method: z.enum(["interview", "workflow_observation", "technical_workshop"]),
    problemSignal: z.string().trim().min(3).max(500),
  }).strict(),
}).strict();

export const salesBusinessCasePrepareCommandSchemaV10_3 = z.object({
  ...commandBase, type: z.literal("sales.business_case.prepare"),
  payload: z.object({
    opportunityId: entityId, annualValue: money.refine((value) => value > 0),
    implementationDays: z.number().int().min(1).max(365),
    evidenceIds: z.array(entityId).min(1).max(20),
  }).strict(),
}).strict();

export const salesProposalSubmitCommandSchemaV10_3 = z.object({
  ...commandBase, type: z.literal("sales.proposal.submit"),
  payload: z.object({
    opportunityId: entityId, monthlyPrice: money.refine((value) => value > 0),
    implementationFee: money, termMonths: z.number().int().min(1).max(60),
    purchasePath: z.enum(["paid_pilot", "subscription", "annual_prepaid"]),
  }).strict(),
}).strict();

export const procurementRequirementRespondCommandSchemaV10_3 = z.object({
  ...commandBase, type: z.literal("procurement.requirement.respond"),
  payload: z.object({
    caseId: entityId, gateId: entityId,
    action: z.enum(["submit_evidence", "remediate", "request_waiver", "escalate"]),
    evidenceIds: z.array(entityId).max(20),
  }).strict(),
}).strict();

export const contractDraftCreateCommandSchemaV10_3 = z.object({
  ...commandBase, type: z.literal("contract.draft.create"),
  payload: z.object({
    procurementCaseId: entityId,
    billingModel: z.enum(["monthly_advance", "monthly_arrears", "annual_prepaid", "milestone"]),
    monthlyPrice: money.refine((value) => value > 0), implementationFee: money,
    termMonths: z.number().int().min(1).max(60),
    paymentTermsDays: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
    serviceLevel: z.enum(["best_effort", "standard", "critical"]),
  }).strict(),
}).strict();

export const contractClauseProposeCommandSchemaV10_3 = z.object({
  ...commandBase, type: z.literal("contract.clause.propose"),
  payload: z.object({
    agreementId: entityId,
    clause: z.enum(["liability_cap", "termination_convenience", "data_processing", "sla_credit", "ip_ownership", "acceptance", "auto_renewal"]),
    position: z.enum(["player_standard", "balanced", "customer_favorable"]),
  }).strict(),
}).strict();

export const contractApprovalRequestCommandSchemaV10_3 = z.object({
  ...commandBase, type: z.literal("contract.approval.request"), payload: z.object({ agreementId: entityId }).strict(),
}).strict();

export const contractSignCommandSchemaV10_3 = z.object({
  ...commandBase, type: z.literal("contract.sign"), payload: z.object({ agreementId: entityId, signatoryActorId: entityId }).strict(),
}).strict();

export const contractWalkAwayCommandSchemaV10_3 = z.object({
  ...commandBase, type: z.literal("contract.walk_away"), payload: z.object({ agreementId: entityId, reason: z.string().trim().min(3).max(500) }).strict(),
}).strict();

export const customerAcceptanceRequestCommandSchemaV10_3 = z.object({
  ...commandBase, type: z.literal("customer.acceptance.request"), payload: z.object({ agreementId: entityId }).strict(),
}).strict();

const playerCommandSchemasV10 = [
  operationsAdvanceCommandSchemaV10,
  requestFinalAuditCommandSchemaV10,
  controlledShutdownCommandSchemaV10,
  workforceRoleOpenCommandSchemaV10,
  workforceCandidateSourceCommandSchemaV10,
  workforceCandidateAssessCommandSchemaV10,
  workforceOfferMakeCommandSchemaV10,
  workforceOfferWithdrawCommandSchemaV10,
  workforceAssignmentSetCommandSchemaV10,
  workforceManagerAssignCommandSchemaV10,
  workforceOneOnOneCommandSchemaV10,
  workforceFeedbackCommandSchemaV10,
  workforceCompensationCommandSchemaV10,
  workforceRoleChangeCommandSchemaV10,
  workforcePerformanceProcessCommandSchemaV10,
  workforceDelegationCommandSchemaV10,
  workforceResignationRespondCommandSchemaV10,
  workforceTerminationPlanCommandSchemaV10,
  workforceLayoffPlanCommandSchemaV10,
  employmentCaseTriageCommandSchemaV10,
  employmentCaseInvestigateCommandSchemaV10,
  employmentCaseRespondCommandSchemaV10,
  treasuryCollectionCommandSchemaV10_2,
  treasuryInvoiceDisputeCommandSchemaV10_2,
  creditFacilityNegotiateCommandSchemaV10_2,
  creditCovenantRespondCommandSchemaV10_2,
  deliveryPlanReallocateCommandSchemaV10_2,
  deliveryCommitmentRenegotiateCommandSchemaV10_2,
  customerContractAmendCommandSchemaV10_2,
  customerRemediationCommandSchemaV10_2,
  commercialCaseTriageCommandSchemaV10_2,
  commercialCaseInvestigateCommandSchemaV10_2,
  commercialCaseRespondCommandSchemaV10_2,
  salesDiscoveryRecordCommandSchemaV10_3,
  salesBusinessCasePrepareCommandSchemaV10_3,
  salesProposalSubmitCommandSchemaV10_3,
  procurementRequirementRespondCommandSchemaV10_3,
  contractDraftCreateCommandSchemaV10_3,
  contractClauseProposeCommandSchemaV10_3,
  contractApprovalRequestCommandSchemaV10_3,
  contractSignCommandSchemaV10_3,
  contractWalkAwayCommandSchemaV10_3,
  customerAcceptanceRequestCommandSchemaV10_3,
] as const;

export const simulationCommandSchemaV10 = z.discriminatedUnion("type", [
  ...playerCommandSchemasV10,
  recordPublicFactCommandSchemaV10,
  completeFinalAuditCommandSchemaV10,
  applyCompetitorPlanCommandSchemaV10,
  applyCompetitorFallbackCommandSchemaV10,
  applyMarketDossierCommandSchemaV10,
]) satisfies z.ZodType<SimulationCommandV10>;

const actorSchema = z.enum(["player", "system"]);

export const engineCommandSchemaV10 = simulationCommandSchemaV10.and(
  z.object({ actor: actorSchema }).strict(),
) satisfies z.ZodType<EngineCommandV10>;
