import { ENGINE_VERSION, applyCommand, applySystemCommand, buildAgentDecisionEnvelope, createInitialState, type SimulationCommand, type SimulationState } from "@sim/engine";
import { publicScenarios, scenarioVersionId } from "@/content/scenarios";

type Policy = "research_led" | "product_led" | "sales_led";
type Difficulty = "guided" | "realistic" | "brutal";
const policies: Policy[] = ["research_led", "product_led", "sales_led"];
const difficulties: Difficulty[] = ["guided", "realistic", "brutal"];
const requested = process.argv.find((item) => item.startsWith("--runs="));
const runsPerCell = Math.max(1, Number(requested?.split("=")[1] ?? 10_000));

function next(state: SimulationState, type: SimulationCommand["type"], payload: unknown, serial: number) {
  try {
    return applyCommand(state, { commandId: `calibration-${state.seed}-${serial}`, type, payload } as SimulationCommand, {
      seed: state.seed, now: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.min(59, serial))).toISOString(),
      engineVersion: state.engineVersion, scenarioVersion: state.scenarioVersion,
    }).state;
  } catch {
    return state;
  }
}

function salesMove(state: SimulationState, serial: number) {
  const negotiation = state.market.accounts.find((account) => account.stage === "negotiation");
  if (negotiation) return next(state, "contract.negotiate", { accountId: negotiation.id, price: state.market.defaultPrice, contractMonths: 3, discountForPrepay: false }, serial);
  const account = state.market.accounts.find((item) => !["customer", "lost", "churned"].includes(item.stage) && !state.scheduledEffects.some((effect) => effect.type === "account_followup" && effect.sourceId === item.id));
  if (account) return next(state, "account.manage", { operation: "advance", accountId: account.id }, serial);
  return next(state, "account.manage", { operation: "source", segmentId: state.market.segments[serial % state.market.segments.length].id }, serial);
}

function resolveCompetitor(state: SimulationState, serial: number) {
  const envelope = buildAgentDecisionEnvelope(state); const selectedActionId = envelope.allowedActionIds[(state.seed + serial) % envelope.allowedActionIds.length];
  return applySystemCommand(state, { commandId: `calibration-agent-${state.seed}-${serial}`, type: "system.agent_decision.apply", payload: { externalInputId: `calibration-input-${state.seed}-${serial}`, turnId: envelope.turnId, decision: { selectedActionId, publicRationale: "SIMULATED deterministic calibration policy.", citedSourceIds: envelope.observedFacts.flatMap((fact) => fact.sourceIds).slice(0, 1) }, provider: "authored", inputHash: envelope.worldInputHash } }, {
    seed: state.seed, now: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.min(59, serial))).toISOString(), engineVersion: state.engineVersion, scenarioVersion: state.scenarioVersion,
  }).state;
}

function simulate(scenarioIndex: number, difficulty: Difficulty, seed: number, policy: Policy) {
  const scenario = publicScenarios[scenarioIndex];
  let state = createInitialState(scenario, { companyName: "Calibration Co", founderArchetype: policy === "product_led" ? "builder" : "seller", difficulty, personalRunway: "standard" }, {
    seed, now: "2026-01-01T00:00:00.000Z", engineVersion: ENGINE_VERSION, scenarioVersion: scenarioVersionId(scenario),
  });
  let serial = 0;
  state = next(state, "planning.capacity.allocate", policy === "research_led" ? { research: 45, product: 20, sales: 25, operations: 10 } : policy === "product_led" ? { research: 15, product: 50, sales: 20, operations: 15 } : { research: 15, product: 20, sales: 50, operations: 15 }, ++serial);
  while (state.status === "active" && state.calendar.absoluteDay < state.maxDays && state.decisionPoints < 220 && serial < 2_000) {
    if (state.features?.public.competitors?.pendingTurn) { state = resolveCompetitor(state, ++serial); continue; }
    const unansweredMove = [...(state.features?.public.competitors?.moves ?? [])].reverse().find((move) => !move.playerResponse && move.status !== "expired");
    if (unansweredMove) { state = next(state, "competitor.respond", { competitorId: unansweredMove.competitorId, response: policy === "research_led" ? "differentiate" : policy === "product_led" ? "accelerate" : "niche_down" }, ++serial); continue; }
    if (state.pendingEvent) state = next(state, "event.respond", { choiceIndex: 0 }, ++serial);
    else if (state.actions.some((action) => action.status === "active")) {
      state = next(state, "operations.advance_to_decision", { maxDays: 14 }, ++serial);
      continue;
    }
    else if (state.finance.companyCash < Math.max(120, state.finance.monthlyFixedCosts * 1.6) && state.finance.personalCash > state.finance.livingCost * 1.5) state = next(state, "finance.manage", { operation: "founder_injection", amount: Math.min(250, state.finance.personalCash - state.finance.livingCost) }, ++serial);
    else if (state.finance.personalCash < state.finance.livingCost * 1.6 && state.finance.mrr > state.finance.monthlyFixedCosts && state.finance.founderDraw < state.finance.livingCost) state = next(state, "planning.update", { key: "founderDraw", value: Math.min(state.finance.livingCost, state.finance.mrr - state.finance.monthlyFixedCosts) }, ++serial);
    else if (state.evidence.budget < 45 && state.decisionPoints % 4 === 1) {
      const problem = state.problems.find((item) => item.status === "open"); const segment = state.market.segments[serial % state.market.segments.length];
      if (problem) state = next(state, "experiment.start", { problemId: problem.id, segmentId: segment.id, kind: "paid_pilot", budget: 10 }, ++serial);
    }
    else if (policy === "research_led" && state.evidence.quality < 38) {
      const problem = state.problems.find((item) => item.status === "open"); const segment = state.market.segments[serial % state.market.segments.length];
      const question = state.evidence.problem < 45 ? "severity" : state.evidence.buyerClarity < 35 ? "buyer" : "budget";
      if (problem) state = next(state, "research.run", { problemId: problem.id, segmentId: segment.id, design: { question, sample: serial % 3 ? "cold_targeted" : "existing_users", method: question === "budget" ? "proposal" : "interview", count: 8 }, intensity: "sustainable" }, ++serial);
    } else if (state.product.capabilities.filter((item) => item.status === "released").length < (policy === "product_led" ? 3 : 2)) {
      const capability = state.product.capabilities.find((item) => item.status === "backlog" && item.dependencies.every((id) => state.product.capabilities.find((item) => item.id === id)?.status === "released"));
      if (capability) state = next(state, "product.plan", { capabilityId: capability.id, approach: "prototype", intensity: "sustainable" }, ++serial);
    } else if (policy !== "research_led" && state.evidence.buyerClarity < 28) {
      const problem = state.problems.find((item) => item.status === "open"); const segment = state.market.segments[serial % state.market.segments.length];
      if (problem) state = next(state, "research.run", { problemId: problem.id, segmentId: segment.id, design: { question: "buyer", sample: "cold_targeted", method: "interview", count: 6 }, intensity: "sustainable" }, ++serial);
    } else state = salesMove(state, ++serial);
    if (state.status === "active" && !state.pendingEvent) state = next(state, "operations.advance_to_decision", { maxDays: 14 }, ++serial);
  }
  return { ending: state.endingCode ?? "active", endingReason: state.endingReason, healthy: ["pmf", "sustainable_niche"].includes(state.endingCode ?? ""), days: state.calendar.absoluteDay, customers: state.market.accounts.filter((account) => account.stage === "customer").length, mrr: state.finance.mrr, evidence: (state.evidence.problem + state.evidence.budget + state.evidence.buyerClarity) / 3, stage: state.stage };
}

const results: Array<{ scenario: string; difficulty: Difficulty; policy: Policy; healthyRate: number; averageDays: number; averageCustomers: number; averageMrr: number; averageEvidence: number; endings: Record<string, number>; endingReasons: Record<string, number> }> = [];
for (let scenarioIndex = 0; scenarioIndex < publicScenarios.length; scenarioIndex += 1) {
  for (const difficulty of difficulties) for (const policy of policies) {
    const endings: Record<string, number> = {}; const endingReasons: Record<string, number> = {}; let healthy = 0; let days = 0; let customers = 0; let mrr = 0; let evidence = 0;
    for (let run = 0; run < runsPerCell; run += 1) {
      const outcome = simulate(scenarioIndex, difficulty, scenarioIndex * 10_000_000 + run * 17 + policies.indexOf(policy) + 1, policy);
      endings[outcome.ending] = (endings[outcome.ending] ?? 0) + 1; if (outcome.endingReason) endingReasons[outcome.endingReason] = (endingReasons[outcome.endingReason] ?? 0) + 1; healthy += Number(outcome.healthy); days += outcome.days; customers += outcome.customers; mrr += outcome.mrr; evidence += outcome.evidence;
    }
    results.push({ scenario: publicScenarios[scenarioIndex].slug, difficulty, policy, healthyRate: healthy / runsPerCell, averageDays: days / runsPerCell, averageCustomers: customers / runsPerCell, averageMrr: mrr / runsPerCell, averageEvidence: evidence / runsPerCell, endings, endingReasons });
  }
}

const standard = results.filter((row) => row.difficulty === "realistic");
const dominanceWarnings = publicScenarios.flatMap((scenario) => {
  const rows = standard.filter((row) => row.scenario === scenario.slug); const best = [...rows].sort((a, b) => b.healthyRate - a.healthyRate)[0]; const total = rows.reduce((sum, row) => sum + row.healthyRate, 0);
  return best && total > 0 && best.healthyRate / total > 0.7 ? [`${scenario.slug}: ${best.policy} contributes ${Math.round(best.healthyRate / total * 100)}% of healthy policy outcomes`] : [];
});
console.log(JSON.stringify({ engineVersion: ENGINE_VERSION, runsPerScenarioDifficultyPolicy: runsPerCell, totalCampaigns: runsPerCell * publicScenarios.length * difficulties.length * policies.length, results, dominanceWarnings }, null, 2));
