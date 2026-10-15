import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";

// Applies every migration in worker/migrations/ (0001 through the latest,
// in order) to the isolated, in-memory local D1 instance before each test
// file runs -- so every test starts from the exact same schema the real
// production database has, including 0009_bi_form_lifecycle.sql, without
// ever touching the real database.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Phase 4 Stage E: lib/email.js posts straight to the real Resend API
// (fetch("https://api.resend.com/emails", ...)) with no mock anywhere in
// this suite. RESEND_API_KEY is never set in a test environment, so every
// route that sends an email (magic links, payment notices, etc.) was
// making a real, doomed-to-fail outbound HTTPS request to Resend on every
// test run -- never asserted on, but a real external network call during
// `npm test` all the same, which the operational-readiness directive
// requires be mocked/sandboxed instead. Intercepting only that one host
// here (and delegating everything else, including the Access JWKS
// endpoint mocked per-test in access-jwt-helper.js, to whatever fetch was
// already installed) makes the whole suite hermetic without touching any
// individual test.
const fetchBeforeEmailStub = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) === "https://api.resend.com/emails") {
    return new Response(JSON.stringify({ id: "test-mock-email-id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return fetchBeforeEmailStub(url, init);
};
