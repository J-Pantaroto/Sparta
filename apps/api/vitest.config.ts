import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@sparta/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@sparta/riot": resolve(__dirname, "../../packages/riot/src/index.ts")
    }
  }
});
