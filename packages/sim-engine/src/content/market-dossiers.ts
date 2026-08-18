import { stateChecksum } from "../checksum";
import type { CompetitorProfile, MarketDossierVersion, MarketFact, MarketSource } from "../types";

const capturedAt = "2026-08-18T00:00:00.000Z";

type Seed = { profiles: CompetitorProfile[]; sources: MarketSource[]; facts: MarketFact[] };

const source = (id: string, title: string, publisher: string, url: string): MarketSource => ({
  id, title, publisher, url, retrievedAt: capturedAt, primary: true,
});

const fact = (id: string, subjectId: string, kind: MarketFact["kind"], statement: string, sourceId: string, value?: string | number, unit?: string): MarketFact => ({
  id, subjectId, kind, statement, value, unit, observedAt: capturedAt, confidence: 92, sourceIds: [sourceId], status: "verified",
});

const seeds: Record<string, Seed> = {
  "ai-workflow-automation": {
    profiles: [
      { id: "zapier", publicName: "Zapier", website: "https://zapier.com", category: "direct", positioning: "Broad task-based business automation", priceAnchor: null, targetSegments: ["smb_ops", "agencies"], channels: ["self_serve", "partners"], capabilitySignals: ["integrations", "AI automation", "chatbots"] },
      { id: "make", publicName: "Make", website: "https://www.make.com", category: "direct", positioning: "Visual-first workflow automation", priceAnchor: 12, targetSegments: ["technical_smb", "agencies"], channels: ["self_serve", "community"], capabilitySignals: ["visual builder", "routers", "AI agents"] },
      { id: "power-automate", publicName: "Microsoft Power Automate", website: "https://www.microsoft.com/power-platform/products/power-automate", category: "platform", positioning: "Enterprise automation within Microsoft Power Platform", priceAnchor: null, targetSegments: ["enterprise", "microsoft_installed_base"], channels: ["enterprise_sales", "partners"], capabilitySignals: ["cloud flows", "RPA", "connectors"] },
      { id: "n8n", publicName: "n8n", website: "https://n8n.io", category: "direct", positioning: "Technical workflow automation with cloud and self-hosted deployment", priceAnchor: null, targetSegments: ["technical_smb", "developers"], channels: ["community", "self_serve"], capabilitySignals: ["workflow executions", "self hosting", "AI workflow builder"] },
    ],
    sources: [
      source("zapier-pricing", "Plans & Pricing", "Zapier", "https://zapier.com/pricing"),
      source("make-pricing", "Plans that grow with you", "Make", "https://www.make.com/en/pricing"),
      source("power-automate-pricing", "Power Automate pricing", "Microsoft", "https://www.microsoft.com/en-us/power-platform/products/power-automate/pricing"),
      source("n8n-pricing", "n8n plans and pricing", "n8n", "https://n8n.io/pricing/"),
    ],
    facts: [
      fact("zapier-task-pricing", "zapier", "pricing", "Zapier publicly describes its automation platform using task-based pricing.", "zapier-pricing", "task based", "billing model"),
      fact("make-core-price", "make", "pricing", "Make lists Core at $12 per month for 10,000 monthly credits on the captured pricing page.", "make-pricing", 12, "USD/month"),
      fact("power-automate-enterprise", "power-automate", "positioning", "Power Automate positions its offering around enterprise process automation and RPA.", "power-automate-pricing"),
      fact("n8n-execution-pricing", "n8n", "pricing", "n8n states that cloud pricing is based on monthly workflow executions.", "n8n-pricing", "workflow executions", "billing model"),
    ],
  },
  "local-services-saas": {
    profiles: [
      { id: "jobber", publicName: "Jobber", website: "https://www.getjobber.com", category: "direct", positioning: "Field service operations for small service businesses", priceAnchor: 29, targetSegments: ["solo_operator", "small_team"], channels: ["self_serve", "inside_sales"], capabilitySignals: ["scheduling", "quotes", "invoicing", "CRM"] },
      { id: "housecall-pro", publicName: "Housecall Pro", website: "https://www.housecallpro.com", category: "direct", positioning: "All-in-one field service management", priceAnchor: 59, targetSegments: ["solo_operator", "growing_team"], channels: ["trial", "inside_sales"], capabilitySignals: ["booking", "dispatch", "payments", "reviews"] },
      { id: "servicetitan", publicName: "ServiceTitan", website: "https://www.servicetitan.com", category: "platform", positioning: "Operational platform for larger trades businesses", priceAnchor: null, targetSegments: ["multi_crew", "enterprise_trades"], channels: ["enterprise_sales"], capabilitySignals: ["dispatch", "estimates", "payments", "analytics"] },
      { id: "square-appointments", publicName: "Square Appointments", website: "https://squareup.com", category: "substitute", positioning: "Scheduling bundled with payments and commerce", priceAnchor: 49, targetSegments: ["solo_operator", "appointment_business"], channels: ["self_serve", "installed_base"], capabilitySignals: ["booking", "payments", "reminders", "deposits"] },
    ],
    sources: [
      source("jobber-pricing", "Jobber pricing", "Jobber", "https://www.getjobber.com/pricing/"),
      source("housecall-pricing", "Housecall Pro pricing", "Housecall Pro", "https://www.housecallpro.com/pricing/"),
      source("servicetitan-fsm", "Field service management software", "ServiceTitan", "https://www.servicetitan.com/market/field-service-management-software"),
      source("square-appointments-pricing", "Appointments pricing", "Square", "https://squareup.com/us/en/appointments/pricing"),
    ],
    facts: [
      fact("jobber-entry-price", "jobber", "pricing", "Jobber's captured pricing page advertises plans starting at $29 per month.", "jobber-pricing", 29, "USD/month"),
      fact("housecall-entry-price", "housecall-pro", "pricing", "Housecall Pro lists its Basic annual-billing entry plan at $59 per month.", "housecall-pricing", 59, "USD/month"),
      fact("servicetitan-operations", "servicetitan", "capability", "ServiceTitan describes scheduling, dispatch, estimates, invoices and payment processing in one platform.", "servicetitan-fsm"),
      fact("square-location-price", "square-appointments", "pricing", "Square lists its Plus plan at $49 per active location per month on the captured US page.", "square-appointments-pricing", 49, "USD/location/month"),
    ],
  },
  "healthcare-operations": {
    profiles: [
      { id: "epic", publicName: "Epic", website: "https://www.epic.com", category: "platform", positioning: "Integrated health record and interoperability platform", priceAnchor: null, targetSegments: ["health_system", "hospital"], channels: ["enterprise_sales", "community_connect"], capabilitySignals: ["EHR", "FHIR", "care coordination"] },
      { id: "oracle-health", publicName: "Oracle Health", website: "https://www.oracle.com/health", category: "platform", positioning: "Enterprise clinical operations and EHR", priceAnchor: null, targetSegments: ["health_system", "hospital"], channels: ["enterprise_sales"], capabilitySignals: ["patient flow", "workload management", "EHR"] },
      { id: "athenahealth", publicName: "athenahealth", website: "https://www.athenahealth.com", category: "direct", positioning: "Integrated ambulatory EHR, billing and practice management", priceAnchor: null, targetSegments: ["ambulatory", "medical_practice"], channels: ["sales", "platform_partners"], capabilitySignals: ["EHR", "billing", "patient engagement"] },
      { id: "nexhealth", publicName: "NexHealth", website: "https://www.nexhealth.com", category: "direct", positioning: "Patient experience layer synchronized with health record systems", priceAnchor: null, targetSegments: ["dental_group", "medical_practice"], channels: ["sales", "developer_api"], capabilitySignals: ["scheduling", "forms", "payments", "EHR sync"] },
    ],
    sources: [
      source("epic-interoperability", "Interoperability", "Epic", "https://www.epic.com/software/interoperability/"),
      source("oracle-clinical-operations", "Clinical operations", "Oracle Health", "https://www.oracle.com/health/clinical-operations/"),
      source("athenaone", "athenaOne", "athenahealth", "https://www.athenahealth.com/solutions/athenaone"),
      source("nexhealth-pricing", "NexHealth pricing and capabilities", "NexHealth", "https://www.nexhealth.com/pricing"),
    ],
    facts: [
      fact("epic-api-specs", "epic", "capability", "Epic states that more than 1,000 API and interface specifications are publicly available for integrations.", "epic-interoperability", 1000, "API/interface specifications"),
      fact("oracle-operations", "oracle-health", "capability", "Oracle Health describes near-real-time patient flow, resource tracking and workload-management capabilities.", "oracle-clinical-operations"),
      fact("athena-collections", "athenahealth", "pricing", "athenahealth describes athenaOne pricing as aligned to a percentage-of-collections model.", "athenaone", "percentage of collections", "billing model"),
      fact("nexhealth-sync", "nexhealth", "capability", "NexHealth describes a synchronizer that reads and writes data to health record systems.", "nexhealth-pricing"),
    ],
  },
};

export function marketSeedForScenario(scenarioId: string): { profiles: CompetitorProfile[]; dossier: MarketDossierVersion } {
  const seed = seeds[scenarioId] ?? { profiles: [], sources: [], facts: [] };
  const content = { scenarioId, capturedAt, sources: seed.sources, facts: seed.facts };
  return { profiles: structuredClone(seed.profiles), dossier: { id: `${scenarioId}@market-2026-08-18`, ...structuredClone(content), contentHash: stateChecksum(content) } };
}
