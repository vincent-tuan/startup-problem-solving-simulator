import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

const viewSchema=z.enum(["map","firms","signals","moves"]);

export async function GET(request:NextRequest,context:{params:Promise<{runId:string}>}){
  try{
    const user=await requireRequestUser(request);const {runId}=await context.params;const view=viewSchema.parse(request.nextUrl.searchParams.get("view")??"map");
    const run=await (await getStore()).getV10Run(user.id,runId);if(!run)throw new Error("RUN_NOT_FOUND");
    const organizations=run.state.features["competitor-organizations"]?.public as {firms?:unknown;signals?:unknown}|undefined;
    const market=run.state.features["competitive-market"]?.public as {opportunities?:unknown;availability?:unknown;signals?:unknown}|undefined;
    const strategy=run.state.features["competitor-strategy"]?.public as {recentPlans?:unknown;pendingTurn?:unknown}|undefined;
    if(!organizations||!market||!strategy)throw new Error("COMPETITIVE_WORLD_NOT_ENABLED");
    const payload=view==="firms"?{firms:organizations.firms}:view==="signals"?{signals:organizations.signals,marketSignals:market.signals}:view==="moves"?{plans:strategy.recentPlans,pendingTurn:strategy.pendingTurn}:{firms:organizations.firms,opportunities:market.opportunities,availability:market.availability};
    return NextResponse.json({view,...payload});
  }catch(error){return errorResponse(error);}
}
