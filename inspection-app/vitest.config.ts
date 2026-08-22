import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // The rules in core/ are plain JavaScript and test themselves with
    // `node --test` (npm run test:core) — no bundler, exactly as they ship.
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@core": path.resolve(__dirname, "core"),
    },
  },
});
