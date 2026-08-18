import { generateMarketDossier } from "@/server/ai/market-intelligence";
import { getStore } from "@/server/store";

async function resolveCompetitorTurnStep(ownerId: string, runId: string, requestedAt: string) {
  "use step";
  return (await getStore()).resolvePendingAgentTurn(ownerId, runId, new Date(requestedAt));
}

export async function resolveCompetitorTurnWorkflow(ownerId: string, runId: string, requestedAt: string) {
  "use workflow";
  return resolveCompetitorTurnStep(ownerId, runId, requestedAt);
}

async function generateMarketDossierStep(scenarioId: string, capturedAt: string) {
  "use step";
  return generateMarketDossier(scenarioId, new Date(capturedAt));
}

async function publishMarketDossierStep(result: Awaited<ReturnType<typeof generateMarketDossier>>, capturedAt: string) {
  "use step";
  const published = await (await getStore()).publishMarketDossier(result.dossier, { provider: "openai", model: result.model, promptVersion: result.promptVersion }, new Date(capturedAt));
  return { scenarioId: result.dossier.scenarioId, dossierId: result.dossier.id, facts: result.dossier.facts.length, updatedRuns: published.updatedRuns, latencyMs: result.latencyMs };
}

export async function refreshMarketDossierWorkflow(scenarioId: string, capturedAt: string) {
  "use workflow";
  const result = await generateMarketDossierStep(scenarioId, capturedAt);
  return publishMarketDossierStep(result, capturedAt);
}
