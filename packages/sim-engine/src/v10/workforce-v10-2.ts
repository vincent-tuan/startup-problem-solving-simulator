import type { SimulationFeatureV10 } from "./contracts";
import {
  createWorkforceFeatureV10,
  type WorkforcePrivateStateV10,
  type WorkforcePublicStateV10,
} from "./workforce";

type WorkforceConfigV10_2 = {
  startingCandidatePoolPerChannel: number;
  salaryAnchor: number;
  performancePeriodDays: number;
};

const ROLE_BASE_HOURS: Record<string, number> = {
  engineering: 40,
  product: 38,
  sales: 40,
  operations: 40,
  customer_success: 40,
  finance: 36,
};

export function createWorkforceFeatureV10_2(): SimulationFeatureV10<
  WorkforcePublicStateV10,
  WorkforcePrivateStateV10,
  WorkforceConfigV10_2
> {
  const base = createWorkforceFeatureV10();
  const baseLayoff = base.commands?.["workforce.layoff.plan"];
  return {
    ...base,
    version: "1.1.0",
    compatibleEngineRange: ">=10.2.0 <11.0.0",
    commands: {
      ...base.commands,
      "workforce.layoff.plan": (context) => {
        const result = baseLayoff?.(context);
        if (context.command.type !== "workforce.layoff.plan") return result;
        const jurisdiction = context.query("jurisdiction-rules.employment") as {
          consultationRequiredForLayoff: boolean;
        };
        if (jurisdiction.consultationRequiredForLayoff) {
          for (const employeeId of context.command.payload.employeeIds) {
            context.emit({
              type: "workforce-and-organization.exposure_detected",
              sourceId: employeeId,
              causality: { exposureIds: [`layoff-process:${context.command.commandId}:${employeeId}`] },
              payload: {
                employeeId,
                type: "wrongful_termination",
                severity: 3,
                causalFactors: ["layoff_consultation_required", "selection_process_under_review"],
              },
            });
          }
        }
        return result;
      },
    },
    queries: [
      ...(base.queries ?? []),
      {
        id: "workforce-and-organization.delivery-capacity",
        resolve: ({ ownState, kernel }) => {
          const byRole: Record<string, { hours: number; quality: number }> = {};
          const ownership: Record<string, number> = {};
          for (const employee of ownState.public.employees) {
            if (!["active", "onboarding"].includes(employee.status)) continue;
            const truth = ownState.private.employeeTruth[employee.id];
            if (!truth) continue;
            const maturity = employee.status === "onboarding" ? employee.onboardingProgress / 100 : 1;
            const hours = (ROLE_BASE_HOURS[employee.role] ?? 36) * employee.workload * maturity;
            const current = byRole[employee.role] ?? { hours: 0, quality: 0 };
            current.quality = current.hours + hours > 0
              ? (current.quality * current.hours + truth.actualContribution * hours) / (current.hours + hours)
              : 0;
            current.hours += hours;
            byRole[employee.role] = current;
            for (const item of employee.ownership) ownership[item] = (ownership[item] ?? 0) + 1;
          }
          byRole.founder = { hours: 32, quality: 0.72 };
          const founderRole = kernel.founderProfileId === "technical_builder" ? "engineering"
            : kernel.founderProfileId === "commercial_hunter" ? "sales" : "operations";
          const founderFunctional = byRole[founderRole] ?? { hours: 0, quality: 0 };
          founderFunctional.quality = (founderFunctional.quality * founderFunctional.hours + 0.74 * 30) / Math.max(1, founderFunctional.hours + 30);
          founderFunctional.hours += 30;
          byRole[founderRole] = founderFunctional;
          return {
            byRole: Object.fromEntries(Object.entries(byRole).map(([role, value]) => [role, { hours: Math.round(value.hours * 10) / 10, quality: Math.round(value.quality * 1000) / 1000 }])),
            ownership,
          };
        },
      },
    ],
  };
}
