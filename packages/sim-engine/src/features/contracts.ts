import type { z } from "zod";
import type {
  HistoryCategory, HistoryEvent, HistoryEventType, ScenarioDefinition, ScheduledEffect, SimulationCommand, SimulationState, SystemSimulationCommand,
} from "../types";

export type DomainEmitter = (type: HistoryEventType, category: HistoryCategory, summary: string, actor?: HistoryEvent["actor"]) => void;
export type EngineCommand = SimulationCommand | SystemSimulationCommand;
export type LifecyclePhase = "after_scheduled_effects" | "after_financial_close" | "after_command";

export type FeatureContext = {
  state: SimulationState;
  emit: DomainEmitter;
};

export type FeatureCommandContext = FeatureContext & {
  command: EngineCommand;
};

export type FeatureLifecycleContext = FeatureContext & {
  elapsedDays: number;
};
export type FeatureEffectContext = FeatureContext & { effect: ScheduledEffect };

export type SimulationFeature = {
  id: string;
  version: string;
  dependencies: string[];
  defaultEnabled?: boolean;
  configSchema?: z.ZodType;
  publicStateSchema?: z.ZodType;
  privateStateSchema?: z.ZodType;
  initialize?: (context: { state: SimulationState; scenario: ScenarioDefinition; config: unknown }) => { public?: unknown; private?: unknown };
  commands?: Partial<Record<EngineCommand["type"], (context: FeatureCommandContext) => { checkpoint?: boolean } | void>>;
  effects?: Record<string, (context: FeatureEffectContext) => void>;
  hooks?: Partial<Record<LifecyclePhase, (context: FeatureLifecycleContext) => void>>;
  validate?: (state: SimulationState) => void;
  project?: (state: SimulationState) => unknown;
};
