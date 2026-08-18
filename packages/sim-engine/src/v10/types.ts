export const V10_ENGINE_VERSION = "10.0.0-alpha.1";
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

export type ScheduledEffectV10 = {
  id: string;
  featureId: string;
  type: `${string}.${string}`;
  dueDay: number;
  createdSequence: number;
  sourceId: string;
  payload: unknown;
  sampledOutcome?: unknown;
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

export type PlayerCommandV10 =
  | OperationsAdvanceCommandV10
  | CampaignRequestFinalAuditCommandV10
  | CampaignControlledShutdownCommandV10;

export type SystemCommandV10 = RecordPublicFactCommandV10 | CompleteFinalAuditCommandV10;
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
};

export type PublicHistoryEventV10 = {
  id: string;
  sequence: number;
  commandId: string;
  type: string;
  featureId: string;
  simulationDay: number;
  payload: unknown;
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
