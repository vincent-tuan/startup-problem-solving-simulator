import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "@sim/engine": fileURLToPath(new URL("./packages/sim-engine/src/index.ts", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
  } },
  test: { include: ["packages/**/*.test.ts", "src/**/*.test.ts"], environment: "node", coverage: { reporter: ["text", "html"] } },
});
