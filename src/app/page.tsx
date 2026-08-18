import Link from "next/link";
import { ArrowRight, BrainCircuit, Cloud, History, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public-nav";

const features = [
  { icon: BrainCircuit, title: "Decisions, not busywork", copy: "Diagnose root causes, collect falsifiable evidence, and commit under real cash and attention constraints." },
  { icon: Cloud, title: "Cloud-backed runs", copy: "Every accepted command is saved with deterministic state, version checks, and safe retries." },
  { icon: History, title: "Causal history", copy: "See what changed, why it changed, and fork from checkpoints without rewriting the original timeline." },
  { icon: ShieldCheck, title: "Private by construction", copy: "Anonymous sessions use recovery credentials. Your email is contact metadata, never an account lookup key." },
];

export default function HomePage() {
  return <><PublicNav /><main>
    <section className="container-page grid min-h-[72vh] items-center gap-12 py-20 lg:grid-cols-[1.1fr_.9fr]">
      <div>
        <div className="eyebrow mb-5">Production beta · $500 zero-to-one</div>
        <h1 className="title-balance max-w-4xl text-5xl font-black tracking-[-.055em] sm:text-6xl lg:text-7xl">Build the judgment to survive startup reality.</h1>
        <p className="muted mt-7 max-w-2xl text-lg leading-8">A problem-first simulation where cash, evidence, stakeholder trust, founder energy, and time interact. There is no perfect playbook—only decisions with consequences.</p>
        <div className="mt-9 flex flex-wrap gap-3"><Link href="/start" className="btn btn-primary">Create a run <ArrowRight size={16} /></Link><Link href="/scenarios" className="btn btn-secondary">Explore scenarios</Link></div>
        <p className="faint mt-4 text-xs">No password. Name and email only. Save your recovery code.</p>
      </div>
      <div className="surface relative overflow-hidden p-5 sm:p-7">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-emerald-300/8 blur-3xl" />
        <div className="flex items-center justify-between"><span className="pill pill-good">Day 12 · active</span><span className="text-xs text-slate-500">Cloud saved</span></div>
        <div className="metric-grid mt-5 !grid-cols-2">
          {[['Company cash','$327','-$173 committed'],['Problem evidence','26 / 100','3 contradictory signals'],['Attention load','1.28×','Execution quality falling'],['Personal runway','1.7 mo','Income bridge unresolved']].map(([label,value,note])=><div className="metric-card" key={label}><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>)}
        </div>
        <div className="surface-soft mt-4 p-4"><div className="flex justify-between gap-3"><div><div className="text-sm font-bold">The ICP is still a collection of guesses</div><div className="muted mt-1 text-xs leading-5">Deadline in 2 days · severity 4/5</div></div><span className="pill pill-bad">Critical</span></div><button className="btn btn-primary mt-4 w-full">Commit a research test</button></div>
      </div>
    </section>
    <section className="container-page grid gap-4 pb-24 md:grid-cols-2 lg:grid-cols-4">{features.map(({icon:Icon,title,copy})=><article className="surface p-5" key={title}><Icon className="text-emerald-300" size={22}/><h2 className="mt-5 font-bold">{title}</h2><p className="muted mt-2 text-sm leading-6">{copy}</p></article>)}</section>
  </main></>;
}
