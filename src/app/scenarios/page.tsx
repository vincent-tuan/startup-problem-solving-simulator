import { PublicNav } from "@/components/public-nav";
import { ScenarioCard } from "@/components/scenario-card";
import { publicScenarios } from "@/content/scenarios";

export const metadata = { title: "Scenarios" };
export default function ScenariosPage() {
  return <><PublicNav/><main className="container-page py-16"><div className="max-w-3xl"><div className="eyebrow">Curated simulations</div><h1 className="title-balance mt-4 text-4xl font-black tracking-[-.045em] sm:text-5xl">Choose the constraint system, not an answer key.</h1><p className="muted mt-5 text-lg leading-8">Every published scenario is immutable and versioned. Founder profile, difficulty, and personal runway change the path without rewriting its market reality.</p></div><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{publicScenarios.map(scenario=><ScenarioCard key={scenario.id} scenario={scenario}/>)}</div></main></>;
}
