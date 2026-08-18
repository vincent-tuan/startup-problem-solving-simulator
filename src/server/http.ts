import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message = code) {
    super(message);
  }
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) throw new HttpError(403, "ORIGIN_REJECTED");
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: "VALIDATION_ERROR", issues: error.issues }, { status: 400 });
  if (error instanceof Error) {
    const known: Record<string, number> = {
      RUN_NOT_FOUND: 404, SCENARIO_NOT_FOUND: 404, CHECKPOINT_NOT_FOUND: 404,
      UNAUTHORIZED: 401, VERSION_CONFLICT: 409, DUPLICATE_ID_CONFLICT: 409,
      RUN_NOT_ACTIVE: 409, EVENT_DECISION_REQUIRED: 409, INSUFFICIENT_COMPANY_CASH: 422,
      AGENT_TURN_PENDING: 409, COMPETITOR_MOVE_ALREADY_ANSWERED: 409,
      DEBRIEF_NOT_AVAILABLE: 409, DIALOGUE_INTERACTION_NOT_AVAILABLE: 409, DIALOGUE_ACTOR_NOT_FOUND: 404,
      DIALOGUE_ENGINE_UNSUPPORTED: 409,
      DIALOGUE_BUDGET_EXCEEDED: 429,
      AI_INPUT_REJECTED: 422, ACCOUNT_NOT_ACTIONABLE: 422, ACCOUNT_FOLLOWUP_PENDING: 409,
      ACCOUNT_NOT_IN_NEGOTIATION: 422, SEGMENT_NOT_FOUND: 404, CAPABILITY_NOT_AVAILABLE: 422,
      OBLIGATION_NOT_FOUND: 404, INCIDENT_NOT_FOUND: 404, INSUFFICIENT_PERSONAL_CASH: 422,
      NO_RECEIVABLE_TO_COLLECT: 422, HIRING_BUDGET_TOO_LOW: 422,
      INVALID_RECOVERY_CODE: 401, RATE_LIMITED: 429, DATABASE_URL_REQUIRED: 503,
    };
    const status = known[error.message] ?? 400;
    if (status >= 500) console.error(JSON.stringify({ level: "error", code: error.message }));
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
