export type CapabilityNodeV10 = {
  id: string;
  status: "backlog" | "building" | "released";
  dependencyIds: string[];
};

export function capabilityDependenciesSatisfiedV10(
  nodes: readonly CapabilityNodeV10[],
  nodeId: string,
  additionallySatisfied: readonly string[] = [],
): boolean {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return true;
  const satisfied = new Set([
    ...nodes.filter((candidate) => candidate.status === "released").map((candidate) => candidate.id),
    ...additionallySatisfied,
  ]);
  return node.dependencyIds.every((dependencyId) => satisfied.has(dependencyId));
}

export function assertCapabilityGraphV10(
  nodes: readonly CapabilityNodeV10[],
): void {
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) throw new Error("CAPABILITY_ID_DUPLICATED");
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error("CAPABILITY_DEPENDENCY_CYCLE");
    if (visited.has(id)) return;
    visiting.add(id);
    const node = nodes.find((candidate) => candidate.id === id);
    for (const dependencyId of node?.dependencyIds ?? []) {
      if (!ids.has(dependencyId)) throw new Error("CAPABILITY_DEPENDENCY_MISSING");
      visit(dependencyId);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}
