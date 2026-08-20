export const V10_ENGINE_VERSION = "10.0.0-alpha.1";
export const V10_1_ENGINE_VERSION = "10.1.0-alpha.1";
export const V10_2_ENGINE_VERSION = "10.2.0-alpha.1";
export const V10_3_ENGINE_VERSION = "10.3.0-alpha.1";
export const V10_SCHEMA_VERSION = 10 as const;
export const V10_CHALLENGE_PROFILE = "maximum_realism_v1" as const;
export const V10_DISTRIBUTION_VERSION = "external-world-distributions-v1" as const;

export type ChallengeProfileV10 = typeof V10_CHALLENGE_PROFILE;
export type CampaignClassV10 = "primary_ironman" | "practice_fork";
export type CampaignStageV10 =
  | "formation"
  | "discovery"
  | "validation"
  | "pmf"
  | "repeatability"
  | "scale"
  | "late_stage"
  | "transaction"
  | "public_company";
export type RunStatusV10 = "active" | "concludable" | "concluding" | "ended";
export type FounderProfileIdV10 =
  | "technical_builder"
  | "commercial_hunter"
  | "domain_insider"
  | "community_operator";

export type RngStateV10 = {
  algorithm: "xorshift32-v1";
  distributionVersion: typeof V10_DISTRIBUTION_VERSION;
  state: number;
  draws: number;
};

export type CausalContextV10_2 = {
  parentEventIds: string[];
  rootEventIds: string[];
  exposureIds: string[];
  obligationIds: string[];
};

export type ScheduledEffectV10 = {
  id: string;
  featureId: string;
  type: `${string}.${string}`;
  dueDay: number;
  createdSequence: number;
  sourceId: string;
  payload: unknown;
  sampledOutcome?: unknown;
  causality?: CausalContextV10_2;
};

export type FeatureManifestEntryV10 = {
  id: string;
  version: string;
  checksum: string;
  dependencies: Array<{ id: string; versionRange: string }>;
};

export type FeatureHeadV10<TPublic = unknown, TPrivate = unknown> = {
  version: string;
  public: TPublic;
  private: TPrivate;
  checksum: string;
  updatedAtVersion: number;
};

export type SimulationKernelStateV10 = {
  schemaVersion: typeof V10_SCHEMA_VERSION;
  engineVersion: string;
  scenarioVersionId: string;
  jurisdictionRuleVersionId: string;
  companyName: string;
  founderProfileId: FounderProfileIdV10;
  challengeProfile: ChallengeProfileV10;
  campaignClass: CampaignClassV10;
  nonComparable: boolean;
  stage: CampaignStageV10;
  status: RunStatusV10;
  simulationDay: number;
  fiscalPeriod: string;
  seed: number;
  rng: RngStateV10;
  version: number;
  commandSequence: number;
  eventSequence: number;
  nextEffectSequence: number;
  pendingEffects: ScheduledEffectV10[];
  pendingCriticalTurnIds: string[];
  recentCausalEventIds?: string[];
  endingReason: string | null;
  overallChecksum: string;
};

export type SimulationStateV10 = {
  kernel: SimulationKernelStateV10;
  manifest: Record<string, FeatureManifestEntryV10>;
  features: Record<string, FeatureHeadV10>;
};

export type CreateRunV10Request = {
  scenarioVersionId: string;
  setup: {
    companyName: string;
    founderProfileId: FounderProfileIdV10;
  };
};

export type PublicSourceFactV10 = {
  id: string;
  sourceType: "verified_public_fact";
  subjectId: string;
  kind: string;
  statement: string;
  title: string;
  publisher: string;
  url: string;
  observedAt: string;
  retrievedAt: string;
};

export type CommandRequestV10<TType extends string = string, TPayload = unknown> = {
  commandId: string;
  expectedVersion: number;
  type: TType;
  payload: TPayload;
};

export type OperationsAdvanceCommandV10 = CommandRequestV10<
  "operations.advance_to_next_material_event",
  { horizonDays?: number }
>;

export type CampaignRequestFinalAuditCommandV10 = CommandRequestV10<
  "campaign.request_final_audit",
  { confirmation: "FINAL_AUDIT" }
>;

export type CampaignControlledShutdownCommandV10 = CommandRequestV10<
  "campaign.controlled_shutdown",
  { reason: string }
>;

export type RecordPublicFactCommandV10 = CommandRequestV10<
  "external_world.record_public_fact",
  { fact: PublicSourceFactV10; externalInputRef: string }
>;

export type CompleteFinalAuditCommandV10 = CommandRequestV10<
  "campaign.complete_final_audit",
  { auditId: string }
>;

export type ApplyCompetitorPlanCommandV10 = CommandRequestV10<
  "system.competitor_plan.apply",
  {
    externalInputId: string;
    turnId: string;
    inputHash: string;
    provider: "openai" | "authored";
    plan: import("./strategy-grammar").CompetitorStrategicPlanV10;
  }
>;

export type ApplyCompetitorFallbackCommandV10 = CommandRequestV10<
  "system.competitor_plan_fallback",
  ApplyCompetitorPlanCommandV10["payload"]
>;

export type ApplyMarketDossierCommandV10 = CommandRequestV10<
  "system.market_dossier.apply_v10",
  {
    externalInputId: string;
    dossierId: string;
    inputHash: string;
    facts: PublicSourceFactV10[];
  }
>;

export type WorkforceRole = "engineering" | "product" | "sales" | "operations" | "customer_success" | "finance";
export type WorkforceLevel = "individual" | "lead" | "manager";
export type EmploymentTypeV10 = "employee" | "contractor";
export type CandidateAssessmentMethodV10 = "structured_interview" | "work_sample" | "reference" | "portfolio_review";

export type WorkforceRoleOpenCommandV10 = CommandRequestV10<"workforce.role.open", {
  title: string;
  role: WorkforceRole;
  level: WorkforceLevel;
  employmentType: EmploymentTypeV10;
  headcount: number;
  salaryMin: number;
  salaryMax: number;
  optionBpsMax: number;
}>;
export type WorkforceCandidateSourceCommandV10 = CommandRequestV10<"workforce.candidate.source", {
  roleId: string;
  channel: "network" | "inbound" | "outbound" | "agency";
  count: number;
}>;
export type WorkforceCandidateAssessCommandV10 = CommandRequestV10<"workforce.candidate.assess", {
  candidateId: string;
  method: CandidateAssessmentMethodV10;
  panelCluster: string;
}>;
export type WorkforceOfferMakeCommandV10 = CommandRequestV10<"workforce.offer.make", {
  candidateId: string;
  salary: number;
  optionBps: number;
  startDelayDays: number;
}>;
export type WorkforceOfferWithdrawCommandV10 = CommandRequestV10<"workforce.offer.withdraw", { candidateId: string }>;
export type WorkforceAssignmentSetCommandV10 = CommandRequestV10<"workforce.assignment.set", {
  employeeId: string;
  workload: number;
  ownership: string[];
}>;
export type WorkforceManagerAssignCommandV10 = CommandRequestV10<"workforce.manager.assign", {
  employeeId: string;
  managerId: string;
}>;
export type WorkforceOneOnOneCommandV10 = CommandRequestV10<"workforce.one_on_one.hold", {
  employeeId: string;
  focus: "performance" | "career" | "conflict" | "retention";
}>;
export type WorkforceFeedbackCommandV10 = CommandRequestV10<"workforce.feedback.record", {
  employeeId: string;
  style: "direct" | "coaching" | "ambiguous";
  topic: string;
}>;
export type WorkforceCompensationCommandV10 = CommandRequestV10<"workforce.compensation.change", {
  employeeId: string;
  salary: number;
  optionBps: number;
}>;
export type WorkforceRoleChangeCommandV10 = CommandRequestV10<"workforce.role.change", {
  employeeId: string;
  role: WorkforceRole;
  level: WorkforceLevel;
}>;
export type WorkforcePerformanceProcessCommandV10 = CommandRequestV10<"workforce.performance_process.start", {
  employeeId: string;
  expectations: string;
  reviewDays: number;
}>;
export type WorkforceDelegationCommandV10 = CommandRequestV10<"workforce.delegation.set", {
  managerId: string;
  mandate: "delivery" | "hiring" | "people" | "commercial";
  budgetLimit: number;
  escalationThreshold: "low" | "material" | "critical";
}>;
export type WorkforceResignationRespondCommandV10 = CommandRequestV10<"workforce.resignation.respond", {
  employeeId: string;
  response: "accept" | "counteroffer" | "change_role" | "negotiate_handoff";
  salary?: number;
}>;
export type WorkforceTerminationPlanCommandV10 = CommandRequestV10<"workforce.termination.plan", {
  employeeId: string;
  reason: "performance" | "misconduct" | "role_eliminated";
  documentationIds: string[];
}>;
export type WorkforceLayoffPlanCommandV10 = CommandRequestV10<"workforce.layoff.plan", {
  employeeIds: string[];
  reason: string;
}>;
export type EmploymentCaseTriageCommandV10 = CommandRequestV10<"employment_case.triage", {
  caseId: string;
  action: "preserve_evidence" | "limit_access" | "interim_leave" | "monitor";
}>;
export type EmploymentCaseInvestigateCommandV10 = CommandRequestV10<"employment_case.investigate", {
  caseId: string;
  approach: "internal" | "independent" | "mediation";
}>;
export type EmploymentCaseRespondCommandV10 = CommandRequestV10<"employment_case.respond", {
  caseId: string;
  action: "no_action" | "coaching" | "warning" | "reassign" | "terminate" | "settle" | "defend" | "notify";
}>;

export type TreasuryCollectionActionV10_2 =
  | "contact_buyer"
  | "request_payment_plan"
  | "offer_early_pay_discount"
  | "suspend_service"
  | "engage_collections_partner"
  | "accept_settlement"
  | "write_off";

export type TreasuryCollectionCommandV10_2 = CommandRequestV10<"treasury.collection.act", {
  invoiceId: string;
  action: TreasuryCollectionActionV10_2;
  discountPercent?: number;
}>;
export type TreasuryInvoiceDisputeCommandV10_2 = CommandRequestV10<"treasury.invoice.dispute_respond", {
  invoiceId: string;
  action: "provide_evidence" | "issue_credit" | "negotiate" | "defend";
  amount?: number;
}>;
export type CreditFacilityNegotiateCommandV10_2 = CommandRequestV10<"credit.facility.negotiate", {
  lenderId: string;
  facilityType: "working_capital" | "revenue_based" | "term_loan";
  requestedAmount: number;
  maturityDays: number;
}>;
export type CreditCovenantRespondCommandV10_2 = CommandRequestV10<"credit.covenant.respond", {
  facilityId: string;
  action: "provide_reporting" | "pay_down_principal" | "request_waiver" | "request_amendment" | "equity_cure" | "refinance" | "sell_eligible_asset" | "controlled_default";
  amount?: number;
}>;
export type DeliveryPlanReallocateCommandV10_2 = CommandRequestV10<"delivery.plan.reallocate", {
  commitmentId: string;
  mode: "protect" | "defer" | "outsource" | "reduce_scope";
  capacityHours: number;
}>;
export type DeliveryCommitmentRenegotiateCommandV10_2 = CommandRequestV10<"delivery.commitment.renegotiate", {
  commitmentId: string;
  requestedExtensionDays: number;
  scopeReductionPercent: number;
}>;
export type CustomerContractAmendCommandV10_2 = CommandRequestV10<"customer.contract.amend", {
  accountId: string;
  paymentTermsDays: 0 | 15 | 30 | 60 | 90 | 120;
  serviceLevel: "best_effort" | "standard" | "critical";
  monthlyPrice: number;
}>;
export type CustomerRemediationCommandV10_2 = CommandRequestV10<"customer.remediation.commit", {
  accountId: string;
  action: "service_credit" | "executive_review" | "recovery_plan" | "accept_churn";
  amount?: number;
}>;
export type CommercialCaseTriageCommandV10_2 = CommandRequestV10<"commercial_case.triage", {
  caseId: string;
  action: "preserve_evidence" | "notify_insurer" | "limit_exposure" | "monitor";
}>;
export type CommercialCaseInvestigateCommandV10_2 = CommandRequestV10<"commercial_case.investigate", {
  caseId: string;
  approach: "internal" | "independent" | "mediation";
}>;
export type CommercialCaseRespondCommandV10_2 = CommandRequestV10<"commercial_case.respond", {
  caseId: string;
  action: "remediate" | "negotiate" | "settle" | "defend" | "notify_regulator";
  amount?: number;
}>;

export type SalesDiscoveryRecordCommandV10_3 = CommandRequestV10<"sales.discovery.record", {
  opportunityId: string;
  actorId: string;
  method: "interview" | "workflow_observation" | "technical_workshop";
  problemSignal: string;
}>;
export type SalesBusinessCasePrepareCommandV10_3 = CommandRequestV10<"sales.business_case.prepare", {
  opportunityId: string;
  annualValue: number;
  implementationDays: number;
  evidenceIds: string[];
}>;
export type SalesProposalSubmitCommandV10_3 = CommandRequestV10<"sales.proposal.submit", {
  opportunityId: string;
  monthlyPrice: number;
  implementationFee: number;
  termMonths: number;
  purchasePath: "paid_pilot" | "subscription" | "annual_prepaid";
}>;
export type ProcurementRequirementRespondCommandV10_3 = CommandRequestV10<"procurement.requirement.respond", {
  caseId: string;
  gateId: string;
  action: "submit_evidence" | "remediate" | "request_waiver" | "escalate";
  evidenceIds: string[];
}>;
export type ContractDraftCreateCommandV10_3 = CommandRequestV10<"contract.draft.create", {
  procurementCaseId: string;
  billingModel: "monthly_advance" | "monthly_arrears" | "annual_prepaid" | "milestone";
  monthlyPrice: number;
  implementationFee: number;
  termMonths: number;
  paymentTermsDays: 0 | 15 | 30 | 60 | 90 | 120;
  serviceLevel: "best_effort" | "standard" | "critical";
}>;
export type ContractClauseProposeCommandV10_3 = CommandRequestV10<"contract.clause.propose", {
  agreementId: string;
  clause: "liability_cap" | "termination_convenience" | "data_processing" | "sla_credit" | "ip_ownership" | "acceptance" | "auto_renewal";
  position: "player_standard" | "balanced" | "customer_favorable";
}>;
export type ContractApprovalRequestCommandV10_3 = CommandRequestV10<"contract.approval.request", { agreementId: string }>;
export type ContractSignCommandV10_3 = CommandRequestV10<"contract.sign", { agreementId: string; signatoryActorId: string }>;
export type ContractWalkAwayCommandV10_3 = CommandRequestV10<"contract.walk_away", { agreementId: string; reason: string }>;
export type CustomerAcceptanceRequestCommandV10_3 = CommandRequestV10<"customer.acceptance.request", { agreementId: string }>;

export type PlayerCommandV10 =
  | OperationsAdvanceCommandV10
  | CampaignRequestFinalAuditCommandV10
  | CampaignControlledShutdownCommandV10
  | WorkforceRoleOpenCommandV10
  | WorkforceCandidateSourceCommandV10
  | WorkforceCandidateAssessCommandV10
  | WorkforceOfferMakeCommandV10
  | WorkforceOfferWithdrawCommandV10
  | WorkforceAssignmentSetCommandV10
  | WorkforceManagerAssignCommandV10
  | WorkforceOneOnOneCommandV10
  | WorkforceFeedbackCommandV10
  | WorkforceCompensationCommandV10
  | WorkforceRoleChangeCommandV10
  | WorkforcePerformanceProcessCommandV10
  | WorkforceDelegationCommandV10
  | WorkforceResignationRespondCommandV10
  | WorkforceTerminationPlanCommandV10
  | WorkforceLayoffPlanCommandV10
  | EmploymentCaseTriageCommandV10
  | EmploymentCaseInvestigateCommandV10
  | EmploymentCaseRespondCommandV10
  | TreasuryCollectionCommandV10_2
  | TreasuryInvoiceDisputeCommandV10_2
  | CreditFacilityNegotiateCommandV10_2
  | CreditCovenantRespondCommandV10_2
  | DeliveryPlanReallocateCommandV10_2
  | DeliveryCommitmentRenegotiateCommandV10_2
  | CustomerContractAmendCommandV10_2
  | CustomerRemediationCommandV10_2
  | CommercialCaseTriageCommandV10_2
  | CommercialCaseInvestigateCommandV10_2
  | CommercialCaseRespondCommandV10_2
  | SalesDiscoveryRecordCommandV10_3
  | SalesBusinessCasePrepareCommandV10_3
  | SalesProposalSubmitCommandV10_3
  | ProcurementRequirementRespondCommandV10_3
  | ContractDraftCreateCommandV10_3
  | ContractClauseProposeCommandV10_3
  | ContractApprovalRequestCommandV10_3
  | ContractSignCommandV10_3
  | ContractWalkAwayCommandV10_3
  | CustomerAcceptanceRequestCommandV10_3;

export type SystemCommandV10 =
  | RecordPublicFactCommandV10
  | CompleteFinalAuditCommandV10
  | ApplyCompetitorPlanCommandV10
  | ApplyCompetitorFallbackCommandV10
  | ApplyMarketDossierCommandV10;
export type SimulationCommandV10 = PlayerCommandV10 | SystemCommandV10;
export type EngineCommandV10 = SimulationCommandV10 & { actor: "player" | "system" };

export type DomainEventVisibilityV10 = "public" | "internal";
export type DomainEventV10 = {
  id: string;
  type: `${string}.${string}`;
  featureId: string;
  sourceId: string;
  simulationDay: number;
  visibility: DomainEventVisibilityV10;
  payload: unknown;
  causality?: CausalContextV10_2;
};

export type PublicHistoryEventV10 = {
  id: string;
  sequence: number;
  commandId: string;
  type: string;
  featureId: string;
  simulationDay: number;
  payload: unknown;
  causality?: CausalContextV10_2;
};

export type CommandResponseV10 = {
  runId: string;
  version: number;
  checksum: string;
  changedProjections: Record<string, unknown>;
  events: PublicHistoryEventV10[];
  pendingExternalTurnIds: string[];
  savedAt: string;
  checkpointRequired: boolean;
};

export type CreateStateContextV10 = {
  now: string;
  seed: number;
  engineVersion?: string;
  jurisdictionRuleVersionId: string;
  campaignClass?: CampaignClassV10;
};

export type ApplyCommandContextV10 = {
  runId: string;
  now: string;
};
