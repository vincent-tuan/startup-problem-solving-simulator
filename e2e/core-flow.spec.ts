import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("onboarding, scenario creation, cloud command, and history flow", async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("heading", { name: /Build the judgment/i })).toBeVisible();
  await page.getByRole("link", { name: /Create a run/i }).click();
  await page.getByLabel("Display name").fill("Test Founder"); await page.getByLabel("Contact email").fill("founder@example.com");
  await page.getByRole("button", { name: /Create secure session/i }).click();
  await expect(page.getByRole("heading", { name: /Save your new recovery code/i })).toBeVisible();
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: /Continue to scenarios/i }).click();
  await page.getByRole("link", { name: /Open scenario/i }).first().click();
  await page.getByLabel("Startup name").fill("E2E Orbit"); await page.getByRole("button", { name: /Start scenario/i }).click();
  await expect(page.getByRole("heading", { name: "E2E Orbit", exact:true })).toBeVisible();
  for (const tab of ["Organization","Hiring desk","Management room","Signals inbox","Employment cases","Intelligence"]) await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  await page.getByRole("tab", { name: "Intelligence" }).click();
  await expect(page.getByText(/Every firm below is a fictional simulation twin/i)).toBeVisible();
  await page.getByRole("tab", { name: "Hiring desk" }).click();await page.getByPlaceholder("Role title").fill("Founding engineer");await page.getByRole("button",{name:"Record opening"}).click();await page.getByRole("tab",{name:"Organization"}).click();await expect(page.getByText("Founding engineer").last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  const runId=new URL(page.url()).pathname.split("/").filter(Boolean).at(-1)!;await page.goto(`/runs/${runId}/history`);await expect(page.getByRole("heading", { name: "E2E Orbit" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze(); expect(results.violations.filter(item => item.impact === "critical")).toEqual([]);
});

test("catalog remains usable at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name: /Choose the constraint system/i })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("a recovery code transfers ownership and rotates", async ({ browser }) => {
  const original = await browser.newContext(); const first = await original.newPage(); await first.goto("/start");
  await first.getByLabel("Display name").fill("Recovery Founder"); await first.getByLabel("Contact email").fill("recovery@example.com");
  await first.getByRole("button", { name: /Create secure session/i }).click(); const oldCode = await first.locator("code").textContent(); expect(oldCode).toMatch(/^ssr\./);
  const recovered = await browser.newContext(); const second = await recovered.newPage(); await second.goto("/start");
  await second.getByRole("tab", { name: "Recover account" }).click(); await second.getByLabel("Recovery code").fill(oldCode!);
  await second.getByRole("button", { name: /Recover and rotate/i }).click(); const newCode = await second.locator("code").textContent();
  expect(newCode).toMatch(/^ssr\./); expect(newCode).not.toBe(oldCode);
  await original.close(); await recovered.close();
});

test("a durable competitor turn falls back, saves, and rehydrates", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "The desktop run covers the shared server workflow.");
  await page.goto("/start"); await page.getByLabel("Display name").fill("World Founder"); await page.getByLabel("Contact email").fill("world@example.com");
  await page.getByRole("button", { name: /Create secure session/i }).click(); await page.getByRole("checkbox").check(); await page.getByRole("button", { name: /Continue to scenarios/i }).click();
  const created=await page.evaluate(async()=>{const response=await fetch("/api/v1/runs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({scenarioSlug:"ai-workflow-automation",scenarioVersion:"2.0.0",setup:{companyName:"Workflow World",founderArchetype:"builder",difficulty:"realistic",personalRunway:"standard"}})});return response.json();});const runId=created.run.id;await page.goto(`/runs/${runId}`);await expect(page.getByRole("heading", { name: "Workflow World" })).toBeVisible();
  const result = await page.evaluate(async (id) => {
    for (let index = 0; index < 50; index += 1) {
      const response = await fetch(`/api/v1/runs/${id}`, { cache: "no-store" }); const canonical = await response.json();
      if (!response.ok || !canonical.run) throw new Error(`CANONICAL_RUN_FAILED:${response.status}:${canonical.error ?? "missing"}`);
      const run = canonical.run;
      const moves = run.state.features?.public?.competitors?.moves ?? [];
      if (moves.length) return { move: moves[0], version: run.stateVersion };
      if (run.state.features?.public?.competitors?.pendingTurn) { await new Promise((resolve) => setTimeout(resolve, 250)); continue; }
      const type = run.state.pendingEvent ? "event.respond" : "operations.advance_to_decision";
      const payload = run.state.pendingEvent ? { choiceIndex: 0 } : { maxDays: 14 };
      const commandResponse = await fetch(`/api/v1/runs/${id}/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: run.stateVersion, type, payload }) });
      if (!commandResponse.ok && commandResponse.status !== 409) throw new Error(await commandResponse.text());
    }
    throw new Error("COMPETITOR_WORKFLOW_TIMEOUT");
  }, runId);
  expect(result.move.publicSummary).toContain("SIMULATED"); expect(result.move.provider).toBe("authored");
  const tape = await page.evaluate((id) => fetch(`/api/v1/runs/${id}/external-inputs`).then((response) => response.json()), runId);
  expect(tape.inputs.map((item: { kind: string }) => item.kind)).toContain("agent_decision");
});
