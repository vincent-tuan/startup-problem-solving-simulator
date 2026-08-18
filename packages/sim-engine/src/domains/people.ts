import type { HistoryEvent, SimulationState, TeamMember } from "../types";
import { randomBetween } from "../rng";
import { scheduleEffect } from "../kernel/scheduler";

type Emit = (type: HistoryEvent["type"], category: HistoryEvent["category"], summary: string, actor?: HistoryEvent["actor"]) => void;

export function beginHiring(state: SimulationState, operation: "hire" | "contract" | "advisor", role: Exclude<TeamMember["role"], "founder" | "advisor">, budget: number, emit: Emit) {
  if (operation === "advisor") {
    const cost = Math.min(250, budget); if (state.finance.companyCash < cost) throw new Error("INSUFFICIENT_COMPANY_CASH");
    state.organization.members.push({ id: `member_${state.organization.members.length + 1}`, name: `${role} advisor`, role: "advisor", employment: "contractor", skill: randomBetween(state, 55, 88), capacity: 5, morale: 75, trust: 42, monthlyCost: cost, onboardingRemaining: 7 });
    state.organization.contractors += 1; emit("hiring_updated", "people", `Engaged a ${role} advisor; capacity remains limited until trust develops.`); return;
  }
  if (operation === "contract") {
    const monthlyCost = Math.max(100, Math.min(1_500, budget));
    state.organization.members.push({ id: `member_${state.organization.members.length + 1}`, name: `${role} contractor`, role, employment: "contractor", skill: randomBetween(state, 42, 78), capacity: 18, morale: 68, trust: 35, monthlyCost, onboardingRemaining: 10 });
    state.organization.contractors += 1; emit("hiring_updated", "people", `Contracted ${role} capacity with a 10-day onboarding period.`); return;
  }
  if (budget < 800) throw new Error("HIRING_BUDGET_TOO_LOW");
  const process = { id: `hiring_${state.organization.hiring.length + 1}`, role, stage: "sourcing" as const, candidateQuality: randomBetween(state, 38, 85), remainingDays: 7 };
  state.organization.hiring.push(process); scheduleEffect(state, "hire_progress", state.calendar.absoluteDay + 7, process.id);
  emit("hiring_updated", "people", `Started a multi-stage ${role} hiring process.`);
}
