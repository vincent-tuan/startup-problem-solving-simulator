"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { Check, Copy, KeyRound, LoaderCircle, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Result = { recoveryCode?: string; error?: string };

export function StartForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>({});
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setResult({});
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/session/anonymous", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: data.get("name"), email: data.get("email") }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) setResult({ error: body.error ?? "Could not create the session." }); else setResult({ recoveryCode: body.recoveryCode });
  }

  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setResult({}); setSaved(false);
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/session/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recoveryCode: data.get("recoveryCode") }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) setResult({ error: body.error === "INVALID_RECOVERY_CODE" ? "That recovery code is invalid or has already been used." : body.error });
    else setResult({ recoveryCode: body.recoveryCode });
  }

  if (result.recoveryCode) return <div className="surface p-6 sm:p-8">
    <div className="grid size-12 place-items-center rounded-2xl bg-emerald-300/12 text-emerald-300"><KeyRound /></div>
    <h1 className="mt-5 text-2xl font-black tracking-tight">Save your new recovery code</h1>
    <p className="muted mt-2 text-sm leading-6">It is shown once. Email cannot recover this account. A successful cross-device recovery rotates the code and signs out prior sessions.</p>
    <div className="mt-5 flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/7 p-3 font-mono text-xs text-amber-100 sm:text-sm"><code className="min-w-0 flex-1 break-all">{result.recoveryCode}</code><button className="btn btn-secondary !min-h-9 !px-3" aria-label="Copy recovery code" onClick={async()=>{await navigator.clipboard.writeText(result.recoveryCode!);setCopied(true)}}>{copied?<Check size={15}/>:<Copy size={15}/>}</button></div>
    <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm"><input className="mt-1 accent-emerald-400" type="checkbox" checked={saved} onChange={(event)=>setSaved(event.target.checked)}/><span>I saved this code somewhere private. I understand that losing both this browser session and the code makes the account unrecoverable.</span></label>
    <button disabled={!saved} className="btn btn-primary mt-6 w-full" onClick={()=>{router.push("/scenarios");router.refresh()}}>Continue to scenarios</button>
  </div>;

  return <Tabs.Root defaultValue="new" className="surface p-2">
    <Tabs.List className="grid grid-cols-2 rounded-xl bg-black/20 p-1" aria-label="Session access">
      <Tabs.Trigger value="new" className="rounded-lg px-3 py-2.5 text-sm font-bold text-slate-400 data-[state=active]:bg-slate-700/70 data-[state=active]:text-white">New simulation</Tabs.Trigger>
      <Tabs.Trigger value="recover" className="rounded-lg px-3 py-2.5 text-sm font-bold text-slate-400 data-[state=active]:bg-slate-700/70 data-[state=active]:text-white">Recover account</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="new" className="p-4 sm:p-6">
      <div className="eyebrow">Anonymous cloud account</div><h1 className="mt-3 text-3xl font-black tracking-tight">Start without a password.</h1>
      <p className="muted mt-2 text-sm leading-6">Your email is contact metadata only. It is never used to find or recover your saves.</p>
      <form onSubmit={submitAccount} className="mt-6 space-y-4">
        <div><label className="label" htmlFor="name">Display name</label><input required minLength={2} maxLength={60} className="input" id="name" name="name" autoComplete="name" placeholder="Alex Morgan"/></div>
        <div><label className="label" htmlFor="email">Contact email</label><input required className="input" id="email" name="email" type="email" autoComplete="email" placeholder="alex@example.com"/><p className="faint mt-2 text-xs">Not verified and never an access credential.</p></div>
        <button className="btn btn-primary w-full" disabled={pending}>{pending?<LoaderCircle className="animate-spin" size={16}/>:<KeyRound size={16}/>} Create secure session</button>
      </form>
    </Tabs.Content>
    <Tabs.Content value="recover" className="p-4 sm:p-6">
      <div className="eyebrow">Cross-device access</div><h2 className="mt-3 text-3xl font-black tracking-tight">Use your recovery code.</h2>
      <p className="muted mt-2 text-sm leading-6">The old code is consumed after recovery. You will receive a replacement to save.</p>
      <form onSubmit={submitRecovery} className="mt-6 space-y-4"><div><label className="label" htmlFor="recoveryCode">Recovery code</label><textarea required className="input min-h-24 resize-none font-mono text-xs" id="recoveryCode" name="recoveryCode" placeholder="ssr.lookup.secret"/></div><button className="btn btn-primary w-full" disabled={pending}>{pending?<LoaderCircle className="animate-spin" size={16}/>:<KeyRound size={16}/>} Recover and rotate</button></form>
    </Tabs.Content>
    {result.error&&<div role="alert" className="mx-4 mb-4 flex gap-2 rounded-xl border border-red-400/25 bg-red-400/8 p-3 text-sm text-red-200 sm:mx-6"><ShieldAlert className="mt-0.5 shrink-0" size={17}/>{result.error}</div>}
  </Tabs.Root>;
}
