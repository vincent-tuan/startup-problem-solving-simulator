import "server-only";
import type { ClientRunRecord, RunRecord } from "./types";
import { projectVersionedState } from "./versioning";

export function projectRun(run: RunRecord): ClientRunRecord {
  return { ...run, state: projectVersionedState(run.state) };
}
