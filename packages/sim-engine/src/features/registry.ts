import type { ScenarioDefinition, ScheduledEffect, SimulationState } from "../types";
import type { DomainEmitter, EngineCommand, LifecyclePhase, SimulationFeature } from "./contracts";

const idPattern = /^[a-z][a-z0-9-]*$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;

export class FeatureRegistry {
  readonly ordered: SimulationFeature[];
  private readonly byId: Map<string, SimulationFeature>;
  private readonly commandOwners = new Map<EngineCommand["type"], SimulationFeature>();
  private readonly effectOwners = new Map<string, SimulationFeature>();

  constructor(features: SimulationFeature[]) {
    this.byId = new Map();
    for (const feature of features) {
      if (!idPattern.test(feature.id)) throw new Error(`INVALID_FEATURE_ID:${feature.id}`);
      if (!versionPattern.test(feature.version)) throw new Error(`INVALID_FEATURE_VERSION:${feature.id}`);
      if (this.byId.has(feature.id)) throw new Error(`DUPLICATE_FEATURE:${feature.id}`);
      this.byId.set(feature.id, feature);
    }
    for (const feature of features) for (const dependency of feature.dependencies) {
      if (!this.byId.has(dependency)) throw new Error(`MISSING_FEATURE_DEPENDENCY:${feature.id}:${dependency}`);
    }
    this.ordered = this.topologicalOrder(features);
    for (const feature of features) for (const type of Object.keys(feature.commands ?? {}) as EngineCommand["type"][]) {
      const owner = this.commandOwners.get(type);
      if (owner) throw new Error(`DUPLICATE_COMMAND_OWNER:${type}:${owner.id}:${feature.id}`);
      this.commandOwners.set(type, feature);
    }
    for (const feature of features) for (const type of Object.keys(feature.effects ?? {})) {
      if (!type.startsWith(`${feature.id}.`)) throw new Error(`FEATURE_EFFECT_NOT_NAMESPACED:${feature.id}:${type}`);
      const owner = this.effectOwners.get(type); if (owner) throw new Error(`DUPLICATE_EFFECT_OWNER:${type}:${owner.id}:${feature.id}`);
      this.effectOwners.set(type, feature);
    }
  }

  private topologicalOrder(features: SimulationFeature[]) {
    const visiting = new Set<string>(); const visited = new Set<string>(); const result: SimulationFeature[] = [];
    const visit = (feature: SimulationFeature) => {
      if (visiting.has(feature.id)) throw new Error(`FEATURE_DEPENDENCY_CYCLE:${feature.id}`);
      if (visited.has(feature.id)) return;
      visiting.add(feature.id);
      for (const dependency of [...feature.dependencies].sort()) visit(this.byId.get(dependency)!);
      visiting.delete(feature.id); visited.add(feature.id); result.push(feature);
    };
    for (const feature of [...features].sort((a, b) => a.id.localeCompare(b.id))) visit(feature);
    return result;
  }

  initialize(state: SimulationState, scenario: ScenarioDefinition, featureConfig: Record<string, unknown> = {}) {
    state.features = { versions: {}, public: {}, private: {} };
    for (const feature of this.ordered.filter((item) => item.defaultEnabled !== false)) {
      const config = feature.configSchema ? feature.configSchema.parse(featureConfig[feature.id]) : featureConfig[feature.id];
      const extension = feature.initialize?.({ state, scenario, config }) ?? {};
      state.features.versions[feature.id] = feature.version;
      if (feature.publicStateSchema) state.features.public[feature.id] = feature.publicStateSchema.parse(extension.public);
      else if (extension.public !== undefined) state.features.public[feature.id] = extension.public;
      if (feature.privateStateSchema) state.features.private[feature.id] = feature.privateStateSchema.parse(extension.private);
      else if (extension.private !== undefined) state.features.private[feature.id] = extension.private;
    }
  }

  dispatch(state: SimulationState, command: EngineCommand, emit: DomainEmitter) {
    const owner = this.commandOwners.get(command.type);
    if (!owner) return { handled: false, checkpoint: false };
    if (!state.features?.versions[owner.id]) throw new Error(`FEATURE_NOT_ENABLED:${owner.id}`);
    const handler = owner.commands?.[command.type];
    if (!handler) throw new Error(`FEATURE_HANDLER_MISSING:${command.type}`);
    const result = handler({ state, command, emit });
    return { handled: true, checkpoint: Boolean(result?.checkpoint) };
  }

  runLifecycle(state: SimulationState, phase: LifecyclePhase, elapsedDays: number, emit: DomainEmitter) {
    for (const feature of this.ordered) if (state.features?.versions[feature.id]) feature.hooks?.[phase]?.({ state, elapsedDays, emit });
  }

  dispatchEffect(state: SimulationState, effect: ScheduledEffect, emit: DomainEmitter) {
    const owner = this.effectOwners.get(effect.type); if (!owner) return false;
    if (!state.features?.versions[owner.id]) throw new Error(`FEATURE_NOT_ENABLED:${owner.id}`);
    const handler = owner.effects?.[effect.type]; if (!handler) throw new Error(`FEATURE_EFFECT_HANDLER_MISSING:${effect.type}`);
    handler({ state, effect, emit }); return true;
  }

  validate(state: SimulationState) {
    if (!state.features) throw new Error("FEATURE_STATE_MISSING");
    for (const feature of this.ordered) {
      const version = state.features.versions[feature.id];
      if (!version) continue;
      if (version !== feature.version) throw new Error(`FEATURE_VERSION_MISMATCH:${feature.id}:${version}:${feature.version}`);
      if (feature.publicStateSchema) feature.publicStateSchema.parse(state.features.public[feature.id]);
      if (feature.privateStateSchema) feature.privateStateSchema.parse(state.features.private[feature.id]);
      feature.validate?.(state);
    }
  }

  manifest() {
    return this.ordered.map((feature) => ({ id: feature.id, version: feature.version, dependencies: [...feature.dependencies], commands: Object.keys(feature.commands ?? {}).sort(), effects: Object.keys(feature.effects ?? {}).sort() }));
  }
}
