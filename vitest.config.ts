import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@arc/contracts": resolve(rootDir, "packages/contracts/src/index.ts"),
      "@arc/shared": resolve(rootDir, "packages/shared/src/index.ts"),
    },
  },
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
