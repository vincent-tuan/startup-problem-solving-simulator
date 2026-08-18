import { notFound, redirect } from "next/navigation";
import { RunWorkspace } from "@/components/run-workspace";
import { currentUser } from "@/server/auth/session";
import { getStore } from "@/server/store";
import { projectRun } from "@/server/store/projection";

export const dynamic="force-dynamic";
export default async function RunPage({params}:{params:Promise<{runId:string}>}){const user=await currentUser();if(!user)redirect("/start");const {runId}=await params;const run=await (await getStore()).getRun(user.id,runId);if(!run)notFound();return <RunWorkspace initialRun={projectRun(run)}/>}
