import type { EvidenceItem, HistoryEvent, ResearchDesign, SimulationAction, SimulationState } from "../types";
import { clamp, round } from "../kernel/math";
import { random } from "../rng";

const sampleAccess = { existing_users: 0.88, warm_network: 0.76, cold_targeted: 0.62, convenience: 0.38 } as const;
const methodStrength = { observation: 1.45, proposal: 1.25, interview: 1, survey: 0.55 } as const;
const evidenceKind = { observation: "observed_behavior", proposal: "paid_commitment", interview: "stated_intent", survey: "opinion" } as const;

export type EvidenceEmitter = (type: HistoryEvent["type"], category: HistoryEvent["category"], summary: string, actor?: HistoryEvent["actor"]) => void;

export function completeResearch(state: SimulationState, action: SimulationAction, quality: number, difficultyFactor: number, emit: EvidenceEmitter) {
  const design: ResearchDesign = action.researchDesign ?? { question: "severity", sample: "cold_targeted", method: "interview", count: 4 };
  const usable = Array.from({ length: design.count }).filter(() => random(state) < sampleAccess[design.sample] * quality * difficultyFactor).length;
  const segmentId = action.targetId ?? state.market.segments[0]?.id;
  const cluster = `${segmentId ?? "unknown"}:${design.sample}`;
  const key = `${design.sample}:${design.method}`;
  let summary: string;
  let direction: EvidenceItem["direction"] = "neutral";
  let gain = 0;
  if (usable === 0) {
    summary = `0/${design.count} usable units. Access was recorded, but target evidence did not increase.`;
  } else {
    const truth = segmentId ? state.hidden.segmentTruth[segmentId] : undefined;
    const signalProbability = clamp(((truth?.fit ?? 45) + (design.question === "budget" ? (truth?.actualWtp ?? 0) / 4 : 0)) / 100, 0.12, 0.9);
    direction = random(state) < signalProbability ? "positive" : "negative";
    gain = usable * quality * difficultyFactor * methodStrength[design.method] * (direction === "negative" ? 0.72 : 1);
    const targetChange = direction === "positive" ? gain : -gain * 0.45;
    if (design.question === "budget") state.evidence.budget = clamp(state.evidence.budget + targetChange);
    else if (design.question === "buyer") state.evidence.buyerClarity = clamp(state.evidence.buyerClarity + targetChange);
    else state.evidence.problem = clamp(state.evidence.problem + targetChange);
    state.evidence.quality = clamp(state.evidence.quality + gain * 0.5);
    if (!state.evidence.designHistory.includes(key)) {
      state.evidence.designHistory.push(key); state.evidence.diversity = clamp(state.evidence.diversity + 4);
    }
    const claim = state.evidence.claims.find((item) => item.id === `claim_${design.question}`);
    if (claim) {
      if (direction === "positive") claim.supportingWeight += gain; else claim.contradictingWeight += gain;
      claim.sampleDiversity = new Set(state.evidence.ledger.filter((item) => item.claimIds?.includes(claim.id)).map((item) => item.independenceCluster).concat(cluster)).size;
      claim.confidence = clamp(50 + claim.supportingWeight * 0.75 - claim.contradictingWeight * 0.95 + claim.sampleDiversity * 2);
      claim.lastUpdatedDay = state.calendar.absoluteDay;
    }
    const segment = state.market.segments.find((item) => item.id === segmentId);
    if (segment) { segment.discovered = true; segment.fitSignal = clamp(segment.fitSignal + (direction === "positive" ? gain : -gain * 0.45)); }
    summary = `${usable}/${design.count} usable ${evidenceKind[design.method]} units produced a ${direction} ${design.question} signal.`;
  }
  action.result = summary;
  state.evidence.ledger.unshift({
    id: `evidence_${state.sequence}_${state.evidence.ledger.length + 1}`, day: state.calendar.absoluteDay, kind: evidenceKind[design.method],
    summary, direction, quality: round(quality * 100), problemId: action.problemId, source: design.sample, method: design.method,
    segmentId, sampleSize: design.count, usableSample: usable, independenceCluster: cluster, claimIds: [`claim_${design.question}`], expiresDay: state.calendar.absoluteDay + 180,
  });
  state.evidence.ledger = state.evidence.ledger.slice(0, 400);
  emit("evidence_recorded", "evidence", summary, "system");
}

export function decayEvidence(state: SimulationState) {
  for (const claim of state.evidence.claims) {
    const age = state.calendar.absoluteDay - claim.lastUpdatedDay;
    if (age > 90) claim.confidence = clamp(claim.confidence - Math.min(4, (age - 90) / 60));
  }
}
