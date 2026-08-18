import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import type { ScenarioDefinition } from "@sim/engine";

export function ScenarioCard({ scenario }: { scenario: ScenarioDefinition }) {
  return <article className="surface group flex h-full flex-col p-5 transition hover:-translate-y-1 hover:border-emerald-300/35">
    <div className="flex items-start justify-between gap-3"><span className="pill pill-good">{scenario.difficultyLabel}</span><span className="muted flex items-center gap-1 text-xs"><Clock3 size={13}/>{scenario.estimatedMinutes} min</span></div>
    <h2 className="mt-5 text-xl font-extrabold tracking-tight">{scenario.title}</h2><p className="mt-2 text-sm font-semibold text-slate-300">{scenario.subtitle}</p><p className="muted mt-3 flex-1 text-sm leading-6">{scenario.description}</p>
    <div className="mt-5 flex flex-wrap gap-1.5">{scenario.tags.slice(0,4).map(tag=><span key={tag} className="pill">{tag}</span>)}</div>
    <Link href={`/scenarios/${scenario.slug}`} className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-emerald-300">Open scenario <ArrowUpRight size={15}/></Link>
  </article>;
}
