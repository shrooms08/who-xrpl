import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Default unit suite: pure engine tests. Excludes the live-DB e2e.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/*.e2e.test.ts"],
  },
});
