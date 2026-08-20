import { z } from "zod";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";
import type { EconomicTransactionV10_2 } from "./finance-treasury-v10-2";

const gateKindSchema = z.enum(["business_need", "budget", "vendor_registration", "security", "privacy", "insurance", "references", "legal", "executive_approval", "purchase_order"]);
const gateSchema = z.object({
  id: z.string(), caseId: z.string(), kind: gateKindSchema, label: z.string(), ownerRole: z.string(),
  status: z.enum(["open", "blocked", "in_review", "completed", "waived", "rejected", "expired"]),
  prerequisiteIds: z.array(z.string()).max(10), requiredEvidenceCount: z.number().int().min(0).max(20),
  evidenceIds: z.array(z.string()).max(30), reviewDueDay: z.number().int().nonnegative().nullable(),
  materiality: z.enum(["low", "material", "critical"]), knownIssue: z.string().nullable(), attempts: z.number().int().nonnegative(),
}).strict();
export type ProcurementGateV10_3 = z.infer<typeof gateSchema>;

const caseSchema = z.object({
  id: z.string(), opportunityId: z.string(), organizationId: z.string(),
  purchaseClass: z.enum(["self_serve", "owner_led", "departmental", "formal_midmarket", "enterprise", "regulated"]),
  status: z.enum(["forming", "active", "blocked", "approved", "rejected", "withdrawn", "expired"]),
  gateIds: z.array(z.string()).min(1).max(20), openedDay: z.number().int().nonnegative(), deadlineDay: z.number().int().nonnegative(),
  nextKnownDeadline: z.number().int().nonnegative().nullable(), progressSignal: z.enum(["early", "moving", "stalled", "final_review", "complete"]),
}).strict();
export type ProcurementCaseV10_3 = z.infer<typeof caseSchema>;

export const procurementProcessesPublicStateSchemaV10_3 = z.object({
  cases: z.array(caseSchema).max(80), gates: z.array(gateSchema).max(1_000),
  openRequestCount: z.number().int().nonnegative(), blockedCaseCount: z.number().int().nonnegative(),
  disclaimer: z.literal("Procurement and commercial-rule simulation archetypes — not legal advice."),
}).strict();
export type ProcurementProcessesPublicStateV10_3 = z.infer<typeof procurementProcessesPublicStateSchemaV10_3>;

const privateSchema = z.object({
  gateTruth: z.record(z.string(), z.object({ threshold: z.number().min(0).max(1), reviewQuantile: z.number().min(0).max(1), waiverTolerance: z.number().min(0).max(1) }).strict()),
  processedProposalIds: z.array(z.string()).max(500), nextCaseSequence: z.number().int().positive(),
  profile: z.enum(["ai_workflow", "local_services", "healthcare"]),
}).strict();
type PrivateState = z.infer<typeof privateSchema>;
const configSchema = z.object({ profile: z.enum(["ai_workflow", "local_services", "healthcare"]) }).default({ profile: "ai_workflow" });
type Context = FeatureRuntimeContextV10<ProcurementProcessesPublicStateV10_3, PrivateState>;

function gateDefinitions(purchaseClass: ProcurementCaseV10_3["purchaseClass"], profile: z.infer<typeof configSchema>["profile"]): Array<{ kind: ProcurementGateV10_3["kind"]; label: string; ownerRole: string; dependencies: ProcurementGateV10_3["kind"][]; evidence: number; materiality: ProcurementGateV10_3["materiality"] }> {
  const formal = ["formal_midmarket", "enterprise", "regulated"].includes(purchaseClass);
  const regulated = purchaseClass === "regulated" || profile === "healthcare";
  return [
    { kind: "business_need", label: "Business need and sponsor confirmation", ownerRole: "champion", dependencies: [], evidence: 1, materiality: "material" },
    { kind: "budget", label: "Budget reservation", ownerRole: "budget_owner", dependencies: ["business_need"], evidence: 1, materiality: "critical" },
    { kind: "vendor_registration", label: "Vendor registration", ownerRole: "procurement", dependencies: [], evidence: formal ? 2 : 1, materiality: formal ? "material" : "low" },
    ...(formal ? [{ kind: "security" as const, label: "Security and architecture review", ownerRole: "security", dependencies: ["vendor_registration" as const], evidence: 2, materiality: regulated ? "critical" as const : "material" as const }] : []),
    ...(regulated ? [{ kind: "privacy" as const, label: "Privacy and data-processing review", ownerRole: "privacy", dependencies: ["security" as const], evidence: 2, materiality: "critical" as const }, { kind: "insurance" as const, label: "Insurance coverage verification", ownerRole: "procurement", dependencies: ["vendor_registration" as const], evidence: 1, materiality: "material" as const }] : []),
    ...(formal ? [{ kind: "references" as const, label: "Customer references", ownerRole: "procurement", dependencies: ["business_need" as const], evidence: 1, materiality: "material" as const }] : []),
    { kind: "legal", label: "Commercial and legal review", ownerRole: "legal", dependencies: ["budget", ...(formal ? [regulated ? "privacy" as const : "security" as const] : [])], evidence: formal ? 2 : 1, materiality: regulated ? "critical" : "material" },
    ...(formal ? [{ kind: "executive_approval" as const, label: "Final executive approval", ownerRole: "executive_sponsor", dependencies: ["legal" as const, "references" as const], evidence: 1, materiality: "critical" as const }] : []),
    { kind: "purchase_order", label: "Purchase order issuance", ownerRole: "finance", dependencies: [formal ? "executive_approval" : "legal"], evidence: 1, materiality: "critical" },
  ];
}

function findCase(context: Context, id: string): ProcurementCaseV10_3 {
  const item = context.ownState.public.cases.find((candidate) => candidate.id === id); if (!item) throw new Error("PROCUREMENT_CASE_NOT_FOUND"); return item;
}
function findGate(context: Context, caseId: string, gateId: string): ProcurementGateV10_3 {
  const item = context.ownState.public.gates.find((candidate) => candidate.id === gateId && candidate.caseId === caseId); if (!item) throw new Error("PROCUREMENT_GATE_NOT_FOUND"); return item;
}
function refresh(context: Context, procurementCase?: ProcurementCaseV10_3): void {
  for (const item of procurementCase ? [procurementCase] : context.ownState.public.cases) {
    const gates = context.ownState.public.gates.filter((gate) => gate.caseId === item.id);
    for (const gate of gates.filter((candidate) => candidate.status === "blocked")) {
      if (gate.prerequisiteIds.every((id) => gates.find((candidate) => candidate.id === id && ["completed", "waived"].includes(candidate.status)))) gate.status = "open";
    }
    const complete = gates.filter((gate) => ["completed", "waived"].includes(gate.status)).length;
    if (complete === gates.length) { item.status = "approved"; item.progressSignal = "complete"; item.nextKnownDeadline = null; }
    else {
      const pending = gates.filter((gate) => gate.status === "in_review").map((gate) => gate.reviewDueDay ?? item.deadlineDay);
      item.nextKnownDeadline = Math.min(item.deadlineDay, ...pending);
      item.status = gates.some((gate) => ["rejected", "expired"].includes(gate.status)) ? "blocked" : "active";
      item.progressSignal = complete / gates.length > 0.75 ? "final_review" : pending.length ? "moving" : gates.some((gate) => gate.attempts > 0) ? "stalled" : "early";
    }
  }
  context.ownState.public.openRequestCount = context.ownState.public.gates.filter((gate) => ["open", "blocked", "in_review", "rejected"].includes(gate.status)).length;
  context.ownState.public.blockedCaseCount = context.ownState.public.cases.filter((item) => item.status === "blocked").length;
}
function economic(context: Context, transaction: EconomicTransactionV10_2): void {
  context.emit({ type: "procurement-processes.economic_transaction_requested", sourceId: transaction.transactionId, payload: transaction });
}

export function createProcurementProcessesFeatureV10_3(): SimulationFeatureV10<ProcurementProcessesPublicStateV10_3, PrivateState, z.infer<typeof configSchema>> {
  return {
    id: "procurement-processes", version: "1.0.0", dependencies: [{ id: "customer-organizations", versionRange: "^1.0.0" }, { id: "commercial-opportunities", versionRange: "^1.0.0" }], compatibleEngineRange: ">=10.3.0 <11.0.0",
    configSchema, publicStateSchema: procurementProcessesPublicStateSchemaV10_3, privateStateSchema: privateSchema,
    initialize: ({ config }) => ({ public: { cases: [], gates: [], openRequestCount: 0, blockedCaseCount: 0, disclaimer: "Procurement and commercial-rule simulation archetypes — not legal advice." }, private: { gateTruth: {}, processedProposalIds: [], nextCaseSequence: 1, profile: config.profile } }),
    commands: { "procurement.requirement.respond": (context) => {
      if (context.command.type !== "procurement.requirement.respond") return;
      const procurementCase = findCase(context, context.command.payload.caseId); const gate = findGate(context, procurementCase.id, context.command.payload.gateId);
      if (!["active", "blocked"].includes(procurementCase.status)) throw new Error("PROCUREMENT_CASE_NOT_ACTIONABLE");
      if (gate.status === "in_review") throw new Error("PROCUREMENT_GATE_REVIEW_PENDING");
      const caseGates = context.ownState.public.gates.filter((item) => item.caseId === procurementCase.id);
      if (!gate.prerequisiteIds.every((id) => caseGates.find((item) => item.id === id && ["completed", "waived"].includes(item.status)))) throw new Error("PROCUREMENT_GATE_PREREQUISITE_MISSING");
      const action = context.command.payload.action;
      if (action === "request_waiver" && gate.materiality === "critical") throw new Error("CRITICAL_GATE_CANNOT_BE_WAIVED");
      if (action === "submit_evidence" && context.command.payload.evidenceIds.length < gate.requiredEvidenceCount) throw new Error("PROCUREMENT_EVIDENCE_INSUFFICIENT");
      gate.evidenceIds = [...new Set([...gate.evidenceIds, ...context.command.payload.evidenceIds])].slice(-30); gate.attempts += 1; gate.status = "in_review"; gate.knownIssue = null;
      const baseDelay = gate.kind === "security" || gate.kind === "privacy" || gate.kind === "legal" ? 9 : gate.kind === "executive_approval" ? 7 : 4;
      const delay = Math.max(2, baseDelay + gate.attempts * 2 - (action === "escalate" ? 3 : 0)); gate.reviewDueDay = context.kernel.simulationDay + delay;
      if (action === "remediate") economic(context, { transactionId: `procurement-remediation:${gate.id}:${context.command.commandId}`, kind: "expense", category: "compliance", amount: gate.materiality === "critical" ? 900 : 350, memo: `Remediation for ${gate.label}`, dueDay: context.kernel.simulationDay });
      context.schedule({ type: "procurement-processes.gate_review", dueDay: gate.reviewDueDay, sourceId: gate.id, payload: { caseId: procurementCase.id, gateId: gate.id, action }, sampledOutcome: { reviewQuantile: context.rng.nextFloat() }, causality: { obligationIds: [`procurement:${procurementCase.id}:${gate.id}`] } });
      context.emit({ type: "procurement-processes.requirement_submitted", visibility: "public", sourceId: gate.id, payload: { caseId: procurementCase.id, gateId: gate.id, kind: gate.kind, action, reviewDueDay: gate.reviewDueDay }, causality: { obligationIds: [`procurement:${procurementCase.id}:${gate.id}`] } });
      refresh(context, procurementCase);
    } },
    effects: { "procurement-processes.gate_review": (context) => {
      const payload = context.effect.payload as { caseId: string; gateId: string; action: string }; const procurementCase = findCase(context, payload.caseId); const gate = findGate(context, payload.caseId, payload.gateId);
      if (gate.status !== "in_review") return;
      const organization = context.query("customer-organizations.organization", { organizationId: procurementCase.organizationId }) as { budgetSignal: string } | null;
      const truth = context.ownState.private.gateTruth[gate.id]; const sampled = context.effect.sampledOutcome as { reviewQuantile: number };
      const evidenceStrength = Math.min(0.35, gate.evidenceIds.length * 0.08); const actionBoost = payload.action === "remediate" ? 0.24 : payload.action === "escalate" ? 0.1 : payload.action === "request_waiver" ? truth.waiverTolerance * 0.25 : 0.12;
      const budgetPenalty = gate.kind === "budget" && organization?.budgetSignal === "frozen" ? 0.65 : gate.kind === "budget" && organization?.budgetSignal === "constrained" ? 0.25 : 0;
      const pass = payload.action === "request_waiver" ? sampled.reviewQuantile < truth.waiverTolerance : evidenceStrength + actionBoost + (1 - truth.threshold) - budgetPenalty >= sampled.reviewQuantile;
      gate.reviewDueDay = null;
      if (pass) { gate.status = payload.action === "request_waiver" ? "waived" : "completed"; gate.knownIssue = null; context.emit({ type: "procurement-processes.gate_approved", visibility: "public", sourceId: gate.id, payload: { caseId: procurementCase.id, gateId: gate.id, kind: gate.kind, disposition: gate.status }, causality: { obligationIds: [`procurement:${procurementCase.id}:${gate.id}`] } }); }
      else { gate.status = "rejected"; gate.knownIssue = gate.kind === "budget" ? "Budget owner did not release funds." : gate.kind === "security" || gate.kind === "privacy" ? "Submitted control evidence did not satisfy the review." : "The reviewer returned the submission with unresolved requirements."; context.emit({ type: "procurement-processes.gate_rejected", visibility: "public", sourceId: gate.id, payload: { caseId: procurementCase.id, gateId: gate.id, kind: gate.kind, knownIssue: gate.knownIssue }, causality: { obligationIds: [`procurement:${procurementCase.id}:${gate.id}`] } }); }
      const wasApproved = procurementCase.status === "approved"; refresh(context, procurementCase);
      if (!wasApproved && procurementCase.status === "approved") context.emit({ type: "procurement-processes.approved", visibility: "public", sourceId: procurementCase.id, payload: { caseId: procurementCase.id, opportunityId: procurementCase.opportunityId, organizationId: procurementCase.organizationId }, causality: { obligationIds: [`procurement:${procurementCase.id}`] } });
    } },
    queries: [
      { id: "procurement-processes.case", resolve: ({ ownState }, input) => structuredClone(ownState.public.cases.find((item) => item.id === (input as { caseId?: string } | undefined)?.caseId) ?? null) },
      { id: "procurement-processes.for-opportunity", resolve: ({ ownState }, input) => structuredClone(ownState.public.cases.find((item) => item.opportunityId === (input as { opportunityId?: string } | undefined)?.opportunityId) ?? null) },
    ],
    eventSubscriptions: [{ id: "procurement-open-from-proposal", eventType: "commercial-opportunities.proposal_submitted", handle: (context, event) => {
      const payload = event.payload as { proposalId: string; opportunityId: string; organizationId: string; purchaseClass: ProcurementCaseV10_3["purchaseClass"] };
      if (context.ownState.private.processedProposalIds.includes(payload.proposalId)) return;
      context.ownState.private.processedProposalIds.push(payload.proposalId);
      const caseId = `procurement-${context.ownState.private.nextCaseSequence++}`; const definitions = gateDefinitions(payload.purchaseClass, context.ownState.private.profile);
      const gates: ProcurementGateV10_3[] = definitions.map((definition) => ({ id: `${caseId}:${definition.kind}`, caseId, kind: definition.kind, label: definition.label, ownerRole: definition.ownerRole, status: definition.dependencies.length ? "blocked" : "open", prerequisiteIds: definition.dependencies.map((kind) => `${caseId}:${kind}`), requiredEvidenceCount: definition.evidence, evidenceIds: [], reviewDueDay: null, materiality: definition.materiality, knownIssue: null, attempts: 0 }));
      context.ownState.public.gates.push(...gates);
      const deadlineDays = payload.purchaseClass === "regulated" ? 270 : payload.purchaseClass === "enterprise" ? 210 : payload.purchaseClass === "formal_midmarket" ? 150 : payload.purchaseClass === "departmental" ? 90 : 60;
      const procurementCase: ProcurementCaseV10_3 = { id: caseId, opportunityId: payload.opportunityId, organizationId: payload.organizationId, purchaseClass: payload.purchaseClass, status: "active", gateIds: gates.map((gate) => gate.id), openedDay: event.simulationDay, deadlineDay: event.simulationDay + deadlineDays, nextKnownDeadline: event.simulationDay + Math.min(45, deadlineDays), progressSignal: "early" };
      context.ownState.public.cases.push(procurementCase);
      for (const gate of gates) context.ownState.private.gateTruth[gate.id] = { threshold: Math.max(0.12, Math.min(0.9, (gate.materiality === "critical" ? 0.68 : gate.materiality === "material" ? 0.52 : 0.35) + context.rng.normal(0, 0.08))), reviewQuantile: context.rng.nextFloat(), waiverTolerance: Math.max(0.05, Math.min(0.8, 0.4 + context.rng.normal(0, 0.15))) };
      refresh(context, procurementCase);
      context.emit({ type: "procurement-processes.case_opened", visibility: "public", sourceId: caseId, payload: { caseId, opportunityId: payload.opportunityId, organizationId: payload.organizationId, gateCount: gates.length, deadlineDay: procurementCase.deadlineDay }, causality: { obligationIds: [`procurement:${caseId}`] } });
    } }],
    hooks: { after_commercial_close: (context) => {
      for (const procurementCase of context.ownState.public.cases.filter((item) => ["active", "blocked"].includes(item.status) && item.deadlineDay < context.kernel.simulationDay)) {
        procurementCase.status = "expired"; for (const gate of context.ownState.public.gates.filter((item) => item.caseId === procurementCase.id && !["completed", "waived"].includes(item.status))) gate.status = "expired";
        context.emit({ type: "procurement-processes.expired", visibility: "public", sourceId: procurementCase.id, payload: { caseId: procurementCase.id, opportunityId: procurementCase.opportunityId, organizationId: procurementCase.organizationId }, causality: { exposureIds: [`lost-procurement:${procurementCase.id}`], obligationIds: [`procurement:${procurementCase.id}`] } });
      }
      refresh(context);
    } },
    invariants: [{ id: "procurement-graph-and-gate-identities", check: ({ ownState }) => {
      const caseIds = ownState.public.cases.map((item) => item.id); const gateIds = ownState.public.gates.map((item) => item.id);
      if (new Set(caseIds).size !== caseIds.length) throw new Error("DUPLICATE_PROCUREMENT_CASE"); if (new Set(gateIds).size !== gateIds.length) throw new Error("DUPLICATE_PROCUREMENT_GATE");
      for (const procurementCase of ownState.public.cases) for (const gateId of procurementCase.gateIds) if (!ownState.public.gates.some((gate) => gate.id === gateId && gate.caseId === procurementCase.id)) throw new Error("PROCUREMENT_CASE_GATE_MISSING");
      for (const gate of ownState.public.gates) for (const dependencyId of gate.prerequisiteIds) if (!ownState.public.gates.some((candidate) => candidate.id === dependencyId && candidate.caseId === gate.caseId)) throw new Error("PROCUREMENT_GATE_DEPENDENCY_MISSING");
      const visit = (gateId: string, visiting: Set<string>, visited: Set<string>): void => { if (visiting.has(gateId)) throw new Error("PROCUREMENT_GATE_CYCLE"); if (visited.has(gateId)) return; visiting.add(gateId); const gate = ownState.public.gates.find((item) => item.id === gateId)!; for (const dependency of gate.prerequisiteIds) visit(dependency, visiting, visited); visiting.delete(gateId); visited.add(gateId); };
      const visited = new Set<string>(); for (const gateId of gateIds) visit(gateId, new Set(), visited);
    } }],
    projectionPolicy: { schema: procurementProcessesPublicStateSchemaV10_3, project: ({ publicState }) => structuredClone(publicState), denyKeys: ["gateTruth", "threshold", "reviewQuantile", "waiverTolerance"] },
    snapshotPolicy: { mode: "every_material_command", maximumCommandsBetweenSnapshots: 15 }, retentionPolicy: { maximumHeadBytes: 2_500_000, maximumMaterialRecords: 4_000, archiveClosedRecords: true },
  };
}
