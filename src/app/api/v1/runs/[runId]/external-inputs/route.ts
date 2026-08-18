import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId } = await context.params;
    return NextResponse.json({ inputs: await (await getStore()).listExternalInputs(user.id, runId) });
  } catch (error) { return errorResponse(error); }
}
