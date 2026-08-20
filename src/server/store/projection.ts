import "server-only";
import { projectSimulationStateV10 } from "@sim/engine";
import type { ClientRunRecord, ClientV10RunRecord, RunRecord, V10RunRecord } from "./types";
import { projectVersionedState } from "./versioning";

export function projectRun(run: RunRecord): ClientRunRecord {
  return { ...run, state: projectVersionedState(run.state) };
}

export function projectV10Run(run: V10RunRecord): ClientV10RunRecord {
  return { ...run, state: projectSimulationStateV10(run.state) };
}
