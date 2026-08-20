import { beforeEach, describe, expect, it } from "vitest";
import { marketSeedForScenario } from "@sim/engine";
import { getScenario, scenarios } from "@/content/scenarios";
import { issueRecoveryCode, issueSession } from "@/server/auth/crypto";
import { MemoryStore, resetMemoryStoreForTests } from "./memory";

async function identity(store: MemoryStore, displayName: string) {
  const now = new Date("2026-08-20T00:00:00.000Z");
  const session = issueSession(now);
  const recovery = issueRecoveryCode();
  const user = await store.createIdentity({
    displayName,
    contactEmail: `${displayName.toLowerCase()}@example.com`,
    session: { tokenHash: session.tokenHash, expiresAt: session.expiresAt },
    recovery: { lookupId: recovery.lookupId, secretHash: recovery.secretHash },
    now,
  });
  return { user, now };
}

describe("v10 feature-head cloud saves", () => {
  let store: MemoryStore;
  beforeEach(async () => {
    resetMemoryStoreForTests();
    store = new MemoryStore();
    await store.syncScenarios(scenarios);
  });

  it("routes scenario 3.x to isolated feature heads and returns idempotent command responses", async () => {
    const owner = await identity(store, "Taylor");
    const outsider = await identity(store, "Morgan");
    const scenario = getScenario("ai-workflow-automation", "3.0.0")!;
    const run = await store.createV10Run(
      owner.user.id,
      scenario,
      {
        companyName: "Actor Labs",
        founderProfileId: "technical_builder",
      },
      77,
      owner.now,
    );
    expect(run.stateFormat).toBe("feature_heads_v10");
    expect(run.stateVersion).toBe(0);
    expect(await store.getV10Run(outsider.user.id, run.id)).toBeNull();

    const request = {
      commandId: "40000000-0000-4000-8000-000000000001",
      expectedVersion: 0,
      type: "workforce.role.open" as const,
      payload: {
        title: "Founding operator",
        role: "operations",
        level: "individual",
        employmentType: "employee",
        headcount: 1,
        salaryMin: 18_000,
        salaryMax: 36_000,
        optionBpsMax: 150,
      },
    };
    const first = await store.executeV10Command(
      owner.user.id,
      run.id,
      request,
      new Date("2026-08-20T00:00:01.000Z"),
    );
    const duplicate = await store.executeV10Command(
      owner.user.id,
      run.id,
      request,
      new Date("2026-08-20T00:00:02.000Z"),
    );
    expect(duplicate).toEqual(first);
    expect(first.version).toBe(1);
    expect(JSON.stringify(first.state)).not.toContain("candidateTruth");
    expect(JSON.stringify(first.state)).not.toContain("employeeTruth");
    await expect(
      store.executeV10Command(
        owner.user.id,
        run.id,
        { ...request, commandId: "40000000-0000-4000-8000-000000000002" },
        new Date(),
      ),
    ).rejects.toThrow("VERSION_CONFLICT");
  });

  it("creates content-stable checkpoint forks without mutating the source timeline", async () => {
    const owner = await identity(store, "Casey");
    const scenario = getScenario("local-services-saas", "3.0.0")!;
    const source = await store.createV10Run(
      owner.user.id,
      scenario,
      { companyName: "Forkable Co", founderProfileId: "commercial_hunter" },
      91,
      owner.now,
    );
    await store.executeV10Command(
      owner.user.id,
      source.id,
      {
        commandId: "50000000-0000-4000-8000-000000000001",
        expectedVersion: 0,
        type: "workforce.role.open",
        payload: {
          title: "Service lead",
          role: "customer_success",
          level: "lead",
          employmentType: "employee",
          headcount: 1,
          salaryMin: 18000,
          salaryMax: 42000,
          optionBpsMax: 120,
        },
      },
      owner.now,
    );
    const checkpoint = await store.createV10Checkpoint(
      owner.user.id,
      source.id,
      "Before sourcing",
      owner.now,
    );
    const fork = await store.forkV10Run(
      owner.user.id,
      source.id,
      checkpoint.id,
      owner.now,
    );
    expect(fork.parentRunId).toBe(source.id);
    expect(fork.checksum).toBe(checkpoint.checksum);
    expect(fork.state.features["workforce-and-organization"].checksum).toBe(
      (await store.getV10Run(owner.user.id, source.id))!.state.features[
        "workforce-and-organization"
      ].checksum,
    );
    await store.executeV10Command(
      owner.user.id,
      fork.id,
      {
        commandId: "50000000-0000-4000-8000-000000000002",
        expectedVersion: fork.stateVersion,
        type: "workforce.candidate.source",
        payload: { roleId: "role-1", channel: "network", count: 1 },
      },
      owner.now,
    );
    expect(
      (await store.getV10Run(owner.user.id, source.id))!.stateVersion,
    ).toBe(1);
    expect((await store.getV10Run(owner.user.id, fork.id))!.stateVersion).toBe(
      2,
    );
  });

  it("persists a V10.1 board plan once and inherits its external tape on fork", async () => {
    const owner = await identity(store, "Riley");
    const scenario = getScenario("ai-workflow-automation", "3.1.0")!;
    const run = await store.createV10Run(
      owner.user.id,
      scenario,
      { companyName: "World Model Labs", founderProfileId: "technical_builder" },
      1_041,
      owner.now,
    );

    expect(run.engineVersion).toBe("10.1.0-alpha.1");
    expect(
      (
        run.state.features["competitor-organizations"].public as {
          firms: unknown[];
        }
      ).firms,
    ).toHaveLength(4);

    let current = run;
    let pendingTurnId: string | undefined;
    for (let index = 0; index < 40 && !pendingTurnId; index += 1) {
      const result = await store.executeV10Command(
        owner.user.id,
        run.id,
        {
          commandId: `61000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          expectedVersion: current.stateVersion,
          type: "operations.advance_to_next_material_event",
          payload: { horizonDays: 90 },
        },
        owner.now,
      );
      pendingTurnId = result.pendingExternalTurnIds[0];
      current = (await store.getV10Run(owner.user.id, run.id))!;
    }
    expect(pendingTurnId).toBeTruthy();

    const resolved = await store.resolvePendingV10CompetitorTurn(
      owner.user.id,
      run.id,
      owner.now,
    );
    expect(resolved?.status).toBe("completed");
    expect(resolved?.provider).toBe("authored");
    expect(
      await store.getV10CompetitorTurn(owner.user.id, run.id, pendingTurnId!),
    ).toEqual(resolved);
    expect(
      await store.resolvePendingV10CompetitorTurn(
        owner.user.id,
        run.id,
        owner.now,
      ),
    ).toBeNull();

    const tape = await store.listV10ExternalInputs(owner.user.id, run.id);
    expect(tape).toHaveLength(1);
    expect(tape[0].kind).toBe("competitor_strategic_plan");
    expect(tape[0].provider).toBe("authored");

    const checkpoint = await store.createV10Checkpoint(
      owner.user.id,
      run.id,
      "After first board cycle",
      owner.now,
    );
    const fork = await store.forkV10Run(
      owner.user.id,
      run.id,
      checkpoint.id,
      owner.now,
    );
    const forkTape = await store.listV10ExternalInputs(owner.user.id, fork.id);
    expect(forkTape).toHaveLength(1);
    expect(forkTape[0].contentHash).toBe(tape[0].contentHash);
    expect(forkTape[0].inheritedFromRunId).toBe(run.id);
  });

  it("applies a published dossier to V10.1 as an immutable typed external input", async () => {
    const owner = await identity(store, "Dossier");
    const scenario = getScenario("healthcare-operations", "3.1.0")!;
    const run = await store.createV10Run(
      owner.user.id,
      scenario,
      { companyName: "Dossier Health", founderProfileId: "domain_insider" },
      2_021,
      owner.now,
    );
    const dossier = marketSeedForScenario("healthcare-operations").dossier;
    const first = await store.publishMarketDossier(
      dossier,
      { provider: "authored", promptVersion: "test-dossier-v1" },
      owner.now,
    );
    const duplicate = await store.publishMarketDossier(
      dossier,
      { provider: "authored", promptVersion: "test-dossier-v1" },
      owner.now,
    );

    expect(first.updatedRuns).toBe(1);
    expect(duplicate.updatedRuns).toBe(0);
    const canonical = (await store.getV10Run(owner.user.id, run.id))!;
    expect(
      (
        canonical.state.features["market-intelligence"].public as {
          supplementalFacts: unknown[];
        }
      ).supplementalFacts.length,
    ).toBeGreaterThan(0);
    const tape = await store.listV10ExternalInputs(owner.user.id, run.id);
    expect(tape).toHaveLength(1);
    expect(tape[0].kind).toBe("market_dossier");
    expect(tape[0].inputHash).toBe(dossier.contentHash);
  });
});
