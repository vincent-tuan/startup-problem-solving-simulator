"use client";
import { FileUp, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, useRef, useState } from "react";

export function LegacyImport() {
  const input=useRef<HTMLInputElement>(null);const router=useRouter();const [status,setStatus]=useState("");const [pending,setPending]=useState(false);
  async function upload(event: ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value="";if(!file)return;if(file.size>2*1024*1024){setStatus("The save exceeds the 2 MB import limit.");return;}setPending(true);setStatus("Validating v6 save…");const raw=await file.text();const response=await fetch("/api/v1/import/v6",{method:"POST",headers:{"content-type":"application/json"},body:raw});const body=await response.json();setPending(false);if(!response.ok){setStatus(`Import failed: ${body.error}`);return;}setStatus(`Imported ${body.importedEvents} historical events.`);router.push(`/runs/${body.run.id}`);router.refresh();}
  return <div className="surface-soft flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold">Continue a simulator v6 save</h3><p className="muted mt-1 text-sm">Export JSON from the legacy HTML, then upload it here. The source file remains untouched.</p>{status&&<p className="mt-2 text-xs text-amber-200" role="status">{status}</p>}</div><input ref={input} className="hidden" type="file" accept="application/json" onChange={upload}/><button className="btn btn-secondary shrink-0" disabled={pending} onClick={()=>input.current?.click()}>{pending?<LoaderCircle className="animate-spin" size={16}/>:<FileUp size={16}/>} Import v6 JSON</button></div>;
}
