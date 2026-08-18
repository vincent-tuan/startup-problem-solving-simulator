import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse, HttpError } from "@/server/http";
import { getStore } from "@/server/store";
import { projectRun } from "@/server/store/projection";

const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request); const user = await requireRequestUser(request);
    const declared = Number(request.headers.get("content-length") ?? 0); if (declared > MAX_BYTES) throw new HttpError(413, "LEGACY_SAVE_TOO_LARGE");
    const raw = await request.text(); if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) throw new HttpError(413, "LEGACY_SAVE_TOO_LARGE");
    let payload: unknown; try { payload = JSON.parse(raw); } catch { throw new HttpError(400, "INVALID_JSON"); }
    const result = await (await getStore()).importLegacy(user.id, payload, new Date());
    return NextResponse.json({ ...result, run: projectRun(result.run) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
