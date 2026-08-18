import type { PendingDecision, SimulationStage, SimulationState } from "../types";
import { clamp } from "../kernel/math";
import { random } from "../rng";

type ChoiceProfile = "scope" | "trust" | "cash" | "risk";
type PressureKey = "cash" | "overload" | "promises" | "reliability" | "pipeline" | "collections" | "churn" | "team" | "compliance" | "competition" | "vendor" | "pricing";
type EventRule = { id: string; stage: SimulationStage; pressure: PressureKey; min: number; hazard: number; title: string; profile: ChoiceProfile };

const stages: SimulationStage[] = ["discovery", "validation", "pilot", "productization", "repeatability"];
const commonThemes: Array<[PressureKey, string, ChoiceProfile]> = [
  ["cash", "The runway forecast moved against you", "cash"], ["overload", "Execution capacity is breaking promises", "scope"],
  ["promises", "A stakeholder is calling in a promise", "trust"], ["reliability", "A reliability weakness reached a customer", "risk"],
  ["pipeline", "The pipeline has stalled between interest and commitment", "scope"], ["collections", "An expected payment has not arrived", "cash"],
  ["churn", "A customer is reconsidering the product", "trust"], ["team", "A key contributor is losing confidence", "trust"],
  ["compliance", "A compliance boundary has become material", "risk"], ["competition", "An alternative changed the buyer's reference point", "scope"],
  ["vendor", "A critical vendor changed the operating assumptions", "risk"], ["pricing", "A buyer challenged the price-to-value story", "cash"],
];

export const COMMON_EVENT_RULES: EventRule[] = commonThemes.flatMap(([pressure, title, profile], themeIndex) => stages.map((stage, stageIndex) => ({
  id: `common_${pressure}_${stage}`, stage, pressure, min: 42 + (themeIndex % 3) * 8, hazard: 0.08 + stageIndex * 0.012, title, profile,
})));

const scenarioThemes: Record<string, Array<[string, string, ChoiceProfile]>> = {
  integration: [
    ["roi", "The champion cannot reproduce the promised ROI", "scope"], ["integration", "The workflow depends on an undocumented integration", "risk"],
    ["privacy", "A buyer asked where model inputs are retained", "trust"], ["api_cost", "Usage economics changed with real volume", "cash"],
    ["service_trap", "Custom implementation is becoming the product", "scope"], ["security", "Enterprise security entered the buying path", "risk"],
    ["commodity", "A competitor shipped a similar demonstration", "scope"],
  ],
  support: [
    ["seasonality", "Seasonality changed customer urgency", "cash"], ["collections", "A local operator is late on payment", "trust"],
    ["onboarding", "Onboarding requires another founder-led session", "scope"], ["channel", "A channel partner wants exclusivity", "risk"],
    ["support", "Support demand is consuming the product roadmap", "scope"], ["digital_readiness", "A customer's workflow is less digital than expected", "trust"],
    ["density", "Growth is spreading beyond serviceable local density", "cash"],
  ],
  compliance: [
    ["procurement", "Procurement introduced a new approval owner", "trust"], ["privacy", "A data-flow review found an ambiguous boundary", "risk"],
    ["clinical_safety", "A workflow edge case could affect operational safety", "risk"], ["design_partner", "The design partner requested preferential terms", "scope"],
    ["security", "Security evidence is now required before the pilot", "cash"], ["champion", "The internal champion lost political capital", "trust"],
    ["sales_cycle", "The buying timeline moved beyond the cash plan", "cash"],
  ],
};

export function scenarioEventRuleCount(profile: keyof typeof scenarioThemes) {
  return scenarioThemes[profile].length * stages.length;
}

function pressureValue(state: SimulationState, pressure: PressureKey) {
  const burn = Math.max(1, state.finance.monthlyFixedCosts + state.finance.payrollExpense - state.finance.mrr);
  const values: Record<PressureKey, number> = {
    cash: clamp(100 - state.finance.companyCash / burn * 18), overload: clamp(state.founder.burnout + state.founder.stress * 0.4),
    promises: clamp(state.relationships.overduePromises * 22 + state.relationships.openPromises * 5), reliability: clamp(100 - state.product.reliability + state.product.incidents.filter((item) => item.status === "open").length * 20),
    pipeline: clamp(55 - state.market.accounts.filter((item) => ["qualified", "pilot", "negotiation"].includes(item.stage)).length * 10),
    collections: clamp(state.finance.accountsReceivable / Math.max(1, state.finance.companyCash) * 35), churn: clamp(state.market.monthlyChurn * 500),
    team: clamp(state.organization.members.reduce((sum, member) => sum + (100 - member.morale), 0) / Math.max(1, state.organization.members.length)),
    compliance: clamp(100 - state.product.compliance + state.risks.filter((risk) => risk.domain === "compliance" && risk.status !== "mitigated").length * 12),
    competition: clamp(35 + state.calendar.absoluteDay / 12 - state.evidence.problem * 0.15), vendor: clamp(state.product.technicalDebt + state.market.supportLoad),
    pricing: clamp(70 - state.evidence.budget * 0.55 + (state.market.defaultPrice > 200 ? 12 : 0)),
  };
  return values[pressure];
}

function choices(profile: ChoiceProfile): PendingDecision["choices"] {
  if (profile === "scope") return [
    { id: "narrow", label: "Narrow the commitment", intentId: "narrow_scope", tradeoff: "Less upside now; lower execution risk" },
    { id: "learn", label: "Run a focused test", intentId: "gather_evidence", tradeoff: "Consumes time; reduces uncertainty" },
    { id: "push", label: "Keep scope and push harder", intentId: "accept_overload", tradeoff: "Preserves promise; raises burnout and rework" },
  ];
  if (profile === "trust") return [
    { id: "disclose", label: "Disclose constraints early", intentId: "transparent_update", tradeoff: "Short-term discomfort; protects trust" },
    { id: "renegotiate", label: "Renegotiate the promise", intentId: "renegotiate", tradeoff: "Changes terms; creates a smaller obligation" },
    { id: "delay", label: "Delay the conversation", intentId: "delay", tradeoff: "Saves attention now; risks trust later" },
  ];
  if (profile === "cash") return [
    { id: "collect", label: "Prioritize collection or prepayment", intentId: "collect_cash", tradeoff: "Improves cash; may weaken the relationship" },
    { id: "cut", label: "Cut scope and spending", intentId: "cut_cost", tradeoff: "Extends runway; slows learning" },
    { id: "bridge", label: "Use founder bridge capital", intentId: "bridge_capital", tradeoff: "Preserves momentum; increases founder exposure" },
  ];
  return [
    { id: "mitigate", label: "Mitigate before proceeding", intentId: "mitigate_risk", tradeoff: "Costs cash and time; lowers tail risk" },
    { id: "partner", label: "Bring in a specialist", intentId: "seek_partner", tradeoff: "Shares control; adds credible capacity" },
    { id: "accept", label: "Accept and monitor the risk", intentId: "accept_risk", tradeoff: "Fastest path; consequence remains latent" },
  ];
}

export function evaluateCausalEvent(state: SimulationState): PendingDecision | null {
  if (state.pendingEvent || state.status !== "active" || state.decisionPoints < 3 || state.calendar.absoluteDay < 10) return null;
  const common = COMMON_EVENT_RULES.filter((rule) => rule.stage === state.stage && !state.triggeredRuleIds.includes(rule.id));
  const profile = state.scenarioId === "healthcare-operations" ? "compliance" : state.scenarioId === "local-services-saas" ? "support" : "integration";
  const scenarioRules: EventRule[] = scenarioThemes[profile].map(([slug, title, choiceProfile], index) => ({
    id: `scenario_${profile}_${slug}_${state.stage}`, stage: state.stage, pressure: commonThemes[index % commonThemes.length][0],
    min: 38 + (index % 3) * 9, hazard: 0.11, title, profile: choiceProfile,
  })).filter((rule) => !state.triggeredRuleIds.includes(rule.id));
  const eligible = [...scenarioRules, ...common].filter((rule) => pressureValue(state, rule.pressure) >= rule.min);
  for (const rule of eligible) {
    const pressure = pressureValue(state, rule.pressure);
    if (random(state) < rule.hazard + Math.max(0, pressure - rule.min) / 300) {
      state.triggeredRuleIds.push(rule.id);
      return {
        id: `decision_${state.calendar.absoluteDay}_${state.triggeredRuleIds.length}`, ruleId: rule.id, title: rule.title,
        summary: `This appeared because ${rule.pressure} pressure reached ${Math.round(pressure)}/100. The consequence depends on how you trade time, cash, scope, and trust.`,
        pressure: rule.pressure, actorId: state.stakeholders[0]?.id, choices: choices(rule.profile), revealableClueIds: [`pressure:${rule.pressure}`, `stage:${state.stage}`],
      };
    }
  }
  return null;
}
