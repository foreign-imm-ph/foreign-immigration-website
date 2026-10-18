// Phase 4 Stage F: committed, repeatable browser journeys for FIS.
//
// Deliberately local-only: both servers below are started with --local/
// local D1+R2 bindings, so nothing here ever reaches a real Cloudflare
// resource, sends a real email, or processes a real payment. See
// e2e/README.md for what each journey covers and how to run this suite.
const { defineConfig, devices } = require("@playwright/test");

const SITE_PORT = process.env.E2E_SITE_PORT || 8080;
const WORKER_PORT = process.env.E2E_WORKER_PORT || 8787;

module.exports = defineConfig({
  testDir: "./e2e/tests",
  globalSetup: require.resolve("./e2e/global-setup.js"),
  // The suite shares one local D1 database and one dev-staff bypass
  // identity across every spec file (see e2e/fixtures/testHelpers.js) --
  // running serially keeps each journey's seeded data and staff actions
  // from interleaving with another journey's.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${SITE_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // In an interactive session these are usually already running (started
  // by hand for manual verification); reuseExistingServer picks those up
  // instead of double-starting them. CI always starts both fresh.
  webServer: [
    {
      command: "npx eleventy --serve --port " + SITE_PORT,
      cwd: __dirname,
      url: `http://127.0.0.1:${SITE_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // See worker/scripts/make-e2e-wrangler-toml.js for why the Staff
      // Portal needs this: --local alone is not enough.
      //
      // `wrangler dev --local` starts from an empty local D1 database if
      // one doesn't already exist on disk under .wrangler/state -- it
      // never applies migrations/ itself. A machine that already ran
      // this suite (or worker/TESTING.md's manual setup) before has that
      // state sitting around already, which is why this was never
      // noticed locally; a fresh checkout (including CI) doesn't, and
      // every request fails with "no such table". Applying migrations
      // before every dev start is a no-op once they're already applied.
      command:
        "node scripts/make-e2e-wrangler-toml.js && npx wrangler d1 migrations apply fis-backend --local && npx wrangler dev --port " +
        WORKER_PORT +
        " --local --config .wrangler-e2e.toml",
      cwd: __dirname + "/worker",
      url: `http://127.0.0.1:${WORKER_PORT}/api/instant-services/catalogue`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
