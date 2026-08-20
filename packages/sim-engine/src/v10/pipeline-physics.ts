export const PIPELINE_STAGES_V10 = [
  "lead",
  "qualified",
  "pilot",
  "negotiation",
  "won",
  "lost",
] as const;
export type PipelineStageV10 = (typeof PIPELINE_STAGES_V10)[number];

const allowedTransitions: Record<PipelineStageV10, PipelineStageV10[]> = {
  lead: ["qualified", "lost"],
  qualified: ["pilot", "negotiation", "lost"],
  pilot: ["negotiation", "won", "lost"],
  negotiation: ["won", "lost"],
  won: [],
  lost: [],
};

export function transitionPipelineStageV10(
  current: PipelineStageV10,
  next: PipelineStageV10,
): PipelineStageV10 {
  if (!allowedTransitions[current].includes(next)) {
    throw new Error(`PIPELINE_TRANSITION_INVALID:${current}:${next}`);
  }
  return next;
}
