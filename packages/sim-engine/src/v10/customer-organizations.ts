import { z } from "zod";
import type { SimulationFeatureV10 } from "./contracts";

const actorRoleSchema = z.enum([
  "end_user", "champion", "economic_buyer", "budget_owner", "procurement", "finance",
  "legal", "security", "privacy", "integration_owner", "executive_sponsor", "blocker",
]);

const customerActorSchema = z.object({
  id: z.string(), organizationId: z.string(), name: z.string(), title: z.string(),
  roles: z.array(actorRoleSchema).min(1).max(4),
  authority: z.enum(["informal", "recommend", "approve_budget", "approve_risk", "sign"]),
  stanceSignal: z.enum(["supportive", "open", "uncertain", "resistant"]),
  availabilitySignal: z.enum(["available", "limited", "blocked"]),
  lastObservedDay: z.number().int().nonnegative(),
}).strict();
export type CustomerActorV10_3 = z.infer<typeof customerActorSchema>;

const organizationSchema = z.object({
  id: z.string(), name: z.string(), segment: z.string(),
  purchaseClass: z.enum(["self_serve", "owner_led", "departmental", "formal_midmarket", "enterprise", "regulated"]),
  jurisdiction: z.enum(["us_like", "eu_like", "sea_like"]),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  budgetSignal: z.enum(["available", "watch", "constrained", "frozen"]),
  vendorPolicySignal: z.enum(["lightweight", "documented", "formal", "regulated"]),
  relationshipSignal: z.enum(["new", "known", "trusted", "strained"]),
  actorIds: z.array(z.string()).min(2).max(16), knownPriorities: z.array(z.string()).max(12),
}).strict();
export type CustomerOrganizationV10_3 = z.infer<typeof organizationSchema>;

export const customerOrganizationsPublicStateSchemaV10_3 = z.object({
  organizations: z.array(organizationSchema).max(80), actors: z.array(customerActorSchema).max(600),
  portfolioSignal: z.enum(["thin", "forming", "covered"]),
}).strict();
export type CustomerOrganizationsPublicStateV10_3 = z.infer<typeof customerOrganizationsPublicStateSchemaV10_3>;

const privateSchema = z.object({
  actorTruth: z.record(z.string(), z.object({
    influence: z.number().min(0).max(1), riskTolerance: z.number().min(0).max(1),
    vendorPreference: z.number().min(0).max(1), responsiveness: z.number().min(0).max(1),
    politicalCapital: z.number().min(0).max(1), memoryPressure: z.number().min(0).max(1),
  }).strict()),
  organizationTruth: z.record(z.string(), z.object({
    budgetFlexibility: z.number().min(0).max(1), approvalFriction: z.number().min(0).max(1),
    changeResistance: z.number().min(0).max(1), budgetQuantile: z.number().min(0).max(1),
  }).strict()),
}).strict();
type PrivateState = z.infer<typeof privateSchema>;
const configSchema = z.object({ profile: z.enum(["ai_workflow", "local_services", "healthcare"]) }).default({ profile: "ai_workflow" });

type Template = Omit<CustomerOrganizationV10_3, "actorIds" | "budgetSignal" | "relationshipSignal"> & {
  actors: Array<Omit<CustomerActorV10_3, "organizationId" | "lastObservedDay">>;
};

function templates(profile: z.infer<typeof configSchema>["profile"]): Template[] {
  if (profile === "local_services") return [
    {
      id: "org-riverbend", name: "Riverbend Property Care", segment: "multi_location_operator", purchaseClass: "owner_led", jurisdiction: "sea_like", fiscalYearStartMonth: 1,
      vendorPolicySignal: "lightweight", knownPriorities: ["reduce missed appointments", "control seasonal labor"],
      actors: [
        { id: "actor-riverbend-owner", name: "Mina Tran", title: "Owner", roles: ["economic_buyer", "budget_owner", "executive_sponsor"], authority: "sign", stanceSignal: "open", availabilitySignal: "limited" },
        { id: "actor-riverbend-ops", name: "Theo Martin", title: "Operations Lead", roles: ["champion", "end_user"], authority: "recommend", stanceSignal: "supportive", availabilitySignal: "available" },
      ],
    },
    {
      id: "org-summit-trades", name: "Summit Trades Network", segment: "franchise_network", purchaseClass: "formal_midmarket", jurisdiction: "us_like", fiscalYearStartMonth: 1,
      vendorPolicySignal: "formal", knownPriorities: ["standardize franchise reporting", "reduce support calls"],
      actors: [
        { id: "actor-summit-digital", name: "Noah Reed", title: "Digital Programs Director", roles: ["champion", "executive_sponsor"], authority: "recommend", stanceSignal: "open", availabilitySignal: "available" },
        { id: "actor-summit-finance", name: "Elena Park", title: "Finance Director", roles: ["budget_owner", "finance"], authority: "approve_budget", stanceSignal: "uncertain", availabilitySignal: "limited" },
        { id: "actor-summit-procurement", name: "Iris Long", title: "Procurement Manager", roles: ["procurement"], authority: "sign", stanceSignal: "uncertain", availabilitySignal: "available" },
      ],
    },
  ];
  if (profile === "healthcare") return [
    {
      id: "org-northstar-health", name: "Northstar Ambulatory Group", segment: "regional_provider", purchaseClass: "regulated", jurisdiction: "eu_like", fiscalYearStartMonth: 4,
      vendorPolicySignal: "regulated", knownPriorities: ["reduce referral leakage", "protect workflow safety"],
      actors: [
        { id: "actor-northstar-ops", name: "Dr. Leona Weiss", title: "Clinical Operations Director", roles: ["champion", "executive_sponsor"], authority: "recommend", stanceSignal: "supportive", availabilitySignal: "limited" },
        { id: "actor-northstar-privacy", name: "Marek Nowak", title: "Privacy Officer", roles: ["privacy", "legal"], authority: "approve_risk", stanceSignal: "uncertain", availabilitySignal: "available" },
        { id: "actor-northstar-cfo", name: "Ari Cohen", title: "Chief Financial Officer", roles: ["budget_owner", "economic_buyer"], authority: "sign", stanceSignal: "open", availabilitySignal: "limited" },
      ],
    },
    {
      id: "org-harbor-clinics", name: "Harbor Specialty Clinics", segment: "specialty_network", purchaseClass: "enterprise", jurisdiction: "us_like", fiscalYearStartMonth: 1,
      vendorPolicySignal: "regulated", knownPriorities: ["improve authorization throughput", "pass vendor risk review"],
      actors: [
        { id: "actor-harbor-revenue", name: "Carmen Silva", title: "Revenue Cycle VP", roles: ["champion", "economic_buyer"], authority: "recommend", stanceSignal: "open", availabilitySignal: "available" },
        { id: "actor-harbor-security", name: "Dev Patel", title: "Security Director", roles: ["security", "integration_owner"], authority: "approve_risk", stanceSignal: "resistant", availabilitySignal: "limited" },
        { id: "actor-harbor-cfo", name: "Ruth Ellis", title: "CFO", roles: ["budget_owner"], authority: "sign", stanceSignal: "uncertain", availabilitySignal: "blocked" },
      ],
    },
  ];
  return [
    {
      id: "org-lattice-ops", name: "Lattice Operations", segment: "mid_market_operations", purchaseClass: "formal_midmarket", jurisdiction: "us_like", fiscalYearStartMonth: 1,
      vendorPolicySignal: "formal", knownPriorities: ["prove automation ROI", "control data access"],
      actors: [
        { id: "actor-lattice-ops", name: "Amara Brooks", title: "VP Operations", roles: ["champion", "economic_buyer"], authority: "recommend", stanceSignal: "supportive", availabilitySignal: "available" },
        { id: "actor-lattice-security", name: "Victor Chen", title: "Security Lead", roles: ["security", "integration_owner"], authority: "approve_risk", stanceSignal: "uncertain", availabilitySignal: "limited" },
        { id: "actor-lattice-cfo", name: "Sarah Bell", title: "CFO", roles: ["budget_owner"], authority: "sign", stanceSignal: "open", availabilitySignal: "limited" },
      ],
    },
    {
      id: "org-cedar-logistics", name: "Cedar Logistics Group", segment: "enterprise_backoffice", purchaseClass: "enterprise", jurisdiction: "eu_like", fiscalYearStartMonth: 4,
      vendorPolicySignal: "regulated", knownPriorities: ["integrate legacy systems", "limit implementation risk"],
      actors: [
        { id: "actor-cedar-transform", name: "Owen Meyer", title: "Transformation Director", roles: ["champion", "executive_sponsor"], authority: "recommend", stanceSignal: "open", availabilitySignal: "available" },
        { id: "actor-cedar-procurement", name: "Priya Nair", title: "Strategic Procurement", roles: ["procurement", "finance"], authority: "approve_budget", stanceSignal: "uncertain", availabilitySignal: "available" },
        { id: "actor-cedar-legal", name: "Eva Laurent", title: "Commercial Counsel", roles: ["legal", "privacy"], authority: "sign", stanceSignal: "resistant", availabilitySignal: "limited" },
      ],
    },
  ];
}

export function createCustomerOrganizationsFeatureV10_3(): SimulationFeatureV10<CustomerOrganizationsPublicStateV10_3, PrivateState, z.infer<typeof configSchema>> {
  return {
    id: "customer-organizations", version: "1.0.0", dependencies: [{ id: "external-world", versionRange: "^1.0.0" }], compatibleEngineRange: ">=10.3.0 <11.0.0",
    configSchema, publicStateSchema: customerOrganizationsPublicStateSchemaV10_3, privateStateSchema: privateSchema,
    initialize: ({ config, rng }) => {
      const source = templates(config.profile);
      const organizations = source.map(({ actors, ...organization }) => ({ ...organization, actorIds: actors.map((actor) => actor.id), budgetSignal: "available" as const, relationshipSignal: "new" as const }));
      const actors = source.flatMap((organization) => organization.actors.map((actor) => ({ ...actor, organizationId: organization.id, lastObservedDay: 0 }))) as CustomerActorV10_3[];
      return {
        public: { organizations, actors, portfolioSignal: organizations.length > 2 ? "covered" : "forming" },
        private: {
          actorTruth: Object.fromEntries(actors.map((actor) => [actor.id, { influence: Math.max(0.2, Math.min(1, 0.62 + rng.normal(0, 0.14))), riskTolerance: Math.max(0.05, Math.min(0.95, 0.48 + rng.normal(0, 0.18))), vendorPreference: Math.max(0.05, Math.min(0.95, 0.5 + rng.normal(0, 0.16))), responsiveness: Math.max(0.1, Math.min(0.95, 0.65 + rng.normal(0, 0.14))), politicalCapital: Math.max(0.1, Math.min(1, 0.55 + rng.normal(0, 0.17))), memoryPressure: 0 }])),
          organizationTruth: Object.fromEntries(organizations.map((organization) => [organization.id, { budgetFlexibility: Math.max(0.1, Math.min(0.95, 0.58 + rng.normal(0, 0.16))), approvalFriction: Math.max(0.1, Math.min(0.95, (organization.purchaseClass === "regulated" ? 0.78 : organization.purchaseClass === "enterprise" ? 0.68 : 0.42) + rng.normal(0, 0.08))), changeResistance: Math.max(0.1, Math.min(0.95, 0.55 + rng.normal(0, 0.17))), budgetQuantile: rng.nextFloat() }])),
        },
      };
    },
    commands: {}, effects: {},
    queries: [
      { id: "customer-organizations.organization", resolve: ({ ownState }, input) => structuredClone(ownState.public.organizations.find((item) => item.id === (input as { organizationId?: string } | undefined)?.organizationId) ?? null) },
      { id: "customer-organizations.actors", resolve: ({ ownState }, input) => structuredClone(ownState.public.actors.filter((item) => item.organizationId === (input as { organizationId?: string } | undefined)?.organizationId)) },
      { id: "customer-organizations.signatory-authority", resolve: ({ ownState }, input) => {
        const value = input as { organizationId?: string; actorId?: string } | undefined;
        const actor = ownState.public.actors.find((item) => item.id === value?.actorId && item.organizationId === value.organizationId);
        return { authorized: actor?.authority === "sign", actor: actor ? structuredClone(actor) : null };
      } },
      { id: "customer-organizations.procurement-truth", resolve: ({ ownState }, input) => {
        const organizationId = (input as { organizationId?: string } | undefined)?.organizationId ?? "";
        return structuredClone(ownState.private.organizationTruth[organizationId] ?? null);
      } },
    ],
    hooks: { after_commercial_close: (context) => {
      const factors = context.query("external-world.domain-factors") as { customerLiquidity: number };
      for (const organization of context.ownState.public.organizations) {
        const truth = context.ownState.private.organizationTruth[organization.id];
        const strength = factors.customerLiquidity * truth.budgetFlexibility;
        organization.budgetSignal = strength < 0.3 ? "frozen" : strength < 0.52 ? "constrained" : strength < 0.78 ? "watch" : "available";
      }
    } },
    invariants: [{ id: "customer-organization-authority-and-identities", check: ({ ownState }) => {
      const organizationIds = ownState.public.organizations.map((item) => item.id); const actorIds = ownState.public.actors.map((item) => item.id);
      if (new Set(organizationIds).size !== organizationIds.length) throw new Error("DUPLICATE_CUSTOMER_ORGANIZATION");
      if (new Set(actorIds).size !== actorIds.length) throw new Error("DUPLICATE_CUSTOMER_ACTOR");
      for (const actor of ownState.public.actors) if (!organizationIds.includes(actor.organizationId)) throw new Error("CUSTOMER_ACTOR_ORGANIZATION_MISSING");
      for (const organization of ownState.public.organizations) if (!organization.actorIds.some((id) => ownState.public.actors.find((actor) => actor.id === id)?.authority === "sign")) throw new Error("CUSTOMER_SIGNATORY_MISSING");
    } }],
    projectionPolicy: { schema: customerOrganizationsPublicStateSchemaV10_3, project: ({ publicState }) => structuredClone(publicState), denyKeys: ["actorTruth", "organizationTruth", "budgetFlexibility", "approvalFriction", "budgetQuantile"] },
    snapshotPolicy: { mode: "period_close", maximumCommandsBetweenSnapshots: 30 }, retentionPolicy: { maximumHeadBytes: 1_500_000, maximumMaterialRecords: 2_000, archiveClosedRecords: true },
  };
}
