import { notFound, redirect } from "next/navigation";
import { RunWorkspace } from "@/components/run-workspace";
import { V10WorkforceWorkspace } from "@/components/v10-workforce-workspace";
import { currentUser } from "@/server/auth/session";
import { getStore } from "@/server/store";
import { projectRun, projectV10Run } from "@/server/store/projection";

export const dynamic="force-dynamic";
export default async function RunPage({params}:{params:Promise<{runId:string}>}){const user=await currentUser();if(!user)redirect("/start");const {runId}=await params;const store=await getStore();const v10=await store.getV10Run(user.id,runId);if(v10)return <V10WorkforceWorkspace initialRun={projectV10Run(v10)}/>;const run=await store.getRun(user.id,runId);if(!run)notFound();return <RunWorkspace initialRun={projectRun(run)}/>}
