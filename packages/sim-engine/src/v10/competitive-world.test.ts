import { describe, expect, it } from "vitest";
import {
  accountingBalanceV10,
  assertLedgerV10,
  createEntityLedgerV10,
  postAccountingEntryV10,
} from "./accounting-core";
import type {
  CompetitorFirmPrivateV10,
  CompetitorOrganizationsPrivateStateV10,
  CompetitorOrganizationsPublicStateV10,
} from "./competitor-organizations";
import {
  generateAuthoredCompetitorPlanV10,
  pendingCompetitorDecisionEnvelopeV10,
  validateCompetitorPlanV10,
} from "./competitor-strategy";
import {
  createProductionFeatureConfigV10_1,
  createProductionFeatureRegistryV10_1,
} from "./feature-set";
import type { FinanceTreasuryPrivateStateV10_1 } from "./finance-treasury-v10-1";
import { applyCommandV10, createInitialStateV10 } from "./kernel";
import type { EngineCommandV10, SimulationStateV10 } from "./types";

const registry = createProductionFeatureRegistryV10_1();

function initial(seed = 731_901): SimulationStateV10 {
  return createInitialStateV10(
    {
      scenarioVersionId: "ai-workflow-automation@3.1.0",
      setup: {
        companyName: "Competitive Systems",
        founderProfileId: "technical_builder",
      },
    },
    {
      now: "2026-08-20T00:00:00.000Z",
      seed,
      engineVersion: "10.1.0-alpha.1",
      jurisdictionRuleVersionId: "sea_like_v1@1.0.0",
    },
    registry,
    createProductionFeatureConfigV10_1({
      jurisdiction: "sea_like",
      openingCash: 500,
    }),
  );
}

function apply(
  state: SimulationStateV10,
  type: EngineCommandV10["type"],
  payload: unknown,
  actor: EngineCommandV10["actor"] = "player",
): SimulationStateV10 {
  const serial = String(state.kernel.version + 1).padStart(12, "0");
  return applyCommandV10(
    state,
    {
      commandId: `81000000-0000-4000-8000-${serial}`,
      expectedVersion: state.kernel.version,
      type,
      payload,
      actor,
    } as EngineCommandV10,
    {
      runId: "competitive-world-test",
      now: "2026-08-20T00:00:00.000Z",
    },
    registry,
  ).state;
}

function resolvePending(state: SimulationStateV10): SimulationStateV10 {
  const envelope = pendingCompetitorDecisionEnvelopeV10(state);
  if (!envelope) return state;
  const plan = generateAuthoredCompetitorPlanV10(envelope);
  return apply(
    state,
    "system.competitor_plan_fallback",
    {
      externalInputId: `authored:${envelope.turnId}`,
      turnId: envelope.turnId,
      inputHash: envelope.worldInputHash,
      provider: "authored",
      plan,
    },
    "system",
  );
}

function runWorld(seed: number, targetDay: number): SimulationStateV10 {
  let state = initial(seed);
  for (let step = 0; step < 800 && state.kernel.simulationDay < targetDay; step += 1) {
    state = resolvePending(state);
    if (!pendingCompetitorDecisionEnvelopeV10(state)) {
      state = apply(state, "operations.advance_to_next_material_event", {
        horizonDays: 90,
      });
    }
  }
  return resolvePending(state);
}

function privateOrganizations(
  state: SimulationStateV10,
): CompetitorOrganizationsPrivateStateV10 {
  return state.features["competitor-organizations"]
    .private as CompetitorOrganizationsPrivateStateV10;
}

describe("v10.1 independent competitor businesses", () => {
  it("creates four independent firms and never projects private business state", () => {
    const state = initial();
    const projected = registry.project(
      state,
      "competitor-organizations",
    ) as CompetitorOrganizationsPublicStateV10;
    const serialized = JSON.stringify(projected);

    expect(projected.firms).toHaveLength(4);
    expect(new Set(projected.firms.map((firm) => firm.id)).size).toBe(4);
    for (const forbidden of [
      '"ledger"',
      '"monthlyRevenue"',
      '"monthlyBurn"',
      '"pipeline"',
      '"activePlan"',
      '"riskTolerance"',
      '"strategicMemory"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(projected.firms.every((firm) => firm.sourceFacts.length > 0)).toBe(
      true,
    );
    expect(
      projected.firms.flatMap((firm) => firm.sourceFacts).every(
        (fact) => fact.url && fact.publisher && fact.retrievedAt,
      ),
    ).toBe(true);
    const completeProjection = {
      intelligence: registry.project(state, "market-intelligence"),
      market: registry.project(state, "competitive-market"),
      organizations: projected,
      strategy: registry.project(state, "competitor-strategy"),
    };
    expect(
      new TextEncoder().encode(JSON.stringify(completeProjection)).byteLength,
    ).toBeLessThan(150_000);
  });

  it("rejects an otherwise valid board plan when its portfolio exceeds cash", () => {
    let state = initial(880_121);
    while (!pendingCompetitorDecisionEnvelopeV10(state)) {
      state = apply(state, "operations.advance_to_next_material_event", {
        horizonDays: 90,
      });
    }
    const envelope = pendingCompetitorDecisionEnvelopeV10(state)!;
    const serializedEnvelope = JSON.stringify(envelope);
    for (const forbidden of ["ledger", "player_hidden", "candidateTruth", "privateState"]) {
      expect(serializedEnvelope).not.toContain(forbidden);
    }
    const plan = generateAuthoredCompetitorPlanV10(envelope);
    plan.initiatives[0].cashLimit = envelope.resourceCeilings.cash + 1;

    expect(() => validateCompetitorPlanV10(plan, envelope)).toThrow(
      "COMPETITOR_PLAN_OVERSPEND",
    );
  });

  it("keeps operating without player intervention and replays identically", () => {
    const left = runWorld(990_031, 180);
    const right = runWorld(990_031, 180);

    expect(left.kernel.simulationDay).toBeGreaterThanOrEqual(180);
    expect(left.kernel.overallChecksum).toBe(right.kernel.overallChecksum);
    expect(
      (
        left.features["competitor-strategy"].public as {
          completedPlanningCycles: number;
        }
      ).completedPlanningCycles,
    ).toBeGreaterThanOrEqual(4);

    const organizations = privateOrganizations(left);
    for (const firm of Object.values(organizations.firms)) {
      assertLedgerV10(firm.ledger);
      expect(firm.lastProcessedDay).toBeGreaterThanOrEqual(180);
      expect(firm.strategicMemory.length).toBeGreaterThan(0);
      expect(Number.isFinite(firm.monthlyRevenue)).toBe(true);
    }
  });

  it("preserves independent accounting and initiative capacity bounds", () => {
    const state = runWorld(421_337, 120);
    const firms = Object.values(privateOrganizations(state).firms);

    for (const firm of firms) {
      assertLedgerV10(firm.ledger);
      const active = firm.initiatives.filter((item) => item.status === "active");
      expect(active.length).toBeLessThanOrEqual(12);
      for (const team of firm.teams) {
        expect(team.reservedCapacity).toBeGreaterThanOrEqual(0);
        expect(team.reservedCapacity).toBeLessThanOrEqual(team.capacity);
      }
    }
    expect(
      firms.some(
        (firm: CompetitorFirmPrivateV10) =>
          firm.initiatives.length > 0 || firm.completedInitiativeIds.length > 0,
      ),
    ).toBe(true);
  });

  it("uses the generalized V10.1 double-entry treasury without changing V10.0", () => {
    let state = initial(601_771);
    expect(state.features["finance-and-treasury"].version).toBe("1.1.0");
    state = apply(state, "workforce.role.open", {
      title: "Founding seller",
      role: "sales",
      level: "individual",
      employmentType: "employee",
      headcount: 1,
      salaryMin: 18_000,
      salaryMax: 36_000,
      optionBpsMax: 150,
    });
    state = apply(state, "workforce.candidate.source", {
      roleId: "role-1",
      channel: "network",
      count: 1,
    });
    const finance = state.features["finance-and-treasury"]
      .private as FinanceTreasuryPrivateStateV10_1;
    assertLedgerV10(finance.ledger);
    expect(finance.recognizedTransactionIds).toContain(
      `source-81000000-0000-4000-8000-${String(state.kernel.version).padStart(12, "0")}`,
    );
  });

  it("compacts long ledgers without changing account balances", () => {
    const ledger = createEntityLedgerV10(10_000, "soak-ledger");
    for (let index = 0; index < 2_500; index += 1) {
      postAccountingEntryV10(ledger, {
        id: `expense-${index}`,
        day: index,
        memo: "Bounded soak expense",
        lines: [
          { account: "expense:vendor", debit: 1, credit: 0 },
          { account: "cash", debit: 0, credit: 1 },
        ],
      });
    }
    assertLedgerV10(ledger);
    expect(ledger.entries.length).toBeLessThanOrEqual(2_000);
    expect(Object.keys(ledger.carriedBalances).length).toBeGreaterThan(0);
    expect(accountingBalanceV10(ledger, "cash")).toBe(7_500);
    expect(accountingBalanceV10(ledger, "expense:vendor")).toBe(2_500);
  });
});
