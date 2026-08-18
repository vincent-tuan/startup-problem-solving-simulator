import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { HistoryView } from "@/components/history-view";
import { currentUser } from "@/server/auth/session";
import { getStore } from "@/server/store";

export const dynamic="force-dynamic";
export default async function RunHistoryPage({params}:{params:Promise<{runId:string}>}){const user=await currentUser();if(!user)redirect("/start");const {runId}=await params;const store=await getStore();const run=await store.getRun(user.id,runId);if(!run)notFound();const [{events},checkpoints]=await Promise.all([store.listEvents(user.id,runId,{limit:100}),store.listCheckpoints(user.id,runId)]);return <div className="container-page py-8"><Link href={`/runs/${runId}`} className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300"><ArrowLeft size={15}/>Back to simulation</Link><header className="mt-6"><div className="eyebrow">Event history</div><h1 className="mt-2 text-3xl font-black tracking-tight">{run.title}</h1><p className="muted mt-2 text-sm">{events.length} recent events · {checkpoints.length} checkpoints · checksum {run.checksum.slice(0,12)}</p></header><div className="mt-7"><HistoryView runId={runId} initialEvents={events} initialCheckpoints={checkpoints}/></div></div>}
