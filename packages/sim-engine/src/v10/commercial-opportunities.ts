import { z } from "zod";
import type { FeatureRuntimeContextV10, SimulationFeatureV10 } from "./contracts";

const evidenceSchema = z.object({
  id: z.string(), opportunityId: z.string(), actorId: z.string(),
  method: z.enum(["interview", "workflow_observation", "technical_workshop"]),
  independenceCluster: z.string(), observedDay: z.number().int().nonnegative(),
  signal: z.string(), confidence: z.enum(["low", "medium", "high"]),
}).strict();

const opportunitySchema = z.object({
  id: z.string(), organizationId: z.string(), name: z.string(),
  purchaseClass: z.enum(["self_serve", "owner_led", "departmental", "formal_midmarket", "enterprise", "regulated"]),
  status: z.enum(["lead", "discovery", "qualified", "business_case", "procurement", "negotiation", "won", "lost", "deferred"]),
  sponsorActorIds: z.array(z.string()).max(8), problemClaims: z.array(z.string()).max(20),
  evidenceIds: z.array(z.string()).max(40),
  budgetWindow: z.object({ earliestDay: z.number().int().nonnegative(), latestDay: z.number().int().nonnegative() }).strict(),
  valueRange: z.object({ lower: z.number().finite().nonnegative(), upper: z.number().finite().nonnegative(), confidence: z.enum(["low", "medium", "high"]) }).strict(),
  relationshipSignal: z.enum(["unknown", "forming", "credible", "strained"]),
  nextKnownDeadline: z.number().int().nonnegative().nullable(), procurementCaseId: z.string().nullable(), agreementId: z.string().nullable(),
  businessCase: z.object({ annualValue: z.number().finite().positive(), implementationDays: z.number().int().positive(), evidenceIds: z.array(z.string()).min(1).max(20) }).strict().nullable(),
  latestProposal: z.object({ monthlyPrice: z.number().finite().positive(), implementationFee: z.number().finite().nonnegative(), termMonths: z.number().int().positive(), purchasePath: z.enum(["paid_pilot", "subscription", "annual_prepaid"]), submittedDay: z.number().int().nonnegative() }).strict().nullable(),
  pendingActivityDay: z.number().int().nonnegative().nullable(),
}).strict();
export type CommercialOpportunityV10_3 = z.infer<typeof opportunitySchema>;

export const commercialOpportunitiesPublicStateSchemaV10_3 = z.object({
  opportunities: z.array(opportunitySchema).max(120), evidence: z.array(evidenceSchema).max(1_000),
  pipelineSignal: z.enum(["thin", "forming", "active", "concentrated"]),
  committedSalesHours: z.number().finite().nonnegative(),
}).strict();
export type CommercialOpportunitiesPublicStateV10_3 = z.infer<typeof commercialOpportunitiesPublicStateSchemaV10_3>;

const privateSchema = z.object({
  opportunityTruth: z.record(z.string(), z.object({
    urgency: z.number().min(0).max(1), willingnessToPay: z.number().finite().positive(),
    solutionFit: z.number().min(0).max(1), decisionQuantile: z.number().min(0).max(1),
    fatigue: z.number().min(0).max(1), contactCounts: z.record(z.string(), z.number().int().nonnegative()),
  }).strict()), nextEvidenceSequence: z.number().int().positive(), processedProposalIds: z.array(z.string()).max(500),
}).strict();
type PrivateState = z.infer<typeof privateSchema>;
const configSchema = z.object({ profile: z.enum(["ai_workflow", "local_services", "healthcare"]) }).default({ profile: "ai_workflow" });
type Context = FeatureRuntimeContextV10<CommercialOpportunitiesPublicStateV10_3, PrivateState>;

function initialOpportunities(profile: z.infer<typeof configSchema>["profile"]): CommercialOpportunityV10_3[] {
  const values = profile === "healthcare"
    ? [["opp-northstar", "org-northstar-health", "Referral workflow design partnership", "regulated", ["actor-northstar-ops"], 18_000, 72_000, 180], ["opp-harbor", "org-harbor-clinics", "Authorization operations platform", "enterprise", ["actor-harbor-revenue"], 12_000, 54_000, 150]]
    : profile === "local_services"
      ? [["opp-riverbend", "org-riverbend", "Seasonal dispatch control", "owner_led", ["actor-riverbend-ops"], 2_000, 12_000, 75], ["opp-summit", "org-summit-trades", "Franchise operations standardization", "formal_midmarket", ["actor-summit-digital"], 8_000, 32_000, 120]]
      : [["opp-lattice", "org-lattice-ops", "Backoffice automation program", "formal_midmarket", ["actor-lattice-ops"], 10_000, 42_000, 120], ["opp-cedar", "org-cedar-logistics", "Enterprise workflow modernization", "enterprise", ["actor-cedar-transform"], 18_000, 84_000, 180]];
  return values.map(([id, organizationId, name, purchaseClass, sponsorActorIds, lower, upper, deadline]) => ({
    id: id as string, organizationId: organizationId as string, name: name as string,
    purchaseClass: purchaseClass as CommercialOpportunityV10_3["purchaseClass"], status: "lead", sponsorActorIds: sponsorActorIds as string[],
    problemClaims: [], evidenceIds: [], budgetWindow: { earliestDay: 15, latestDay: deadline as number },
    valueRange: { lower: lower as number, upper: upper as number, confidence: "low" }, relationshipSignal: "unknown",
    nextKnownDeadline: deadline as number, procurementCaseId: null, agreementId: null, businessCase: null, latestProposal: null, pendingActivityDay: null,
  }));
}

function findOpportunity(context: Context, id: string): CommercialOpportunityV10_3 {
  const value = context.ownState.public.opportunities.find((item) => item.id === id);
  if (!value) throw new Error("COMMERCIAL_OPPORTUNITY_NOT_FOUND");
  return value;
}

function refresh(context: Context): void {
  const live = context.ownState.public.opportunities.filter((item) => !["won", "lost"].includes(item.status));
  const organizations = new Set(live.map((item) => item.organizationId)).size;
  context.ownState.public.pipelineSignal = live.length < 2 ? "thin" : organizations < live.length / 2 ? "concentrated" : live.some((item) => ["procurement", "negotiation"].includes(item.status)) ? "active" : "forming";
}

export function createCommercialOpportunitiesFeatureV10_3(): SimulationFeatureV10<CommercialOpportunitiesPublicStateV10_3, PrivateState, z.infer<typeof configSchema>> {
  return {
    id: "commercial-opportunities", version: "1.0.0", dependencies: [{ id: "customer-organizations", versionRange: "^1.0.0" }], compatibleEngineRange: ">=10.3.0 <11.0.0",
    configSchema, publicStateSchema: commercialOpportunitiesPublicStateSchemaV10_3, privateStateSchema: privateSchema,
    initialize: ({ config, rng }) => {
      const opportunities = initialOpportunities(config.profile);
      return { public: { opportunities, evidence: [], pipelineSignal: "forming", committedSalesHours: 0 }, private: {
        opportunityTruth: Object.fromEntries(opportunities.map((item) => [item.id, { urgency: Math.max(0.1, Math.min(0.95, 0.58 + rng.normal(0, 0.16))), willingnessToPay: item.valueRange.upper / 12 * Math.max(0.55, 0.82 + rng.normal(0, 0.12)), solutionFit: Math.max(0.1, Math.min(0.95, 0.55 + rng.normal(0, 0.15))), decisionQuantile: rng.nextFloat(), fatigue: 0, contactCounts: {} }])),
        nextEvidenceSequence: 1, processedProposalIds: [],
      } };
    },
    commands: {
      "sales.discovery.record": (context) => {
        if (context.command.type !== "sales.discovery.record") return;
        const payload = context.command.payload;
        const opportunity = findOpportunity(context, payload.opportunityId);
        if (["won", "lost", "procurement", "negotiation"].includes(opportunity.status)) throw new Error("DISCOVERY_NOT_AVAILABLE");
        if (opportunity.pendingActivityDay !== null) throw new Error("SALES_ACTIVITY_ALREADY_PENDING");
        const actors = context.query("customer-organizations.actors", { organizationId: opportunity.organizationId }) as Array<{ id: string }>;
        if (!actors.some((actor) => actor.id === payload.actorId)) throw new Error("CUSTOMER_ACTOR_NOT_IN_ORGANIZATION");
        const duration = payload.method === "workflow_observation" ? 5 : payload.method === "technical_workshop" ? 4 : 2;
        opportunity.status = "discovery"; opportunity.pendingActivityDay = context.kernel.simulationDay + duration;
        context.ownState.public.committedSalesHours += payload.method === "interview" ? 4 : 9;
        context.schedule({ type: "commercial-opportunities.discovery_complete", dueDay: opportunity.pendingActivityDay, sourceId: opportunity.id, payload: structuredClone(payload), sampledOutcome: { signalNoise: context.rng.normal(0, 0.12) } });
        context.emit({ type: "commercial-opportunities.discovery_scheduled", visibility: "public", sourceId: opportunity.id, payload: { opportunityId: opportunity.id, actorId: payload.actorId, method: payload.method, dueDay: opportunity.pendingActivityDay } });
      },
      "sales.business_case.prepare": (context) => {
        if (context.command.type !== "sales.business_case.prepare") return;
        const opportunity = findOpportunity(context, context.command.payload.opportunityId);
        const evidence = context.command.payload.evidenceIds.map((id) => context.ownState.public.evidence.find((item) => item.id === id));
        if (evidence.some((item) => !item || item.opportunityId !== opportunity.id)) throw new Error("BUSINESS_CASE_EVIDENCE_INVALID");
        const clusters = new Set(evidence.map((item) => item!.independenceCluster));
        if (clusters.size < 2 && !evidence.some((item) => item?.method === "workflow_observation")) throw new Error("BUSINESS_CASE_EVIDENCE_TOO_CORRELATED");
        opportunity.businessCase = { annualValue: context.command.payload.annualValue, implementationDays: context.command.payload.implementationDays, evidenceIds: [...context.command.payload.evidenceIds] }; opportunity.status = "business_case";
        opportunity.valueRange = { lower: context.command.payload.annualValue * 0.65, upper: context.command.payload.annualValue * 1.2, confidence: clusters.size >= 3 ? "high" : "medium" };
        context.emit({ type: "commercial-opportunities.business_case_prepared", visibility: "public", sourceId: opportunity.id, payload: { opportunityId: opportunity.id, annualValueRange: opportunity.valueRange, implementationDays: context.command.payload.implementationDays } });
      },
      "sales.proposal.submit": (context) => {
        if (context.command.type !== "sales.proposal.submit") return;
        const opportunity = findOpportunity(context, context.command.payload.opportunityId);
        if (!opportunity.businessCase) throw new Error("BUSINESS_CASE_REQUIRED");
        if (opportunity.latestProposal && context.kernel.simulationDay === opportunity.latestProposal.submittedDay) throw new Error("DUPLICATE_PROPOSAL_DAY");
        opportunity.latestProposal = {
          monthlyPrice: context.command.payload.monthlyPrice,
          implementationFee: context.command.payload.implementationFee,
          termMonths: context.command.payload.termMonths,
          purchasePath: context.command.payload.purchasePath,
          submittedDay: context.kernel.simulationDay,
        };
        opportunity.status = "procurement"; opportunity.relationshipSignal = "credible";
        const proposalId = `proposal:${opportunity.id}:${context.kernel.commandSequence + 1}`;
        context.ownState.private.processedProposalIds.push(proposalId);
        context.emit({ type: "commercial-opportunities.proposal_submitted", visibility: "public", sourceId: proposalId, payload: { proposalId, organizationId: opportunity.organizationId, opportunityId: opportunity.id, purchaseClass: opportunity.purchaseClass, businessCase: opportunity.businessCase, proposal: opportunity.latestProposal } });
        refresh(context);
        return { checkpointRequired: true };
      },
    },
    effects: { "commercial-opportunities.discovery_complete": (context) => {
      const payload = context.effect.payload as { opportunityId: string; actorId: string; method: "interview" | "workflow_observation" | "technical_workshop"; problemSignal: string };
      const opportunity = findOpportunity(context, payload.opportunityId); const truth = context.ownState.private.opportunityTruth[opportunity.id];
      const prior = truth.contactCounts[payload.actorId] ?? 0; truth.contactCounts[payload.actorId] = prior + 1;
      truth.fatigue = Math.min(1, truth.fatigue + (prior > 0 ? 0.08 : 0.02));
      const sampled = context.effect.sampledOutcome as { signalNoise: number };
      const quality = truth.solutionFit + truth.urgency * 0.2 + sampled.signalNoise - prior * 0.12;
      const id = `sales-evidence-${context.ownState.private.nextEvidenceSequence++}`;
      context.ownState.public.evidence.push({ id, opportunityId: opportunity.id, actorId: payload.actorId, method: payload.method, independenceCluster: payload.actorId, observedDay: context.kernel.simulationDay, signal: payload.problemSignal, confidence: quality > 0.75 ? "high" : quality > 0.48 ? "medium" : "low" });
      opportunity.evidenceIds.push(id); opportunity.problemClaims.push(payload.problemSignal); opportunity.pendingActivityDay = null;
      const clusters = new Set(context.ownState.public.evidence.filter((item) => item.opportunityId === opportunity.id).map((item) => item.independenceCluster));
      opportunity.status = clusters.size >= 2 || payload.method === "workflow_observation" ? "qualified" : "discovery";
      opportunity.relationshipSignal = truth.fatigue > 0.45 ? "strained" : opportunity.evidenceIds.length > 1 ? "credible" : "forming";
      context.emit({ type: "commercial-opportunities.discovery_completed", visibility: "public", sourceId: id, payload: { evidenceId: id, opportunityId: opportunity.id, actorId: payload.actorId, method: payload.method, confidence: context.ownState.public.evidence.at(-1)!.confidence } });
      refresh(context);
    } },
    queries: [
      { id: "commercial-opportunities.opportunity", resolve: ({ ownState }, input) => structuredClone(ownState.public.opportunities.find((item) => item.id === (input as { opportunityId?: string } | undefined)?.opportunityId) ?? null) },
      { id: "commercial-opportunities.proposal", resolve: ({ ownState }, input) => {
        const item = ownState.public.opportunities.find((candidate) => candidate.id === (input as { opportunityId?: string } | undefined)?.opportunityId);
        return item?.latestProposal ? structuredClone({ opportunityId: item.id, organizationId: item.organizationId, purchaseClass: item.purchaseClass, businessCase: item.businessCase, proposal: item.latestProposal }) : null;
      } },
    ],
    eventSubscriptions: [
      { id: "opportunity-procurement-case-opened", eventType: "procurement-processes.case_opened", handle: (context, event) => { const payload = event.payload as { caseId: string; opportunityId: string }; const item = context.ownState.public.opportunities.find((candidate) => candidate.id === payload.opportunityId); if (item) item.procurementCaseId = payload.caseId; } },
      { id: "opportunity-procurement-approved", eventType: "procurement-processes.approved", handle: (context, event) => { const payload = event.payload as { opportunityId: string }; const item = context.ownState.public.opportunities.find((candidate) => candidate.id === payload.opportunityId); if (item) item.status = "negotiation"; refresh(context); } },
      { id: "opportunity-agreement-created", eventType: "contract-lifecycle.draft_created", handle: (context, event) => { const payload = event.payload as { opportunityId: string; agreementId: string }; const item = context.ownState.public.opportunities.find((candidate) => candidate.id === payload.opportunityId); if (item) item.agreementId = payload.agreementId; } },
      { id: "opportunity-agreement-activated", eventType: "contract-lifecycle.agreement_activated", handle: (context, event) => { const payload = event.payload as { opportunityId: string }; const item = context.ownState.public.opportunities.find((candidate) => candidate.id === payload.opportunityId); if (item) item.status = "won"; refresh(context); } },
      { id: "opportunity-negotiation-abandoned", eventType: "contract-lifecycle.negotiation_abandoned", handle: (context, event) => { const payload = event.payload as { opportunityId: string }; const item = context.ownState.public.opportunities.find((candidate) => candidate.id === payload.opportunityId); if (item) item.status = "lost"; refresh(context); } },
    ],
    hooks: { after_commercial_close: (context) => { context.ownState.public.committedSalesHours = Math.max(0, context.ownState.public.committedSalesHours * 0.35); context.ownState.public.evidence = context.ownState.public.evidence.slice(-1_000); refresh(context); } },
    invariants: [{ id: "commercial-opportunity-evidence-and-stage", check: ({ ownState }) => {
      const ids = ownState.public.opportunities.map((item) => item.id); const evidenceIds = ownState.public.evidence.map((item) => item.id);
      if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_COMMERCIAL_OPPORTUNITY");
      if (new Set(evidenceIds).size !== evidenceIds.length) throw new Error("DUPLICATE_SALES_EVIDENCE");
      for (const evidence of ownState.public.evidence) if (!ids.includes(evidence.opportunityId)) throw new Error("SALES_EVIDENCE_OPPORTUNITY_MISSING");
    } }],
    projectionPolicy: { schema: commercialOpportunitiesPublicStateSchemaV10_3, project: ({ publicState }) => structuredClone(publicState), denyKeys: ["opportunityTruth", "willingnessToPay", "decisionQuantile", "fatigue"] },
    snapshotPolicy: { mode: "every_material_command", maximumCommandsBetweenSnapshots: 20 }, retentionPolicy: { maximumHeadBytes: 2_000_000, maximumMaterialRecords: 3_000, archiveClosedRecords: true },
  };
}
