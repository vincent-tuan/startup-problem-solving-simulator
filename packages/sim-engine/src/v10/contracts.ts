import type { z } from "zod";
import type {
  DomainEventV10,
  EngineCommandV10,
  FeatureHeadV10,
  PublicSourceFactV10,
  ScheduledEffectV10,
  SimulationKernelStateV10,
} from "./types";

export type FeatureDependencyV10 = {
  id: string;
  versionRange: string;
};

export type RandomSourceV10 = {
  nextFloat(): number;
  normal(mean?: number, standardDeviation?: number): number;
  categorical<T extends string>(weights: Readonly<Record<T, number>>): T;
  snapshot(): SimulationKernelStateV10["rng"];
};

export type FeatureEventDraftV10 = {
  type: `${string}.${string}`;
  visibility?: DomainEventV10["visibility"];
  sourceId: string;
  payload: unknown;
};

export type FeatureEffectDraftV10 = {
  type: `${string}.${string}`;
  dueDay: number;
  sourceId: string;
  payload: unknown;
  sampledOutcome?: unknown;
};

export type QueryResolverV10 = (queryId: string, input?: unknown) => unknown;

export type FeatureRuntimeContextV10<TPublic, TPrivate> = {
  featureId: string;
  kernel: Readonly<SimulationKernelStateV10>;
  ownState: { public: TPublic; private: TPrivate };
  rng: RandomSourceV10;
  query: QueryResolverV10;
  emit(event: FeatureEventDraftV10): void;
  schedule(effect: FeatureEffectDraftV10): ScheduledEffectV10;
};

export type FeatureInitializeContextV10<TConfig> = {
  featureId: string;
  kernel: Readonly<SimulationKernelStateV10>;
  config: TConfig;
  rng: RandomSourceV10;
  query: QueryResolverV10;
  schedule(effect: FeatureEffectDraftV10): ScheduledEffectV10;
};

export type FeatureCommandContextV10<TPublic, TPrivate> = FeatureRuntimeContextV10<TPublic, TPrivate> & {
  command: EngineCommandV10;
};

export type FeatureEffectContextV10<TPublic, TPrivate> = FeatureRuntimeContextV10<TPublic, TPrivate> & {
  effect: ScheduledEffectV10;
};

export type FeatureLifecyclePhaseV10 =
  | "before_command"
  | "after_immediate_effects"
  | "after_scheduled_effects"
  | "after_period_close"
  | "after_command";

export type FeatureLifecycleContextV10<TPublic, TPrivate> = FeatureRuntimeContextV10<TPublic, TPrivate> & {
  phase: FeatureLifecyclePhaseV10;
  elapsedDays: number;
};

export type FeatureCommandResultV10 = {
  checkpointRequired?: boolean;
};

export type TypedQueryProviderV10<TPublic, TPrivate> = {
  id: string;
  dependsOn?: string[];
  resolve(
    context: Pick<FeatureRuntimeContextV10<TPublic, TPrivate>, "featureId" | "kernel" | "ownState" | "query">,
    input: unknown,
  ): unknown;
};

export type TypedDomainEventSubscriptionV10<TPublic, TPrivate> = {
  id: string;
  eventType: `${string}.${string}`;
  handle(context: FeatureRuntimeContextV10<TPublic, TPrivate>, event: DomainEventV10): void;
};

export type FeatureInvariantV10<TPublic, TPrivate> = {
  id: string;
  check(context: Pick<FeatureRuntimeContextV10<TPublic, TPrivate>, "featureId" | "kernel" | "ownState" | "query">): void;
};

export type FeatureProjectionPolicyV10<TPublic, TPrivate> = {
  schema: z.ZodType;
  project(context: {
    featureId: string;
    kernel: Readonly<SimulationKernelStateV10>;
    publicState: TPublic;
  }): unknown;
  denyKeys?: string[];
};

export type FeatureSnapshotPolicyV10 = {
  mode: "every_material_command" | "period_close" | "adaptive";
  maximumCommandsBetweenSnapshots: number;
};

export type FeatureRetentionPolicyV10 = {
  maximumHeadBytes: number;
  maximumMaterialRecords: number;
  archiveClosedRecords: boolean;
};

export type SimulationFeatureV10<TPublic = unknown, TPrivate = unknown, TConfig = unknown> = {
  id: string;
  version: string;
  dependencies: FeatureDependencyV10[];
  compatibleEngineRange: string;

  configSchema: z.ZodType<TConfig>;
  publicStateSchema: z.ZodType<TPublic>;
  privateStateSchema: z.ZodType<TPrivate>;

  initialize(context: FeatureInitializeContextV10<TConfig>): {
    public: TPublic;
    private: TPrivate;
  };

  commands?: Partial<
    Record<
      EngineCommandV10["type"],
      (context: FeatureCommandContextV10<TPublic, TPrivate>) => FeatureCommandResultV10 | void
    >
  >;

  effects?: Record<string, (context: FeatureEffectContextV10<TPublic, TPrivate>) => void>;
  queries?: TypedQueryProviderV10<TPublic, TPrivate>[];
  eventSubscriptions?: TypedDomainEventSubscriptionV10<TPublic, TPrivate>[];
  hooks?: Partial<
    Record<FeatureLifecyclePhaseV10, (context: FeatureLifecycleContextV10<TPublic, TPrivate>) => void>
  >;
  invariants: FeatureInvariantV10<TPublic, TPrivate>[];
  projectionPolicy: FeatureProjectionPolicyV10<TPublic, TPrivate>;
  snapshotPolicy: FeatureSnapshotPolicyV10;
  retentionPolicy: FeatureRetentionPolicyV10;
};

export type RegisteredFeatureV10 = SimulationFeatureV10<any, any, any>;
export type MutableFeatureHeadV10 = FeatureHeadV10<any, any>;

export type ExternalInputReferenceV10 = {
  id: string;
  kind: "market_dossier" | "macro_dossier" | "actor_decision" | "public_fact";
  inputHash: string;
  observedAt: string;
  publicFacts?: PublicSourceFactV10[];
};
