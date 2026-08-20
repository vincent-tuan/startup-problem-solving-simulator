import { stateChecksum } from "../checksum";
import type {
  FeatureEffectDraftV10,
  FeatureEventDraftV10,
  FeatureLifecyclePhaseV10,
  FeatureRuntimeContextV10,
  QueryResolverV10,
} from "./contracts";
import { FeatureRegistryV10 } from "./registry";
import { SeededRngV10 } from "./rng";
import {
  V10_CHALLENGE_PROFILE,
  V10_ENGINE_VERSION,
  V10_2_ENGINE_VERSION,
  V10_3_ENGINE_VERSION,
  V10_SCHEMA_VERSION,
  type ApplyCommandContextV10,
  type CommandResponseV10,
  type CreateRunV10Request,
  type CreateStateContextV10,
  type DomainEventV10,
  type CausalContextV10_2,
  type EngineCommandV10,
  type FeatureHeadV10,
  type PublicHistoryEventV10,
  type ScheduledEffectV10,
  type SimulationStateV10,
} from "./types";

const MAX_DOMAIN_EVENTS_PER_COMMAND = 10_000;
const MAX_EFFECTS_PER_COMMAND = 10_000;
const MAX_MATERIALIZED_STATE_BYTES = 12_000_000;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fiscalPeriodForDay(day: number): string {
  const year = 2026 + Math.floor(day / 360);
  const month = Math.floor((day % 360) / 30) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function overallChecksum(state: SimulationStateV10): string {
  return stateChecksum({
    kernel: { ...state.kernel, overallChecksum: "" },
    manifest: state.manifest,
    featureHeads: Object.fromEntries(Object.entries(state.features).sort(([left], [right]) => left.localeCompare(right)).map(
      ([featureId, head]) => [featureId, {
        version: head.version,
        checksum: head.checksum,
        updatedAtVersion: head.updatedAtVersion,
      }],
    )),
  });
}

function assertCommandActor(command: EngineCommandV10): void {
  const systemCommand = command.type.startsWith("system.") || command.type === "external_world.record_public_fact" || command.type === "campaign.complete_final_audit";
  if (systemCommand && command.actor !== "system") throw new V10EngineError("SYSTEM_COMMAND_REQUIRED", 403);
  if (!systemCommand && command.actor !== "player") throw new V10EngineError("PLAYER_COMMAND_REQUIRED", 403);
}

export class V10EngineError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus = 400,
    readonly canonicalVersion?: number,
  ) {
    super(code);
    this.name = "V10EngineError";
  }
}

type Runtime = {
  state: SimulationStateV10;
  registry: FeatureRegistryV10;
  rng: SeededRngV10;
  command: EngineCommandV10;
  events: DomainEventV10[];
  checkpointRequired: boolean;
  query: QueryResolverV10;
  contextFor(featureId: string): FeatureRuntimeContextV10<unknown, unknown>;
  withCausality<T>(causality: CausalContextV10_2 | undefined, work: () => T): T;
  drainEvents(): void;
};

const uniqueIds = (values: readonly string[] | undefined): string[] =>
  [...new Set(values ?? [])].filter(Boolean).sort();

function mergeCausality(
  inherited: CausalContextV10_2 | undefined,
  explicit: Partial<CausalContextV10_2> | undefined,
): CausalContextV10_2 | undefined {
  if (!inherited && !explicit) return undefined;
  const merged: CausalContextV10_2 = {
    parentEventIds: uniqueIds([...(inherited?.parentEventIds ?? []), ...(explicit?.parentEventIds ?? [])]),
    rootEventIds: uniqueIds([...(inherited?.rootEventIds ?? []), ...(explicit?.rootEventIds ?? [])]),
    exposureIds: uniqueIds([...(inherited?.exposureIds ?? []), ...(explicit?.exposureIds ?? [])]),
    obligationIds: uniqueIds([...(inherited?.obligationIds ?? []), ...(explicit?.obligationIds ?? [])]),
  };
  return Object.values(merged).some((values) => values.length > 0) ? merged : undefined;
}

function childCausality(event: DomainEventV10): CausalContextV10_2 {
  return {
    parentEventIds: [event.id],
    rootEventIds: event.causality?.rootEventIds.length ? [...event.causality.rootEventIds] : [event.id],
    exposureIds: [...(event.causality?.exposureIds ?? [])],
    obligationIds: [...(event.causality?.obligationIds ?? [])],
  };
}

function createQueryResolver(state: SimulationStateV10, registry: FeatureRegistryV10): QueryResolverV10 {
  const active = new Set<string>();
  const resolve: QueryResolverV10 = (queryId, input) => {
    if (active.has(queryId)) throw new V10EngineError(`QUERY_RUNTIME_CYCLE:${queryId}`, 500);
    const entry = registry.getQueryProvider(queryId);
    if (!entry) throw new V10EngineError(`QUERY_NOT_REGISTERED:${queryId}`, 500);
    const head = state.features[entry.feature.id];
    if (!head) throw new V10EngineError(`QUERY_FEATURE_NOT_INITIALIZED:${entry.feature.id}`, 500);
    active.add(queryId);
    try {
      return entry.provider.resolve({
        featureId: entry.feature.id,
        kernel: state.kernel,
        ownState: { public: head.public, private: head.private },
        query: resolve,
      }, input);
    } finally {
      active.delete(queryId);
    }
  };
  return resolve;
}

function createRuntime(
  state: SimulationStateV10,
  registry: FeatureRegistryV10,
  command: EngineCommandV10,
): Runtime {
  const rng = new SeededRngV10(state.kernel.rng);
  const events: DomainEventV10[] = [];
  let checkpointRequired = false;
  let inheritedCausality: CausalContextV10_2 | undefined;
  const query = createQueryResolver(state, registry);

  const contextFor = (featureId: string): FeatureRuntimeContextV10<unknown, unknown> => {
    const head = state.features[featureId];
    if (!head) throw new V10EngineError(`FEATURE_HEAD_MISSING:${featureId}`, 500);
    return {
      featureId,
      kernel: state.kernel,
      ownState: { public: head.public, private: head.private },
      rng,
      query,
      requestExternalTurn(turnId: string): void {
        if (!state.kernel.pendingCriticalTurnIds.includes(turnId)) {
          state.kernel.pendingCriticalTurnIds.push(turnId);
          state.kernel.pendingCriticalTurnIds.sort();
        }
      },
      resolveExternalTurn(turnId: string): void {
        state.kernel.pendingCriticalTurnIds = state.kernel.pendingCriticalTurnIds.filter((id) => id !== turnId);
      },
      emit(draft: FeatureEventDraftV10): void {
        if (!draft.type.startsWith(`${featureId}.`)) {
          throw new V10EngineError(`EVENT_NAMESPACE_VIOLATION:${featureId}:${draft.type}`, 500);
        }
        if (events.length >= MAX_DOMAIN_EVENTS_PER_COMMAND) {
          throw new V10EngineError("DOMAIN_EVENT_LIMIT_EXCEEDED", 500);
        }
        events.push({
          id: `${command.commandId}:event:${events.length + 1}`,
          type: draft.type,
          featureId,
          sourceId: draft.sourceId,
          simulationDay: state.kernel.simulationDay,
          visibility: draft.visibility ?? "internal",
          payload: clone(draft.payload),
          causality: mergeCausality(inheritedCausality, draft.causality),
        });
      },
      schedule(draft: FeatureEffectDraftV10): ScheduledEffectV10 {
        if (!draft.type.startsWith(`${featureId}.`)) {
          throw new V10EngineError(`EFFECT_NAMESPACE_VIOLATION:${featureId}:${draft.type}`, 500);
        }
        if (!Number.isInteger(draft.dueDay) || draft.dueDay < state.kernel.simulationDay) {
          throw new V10EngineError(`INVALID_EFFECT_DUE_DAY:${draft.type}:${draft.dueDay}`, 500);
        }
        state.kernel.nextEffectSequence += 1;
        const effect: ScheduledEffectV10 = {
          id: `${featureId}:effect:${state.kernel.nextEffectSequence}`,
          featureId,
          type: draft.type,
          dueDay: draft.dueDay,
          createdSequence: state.kernel.nextEffectSequence,
          sourceId: draft.sourceId,
          payload: clone(draft.payload),
          sampledOutcome: draft.sampledOutcome === undefined ? undefined : clone(draft.sampledOutcome),
          causality: mergeCausality(inheritedCausality, draft.causality),
        };
        state.kernel.pendingEffects.push(effect);
        return effect;
      },
    };
  };

  let dispatchedEventCount = 0;
  const drainEvents = (): void => {
    while (dispatchedEventCount < events.length) {
      if (dispatchedEventCount >= MAX_DOMAIN_EVENTS_PER_COMMAND) {
        throw new V10EngineError("DOMAIN_EVENT_DISPATCH_LIMIT_EXCEEDED", 500);
      }
      const event = events[dispatchedEventCount];
      dispatchedEventCount += 1;
      for (const { feature, subscription } of registry.getSubscribers(event.type)) {
        const previous = inheritedCausality;
        inheritedCausality = childCausality(event);
        try {
          subscription.handle(contextFor(feature.id), event);
        } finally {
          inheritedCausality = previous;
        }
      }
    }
  };

  const runtime: Runtime = {
    state,
    registry,
    rng,
    command,
    events,
    get checkpointRequired() {
      return checkpointRequired;
    },
    set checkpointRequired(value: boolean) {
      checkpointRequired = value;
    },
    query,
    contextFor,
    withCausality<T>(causality: CausalContextV10_2 | undefined, work: () => T): T {
      const previous = inheritedCausality;
      inheritedCausality = causality;
      try {
        return work();
      } finally {
        inheritedCausality = previous;
      }
    },
    drainEvents,
  };
  return runtime;
}

function runHooks(runtime: Runtime, phase: FeatureLifecyclePhaseV10, elapsedDays: number): void {
  for (const feature of runtime.registry.ordered) {
    const hook = feature.hooks?.[phase];
    if (!hook) continue;
    hook({
      ...runtime.contextFor(feature.id),
      phase,
      elapsedDays,
    });
  }
  runtime.drainEvents();
}

function processDueEffects(runtime: Runtime): void {
  let processed = 0;
  while (true) {
    const due = runtime.state.kernel.pendingEffects
      .filter((effect) => effect.dueDay <= runtime.state.kernel.simulationDay)
      .sort((left, right) => left.dueDay - right.dueDay || left.createdSequence - right.createdSequence || left.id.localeCompare(right.id))[0];
    if (!due) break;
    processed += 1;
    if (processed > MAX_EFFECTS_PER_COMMAND) throw new V10EngineError("SCHEDULED_EFFECT_LIMIT_EXCEEDED", 500);
    runtime.state.kernel.pendingEffects = runtime.state.kernel.pendingEffects.filter((effect) => effect.id !== due.id);
    const owner = runtime.registry.getEffectOwner(due.type);
    if (!owner) throw new V10EngineError(`SCHEDULED_EFFECT_OWNER_MISSING:${due.type}`, 500);
    if (owner.id !== due.featureId) throw new V10EngineError(`SCHEDULED_EFFECT_OWNER_MISMATCH:${due.type}`, 500);
    const handler = owner.effects?.[due.type];
    if (!handler) throw new V10EngineError(`SCHEDULED_EFFECT_HANDLER_MISSING:${due.type}`, 500);
    runtime.withCausality(due.causality, () => handler({ ...runtime.contextFor(owner.id), effect: due }));
    runtime.drainEvents();
  }
}

function advanceToNextMaterialEvent(runtime: Runtime, horizonDays: number): number {
  const currentDay = runtime.state.kernel.simulationDay;
  const dueNow = runtime.state.kernel.pendingEffects.some((effect) => effect.dueDay <= currentDay);
  const nextEffectDay = runtime.state.kernel.pendingEffects
    .filter((effect) => effect.dueDay > currentDay)
    .reduce((minimum, effect) => Math.min(minimum, effect.dueDay), Number.POSITIVE_INFINITY);
  const nextPeriodClose = Math.floor(currentDay / 30 + 1) * 30;
  const targetDay = dueNow
    ? currentDay
    : Math.min(currentDay + horizonDays, nextEffectDay, nextPeriodClose);
  const elapsedDays = targetDay - currentDay;
  runtime.state.kernel.simulationDay = targetDay;
  runtime.state.kernel.fiscalPeriod = fiscalPeriodForDay(targetDay);
  processDueEffects(runtime);
  runHooks(runtime, "after_scheduled_effects", elapsedDays);
  if (targetDay > currentDay && targetDay % 30 === 0) {
    runHooks(runtime, "after_period_close", elapsedDays);
    if ([V10_2_ENGINE_VERSION, V10_3_ENGINE_VERSION].includes(runtime.state.kernel.engineVersion)) {
      runHooks(runtime, "after_operations_close", elapsedDays);
      runHooks(runtime, "after_commercial_close", elapsedDays);
      runHooks(runtime, "after_accounting_close", elapsedDays);
      runHooks(runtime, "after_covenant_close", elapsedDays);
      runHooks(runtime, "after_risk_close", elapsedDays);
      runHooks(runtime, "after_stage_evaluation", elapsedDays);
    }
  }
  return elapsedDays;
}

function applyKernelCommand(runtime: Runtime): { handled: boolean; elapsedDays: number } {
  const { state, command } = runtime;
  switch (command.type) {
    case "operations.advance_to_next_material_event": {
      if (state.kernel.pendingCriticalTurnIds.length > 0) throw new V10EngineError("CRITICAL_TURN_PENDING", 409);
      const horizonDays = command.payload.horizonDays ?? 90;
      if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 365) {
        throw new V10EngineError("INVALID_ADVANCE_HORIZON");
      }
      return { handled: true, elapsedDays: advanceToNextMaterialEvent(runtime, horizonDays) };
    }
    case "campaign.request_final_audit": {
      if (!(["active", "concludable"] as const).includes(state.kernel.status as "active" | "concludable")) {
        throw new V10EngineError("RUN_NOT_CONCLUDABLE", 409);
      }
      if (command.payload.confirmation !== "FINAL_AUDIT") throw new V10EngineError("FINAL_AUDIT_CONFIRMATION_REQUIRED");
      state.kernel.status = "concluding";
      runtime.checkpointRequired = true;
      return { handled: true, elapsedDays: 0 };
    }
    case "campaign.complete_final_audit": {
      if (state.kernel.status !== "concluding") throw new V10EngineError("FINAL_AUDIT_NOT_PENDING", 409);
      state.kernel.status = "ended";
      state.kernel.endingReason = `final_audit:${command.payload.auditId}`;
      return { handled: true, elapsedDays: 0 };
    }
    case "campaign.controlled_shutdown": {
      if (state.kernel.status === "ended" || state.kernel.status === "concluding") {
        throw new V10EngineError("RUN_NOT_ACTIVE", 409);
      }
      state.kernel.status = "ended";
      state.kernel.endingReason = `controlled_shutdown:${command.payload.reason}`;
      runtime.checkpointRequired = true;
      return { handled: true, elapsedDays: 0 };
    }
    default:
      return { handled: false, elapsedDays: 0 };
  }
}

function runInvariants(state: SimulationStateV10, registry: FeatureRegistryV10, query: QueryResolverV10): void {
  if (state.kernel.schemaVersion !== V10_SCHEMA_VERSION) throw new V10EngineError("V10_SCHEMA_VERSION_MISMATCH", 500);
  if (!Number.isInteger(state.kernel.simulationDay) || state.kernel.simulationDay < 0) {
    throw new V10EngineError("INVALID_SIMULATION_DAY", 500);
  }
  if (state.kernel.pendingEffects.some((effect) => effect.dueDay < state.kernel.simulationDay)) {
    throw new V10EngineError("OVERDUE_EFFECT_REMAINING", 500);
  }
  const effectIds = state.kernel.pendingEffects.map((effect) => effect.id);
  if (new Set(effectIds).size !== effectIds.length) throw new V10EngineError("DUPLICATE_EFFECT_ID", 500);
  for (const effect of state.kernel.pendingEffects) {
    if ((effect.causality?.parentEventIds.length ?? 0) > 8) throw new V10EngineError("CAUSAL_PARENT_LIMIT_EXCEEDED", 500);
  }

  for (const feature of registry.ordered) {
    registry.validateFeatureState(state, feature.id);
    const head = state.features[feature.id];
    const context = {
      featureId: feature.id,
      kernel: state.kernel,
      ownState: { public: head.public, private: head.private },
      query,
    };
    for (const invariant of feature.invariants) invariant.check(context);
    const headBytes = bytes({ public: head.public, private: head.private });
    if (headBytes > feature.retentionPolicy.maximumHeadBytes) {
      throw new V10EngineError(`FEATURE_HEAD_SIZE_LIMIT:${feature.id}:${headBytes}`, 500);
    }
  }
  const totalBytes = bytes(state);
  if (totalBytes > MAX_MATERIALIZED_STATE_BYTES) {
    throw new V10EngineError(`MATERIALIZED_STATE_SIZE_LIMIT:${totalBytes}`, 500);
  }
}

function updateChecksums(
  state: SimulationStateV10,
  registry: FeatureRegistryV10,
  previous: SimulationStateV10 | null,
): string[] {
  const changed: string[] = [];
  for (const feature of registry.ordered) {
    const head = state.features[feature.id];
    const checksum = registry.featureChecksum(feature.id, head.public, head.private);
    const previousChecksum = previous?.features[feature.id]?.checksum;
    head.checksum = checksum;
    if (checksum !== previousChecksum) {
      changed.push(feature.id);
      head.updatedAtVersion = state.kernel.version;
    }
    state.manifest[feature.id] = {
      id: feature.id,
      version: feature.version,
      checksum,
      dependencies: feature.dependencies.map((dependency) => ({ ...dependency })),
    };
  }
  state.kernel.overallChecksum = overallChecksum(state);
  return changed;
}

export function createInitialStateV10(
  request: CreateRunV10Request,
  context: CreateStateContextV10,
  registry: FeatureRegistryV10,
  featureConfig: Record<string, unknown> = {},
): SimulationStateV10 {
  const engineVersion = context.engineVersion ?? V10_ENGINE_VERSION;
  if (registry.engineVersion !== engineVersion) throw new V10EngineError("REGISTRY_ENGINE_VERSION_MISMATCH", 500);
  const campaignClass = context.campaignClass ?? "primary_ironman";
  const rng = new SeededRngV10(context.seed);
  const state: SimulationStateV10 = {
    kernel: {
      schemaVersion: V10_SCHEMA_VERSION,
      engineVersion,
      scenarioVersionId: request.scenarioVersionId,
      jurisdictionRuleVersionId: context.jurisdictionRuleVersionId,
      companyName: request.setup.companyName,
      founderProfileId: request.setup.founderProfileId,
      challengeProfile: V10_CHALLENGE_PROFILE,
      campaignClass,
      nonComparable: campaignClass === "practice_fork",
      stage: "formation",
      status: "active",
      simulationDay: 0,
      fiscalPeriod: fiscalPeriodForDay(0),
      seed: context.seed >>> 0 || 1,
      rng: rng.snapshot(),
      version: 0,
      commandSequence: 0,
      eventSequence: 0,
      nextEffectSequence: 0,
      pendingEffects: [],
      pendingCriticalTurnIds: [],
      recentCausalEventIds: [],
      endingReason: null,
      overallChecksum: "",
    },
    manifest: {},
    features: {},
  };

  const query = createQueryResolver(state, registry);
  for (const feature of registry.ordered) {
    const config = feature.configSchema.parse(featureConfig[feature.id]);
    const initialized = feature.initialize({
      featureId: feature.id,
      kernel: state.kernel,
      config,
      rng,
      query,
      schedule(draft): ScheduledEffectV10 {
        if (!draft.type.startsWith(`${feature.id}.`)) {
          throw new V10EngineError(`EFFECT_NAMESPACE_VIOLATION:${feature.id}:${draft.type}`, 500);
        }
        state.kernel.nextEffectSequence += 1;
        const effect: ScheduledEffectV10 = {
          id: `${feature.id}:effect:${state.kernel.nextEffectSequence}`,
          featureId: feature.id,
          type: draft.type,
          dueDay: draft.dueDay,
          createdSequence: state.kernel.nextEffectSequence,
          sourceId: draft.sourceId,
          payload: clone(draft.payload),
          sampledOutcome: draft.sampledOutcome === undefined ? undefined : clone(draft.sampledOutcome),
          causality: mergeCausality(undefined, draft.causality),
        };
        state.kernel.pendingEffects.push(effect);
        return effect;
      },
    });
    const publicState = feature.publicStateSchema.parse(initialized.public);
    const privateState = feature.privateStateSchema.parse(initialized.private);
    state.features[feature.id] = {
      version: feature.version,
      public: publicState,
      private: privateState,
      checksum: "",
      updatedAtVersion: 0,
    } satisfies FeatureHeadV10;
  }
  state.kernel.rng = rng.snapshot();
  state.manifest = registry.manifest(state);
  const initializedQuery = createQueryResolver(state, registry);
  runInvariants(state, registry, initializedQuery);
  updateChecksums(state, registry, null);
  return state;
}

export function applyCommandV10(
  stateInput: SimulationStateV10,
  command: EngineCommandV10,
  context: ApplyCommandContextV10,
  registry: FeatureRegistryV10,
): { state: SimulationStateV10; response: CommandResponseV10 } {
  if (stateInput.kernel.engineVersion !== registry.engineVersion) {
    throw new V10EngineError("ENGINE_CONTEXT_MISMATCH", 409, stateInput.kernel.version);
  }
  if (stateInput.kernel.status === "ended") throw new V10EngineError("RUN_NOT_ACTIVE", 409, stateInput.kernel.version);
  if (stateInput.kernel.status === "concluding" && command.type !== "campaign.complete_final_audit") {
    throw new V10EngineError("FINAL_AUDIT_IN_PROGRESS", 409, stateInput.kernel.version);
  }
  if (command.expectedVersion !== stateInput.kernel.version) {
    throw new V10EngineError("STALE_VERSION", 409, stateInput.kernel.version);
  }
  assertCommandActor(command);

  const state = clone(stateInput);
  const runtime = createRuntime(state, registry, command);
  runHooks(runtime, "before_command", 0);

  const kernelResult = applyKernelCommand(runtime);
  let elapsedDays = kernelResult.elapsedDays;
  if (!kernelResult.handled) {
    const owner = registry.getCommandOwner(command.type);
    if (!owner) throw new V10EngineError(`COMMAND_OWNER_MISSING:${command.type}`);
    const handler = owner.commands?.[command.type];
    if (!handler) throw new V10EngineError(`COMMAND_HANDLER_MISSING:${command.type}`, 500);
    const result = handler({ ...runtime.contextFor(owner.id), command });
    runtime.checkpointRequired ||= Boolean(result?.checkpointRequired);
    runtime.drainEvents();
    elapsedDays = 0;
  }

  runHooks(runtime, "after_immediate_effects", elapsedDays);
  runHooks(runtime, "after_command", elapsedDays);

  state.kernel.commandSequence += 1;
  state.kernel.version += 1;
  state.kernel.rng = runtime.rng.snapshot();
  const knownEventIds = new Set(stateInput.kernel.recentCausalEventIds ?? []);
  for (const event of runtime.events) {
    if ((event.causality?.parentEventIds.length ?? 0) > 8) throw new V10EngineError("CAUSAL_PARENT_LIMIT_EXCEEDED", 500);
    for (const parentId of event.causality?.parentEventIds ?? []) {
      if (!knownEventIds.has(parentId)) throw new V10EngineError(`CAUSAL_PARENT_NOT_FOUND:${parentId}`, 500);
    }
    knownEventIds.add(event.id);
  }
  state.kernel.recentCausalEventIds = [...knownEventIds].slice(-4_000);
  state.kernel.eventSequence += runtime.events.length;
  const query = createQueryResolver(state, registry);
  runInvariants(state, registry, query);
  const changedFeatureIds = updateChecksums(state, registry, stateInput);

  const changedProjections: Record<string, unknown> = {
    kernel: {
      version: state.kernel.version,
      stage: state.kernel.stage,
      status: state.kernel.status,
      simulationDay: state.kernel.simulationDay,
      fiscalPeriod: state.kernel.fiscalPeriod,
      challengeProfile: state.kernel.challengeProfile,
      campaignClass: state.kernel.campaignClass,
    },
  };
  for (const featureId of changedFeatureIds) changedProjections[featureId] = registry.project(state, featureId);

  const firstSequence = state.kernel.eventSequence - runtime.events.length;
  const publicEvents: PublicHistoryEventV10[] = runtime.events.flatMap((event, index) => event.visibility === "public" ? [{
    id: event.id,
    sequence: firstSequence + index + 1,
    commandId: command.commandId,
    type: event.type,
    featureId: event.featureId,
    simulationDay: event.simulationDay,
    payload: clone(event.payload),
    causality: event.causality ? clone(event.causality) : undefined,
  }] : []);

  return {
    state,
    response: {
      runId: context.runId,
      version: state.kernel.version,
      checksum: state.kernel.overallChecksum,
      changedProjections,
      events: publicEvents,
      pendingExternalTurnIds: [...state.kernel.pendingCriticalTurnIds],
      savedAt: context.now,
      checkpointRequired: runtime.checkpointRequired,
    },
  };
}
