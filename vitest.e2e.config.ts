import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Live-DB end-to-end suite. Drives real games through the server orchestration
// against the Supabase project. `server-only` is stubbed for the Node runner.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.e2e.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
