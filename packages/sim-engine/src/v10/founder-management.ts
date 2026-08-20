import { z } from "zod";
import type { SimulationFeatureV10 } from "./contracts";

const managementSignalSchema = z.enum([
  "controlled",
  "stretched",
  "overloaded",
  "critical",
]);
const publicStateSchema = z.object({
  founderProfileId: z.enum([
    "technical_builder",
    "commercial_hunter",
    "domain_insider",
    "community_operator",
  ]),
  managementSignal: managementSignalSchema,
  directReports: z.number().int().min(0).max(25),
  managementCapacityHours: z.number().min(0).max(80),
  committedHours: z.number().min(0).max(160),
  mandates: z
    .array(
      z.object({
        managerId: z.string(),
        mandate: z.enum(["delivery", "hiring", "people", "commercial"]),
        budgetLimit: z.number().nonnegative(),
        escalationThreshold: z.enum(["low", "material", "critical"]),
      }),
    )
    .max(24),
  visibleSignals: z
    .array(
      z.object({ day: z.number().int().nonnegative(), summary: z.string() }),
    )
    .max(60),
});
export type FounderManagementPublicStateV10 = z.infer<typeof publicStateSchema>;

const privateStateSchema = z.object({
  attentionCapacity: z.number().min(10).max(80),
  managementSkill: z.number().min(0).max(1),
  conflictAvoidance: z.number().min(0).max(1),
  optimismBias: z.number().min(0).max(1),
  stress: z.number().min(0).max(1),
  unresolvedPeopleLoad: z.number().min(0).max(200),
  memory: z.array(z.string()).max(80),
});
export type FounderManagementPrivateStateV10 = z.infer<
  typeof privateStateSchema
>;

const configSchema = z
  .object({ baseCapacityHours: z.number().min(20).max(70).default(42) })
  .default({ baseCapacityHours: 42 });

function signal(
  committed: number,
  capacity: number,
): z.infer<typeof managementSignalSchema> {
  const load = committed / Math.max(1, capacity);
  if (load < 0.75) return "controlled";
  if (load < 1) return "stretched";
  if (load < 1.3) return "overloaded";
  return "critical";
}

export function createFounderManagementFeatureV10(): SimulationFeatureV10<
  FounderManagementPublicStateV10,
  FounderManagementPrivateStateV10,
  z.infer<typeof configSchema>
> {
  return {
    id: "founder-and-management",
    version: "1.0.0",
    dependencies: [],
    compatibleEngineRange: ">=10.0.0 <11.0.0",
    configSchema,
    publicStateSchema,
    privateStateSchema,
    initialize: ({ kernel, config, rng }) => ({
      public: {
        founderProfileId: kernel.founderProfileId,
        managementSignal: "controlled",
        directReports: 0,
        managementCapacityHours: config.baseCapacityHours,
        committedHours: 0,
        mandates: [],
        visibleSignals: [],
      },
      private: {
        attentionCapacity: config.baseCapacityHours,
        managementSkill: Math.max(
          0.2,
          Math.min(0.9, 0.52 + rng.normal(0, 0.1)),
        ),
        conflictAvoidance: Math.max(
          0.05,
          Math.min(0.95, 0.5 + rng.normal(0, 0.16)),
        ),
        optimismBias: Math.max(
          0.05,
          Math.min(0.95, 0.48 + rng.normal(0, 0.15)),
        ),
        stress: 0.18,
        unresolvedPeopleLoad: 0,
        memory: [],
      },
    }),
    commands: {
      "workforce.delegation.set": (context) => {
        if (context.command.type !== "workforce.delegation.set") return;
        const payload = context.command.payload;
        const existing = context.ownState.public.mandates.findIndex(
          (item) =>
            item.managerId === payload.managerId &&
            item.mandate === payload.mandate,
        );
        const mandate = { ...payload };
        if (existing >= 0) context.ownState.public.mandates[existing] = mandate;
        else context.ownState.public.mandates.push(mandate);
        context.ownState.private.memory.push(
          `Delegated ${payload.mandate} to ${payload.managerId} on day ${context.kernel.simulationDay}`,
        );
        context.ownState.private.memory =
          context.ownState.private.memory.slice(-80);
        context.emit({
          type: "founder-and-management.delegation_changed",
          visibility: "public",
          sourceId: payload.managerId,
          payload: mandate,
        });
      },
    },
    effects: {},
    queries: [
      {
        id: "founder-and-management.capacity",
        resolve: ({ ownState }) => ({
          availableHours: Math.max(
            0,
            ownState.private.attentionCapacity - ownState.public.committedHours,
          ),
          managementSkill: ownState.private.managementSkill,
          conflictAvoidance: ownState.private.conflictAvoidance,
          optimismBias: ownState.private.optimismBias,
        }),
      },
    ],
    eventSubscriptions: [
      {
        id: "founder-observes-management-demand",
        eventType: "workforce-and-organization.management_demand_changed",
        handle: (context, event) => {
          const payload = event.payload as {
            directReports?: number;
            committedHours?: number;
            unresolvedLoad?: number;
          };
          context.ownState.public.directReports = Math.max(
            0,
            Math.min(
              25,
              payload.directReports ?? context.ownState.public.directReports,
            ),
          );
          context.ownState.public.committedHours = Math.max(
            0,
            Math.min(
              160,
              payload.committedHours ?? context.ownState.public.committedHours,
            ),
          );
          context.ownState.private.unresolvedPeopleLoad = Math.max(
            0,
            Math.min(
              200,
              payload.unresolvedLoad ??
                context.ownState.private.unresolvedPeopleLoad,
            ),
          );
          context.ownState.public.managementSignal = signal(
            context.ownState.public.committedHours,
            context.ownState.private.attentionCapacity,
          );
        },
      },
      {
        id: "founder-observes-workforce-crisis",
        eventType: "workforce-and-organization.conflict_observed",
        handle: (context, event) => {
          context.ownState.private.stress = Math.min(
            1,
            context.ownState.private.stress + 0.08,
          );
          context.ownState.public.visibleSignals.push({
            day: event.simulationDay,
            summary:
              "A material team conflict now requires management attention.",
          });
          context.ownState.public.visibleSignals =
            context.ownState.public.visibleSignals.slice(-60);
        },
      },
    ],
    hooks: {
      after_period_close: (context) => {
        const load =
          context.ownState.public.committedHours /
          Math.max(1, context.ownState.private.attentionCapacity);
        context.ownState.private.stress = Math.max(
          0,
          Math.min(
            1,
            context.ownState.private.stress + (load > 1 ? 0.08 : -0.04),
          ),
        );
      },
    },
    invariants: [
      {
        id: "management-mandates-unique",
        check: ({ ownState }) => {
          const ids = ownState.public.mandates.map(
            (item) => `${item.managerId}:${item.mandate}`,
          );
          if (new Set(ids).size !== ids.length)
            throw new Error("DUPLICATE_MANAGEMENT_MANDATE");
        },
      },
    ],
    projectionPolicy: {
      schema: publicStateSchema,
      project: ({ publicState }) => structuredClone(publicState),
      denyKeys: [
        "managementSkill",
        "conflictAvoidance",
        "optimismBias",
        "stress",
        "private",
      ],
    },
    snapshotPolicy: { mode: "adaptive", maximumCommandsBetweenSnapshots: 50 },
    retentionPolicy: {
      maximumHeadBytes: 250_000,
      maximumMaterialRecords: 160,
      archiveClosedRecords: true,
    },
  };
}
