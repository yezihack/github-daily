import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            ADMIN_TOKEN: "test-admin-token",
            AI_BASE_URL: "https://ai.example.com/v1",
            AI_API_KEY: "test-ai-key",
            AI_MODEL: "test-model",
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./tests/apply-migrations.ts", "./tests/network.ts"],
      include: ["tests/**/*.test.ts"],
    },
  };
});
