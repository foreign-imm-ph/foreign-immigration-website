import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Runs tests inside the real Workers runtime (Miniflare), against this
// Worker's actual wrangler.toml bindings (DB, CLIENT_FILES, AI) -- not a
// mocked/stubbed environment. This is local-only: nothing here touches the
// real Cloudflare account, the real D1 database, or the real R2 bucket.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = path.join(import.meta.dirname, "migrations");
      const migrations = await readD1Migrations(migrationsPath);
      return {
        wrangler: { configPath: "./wrangler.toml" },
        // Workers AI (the `AI` binding) cannot be simulated locally and
        // would otherwise make Miniflare proxy to the real Cloudflare
        // account, requiring a CLOUDFLARE_API_TOKEN -- explicitly disabled
        // so this test suite never needs, and never can, reach any real
        // Cloudflare resource. No test here exercises AI-backed
        // translation; see worker/TESTING.md.
        remoteBindings: false,
        miniflare: {
          // Test-only binding so the setup file below can apply every
          // migration (0001 through the latest) to the isolated, in-memory
          // local D1 before each test file runs.
          bindings: { TEST_MIGRATIONS: migrations },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.js"],
  },
});
