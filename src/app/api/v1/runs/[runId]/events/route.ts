import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId } = await context.params; const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor"); const limit = url.searchParams.get("limit");
    const store=await getStore();const v10=await store.getV10Run(user.id,runId);if(v10){return NextResponse.json(await store.listV10Events(user.id,runId,{featureId:url.searchParams.get("type")??undefined,cursor:cursor?Number(cursor):undefined,limit:limit?Number(limit):undefined}));}
    const result = await store.listEvents(user.id, runId, {
      category: url.searchParams.get("type") ?? undefined, cursor: cursor ? Number(cursor) : undefined, limit: limit ? Number(limit) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
