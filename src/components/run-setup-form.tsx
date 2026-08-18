"use client";
import { LoaderCircle, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function RunSetupForm({ scenarioSlug, authenticated }: { scenarioSlug: string; authenticated: boolean }) {
  const router = useRouter(); const [pending,setPending]=useState(false); const [error,setError]=useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!authenticated) { router.push("/start"); return; }
    setPending(true);setError("");const data=new FormData(event.currentTarget);
    const response=await fetch("/api/v1/runs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({scenarioSlug,setup:{companyName:data.get("companyName"),founderArchetype:data.get("founderArchetype"),difficulty:data.get("difficulty"),personalRunway:data.get("personalRunway")}})});
    const body=await response.json();setPending(false);if(!response.ok){setError(body.error??"Could not start the run.");return;}router.push(`/runs/${body.run.id}`);router.refresh();
  }
  return <form onSubmit={submit} className="surface p-5 sm:p-6"><h2 className="text-xl font-black">Configure your founder</h2><p className="muted mt-2 text-sm">The market and starting thesis are fixed by this scenario version.</p><div className="mt-5 space-y-4"><div><label className="label" htmlFor="companyName">Startup name</label><input className="input" required minLength={2} maxLength={42} id="companyName" name="companyName" defaultValue="Tiny Orbit"/></div><div><label className="label" htmlFor="founderArchetype">Founder archetype</label><select className="input" id="founderArchetype" name="founderArchetype" defaultValue="builder"><option value="builder">Technical builder</option><option value="seller">Sales-led founder</option><option value="expert">Domain expert</option><option value="community">Community-led maker</option></select></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="label" htmlFor="difficulty">Difficulty</label><select className="input" id="difficulty" name="difficulty" defaultValue="realistic"><option value="guided">Guided</option><option value="realistic">Realistic</option><option value="brutal">Brutal</option></select></div><div><label className="label" htmlFor="personalRunway">Personal runway</label><select className="input" id="personalRunway" name="personalRunway" defaultValue="standard"><option value="pressure">Pressure</option><option value="standard">Standard</option><option value="stable">Stable buffer</option></select></div></div></div>{error&&<p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}<button className="btn btn-primary mt-6 w-full" disabled={pending}>{pending?<LoaderCircle className="animate-spin" size={16}/>:<Play size={16}/>} {authenticated?"Start scenario":"Create a session to play"}</button></form>;
}
