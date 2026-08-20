"use client";

import * as Tabs from "@radix-ui/react-tabs";
import {
  Activity,
  Banknote,
  BriefcaseBusiness,
  Building2,
  Clock3,
  FileSignature,
  Handshake,
  LoaderCircle,
  Radar,
  Scale,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  CompetitiveMarketPublicStateV10,
  CommercialCasesPublicStateV10_2,
  CommercialOpportunitiesPublicStateV10_3,
  CommercialObligationsPublicStateV10_2,
  CompetitorOrganizationsPublicStateV10,
  CompetitorStrategyPublicStateV10,
  ContractLifecyclePublicStateV10_3,
  CreditCovenantsPublicStateV10_2,
  CustomersRevenuePublicStateV10_2,
  CustomerOrganizationsPublicStateV10_3,
  DeliveryServicePublicStateV10_2,
  EmploymentCasesPublicStateV10,
  FinanceTreasuryPublicStateV10,
  FinanceTreasuryPublicStateV10_2,
  FounderManagementPublicStateV10,
  JurisdictionPublicStateV10,
  MarketIntelligencePublicStateV10,
  ProcurementProcessesPublicStateV10_3,
  SimulationCommandV10,
  WorkforcePublicStateV10,
} from "@sim/engine";
import type {
  ClientV10RunRecord,
  V10CommandResponse,
} from "@/server/store/types";
import { cn, money } from "@/lib/ui";

type SaveStatus = "saved" | "saving" | "conflict";
const tabItems = [
  ["organization", "Organization", Building2],
  ["hiring", "Hiring desk", BriefcaseBusiness],
  ["management", "Management room", Users],
  ["signals", "Signals inbox", Activity],
  ["cases", "Employment cases", Scale],
] as const;

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface p-4 sm:p-5">
      <h2 className="font-black">{title}</h2>
      {subtitle && <p className="muted mt-1 text-xs leading-5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SignalPill({ value }: { value: string }) {
  const bad = [
    "critical",
    "damaged",
    "fragmented",
    "flight_risk",
    "concerning",
    "insolvent",
  ].includes(value);
  const warning = [
    "material",
    "weak",
    "strained",
    "watch",
    "mixed",
    "tight",
    "overloaded",
    "stretched",
  ].includes(value);
  return (
    <span
      className={cn(
        "pill capitalize",
        bad ? "pill-bad" : warning ? "pill-warn" : "pill-good",
      )}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function V10WorkforceWorkspace({
  initialRun,
}: {
  initialRun: ClientV10RunRecord;
}) {
  const [state, setState] = useState(initialRun.state);
  const [version, setVersion] = useState(initialRun.stateVersion);
  const [checksum, setChecksum] = useState(initialRun.checksum);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState("");
  const [pendingTurns, setPendingTurns] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const workforce = state.features[
    "workforce-and-organization"
  ] as WorkforcePublicStateV10;
  const management = state.features[
    "founder-and-management"
  ] as FounderManagementPublicStateV10;
  const finance = state.features[
    "finance-and-treasury"
  ] as FinanceTreasuryPublicStateV10;
  const cases = state.features[
    "employment-cases"
  ] as EmploymentCasesPublicStateV10;
  const jurisdiction = state.features[
    "jurisdiction-rules"
  ] as JurisdictionPublicStateV10;
  const intelligence = state.features["market-intelligence"] as
    | MarketIntelligencePublicStateV10
    | undefined;
  const competitiveMarket = state.features["competitive-market"] as
    | CompetitiveMarketPublicStateV10
    | undefined;
  const competitorOrganizations = state.features[
    "competitor-organizations"
  ] as CompetitorOrganizationsPublicStateV10 | undefined;
  const competitorStrategy = state.features["competitor-strategy"] as
    | CompetitorStrategyPublicStateV10
    | undefined;
  const causalFinance = state.features["finance-and-treasury"] as FinanceTreasuryPublicStateV10_2 | undefined;
  const customers = state.features["customers-and-revenue"] as CustomersRevenuePublicStateV10_2 | undefined;
  const delivery = state.features["delivery-and-service"] as DeliveryServicePublicStateV10_2 | undefined;
  const obligations = state.features["commercial-obligations"] as CommercialObligationsPublicStateV10_2 | undefined;
  const credit = state.features["credit-and-covenants"] as CreditCovenantsPublicStateV10_2 | undefined;
  const commercialCases = state.features["commercial-cases"] as CommercialCasesPublicStateV10_2 | undefined;
  const customerOrganizations = state.features["customer-organizations"] as CustomerOrganizationsPublicStateV10_3 | undefined;
  const commercialOpportunities = state.features["commercial-opportunities"] as CommercialOpportunitiesPublicStateV10_3 | undefined;
  const procurement = state.features["procurement-processes"] as ProcurementProcessesPublicStateV10_3 | undefined;
  const contracts = state.features["contract-lifecycle"] as ContractLifecyclePublicStateV10_3 | undefined;
  const workspaceTabs = [
    ...tabItems,
    ...(customers ? [
      ["treasury", "Treasury", Banknote] as const,
      ["customers", "Customers", BriefcaseBusiness] as const,
      ["delivery", "Delivery", Activity] as const,
      ["risk-room", "Risk room", Scale] as const,
    ] : []),
    ...(commercialOpportunities ? [
      ["deal-room", "Deal room", Handshake] as const,
      ["procurement", "Procurement", BriefcaseBusiness] as const,
      ["contracts", "Contracts", FileSignature] as const,
    ] : []),
    ...(competitorOrganizations ? [["intelligence", "Intelligence", Radar] as const] : []),
  ];
  const activePeople = useMemo(
    () => workforce.employees.filter((item) => item.status !== "departed"),
    [workforce.employees],
  );
  const roleId =
    selectedRole ||
    workforce.openRoles.find((item) => item.status === "open")?.id ||
    "";

  useEffect(() => {
    if (!pendingTurns.length) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const turnId = pendingTurns[0];
        const response = await fetch(
          `/api/v1/runs/${initialRun.id}/agent-turns/${encodeURIComponent(turnId)}`,
          { cache: "no-store" },
        );
        const body = await response.json();
        if (
          response.ok &&
          ["completed", "failed", "superseded"].includes(body.turn?.status)
        ) {
          const canonical = await fetch(`/api/v1/runs/${initialRun.id}`, {
            cache: "no-store",
          }).then((item) => item.json());
          if (!cancelled && canonical.run) {
            setState(canonical.run.state);
            setVersion(canonical.run.stateVersion);
            setChecksum(canonical.run.checksum);
            setPendingTurns((current) => current.slice(1));
          }
          return;
        }
      } catch {
        // A transient polling failure must not disturb canonical engine state.
      }
      if (!cancelled) timer = setTimeout(poll, 800);
    };
    timer = setTimeout(poll, 400);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [initialRun.id, pendingTurns]);

  async function command(type: SimulationCommandV10["type"], payload: unknown) {
    if (status === "saving") return;
    setStatus("saving");
    setError("");
    try {
      const response = await fetch(`/api/v1/runs/${initialRun.id}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: version,
          type,
          payload,
        }),
      });
      const body = await response.json();
      if (response.status === 409) {
        const canonical = await fetch(`/api/v1/runs/${initialRun.id}`, {
          cache: "no-store",
        }).then((item) => item.json());
        if (canonical.run) {
          setState(canonical.run.state);
          setVersion(canonical.run.stateVersion);
          setChecksum(canonical.run.checksum);
        }
        setStatus("conflict");
        setError(
          "Canonical state changed in another tab. This workspace was reloaded without overwriting it.",
        );
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "COMMAND_REJECTED");
      const result = body as V10CommandResponse;
      setState(result.state);
      setVersion(result.version);
      setChecksum(result.checksum);
      setPendingTurns(result.pendingExternalTurnIds);
      setStatus("saved");
    } catch (cause) {
      setStatus("saved");
      setError(cause instanceof Error ? cause.message : "COMMAND_REJECTED");
    }
  }

  function openRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void command("workforce.role.open", {
      title: data.get("title"),
      role: data.get("role"),
      level: data.get("level"),
      employmentType: data.get("employmentType"),
      headcount: Number(data.get("headcount")),
      salaryMin: Number(data.get("salaryMin")),
      salaryMax: Number(data.get("salaryMax")),
      optionBpsMax: Number(data.get("optionBpsMax")),
    });
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="border-b border-white/7 bg-[#071019]/85 backdrop-blur-xl">
        <div className="container-page py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <SignalPill value={state.kernel.status} />
                <span className="pill capitalize">{state.kernel.stage}</span>
                <span className="pill">Day {state.kernel.simulationDay}</span>
                <span className="pill">
                  V10 · {state.kernel.challengeProfile.replaceAll("_", " ")}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-black sm:text-3xl">
                {state.kernel.companyName}
              </h1>
              <p className="muted mt-1 text-xs">
                {state.kernel.scenarioVersionId} · state {version} ·{" "}
                {checksum.slice(0, 10)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "pill",
                  status === "conflict" ? "pill-warn" : "pill-good",
                )}
              >
                {status === "saving" || pendingTurns.length ? (
                  <LoaderCircle className="animate-spin" size={13} />
                ) : (
                  <Clock3 size={13} />
                )}{" "}
                {status === "saving"
                  ? "Committing…"
                  : pendingTurns.length
                    ? "Board cycle resolving…"
                  : status === "conflict"
                    ? "Canonical state reloaded"
                    : "Cloud state canonical"}
              </span>
              <Link
                className="btn btn-secondary"
                href={`/runs/${initialRun.id}/history`}
              >
                History
              </Link>
              <Link className="btn btn-secondary" href="/dashboard">
                Dashboard
              </Link>
            </div>
          </div>
          <div className="metric-grid mt-5">
            <div className="metric-card">
              <div className="metric-label">Cash</div>
              <div className="metric-value">{money(finance.cash)}</div>
              <SignalPill value={finance.runwaySignal} />
            </div>
            <div className="metric-card">
              <div className="metric-label">People payable</div>
              <div className="metric-value">{money(finance.peoplePayable)}</div>
              <div className="metric-note">
                Overdue {money(finance.overduePeoplePayable)} · period cost{" "}
                {money(finance.monthlyPeopleCost)}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Team</div>
              <div className="metric-value">{activePeople.length}/25</div>
              <div className="metric-note">
                {
                  workforce.openRoles.filter((item) => item.status === "open")
                    .length
                }{" "}
                open roles
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Management load</div>
              <div className="metric-value">
                {management.committedHours.toFixed(1)}h
              </div>
              <SignalPill value={management.managementSignal} />
            </div>
          </div>
        </div>
      </header>
      {error && (
        <div className="container-page mt-4">
          <div
            role="alert"
            className="flex gap-2 rounded-xl border border-amber-300/25 bg-amber-300/8 p-3 text-sm text-amber-100"
          >
            <ShieldAlert size={16} />
            {error}
          </div>
        </div>
      )}
      <div className="container-page py-5">
        <Tabs.Root defaultValue="organization">
          <Tabs.List
            aria-label="Workforce views"
            className="flex gap-1 overflow-x-auto rounded-xl border border-white/7 bg-black/15 p-1"
          >
            {workspaceTabs.map(([value, label, Icon]) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-400 data-[state=active]:bg-slate-700/70 data-[state=active]:text-white"
              >
                <Icon size={14} />
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="organization" className="mt-4 space-y-4">
            <Panel
              title="Reporting graph"
              subtitle="Observed roles, reporting lines, workload and ownership. Latent capability and private intent remain server-only."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {activePeople.map((person) => (
                  <article className="surface-soft p-4" key={person.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold">{person.name}</h3>
                        <p className="faint mt-1 text-xs capitalize">
                          {person.level} {person.role.replaceAll("_", " ")} ·{" "}
                          {person.employmentType}
                        </p>
                      </div>
                      <SignalPill value={person.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="faint">Manager</span>
                        <div>{person.managerId ?? "Board / founder"}</div>
                      </div>
                      <div>
                        <span className="faint">Workload</span>
                        <div>{person.workload.toFixed(1)}×</div>
                      </div>
                      <div>
                        <span className="faint">Performance</span>
                        <div>
                          <SignalPill value={person.performanceSignal} />
                        </div>
                      </div>
                      <div>
                        <span className="faint">Retention</span>
                        <div>
                          <SignalPill value={person.retentionSignal} />
                        </div>
                      </div>
                    </div>
                    <div className="faint mt-3 text-xs">
                      Ownership: {person.ownership.join(", ") || "not recorded"}
                    </div>
                  </article>
                ))}
              </div>
            </Panel>
            <Panel title="Role coverage">
              <div className="grid gap-2">
                {workforce.openRoles.map((role) => (
                  <div
                    className="surface-soft flex items-center justify-between gap-3 p-3"
                    key={role.id}
                  >
                    <div>
                      <div className="font-bold">{role.title}</div>
                      <div className="faint text-xs capitalize">
                        {role.role.replaceAll("_", " ")} · {role.employmentType}{" "}
                        · {money(role.salaryMin)}–{money(role.salaryMax)}
                      </div>
                    </div>
                    <SignalPill value={role.status} />
                  </div>
                ))}
              </div>
            </Panel>
          </Tabs.Content>
          <Tabs.Content
            value="hiring"
            className="mt-4 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]"
          >
            <div className="space-y-4">
              <Panel title="Open role">
                <form className="space-y-3" onSubmit={openRole}>
                  <input
                    className="input"
                    name="title"
                    required
                    placeholder="Role title"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="input"
                      name="role"
                      defaultValue="engineering"
                    >
                      <option value="engineering">Engineering</option>
                      <option value="product">Product</option>
                      <option value="sales">Sales</option>
                      <option value="operations">Operations</option>
                      <option value="customer_success">Customer success</option>
                      <option value="finance">Finance</option>
                    </select>
                    <select
                      className="input"
                      name="level"
                      defaultValue="individual"
                    >
                      <option value="individual">Individual</option>
                      <option value="lead">Lead</option>
                      <option value="manager">Manager</option>
                    </select>
                    <select
                      className="input"
                      name="employmentType"
                      defaultValue="employee"
                    >
                      <option value="employee">Employee</option>
                      <option value="contractor">Contractor</option>
                    </select>
                    <input
                      className="input"
                      name="headcount"
                      type="number"
                      min="1"
                      max="5"
                      defaultValue="1"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      className="input"
                      aria-label="Minimum salary"
                      name="salaryMin"
                      type="number"
                      min="0"
                      defaultValue="24000"
                    />
                    <input
                      className="input"
                      aria-label="Maximum salary"
                      name="salaryMax"
                      type="number"
                      min="0"
                      defaultValue="48000"
                    />
                    <input
                      className="input"
                      aria-label="Maximum option basis points"
                      name="optionBpsMax"
                      type="number"
                      min="0"
                      max="2000"
                      defaultValue="200"
                    />
                  </div>
                  <button
                    className="btn btn-primary w-full"
                    disabled={status === "saving"}
                  >
                    Record opening
                  </button>
                </form>
              </Panel>
              <Panel title="Source inventory">
                <select
                  className="input"
                  value={roleId}
                  onChange={(event) => setSelectedRole(event.target.value)}
                >
                  <option value="">Select open role</option>
                  {workforce.openRoles
                    .filter((item) => item.status === "open")
                    .map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.title}
                      </option>
                    ))}
                </select>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {["network", "inbound", "outbound", "agency"].map(
                    (channel) => (
                      <button
                        className="btn btn-secondary"
                        key={channel}
                        disabled={!roleId || status === "saving"}
                        onClick={() =>
                          command("workforce.candidate.source", {
                            roleId,
                            channel,
                            count: 1,
                          })
                        }
                      >
                        {channel}
                      </button>
                    ),
                  )}
                </div>
              </Panel>
            </div>
            <Panel
              title="Candidate packets"
              subtitle="Ranges summarize independent evidence. Reusing a panel creates correlated evidence and candidate fatigue."
            >
              <div className="grid gap-3 lg:grid-cols-2">
                {workforce.candidates
                  .slice()
                  .reverse()
                  .map((candidate) => (
                    <article className="surface-soft p-4" key={candidate.id}>
                      <div className="flex justify-between gap-2">
                        <div>
                          <h3 className="font-bold">{candidate.name}</h3>
                          <p className="faint mt-1 text-xs">
                            {candidate.source} ·{" "}
                            {candidate.stage.replaceAll("_", " ")}
                          </p>
                        </div>
                        <SignalPill value={candidate.goodwillSignal} />
                      </div>
                      <div className="mt-3 text-sm">
                        <span className="faint">Capability estimate</span>
                        <div className="font-black">
                          {candidate.estimate.low.toFixed(0)}–
                          {candidate.estimate.high.toFixed(0)}{" "}
                          <span className="faint text-xs">
                            confidence{" "}
                            {candidate.estimate.confidence.toFixed(0)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          "structured_interview",
                          "work_sample",
                          "reference",
                          "portfolio_review",
                        ].map((method) => (
                          <button
                            className="btn btn-secondary !min-h-9 !px-3 text-xs"
                            key={method}
                            disabled={
                              !["screened", "assessed"].includes(
                                candidate.stage,
                              ) || status === "saving"
                            }
                            onClick={() =>
                              command("workforce.candidate.assess", {
                                candidateId: candidate.id,
                                method,
                                panelCluster:
                                  method === "structured_interview"
                                    ? "founder-panel"
                                    : method,
                              })
                            }
                          >
                            {method.replaceAll("_", " ")}
                          </button>
                        ))}
                      </div>
                      {["screened", "assessed"].includes(candidate.stage) && (
                        <button
                          className="btn btn-primary mt-3 w-full"
                          onClick={() =>
                            command("workforce.offer.make", {
                              candidateId: candidate.id,
                              salary: Math.ceil(candidate.salaryExpectation),
                              optionBps: candidate.optionExpectationBps,
                              startDelayDays: 7,
                            })
                          }
                        >
                          Offer {money(candidate.salaryExpectation)} +{" "}
                          {candidate.optionExpectationBps} bps
                        </button>
                      )}
                    </article>
                  ))}
                {!workforce.candidates.length && (
                  <p className="muted text-sm">
                    No candidate packets recorded.
                  </p>
                )}
              </div>
            </Panel>
          </Tabs.Content>
          <Tabs.Content value="management" className="mt-4 space-y-4">
            <Panel title="Founder and management capacity">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="surface-soft p-3">
                  <div className="faint text-xs">Direct reports</div>
                  <div className="text-2xl font-black">
                    {management.directReports}
                  </div>
                </div>
                <div className="surface-soft p-3">
                  <div className="faint text-xs">Capacity</div>
                  <div className="text-2xl font-black">
                    {management.managementCapacityHours}h
                  </div>
                </div>
                <div className="surface-soft p-3">
                  <div className="faint text-xs">Committed</div>
                  <div className="text-2xl font-black">
                    {management.committedHours.toFixed(1)}h
                  </div>
                </div>
              </div>
            </Panel>
            <Panel title="Management records">
              <div className="space-y-3">
                {activePeople
                  .filter((person) => person.id !== "founder")
                  .map((person) => (
                    <div className="surface-soft p-4" key={person.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-bold">{person.name}</div>
                          <div className="faint text-xs">
                            Last 1:1:{" "}
                            {person.lastOneOnOneDay === null
                              ? "no record"
                              : `day ${person.lastOneOnOneDay}`}{" "}
                            · workload {person.workload.toFixed(1)}×
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="btn btn-secondary !min-h-9"
                            disabled={
                              status === "saving" ||
                              person.lastOneOnOneDay ===
                                state.kernel.simulationDay
                            }
                            onClick={() =>
                              command("workforce.one_on_one.hold", {
                                employeeId: person.id,
                                focus: "performance",
                              })
                            }
                          >
                            Performance 1:1
                          </button>
                          <button
                            className="btn btn-secondary !min-h-9"
                            disabled={
                              status === "saving" ||
                              person.lastOneOnOneDay ===
                                state.kernel.simulationDay
                            }
                            onClick={() =>
                              command("workforce.one_on_one.hold", {
                                employeeId: person.id,
                                focus: "retention",
                              })
                            }
                          >
                            Retention 1:1
                          </button>
                          <button
                            className="btn btn-secondary !min-h-9"
                            onClick={() =>
                              command("workforce.feedback.record", {
                                employeeId: person.id,
                                style: "coaching",
                                topic: "Recorded delivery expectations",
                              })
                            }
                          >
                            Record feedback
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 border-t border-white/7 pt-4 xl:grid-cols-3">
                        <form
                          className="space-y-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            void command("workforce.assignment.set", {
                              employeeId: person.id,
                              workload: Number(data.get("workload")),
                              ownership: String(data.get("ownership") ?? "")
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean),
                            });
                          }}
                        >
                          <div className="faint text-xs font-bold uppercase tracking-wide">
                            Assignment record
                          </div>
                          <div className="grid grid-cols-[90px_1fr] gap-2">
                            <input
                              className="input"
                              aria-label={`Workload for ${person.name}`}
                              name="workload"
                              type="number"
                              min="0"
                              max="1.5"
                              step="0.05"
                              defaultValue={person.workload}
                            />
                            <input
                              className="input"
                              aria-label={`Ownership for ${person.name}`}
                              name="ownership"
                              defaultValue={person.ownership.join(", ")}
                              placeholder="account, capability, vendor"
                            />
                          </div>
                          <button
                            className="btn btn-secondary w-full !min-h-9"
                            disabled={
                              status === "saving" ||
                              !["active", "onboarding"].includes(person.status)
                            }
                          >
                            Record assignment
                          </button>
                        </form>
                        <form
                          className="space-y-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            void command("workforce.compensation.change", {
                              employeeId: person.id,
                              salary: Number(data.get("salary")),
                              optionBps: Number(data.get("optionBps")),
                            });
                          }}
                        >
                          <div className="faint text-xs font-bold uppercase tracking-wide">
                            Compensation record
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              className="input"
                              aria-label={`Salary for ${person.name}`}
                              name="salary"
                              type="number"
                              min="0"
                              defaultValue={person.annualSalary}
                            />
                            <input
                              className="input"
                              aria-label={`Option basis points for ${person.name}`}
                              name="optionBps"
                              type="number"
                              min="0"
                              max="2000"
                              defaultValue={person.optionBps}
                            />
                          </div>
                          <button
                            className="btn btn-secondary w-full !min-h-9"
                            disabled={status === "saving"}
                          >
                            Change compensation
                          </button>
                        </form>
                        <form
                          className="space-y-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            void command("workforce.manager.assign", {
                              employeeId: person.id,
                              managerId: data.get("managerId"),
                            });
                          }}
                        >
                          <div className="faint text-xs font-bold uppercase tracking-wide">
                            Reporting line
                          </div>
                          <select
                            className="input"
                            name="managerId"
                            defaultValue={person.managerId ?? "founder"}
                          >
                            {activePeople
                              .filter(
                                (manager) =>
                                  manager.id !== person.id &&
                                  (manager.id === "founder" ||
                                    manager.level === "manager"),
                              )
                              .map((manager) => (
                                <option key={manager.id} value={manager.id}>
                                  {manager.name}
                                </option>
                              ))}
                          </select>
                          <button
                            className="btn btn-secondary w-full !min-h-9"
                            disabled={status === "saving"}
                          >
                            Change manager
                          </button>
                        </form>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="btn btn-secondary !min-h-9"
                          disabled={status === "saving"}
                          onClick={() =>
                            command("workforce.performance_process.start", {
                              employeeId: person.id,
                              expectations:
                                "Recorded role outcomes, delivery quality, and review evidence",
                              reviewDays: 30,
                            })
                          }
                        >
                          Start performance process
                        </button>
                        {person.level === "manager" && (
                          <button
                            className="btn btn-secondary !min-h-9"
                            disabled={status === "saving"}
                            onClick={() =>
                              command("workforce.delegation.set", {
                                managerId: person.id,
                                mandate: "people",
                                budgetLimit: 2500,
                                escalationThreshold: "material",
                              })
                            }
                          >
                            Record people mandate
                          </button>
                        )}
                        {person.status === "notice" && (
                          <>
                            <button
                              className="btn btn-secondary !min-h-9"
                              disabled={status === "saving"}
                              onClick={() =>
                                command("workforce.resignation.respond", {
                                  employeeId: person.id,
                                  response: "negotiate_handoff",
                                })
                              }
                            >
                              Negotiate handoff
                            </button>
                            <button
                              className="btn btn-secondary !min-h-9"
                              disabled={status === "saving"}
                              onClick={() =>
                                command("workforce.resignation.respond", {
                                  employeeId: person.id,
                                  response: "accept",
                                })
                              }
                            >
                              Accept resignation
                            </button>
                          </>
                        )}
                        {["active", "onboarding"].includes(person.status) && (
                          <>
                            <button
                              className="btn btn-secondary !min-h-9"
                              disabled={status === "saving"}
                              onClick={() =>
                                command("workforce.termination.plan", {
                                  employeeId: person.id,
                                  reason: "performance",
                                  documentationIds:
                                    person.performanceProcess?.evidenceIds ??
                                    [],
                                })
                              }
                            >
                              Plan termination
                            </button>
                            <button
                              className="btn btn-secondary !min-h-9"
                              disabled={status === "saving"}
                              onClick={() =>
                                command("workforce.layoff.plan", {
                                  employeeIds: [person.id],
                                  reason: "Role elimination",
                                })
                              }
                            >
                              Plan role elimination
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </Panel>
          </Tabs.Content>
          <Tabs.Content value="signals" className="mt-4">
            <Panel
              title="Observed signals"
              subtitle="Signals are incomplete observations, not diagnoses or probability disclosures."
            >
              <div className="space-y-2">
                {workforce.signals
                  .slice()
                  .reverse()
                  .map((signal) => (
                    <div className="surface-soft p-4" key={signal.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold capitalize">
                          {signal.kind}
                        </span>
                        <SignalPill value={signal.severity} />
                      </div>
                      <p className="muted mt-2 text-sm leading-6">
                        {signal.summary}
                      </p>
                      <div className="faint mt-2 text-xs">
                        Day {signal.day} · records {signal.actorIds.join(", ")}
                      </div>
                    </div>
                  ))}
                {!workforce.signals.length && (
                  <p className="muted text-sm">
                    No material workforce signal is currently recorded.
                  </p>
                )}
              </div>
            </Panel>
          </Tabs.Content>
          {commercialOpportunities && customerOrganizations && (
            <Tabs.Content value="deal-room" className="mt-4 space-y-4">
              <Panel title="Commercial opportunities" subtitle="Each opportunity retains its own actors, independent discovery evidence, budget window and commercial history. Hidden urgency, willingness to pay and decision thresholds are not projected.">
                <div className="grid gap-3 xl:grid-cols-2">
                  {commercialOpportunities.opportunities.map((opportunity) => {
                    const organization = customerOrganizations.organizations.find((item) => item.id === opportunity.organizationId);
                    const actors = customerOrganizations.actors.filter((item) => item.organizationId === opportunity.organizationId);
                    const evidence = commercialOpportunities.evidence.filter((item) => item.opportunityId === opportunity.id);
                    return <article className="surface-soft p-4" key={opportunity.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><h3 className="font-black">{opportunity.name}</h3><p className="faint mt-1 text-xs">{organization?.name} · {opportunity.purchaseClass.replaceAll("_", " ")} · budget days {opportunity.budgetWindow.earliestDay}–{opportunity.budgetWindow.latestDay}</p></div>
                        <SignalPill value={opportunity.status} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div><span className="faint">Value estimate</span><div className="font-bold">{money(opportunity.valueRange.lower)}–{money(opportunity.valueRange.upper)}</div></div>
                        <div><span className="faint">Relationship</span><div><SignalPill value={opportunity.relationshipSignal} /></div></div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">{actors.map((actor) => <span className="pill" key={actor.id}>{actor.name} · {actor.roles[0].replaceAll("_", " ")}</span>)}</div>
                      <div className="mt-3 space-y-1 text-xs">{evidence.slice(-4).map((item) => <div className="rounded-lg border border-white/7 p-2" key={item.id}><span className="font-bold capitalize">{item.method.replaceAll("_", " ")}</span> · {item.signal} · <span className="faint">{item.confidence} confidence</span></div>)}</div>
                      {opportunity.pendingActivityDay !== null && <p className="muted mt-3 text-xs">Recorded activity due day {opportunity.pendingActivityDay}.</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {actors.slice(0, 3).map((actor) => <button className="btn btn-secondary !min-h-9" key={actor.id} disabled={status === "saving" || opportunity.pendingActivityDay !== null || ["procurement", "negotiation", "won", "lost"].includes(opportunity.status)} onClick={() => command("sales.discovery.record", { opportunityId: opportunity.id, actorId: actor.id, method: evidence.length ? "technical_workshop" : "interview", problemSignal: `Recorded ${organization?.knownPriorities[evidence.length % Math.max(1, organization.knownPriorities.length)] ?? "operational constraint"} with ${actor.title}.` })}>Meet {actor.name.split(" ")[0]}</button>)}
                        {opportunity.status === "qualified" && <button className="btn btn-secondary !min-h-9" disabled={status === "saving"} onClick={() => command("sales.business_case.prepare", { opportunityId: opportunity.id, annualValue: Math.round((opportunity.valueRange.lower + opportunity.valueRange.upper) / 2), implementationDays: opportunity.purchaseClass === "regulated" ? 60 : opportunity.purchaseClass === "enterprise" ? 45 : 21, evidenceIds: evidence.map((item) => item.id) })}>Submit business case record</button>}
                        {opportunity.status === "business_case" && <button className="btn btn-primary !min-h-9" disabled={status === "saving"} onClick={() => command("sales.proposal.submit", { opportunityId: opportunity.id, monthlyPrice: Math.max(100, Math.round(opportunity.valueRange.upper / 24)), implementationFee: Math.round(opportunity.valueRange.lower * 0.05), termMonths: 12, purchasePath: opportunity.purchaseClass === "regulated" || opportunity.purchaseClass === "enterprise" ? "annual_prepaid" : "subscription" })}>Submit commercial proposal</button>}
                      </div>
                    </article>;
                  })}
                </div>
              </Panel>
            </Tabs.Content>
          )}
          {procurement && commercialOpportunities && (
            <Tabs.Content value="procurement" className="mt-4 space-y-4">
              <Panel title="Procurement cases" subtitle={procurement.disclaimer}>
                <div className="space-y-4">
                  {procurement.cases.map((procurementCase) => {
                    const opportunity = commercialOpportunities.opportunities.find((item) => item.id === procurementCase.opportunityId);
                    const gates = procurement.gates.filter((item) => item.caseId === procurementCase.id);
                    return <article className="surface-soft p-4" key={procurementCase.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-black">{opportunity?.name ?? procurementCase.id}</h3><p className="faint mt-1 text-xs">Opened day {procurementCase.openedDay} · deadline day {procurementCase.deadlineDay} · {gates.length} gates</p></div><div className="flex gap-2"><SignalPill value={procurementCase.status} /><SignalPill value={procurementCase.progressSignal} /></div></div>
                      <div className="mt-4 grid gap-2 lg:grid-cols-2">{gates.map((gate) => <div className="rounded-xl border border-white/7 p-3" key={gate.id}>
                        <div className="flex items-start justify-between gap-2"><div><div className="font-bold">{gate.label}</div><div className="faint text-xs">{gate.ownerRole.replaceAll("_", " ")} · {gate.materiality} · attempts {gate.attempts}</div></div><SignalPill value={gate.status} /></div>
                        {gate.knownIssue && <p className="muted mt-2 text-xs leading-5">{gate.knownIssue}</p>}
                        {gate.reviewDueDay !== null && <p className="faint mt-2 text-xs">Review due day {gate.reviewDueDay}</p>}
                        {["open", "rejected"].includes(gate.status) && <div className="mt-2 flex flex-wrap gap-2"><button className="btn btn-secondary !min-h-9" disabled={status === "saving"} onClick={() => command("procurement.requirement.respond", { caseId: procurementCase.id, gateId: gate.id, action: "submit_evidence", evidenceIds: Array.from({ length: gate.requiredEvidenceCount }, (_, index) => `document-${gate.id}-${gate.attempts + 1}-${index + 1}`) })}>Submit document set</button><button className="btn btn-secondary !min-h-9" disabled={status === "saving"} onClick={() => command("procurement.requirement.respond", { caseId: procurementCase.id, gateId: gate.id, action: "remediate", evidenceIds: [] })}>Commission remediation</button>{gate.materiality !== "critical" && <button className="btn btn-secondary !min-h-9" disabled={status === "saving"} onClick={() => command("procurement.requirement.respond", { caseId: procurementCase.id, gateId: gate.id, action: "request_waiver", evidenceIds: [] })}>Request waiver</button>}</div>}
                      </div>)}</div>
                    </article>;
                  })}
                  {!procurement.cases.length && <p className="muted text-sm">No procurement case has been opened.</p>}
                </div>
              </Panel>
            </Tabs.Content>
          )}
          {contracts && procurement && commercialOpportunities && customerOrganizations && (
            <Tabs.Content value="contracts" className="mt-4 space-y-4">
              <Panel title="Agreement lifecycle" subtitle={contracts.disclaimer}>
                <div className="space-y-3">
                  {procurement.cases.filter((item) => item.status === "approved" && !contracts.agreements.some((agreement) => agreement.procurementCaseId === item.id && agreement.status !== "abandoned")).map((procurementCase) => {
                    const opportunity = commercialOpportunities.opportunities.find((item) => item.id === procurementCase.opportunityId);
                    const proposal = opportunity?.latestProposal;
                    if (!proposal) return null;
                    return <div className="surface-soft flex flex-wrap items-center justify-between gap-3 p-4" key={procurementCase.id}><div><div className="font-black">{opportunity?.name}</div><div className="faint text-xs">Procurement approved · no agreement draft</div></div><button className="btn btn-primary" disabled={status === "saving"} onClick={() => command("contract.draft.create", { procurementCaseId: procurementCase.id, billingModel: proposal.purchasePath === "annual_prepaid" ? "annual_prepaid" : proposal.purchasePath === "paid_pilot" ? "milestone" : "monthly_advance", monthlyPrice: proposal.monthlyPrice, implementationFee: proposal.implementationFee, termMonths: proposal.termMonths, paymentTermsDays: procurementCase.purchaseClass === "regulated" ? 90 : procurementCase.purchaseClass === "enterprise" ? 60 : 30, serviceLevel: procurementCase.purchaseClass === "regulated" ? "critical" : "standard" })}>Create version 1</button></div>;
                  })}
                  {contracts.agreements.map((agreement) => {
                    const current = contracts.drafts.find((item) => item.id === agreement.latestDraftId);
                    const organization = customerOrganizations.organizations.find((item) => item.id === agreement.organizationId);
                    const signatory = customerOrganizations.actors.find((item) => item.organizationId === agreement.organizationId && item.authority === "sign");
                    const playerStandard = current?.clauses.find((item) => item.position === "player_standard");
                    return <article className="surface-soft p-4" key={agreement.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-black">{organization?.name}</h3><p className="faint mt-1 text-xs">{agreement.id} · draft v{current?.version} · {current ? `${money(current.terms.monthlyPrice)}/month · ${current.terms.termMonths} months · net ${current.terms.paymentTermsDays}` : "draft missing"}</p></div><SignalPill value={agreement.status} /></div>
                      {agreement.knownBlocker && <p className="muted mt-3 text-sm leading-6">{agreement.knownBlocker}</p>}
                      {current && <div className="mt-3 flex flex-wrap gap-1.5">{current.clauses.map((clause) => <span className="pill" key={clause.kind}>{clause.kind.replaceAll("_", " ")} · {clause.position.replaceAll("_", " ")}</span>)}</div>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {agreement.status === "negotiating" && agreement.knownBlocker && playerStandard && <button className="btn btn-secondary !min-h-9" disabled={status === "saving"} onClick={() => command("contract.clause.propose", { agreementId: agreement.id, clause: playerStandard.kind, position: "balanced" })}>Propose balanced {playerStandard.kind.replaceAll("_", " ")}</button>}
                        {agreement.status === "negotiating" && <button className="btn btn-primary !min-h-9" disabled={status === "saving"} onClick={() => command("contract.approval.request", { agreementId: agreement.id })}>Request counterparty approval</button>}
                        {agreement.status === "approved" && signatory && <button className="btn btn-primary !min-h-9" disabled={status === "saving"} onClick={() => command("contract.sign", { agreementId: agreement.id, signatoryActorId: signatory.id })}>Record signature by {signatory.name}</button>}
                        {["signed_pending_implementation", "acceptance_disputed"].includes(agreement.status) && <button className="btn btn-secondary !min-h-9" disabled={status === "saving" || (agreement.implementationReadyDay ?? Number.MAX_SAFE_INTEGER) > state.kernel.simulationDay || (agreement.lastAcceptanceRequestDay !== null && state.kernel.simulationDay - agreement.lastAcceptanceRequestDay < 7)} onClick={() => command("customer.acceptance.request", { agreementId: agreement.id })}>Request acceptance</button>}
                        {!["active", "abandoned", "terminated"].includes(agreement.status) && <button className="btn btn-secondary !min-h-9" disabled={status === "saving"} onClick={() => command("contract.walk_away", { agreementId: agreement.id, reason: "Commercial process discontinued by founder." })}>Walk away</button>}
                      </div>
                      {agreement.implementationReadyDay !== null && <div className="faint mt-3 text-xs">Implementation readiness day {agreement.implementationReadyDay} · acceptance {agreement.acceptanceDay === null ? "not recorded" : `day ${agreement.acceptanceDay}`} · renewal {agreement.nextRenewalDay === null ? "not set" : `day ${agreement.nextRenewalDay}`}</div>}
                    </article>;
                  })}
                  {!contracts.agreements.length && !procurement.cases.some((item) => item.status === "approved") && <p className="muted text-sm">No agreement draft exists.</p>}
                </div>
              </Panel>
            </Tabs.Content>
          )}
          {causalFinance && credit && (
            <Tabs.Content value="treasury" className="mt-4 space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Cash and receivables" subtitle="Receivables are contractual claims, not cash. Forecasts reflect aging and committed outflows.">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="surface-soft p-3"><div className="faint text-xs">Cash</div><div className="text-2xl font-black">{money(causalFinance.cash)}</div></div>
                    <div className="surface-soft p-3"><div className="faint text-xs">Net AR</div><div className="text-2xl font-black">{money(causalFinance.netAccountsReceivable)}</div></div>
                    <div className="surface-soft p-3"><div className="faint text-xs">90-day base forecast</div><div className="text-2xl font-black">{money(causalFinance.cashForecast.base)}</div></div>
                    <div className="surface-soft p-3"><div className="faint text-xs">Downside forecast</div><div className="text-2xl font-black">{money(causalFinance.cashForecast.downside)}</div></div>
                  </div>
                  <div className="mt-4 grid grid-cols-5 gap-1 text-center text-xs">
                    {Object.entries(causalFinance.arAging).map(([bucket, amount]) => <div className="surface-soft p-2" key={bucket}><div className="faint break-words">{bucket}</div><div className="mt-1 font-bold">{money(amount)}</div></div>)}
                  </div>
                </Panel>
                <Panel title="Credit facilities" subtitle="Diligence, funding and cure actions resolve over time. An unclosed facility is not available cash.">
                  {!credit.facilities.length && credit.lenders[0] && (
                    <button className="btn btn-secondary" disabled={status === "saving"} onClick={() => command("credit.facility.negotiate", { lenderId: credit.lenders[0].id, facilityType: "working_capital", requestedAmount: 5000, maturityDays: 360 })}>
                      Submit $5,000 working-capital request
                    </button>
                  )}
                  <div className="mt-3 space-y-3">
                    {credit.facilities.map((facility) => <article className="surface-soft p-3" key={facility.id}>
                      <div className="flex items-start justify-between gap-2"><div><div className="font-bold">{facility.lenderName}</div><div className="faint text-xs">{facility.type.replaceAll("_", " ")} · principal {money(facility.outstandingPrincipal)}</div></div><SignalPill value={facility.status} /></div>
                      {facility.latestNotice && <p className="muted mt-2 text-xs leading-5">{facility.latestNotice}</p>}
                      <div className="mt-2 space-y-1">{facility.covenants.map((covenant) => <div className="flex items-center justify-between gap-2 text-xs" key={covenant.id}><span className="capitalize">{covenant.kind.replaceAll("_", " ")}</span><SignalPill value={covenant.status} /></div>)}</div>
                      {facility.status === "breached" && <div className="mt-3 flex flex-wrap gap-2">
                        <button className="btn btn-secondary !min-h-9" onClick={() => command("credit.covenant.respond", { facilityId: facility.id, action: "provide_reporting" })}>Provide reporting</button>
                        <button className="btn btn-secondary !min-h-9" onClick={() => command("credit.covenant.respond", { facilityId: facility.id, action: "request_waiver" })}>Request waiver</button>
                        <button className="btn btn-secondary !min-h-9" onClick={() => command("credit.covenant.respond", { facilityId: facility.id, action: "controlled_default" })}>Controlled default</button>
                      </div>}
                    </article>)}
                  </div>
                </Panel>
              </div>
              <Panel title="Invoice subledger" subtitle="Collection actions trade recovery timing against margin, relationship trust and legal exposure.">
                <div className="space-y-2">{causalFinance.invoices.slice().reverse().slice(0, 30).map((invoice) => <div className="surface-soft p-3" key={invoice.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-bold">{invoice.id}</div><div className="faint text-xs">{invoice.accountId} · due day {invoice.dueDay} · open {money(invoice.openBalance)}</div></div><SignalPill value={invoice.status} /></div>
                  {invoice.openBalance > 0 && <div className="mt-2 flex flex-wrap gap-2">
                    <button className="btn btn-secondary !min-h-9" onClick={() => command("treasury.collection.act", { invoiceId: invoice.id, action: "contact_buyer" })}>Contact buyer</button>
                    <button className="btn btn-secondary !min-h-9" onClick={() => command("treasury.collection.act", { invoiceId: invoice.id, action: "request_payment_plan" })}>Payment plan</button>
                    <button className="btn btn-secondary !min-h-9" onClick={() => command("treasury.collection.act", { invoiceId: invoice.id, action: "offer_early_pay_discount", discountPercent: 5 })}>5% early-pay discount</button>
                  </div>}
                </div>)}</div>
              </Panel>
            </Tabs.Content>
          )}
          {customers && (
            <Tabs.Content value="customers" className="mt-4 space-y-4">
              <Panel title="Customer portfolio" subtitle="Budget, trust and payment signals are observations. Exact liquidity and churn thresholds remain hidden.">
                <div className="grid gap-3 lg:grid-cols-2">{customers.accounts.map((account) => <article className="surface-soft p-4" key={account.id}>
                  <div className="flex items-start justify-between gap-2"><div><h3 className="font-black">{account.name}</h3><p className="faint mt-1 text-xs">{account.segment.replaceAll("_", " ")} · {money(account.monthlyPrice)}/month · net {account.paymentTermsDays}</p></div><SignalPill value={account.status} /></div>
                  <div className="mt-3 flex flex-wrap gap-2"><SignalPill value={account.trustSignal} /><SignalPill value={account.budgetSignal} /><SignalPill value={account.paymentSignal} /><SignalPill value={account.valueSignal} /></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn btn-secondary !min-h-9" onClick={() => command("customer.remediation.commit", { accountId: account.id, action: "executive_review" })}>Executive review</button>
                    <button className="btn btn-secondary !min-h-9" onClick={() => command("customer.remediation.commit", { accountId: account.id, action: "recovery_plan" })}>Recovery plan</button>
                    <button className="btn btn-secondary !min-h-9" onClick={() => command("customer.contract.amend", { accountId: account.id, paymentTermsDays: account.paymentTermsDays, serviceLevel: account.serviceLevel, monthlyPrice: account.monthlyPrice })}>Record current terms</button>
                  </div>
                </article>)}</div>
              </Panel>
              <Panel title="Cohort retention"><div className="grid gap-2 md:grid-cols-3">{customers.cohorts.map((cohort) => <div className="surface-soft p-3" key={cohort.id}><div className="font-bold">{cohort.id}</div><div className="faint mt-1 text-xs">Starting {money(cohort.startingRevenue)} · retained {money(cohort.retainedRevenue)}</div></div>)}</div></Panel>
            </Tabs.Content>
          )}
          {delivery && obligations && (
            <Tabs.Content value="delivery" className="mt-4 space-y-4">
              <Panel title="Delivery control" subtitle="Backlog is generated from committed work, role capacity, onboarding maturity, ownership and execution quality.">
                <div className="grid gap-3 lg:grid-cols-2">{delivery.commitments.map((item) => <article className="surface-soft p-4" key={item.id}>
                  <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{item.label}</h3><p className="faint mt-1 text-xs">{item.accountId} · due day {item.dueDay} · {item.requiredHours}h/period</p></div><SignalPill value={item.status} /></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><span className="faint">Backlog</span><div className="font-bold">{item.backlogHours}h</div></div><div><span className="faint">Reliability</span><div><SignalPill value={item.reliabilitySignal} /></div></div><div><span className="faint">Quality</span><div><SignalPill value={item.qualitySignal} /></div></div></div>
                  <div className="mt-3 flex flex-wrap gap-2"><button className="btn btn-secondary !min-h-9" onClick={() => command("delivery.plan.reallocate", { commitmentId: item.id, mode: "protect", capacityHours: 20 })}>Protect 20h</button><button className="btn btn-secondary !min-h-9" onClick={() => command("delivery.plan.reallocate", { commitmentId: item.id, mode: "outsource", capacityHours: 20 })}>Outsource 20h</button><button className="btn btn-secondary !min-h-9" onClick={() => command("delivery.commitment.renegotiate", { commitmentId: item.id, requestedExtensionDays: 14, scopeReductionPercent: 10 })}>Request extension</button></div>
                </article>)}</div>
              </Panel>
              <Panel title="Commercial obligations" subtitle={obligations.disclaimer}><div className="space-y-2">{obligations.obligations.map((item) => <div className="surface-soft flex items-center justify-between gap-3 p-3" key={item.id}><div><div className="font-bold capitalize">{item.kind.replaceAll("_", " ")}</div><div className="faint text-xs">{item.accountId} · remedy {item.remedy.replaceAll("_", " ")} · cure {item.cureDays} days</div></div><SignalPill value={item.status} /></div>)}</div></Panel>
            </Tabs.Content>
          )}
          {commercialCases && (
            <Tabs.Content value="risk-room" className="mt-4 space-y-4">
              <Panel title="Commercial cases" subtitle={commercialCases.disclaimer}>
                <div className="space-y-3">{commercialCases.cases.map((item) => <article className="surface-soft p-4" key={item.id}>
                  <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold capitalize">{item.type.replaceAll("_", " ")}</h3><p className="faint mt-1 text-xs">{item.accountId} · deadline day {item.proceduralDeadlineDay} · insurer {item.insurerStatus.replaceAll("_", " ")}</p></div><div className="flex gap-2"><SignalPill value={item.status} /><SignalPill value={item.severitySignal} /></div></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.status === "notice" && <><button className="btn btn-secondary !min-h-9" onClick={() => command("commercial_case.triage", { caseId: item.id, action: "preserve_evidence" })}>Preserve evidence</button><button className="btn btn-secondary !min-h-9" onClick={() => command("commercial_case.triage", { caseId: item.id, action: "notify_insurer" })}>Notify insurer</button></>}
                    {["notice", "triaged", "claim"].includes(item.status) && <button className="btn btn-secondary !min-h-9" onClick={() => command("commercial_case.investigate", { caseId: item.id, approach: "independent" })}>Independent investigation</button>}
                    {item.status !== "resolved" && <><button className="btn btn-secondary !min-h-9" onClick={() => command("commercial_case.respond", { caseId: item.id, action: "negotiate" })}>Negotiate</button><button className="btn btn-secondary !min-h-9" onClick={() => command("commercial_case.respond", { caseId: item.id, action: "defend" })}>Defend</button></>}
                  </div>
                </article>)}{!commercialCases.cases.length && <p className="muted text-sm">No commercial notice has been received. This does not mean exposure is zero.</p>}</div>
              </Panel>
            </Tabs.Content>
          )}
          {intelligence &&
            competitiveMarket &&
            competitorOrganizations &&
            competitorStrategy && (
              <Tabs.Content value="intelligence" className="mt-4 space-y-4">
                <Panel
                  title="Competitive business world"
                  subtitle="Verified public baselines and fictional-twin operations are separate. Internal budgets, teams, pipeline and strategy remain hidden until the campaign debrief."
                >
                  <div className="rounded-xl border border-sky-300/20 bg-sky-300/7 p-3 text-xs leading-5 text-sky-100">
                    Every firm below is a fictional simulation twin. Simulated moves
                    are not claims about the real companies cited in its public
                    baseline.
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {competitorOrganizations.firms.map((firm) => (
                      <article className="surface-soft p-4" key={firm.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-black">{firm.displayName}</h3>
                            <p className="faint mt-1 text-xs">
                              Synthetic executive: {firm.executiveName} · {firm.archetype.replaceAll("_", " ")}
                            </p>
                          </div>
                          <SignalPill value={firm.lifecycleSignal} />
                        </div>
                        <p className="muted mt-3 text-sm leading-6">
                          {firm.positioning}
                        </p>
                        <div className="faint mt-2 text-xs">
                          Segments: {intelligence.fictionalTwins.find((twin) => twin.id === firm.id)?.targetSegments.join(", ") || "not observed"}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <div>
                            <span className="faint">Headcount estimate</span>
                            <div className="font-bold">
                              {firm.headcountEstimate.low}–{firm.headcountEstimate.high}
                            </div>
                          </div>
                          <div>
                            <span className="faint">Momentum</span>
                            <div><SignalPill value={firm.commercialMomentum} /></div>
                          </div>
                          <div>
                            <span className="faint">Delivery</span>
                            <div><SignalPill value={firm.implementationCapacity} /></div>
                          </div>
                          <div>
                            <span className="faint">Product pace</span>
                            <div><SignalPill value={firm.productPace} /></div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {firm.visibleCapabilities.slice(0, 8).map((capability) => (
                            <span className="pill" key={capability}>{capability.replaceAll("_", " ")}</span>
                          ))}
                        </div>
                        <div className="mt-4 border-t border-white/7 pt-3">
                          <div className="faint text-[11px] font-bold uppercase tracking-wide">
                            Verified public baseline
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {firm.sourceFacts.slice(0, 3).map((fact) => (
                              <a
                                className="text-xs text-sky-300 underline decoration-sky-300/40 underline-offset-4 hover:text-sky-200"
                                href={fact.url}
                                key={fact.id}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {fact.publisher} · {fact.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </Panel>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Panel
                    title="Shared market ecology"
                    subtitle="Accounts, talent, channels, vendors and capital are finite and clear on a common market clock."
                  >
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(competitiveMarket.availability).map(
                        ([resource, signal]) => (
                          <div className="surface-soft min-w-28 p-3" key={resource}>
                            <div className="faint text-xs capitalize">{resource}</div>
                            <div className="mt-1"><SignalPill value={signal} /></div>
                          </div>
                        ),
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      {competitiveMarket.opportunities
                        .filter((item) => item.status !== "open")
                        .slice(-8)
                        .map((opportunity) => (
                          <div className="surface-soft flex items-center justify-between gap-3 p-3" key={opportunity.id}>
                            <div>
                              <div className="font-bold capitalize">{opportunity.segmentId.replaceAll("_", " ")}</div>
                              <div className="faint text-xs">
                                {opportunity.budgetBand} budget · {opportunity.switchingFriction} switching friction · {opportunity.considerationSetSize} suppliers considered
                              </div>
                            </div>
                            <SignalPill value={opportunity.status} />
                          </div>
                        ))}
                      {!competitiveMarket.opportunities.some((item) => item.status !== "open") && (
                        <p className="muted text-sm">No publicly observable contested opportunity yet.</p>
                      )}
                    </div>
                  </Panel>
                  <Panel
                    title="Observed plan history"
                    subtitle="These are delayed simulated observations, not the competitor's exact plan or resource commitment."
                  >
                    <div className="space-y-2">
                      {competitorStrategy.recentPlans.slice().reverse().slice(0, 10).map((plan) => (
                        <div className="surface-soft p-3" key={plan.planningCycleId}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold">{plan.firmId}</span>
                            <span className="pill">simulated move · day {plan.committedDay}</span>
                          </div>
                          <p className="muted mt-2 text-sm leading-6">{plan.publicRationale}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {plan.initiativeKinds.map((kind) => <span className="pill" key={kind}>{kind.replaceAll("_", " ")}</span>)}
                          </div>
                        </div>
                      ))}
                      {!competitorStrategy.recentPlans.length && (
                        <p className="muted text-sm">No board-cycle strategy is publicly observable yet.</p>
                      )}
                    </div>
                  </Panel>
                </div>
                {intelligence.supplementalFacts.length > 0 && (
                  <Panel
                    title="Latest verified dossier update"
                    subtitle={`Applied at simulation day ${intelligence.lastUpdatedDay}. New facts update founder-visible signals and never rewrite a fictional firm's synthetic history.`}
                  >
                    <div className="grid gap-2 md:grid-cols-2">
                      {intelligence.supplementalFacts.slice().reverse().slice(0, 12).map((fact) => (
                        <article className="surface-soft p-3" key={fact.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="pill">verified public fact</span>
                            <span className="faint text-xs">{fact.observedAt.slice(0, 10)}</span>
                          </div>
                          <p className="muted mt-2 text-sm leading-6">{fact.statement}</p>
                          <a
                            className="mt-2 inline-block text-xs text-sky-300 underline decoration-sky-300/40 underline-offset-4"
                            href={fact.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {fact.publisher} · {fact.title}
                          </a>
                        </article>
                      ))}
                    </div>
                  </Panel>
                )}
                <Panel
                  title="Signal tape"
                  subtitle="Provenance is explicit: verified public fact, founder-visible simulated observation, or simulated move."
                >
                  <div className="grid gap-2 md:grid-cols-2">
                    {[...competitiveMarket.signals, ...competitorOrganizations.signals]
                      .sort((left, right) => right.day - left.day)
                      .slice(0, 20)
                      .map((signal) => (
                        <div className="surface-soft p-3" key={signal.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="pill">{signal.provenance.replaceAll("_", " ")}</span>
                            <span className="faint text-xs">day {signal.day}</span>
                          </div>
                          <p className="muted mt-2 text-sm leading-6">{signal.summary}</p>
                        </div>
                      ))}
                  </div>
                </Panel>
              </Tabs.Content>
            )}
          <Tabs.Content value="cases" className="mt-4 space-y-4">
            <Panel
              title="Procedural environment"
              subtitle={jurisdiction.disclaimer}
            >
              <div className="flex flex-wrap gap-2">
                <span className="pill">{jurisdiction.label}</span>
                {jurisdiction.knownProcedures.map((procedure) => (
                  <span className="pill" key={procedure}>
                    {procedure}
                  </span>
                ))}
              </div>
            </Panel>
            <Panel
              title="Case chronology"
              subtitle="Allegation, evidence and finding are separate records. Response families below are available actions, not recommendations."
            >
              <div className="space-y-3">
                {cases.cases
                  .slice()
                  .reverse()
                  .map((item) => (
                    <article className="surface-soft p-4" key={item.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold">
                            {item.type.replaceAll("_", " ")}
                          </h3>
                          <p className="faint mt-1 text-xs">
                            {item.id} · subject {item.subjectEmployeeId} ·
                            deadline day {item.proceduralDeadlineDay}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <SignalPill value={item.status} />
                          <SignalPill value={item.severitySignal} />
                        </div>
                      </div>
                      <p className="muted mt-3 text-sm leading-6">
                        {item.allegation}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.status === "reported" && (
                          <>
                            <button
                              className="btn btn-secondary !min-h-9"
                              onClick={() =>
                                command("employment_case.triage", {
                                  caseId: item.id,
                                  action: "preserve_evidence",
                                })
                              }
                            >
                              Preserve evidence
                            </button>
                            <button
                              className="btn btn-secondary !min-h-9"
                              onClick={() =>
                                command("employment_case.triage", {
                                  caseId: item.id,
                                  action: "limit_access",
                                })
                              }
                            >
                              Limit access
                            </button>
                            <button
                              className="btn btn-secondary !min-h-9"
                              onClick={() =>
                                command("employment_case.triage", {
                                  caseId: item.id,
                                  action: "interim_leave",
                                })
                              }
                            >
                              Interim leave
                            </button>
                            <button
                              className="btn btn-secondary !min-h-9"
                              onClick={() =>
                                command("employment_case.triage", {
                                  caseId: item.id,
                                  action: "monitor",
                                })
                              }
                            >
                              Monitor
                            </button>
                          </>
                        )}
                        {["reported", "triaged"].includes(item.status) && (
                          <>
                            <button
                              className="btn btn-secondary !min-h-9"
                              onClick={() =>
                                command("employment_case.investigate", {
                                  caseId: item.id,
                                  approach: "internal",
                                })
                              }
                            >
                              Internal investigation
                            </button>
                            <button
                              className="btn btn-secondary !min-h-9"
                              onClick={() =>
                                command("employment_case.investigate", {
                                  caseId: item.id,
                                  approach: "independent",
                                })
                              }
                            >
                              Independent investigation
                            </button>
                            <button
                              className="btn btn-secondary !min-h-9"
                              onClick={() =>
                                command("employment_case.investigate", {
                                  caseId: item.id,
                                  approach: "mediation",
                                })
                              }
                            >
                              Mediation
                            </button>
                          </>
                        )}
                        {["finding_ready", "claim"].includes(item.status) &&
                          [
                            "no_action",
                            "coaching",
                            "warning",
                            "reassign",
                            "terminate",
                            "settle",
                            "defend",
                            "notify",
                          ].map((action) => (
                            <button
                              className="btn btn-secondary !min-h-9"
                              key={action}
                              onClick={() =>
                                command("employment_case.respond", {
                                  caseId: item.id,
                                  action,
                                })
                              }
                            >
                              {action.replaceAll("_", " ")}
                            </button>
                          ))}
                      </div>
                      <div className="mt-3 space-y-1">
                        {item.knownEvidence.map((evidence) => (
                          <div className="faint text-xs" key={evidence}>
                            • {evidence}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                {!cases.cases.length && (
                  <p className="muted text-sm">
                    No allegation or case signal is currently recorded.
                  </p>
                )}
              </div>
            </Panel>
          </Tabs.Content>
        </Tabs.Root>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#071019]/95 p-3 backdrop-blur">
        <div className="container-page flex items-center justify-between gap-3">
          <div className="hidden sm:block">
            <div className="text-sm font-bold">
              Advance to the next material event
            </div>
            <div className="faint text-xs">
              Scheduled effects and period close remain deterministic.
            </div>
          </div>
          <button
            className="btn btn-primary ml-auto"
            disabled={
              status === "saving" ||
              pendingTurns.length > 0 ||
              state.kernel.status !== "active"
            }
            onClick={() =>
              command("operations.advance_to_next_material_event", {
                horizonDays: 90,
              })
            }
          >
            {status === "saving" ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <Banknote size={16} />
            )}
            Advance
          </button>
        </div>
      </div>
    </div>
  );
}
