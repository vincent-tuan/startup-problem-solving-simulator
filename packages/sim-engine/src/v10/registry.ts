import { stateChecksum } from "../checksum";
import type {
  RegisteredFeatureV10,
  SimulationFeatureV10,
  TypedDomainEventSubscriptionV10,
  TypedQueryProviderV10,
} from "./contracts";
import type { EngineCommandV10, FeatureManifestEntryV10, SimulationStateV10 } from "./types";

const featureIdPattern = /^[a-z][a-z0-9-]*$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;
const commandTypePattern = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const namespacedTypePattern = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9_.-]*$/;

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) throw new Error(`INVALID_SEMVER:${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function satisfies(version: string, range: string): boolean {
  const normalized = range.trim();
  if (normalized === "*") return true;
  if (normalized.startsWith("^")) {
    const base = normalized.slice(1);
    const [major] = parseVersion(base);
    return parseVersion(version)[0] === major && compareVersion(version, base) >= 0;
  }
  const interval = /^>=(\d+\.\d+\.\d+)\s+<(\d+\.\d+\.\d+)$/.exec(normalized);
  if (interval) return compareVersion(version, interval[1]) >= 0 && compareVersion(version, interval[2]) < 0;
  return compareVersion(version, normalized) === 0;
}

function collectObjectReferences(value: unknown, references: WeakSet<object>): void {
  if (value === null || typeof value !== "object" || references.has(value)) return;
  references.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectObjectReferences(item, references);
    return;
  }
  for (const child of Object.values(value as Record<string, unknown>)) collectObjectReferences(child, references);
}

function assertProjectionSafe(projection: unknown, privateState: unknown, denyKeys: string[]): void {
  const privateReferences = new WeakSet<object>();
  collectObjectReferences(privateState, privateReferences);
  const seen = new WeakSet<object>();
  const visit = (value: unknown, path: string): void => {
    if (value === null || typeof value !== "object") return;
    if (privateReferences.has(value)) throw new Error(`PRIVATE_STATE_REFERENCE_LEAK:${path}`);
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (denyKeys.includes(key)) throw new Error(`PRIVATE_PROJECTION_KEY:${path}.${key}`);
      visit(child, `${path}.${key}`);
    }
  };
  visit(projection, "projection");
}

export class FeatureRegistryV10 {
  readonly ordered: RegisteredFeatureV10[];
  private readonly byId = new Map<string, RegisteredFeatureV10>();
  private readonly commandOwners = new Map<EngineCommandV10["type"], RegisteredFeatureV10>();
  private readonly effectOwners = new Map<string, RegisteredFeatureV10>();
  private readonly queryProviders = new Map<string, { feature: RegisteredFeatureV10; provider: TypedQueryProviderV10<unknown, unknown> }>();
  private readonly subscribers = new Map<string, Array<{ feature: RegisteredFeatureV10; subscription: TypedDomainEventSubscriptionV10<unknown, unknown> }>>();

  constructor(features: Array<SimulationFeatureV10<any, any, any>>, readonly engineVersion: string) {
    for (const input of features) {
      const feature = input as RegisteredFeatureV10;
      if (!featureIdPattern.test(feature.id)) throw new Error(`INVALID_FEATURE_ID:${feature.id}`);
      if (!versionPattern.test(feature.version)) throw new Error(`INVALID_FEATURE_VERSION:${feature.id}:${feature.version}`);
      if (!satisfies(engineVersion, feature.compatibleEngineRange)) {
        throw new Error(`UNSUPPORTED_ENGINE_VERSION:${feature.id}:${engineVersion}:${feature.compatibleEngineRange}`);
      }
      if (this.byId.has(feature.id)) throw new Error(`DUPLICATE_FEATURE:${feature.id}`);
      if (!feature.projectionPolicy) throw new Error(`PROJECTION_POLICY_MISSING:${feature.id}`);
      this.byId.set(feature.id, feature);
    }

    for (const feature of this.byId.values()) {
      for (const dependency of feature.dependencies) {
        const target = this.byId.get(dependency.id);
        if (!target) throw new Error(`MISSING_FEATURE_DEPENDENCY:${feature.id}:${dependency.id}`);
        if (!satisfies(target.version, dependency.versionRange)) {
          throw new Error(`FEATURE_DEPENDENCY_VERSION_MISMATCH:${feature.id}:${dependency.id}:${target.version}:${dependency.versionRange}`);
        }
      }
    }

    this.ordered = this.topologicalOrder();
    const featureOrder = new Map(this.ordered.map((feature, index) => [feature.id, index]));

    for (const feature of this.ordered) {
      for (const type of Object.keys(feature.commands ?? {}) as EngineCommandV10["type"][]) {
        if (!commandTypePattern.test(type)) throw new Error(`INVALID_COMMAND_TYPE:${feature.id}:${type}`);
        const existing = this.commandOwners.get(type);
        if (existing) throw new Error(`DUPLICATE_COMMAND_OWNER:${type}:${existing.id}:${feature.id}`);
        this.commandOwners.set(type, feature);
      }

      for (const type of Object.keys(feature.effects ?? {})) {
        if (!namespacedTypePattern.test(type) || !type.startsWith(`${feature.id}.`)) {
          throw new Error(`FEATURE_EFFECT_NAMESPACE_VIOLATION:${feature.id}:${type}`);
        }
        const existing = this.effectOwners.get(type);
        if (existing) throw new Error(`DUPLICATE_EFFECT_OWNER:${type}:${existing.id}:${feature.id}`);
        this.effectOwners.set(type, feature);
      }

      for (const provider of feature.queries ?? []) {
        const existing = this.queryProviders.get(provider.id);
        if (existing) throw new Error(`DUPLICATE_QUERY_PROVIDER:${provider.id}:${existing.feature.id}:${feature.id}`);
        this.queryProviders.set(provider.id, { feature, provider });
      }

      for (const subscription of feature.eventSubscriptions ?? []) {
        const values = this.subscribers.get(subscription.eventType) ?? [];
        if (values.some((entry) => entry.subscription.id === subscription.id)) {
          throw new Error(`DUPLICATE_EVENT_SUBSCRIPTION:${subscription.eventType}:${subscription.id}`);
        }
        values.push({ feature, subscription });
        values.sort((left, right) => {
          const order = featureOrder.get(left.feature.id)! - featureOrder.get(right.feature.id)!;
          return order || left.subscription.id.localeCompare(right.subscription.id);
        });
        this.subscribers.set(subscription.eventType, values);
      }
    }

    this.validateQueryGraph();
  }

  private topologicalOrder(): RegisteredFeatureV10[] {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const result: RegisteredFeatureV10[] = [];
    const visit = (feature: RegisteredFeatureV10): void => {
      if (visiting.has(feature.id)) throw new Error(`FEATURE_DEPENDENCY_CYCLE:${feature.id}`);
      if (visited.has(feature.id)) return;
      visiting.add(feature.id);
      for (const dependency of [...feature.dependencies].sort((a, b) => a.id.localeCompare(b.id))) {
        visit(this.byId.get(dependency.id)!);
      }
      visiting.delete(feature.id);
      visited.add(feature.id);
      result.push(feature);
    };
    for (const feature of [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id))) visit(feature);
    return result;
  }

  private validateQueryGraph(): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (queryId: string): void => {
      if (visiting.has(queryId)) throw new Error(`QUERY_DEPENDENCY_CYCLE:${queryId}`);
      if (visited.has(queryId)) return;
      const entry = this.queryProviders.get(queryId);
      if (!entry) throw new Error(`MISSING_QUERY_PROVIDER:${queryId}`);
      visiting.add(queryId);
      for (const dependency of [...(entry.provider.dependsOn ?? [])].sort()) visit(dependency);
      visiting.delete(queryId);
      visited.add(queryId);
    };
    for (const queryId of [...this.queryProviders.keys()].sort()) visit(queryId);
  }

  getFeature(featureId: string): RegisteredFeatureV10 {
    const feature = this.byId.get(featureId);
    if (!feature) throw new Error(`FEATURE_NOT_REGISTERED:${featureId}`);
    return feature;
  }

  getCommandOwner(type: EngineCommandV10["type"]): RegisteredFeatureV10 | undefined {
    return this.commandOwners.get(type);
  }

  getEffectOwner(type: string): RegisteredFeatureV10 | undefined {
    return this.effectOwners.get(type);
  }

  getQueryProvider(queryId: string) {
    return this.queryProviders.get(queryId);
  }

  getSubscribers(eventType: string) {
    return this.subscribers.get(eventType) ?? [];
  }

  manifest(state?: SimulationStateV10): Record<string, FeatureManifestEntryV10> {
    return Object.fromEntries(this.ordered.map((feature) => [feature.id, {
      id: feature.id,
      version: feature.version,
      checksum: state?.features[feature.id]?.checksum ?? "",
      dependencies: feature.dependencies.map((dependency) => ({ ...dependency })),
    }]));
  }

  validateFeatureState(state: SimulationStateV10, featureId: string): void {
    const feature = this.getFeature(featureId);
    const head = state.features[featureId];
    if (!head) throw new Error(`FEATURE_HEAD_MISSING:${featureId}`);
    if (head.version !== feature.version) throw new Error(`FEATURE_VERSION_MISMATCH:${featureId}:${head.version}:${feature.version}`);
    feature.publicStateSchema.parse(head.public);
    feature.privateStateSchema.parse(head.private);
  }

  project(state: SimulationStateV10, featureId: string): unknown {
    this.validateFeatureState(state, featureId);
    const feature = this.getFeature(featureId);
    const head = state.features[featureId];
    const projection = feature.projectionPolicy.project({
      featureId,
      kernel: state.kernel,
      publicState: structuredClone(head.public),
    });
    const parsed = feature.projectionPolicy.schema.parse(projection);
    assertProjectionSafe(parsed, head.private, feature.projectionPolicy.denyKeys ?? []);
    return parsed;
  }

  featureChecksum(featureId: string, publicState: unknown, privateState: unknown): string {
    const feature = this.getFeature(featureId);
    return stateChecksum({ featureId, version: feature.version, public: publicState, private: privateState });
  }
}
