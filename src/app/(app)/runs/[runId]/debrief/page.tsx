import Link from "next/link";
import { ArrowLeft, CheckCircle2, GitFork, Lightbulb, ShieldAlert } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { getStore } from "@/server/store";
import { number, money } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function DebriefPage({ params }: { params: Promise<{ runId: string }> }) {
  const user = await currentUser(); if (!user) redirect("/start");
  const { runId } = await params; const store = await getStore(); const run = await store.getRun(user.id, runId); if (!run) notFound();
  if (run.status === "active") redirect(`/runs/${runId}`);
  const report = await store.buildDebrief(user.id, runId);
  return <div className="container-page py-8 sm:py-12">
    <Link href={`/runs/${runId}`} className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300"><ArrowLeft size={15} />Back to simulation</Link>
    <header className="mt-6 max-w-4xl"><div className="eyebrow">Causal debrief · {report.endingCode.replaceAll("_", " ")}</div><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{run.title}</h1><p className="muted mt-4 text-base leading-7">{report.endingReason}</p><div className="mt-4 flex flex-wrap gap-2"><span className="pill">Day {report.daysElapsed}</span><span className="pill capitalize">{report.stageReached}</span><span className="pill">Engine {run.engineVersion}</span><span className="pill">Checksum {run.checksum.slice(0, 12)}</span></div></header>
    <section className="metric-grid mt-8">{Object.entries(report.scores).map(([key, value]) => <div className="metric-card" key={key}><div className="metric-label">{key.replaceAll(/([A-Z])/g, " $1")}</div><div className="metric-value">{number(value)}/100</div></div>)}</section>
    <div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="surface p-5"><div className="flex items-center gap-2"><CheckCircle2 className="text-emerald-300" size={18} /><h2 className="font-black">Strengths preserved</h2></div><div className="mt-4 space-y-2">{report.strengths.length ? report.strengths.map((item) => <div className="surface-soft p-3 text-sm" key={item}>{item}</div>) : <p className="muted text-sm">No durable operating strength crossed the debrief threshold.</p>}</div></section><section className="surface p-5"><div className="flex items-center gap-2"><ShieldAlert className="text-amber-300" size={18} /><h2 className="font-black">Missed signals</h2></div><div className="mt-4 space-y-2">{report.missedSignals.length ? report.missedSignals.map((item) => <div className="surface-soft p-3 text-sm" key={item}>{item}</div>) : <p className="muted text-sm">No major ignored signal was detected.</p>}</div></section></div>
    <section className="surface mt-5 p-5"><div className="flex items-center gap-2"><Lightbulb className="text-sky-300" size={18} /><h2 className="font-black">Counterfactual opportunities</h2></div><p className="muted mt-2 text-xs">These are plausible alternatives derived from the final state, not claims that one choice guaranteed success.</p><div className="mt-4 grid gap-3 md:grid-cols-3">{report.counterfactuals.map((item) => <div className="surface-soft p-4 text-sm leading-6" key={item}>{item}</div>)}</div></section>
    <section className="surface mt-5 p-5"><h2 className="font-black">Hidden market truth revealed</h2><p className="muted mt-2 text-xs">Ground truth was never included in the client state during play.</p><div className="mt-4 grid gap-3 md:grid-cols-3">{report.hiddenTruth.map((truth) => <div className="surface-soft p-4" key={truth.segment}><div className="font-bold">{truth.segment}</div><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between"><dt className="muted">Underlying fit</dt><dd>{number(truth.fit)}/100</dd></div><div className="flex justify-between"><dt className="muted">Actual WTP</dt><dd>{money(truth.actualWtp)}</dd></div><div className="flex justify-between"><dt className="muted">Churn risk</dt><dd>{number(truth.churnRisk)}%</dd></div></dl></div>)}</div></section>
    <section className="surface mt-5 p-5"><h2 className="font-black">Causal chain</h2><div className="mt-4 space-y-2">{report.causalChain.map((item, index) => <div className="surface-soft flex gap-4 p-3" key={`${item.day}:${index}`}><span className="pill shrink-0">Day {item.day}</span><div><div className="text-sm font-bold">{item.summary}</div><div className="faint mt-1 text-xs">{item.eventType.replaceAll("_", " ")}</div></div></div>)}</div></section>
    <div className="mt-6 flex flex-wrap gap-3"><Link href={`/runs/${runId}/history`} className="btn btn-secondary"><GitFork size={15} />Fork from a checkpoint</Link><Link href="/scenarios" className="btn btn-primary">Start another campaign</Link></div>
  </div>;
}
