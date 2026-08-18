import "server-only";
import { scenarios } from "@/content/scenarios";
import { MemoryStore } from "./memory";
import { PostgresStore } from "./postgres";
import type { RuntimeStore } from "./types";

const globalStore = globalThis as typeof globalThis & { __startupRuntimeStore?: RuntimeStore; __startupStoreReady?: Promise<void> };

export async function getStore(): Promise<RuntimeStore> {
  if (!globalStore.__startupRuntimeStore) {
    const useMemory = !process.env.DATABASE_URL && (process.env.NODE_ENV !== "production" || process.env.ALLOW_EPHEMERAL_STORE === "1");
    if (!useMemory && !process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
    globalStore.__startupRuntimeStore = useMemory ? new MemoryStore() : new PostgresStore();
    globalStore.__startupStoreReady = globalStore.__startupRuntimeStore.syncScenarios(scenarios);
  }
  await globalStore.__startupStoreReady;
  return globalStore.__startupRuntimeStore;
}

export type * from "./types";
