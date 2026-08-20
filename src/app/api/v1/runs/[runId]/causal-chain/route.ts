import { NextRequest, NextResponse } from "next/server";
import type { PublicHistoryEventV10 } from "@sim/engine";
import { requireRequestUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { getStore } from "@/server/store";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireRequestUser(request); const { runId } = await context.params;
    const eventId = request.nextUrl.searchParams.get("eventId");
    if (!eventId || eventId.length > 240) throw new Error("CAUSAL_EVENT_ID_REQUIRED");
    const store = await getStore();
    if (!await store.getV10Run(user.id, runId)) throw new Error("RUN_NOT_FOUND");
    const all: PublicHistoryEventV10[] = [];
    let cursor: number | undefined;
    for (let page = 0; page < 40; page += 1) {
      const result = await store.listV10Events(user.id, runId, { cursor, limit: 100 });
      all.push(...result.events);
      if (result.nextCursor === null) break;
      cursor = result.nextCursor;
    }
    const aliases = new Map<string, PublicHistoryEventV10>();
    for (const event of all) {
      aliases.set(event.id, event);
      aliases.set(event.id.startsWith(`${runId}:`) ? event.id.slice(runId.length + 1) : `${runId}:${event.id}`, event);
    }
    const start = aliases.get(eventId);
    if (!start) throw new Error("CAUSAL_EVENT_NOT_FOUND");
    const visible = new Map<string, PublicHistoryEventV10>();
    const queue = [start];
    while (queue.length && visible.size < 120) {
      const event = queue.shift()!;
      if (visible.has(event.id)) continue;
      visible.set(event.id, event);
      for (const parentId of event.causality?.parentEventIds ?? []) {
        const parent = aliases.get(parentId) ?? aliases.get(`${runId}:${parentId}`);
        if (parent) queue.push(parent);
      }
    }
    return NextResponse.json({ runId, eventId: start.id, events: [...visible.values()].sort((left, right) => left.sequence - right.sequence), incomplete: queue.length > 0 });
  } catch (error) { return errorResponse(error); }
}
