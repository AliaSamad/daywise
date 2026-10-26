import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    // Run in a non-UTC zone so accidental reliance on the server's local time shows up.
    env: { TZ: "America/New_York" },
  },
});
