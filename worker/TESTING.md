# Worker test suite

Phase 2, Stage 2. Previously the Worker had no automated tests at all.
This runs tests inside the real Workers runtime (Miniflare, via
`@cloudflare/vitest-plugin`), against this Worker's actual
`wrangler.toml` bindings (`DB`, `CLIENT_FILES`) — not a mocked or
hand-stubbed environment. Entirely local: nothing here reaches the real
Cloudflare account, the real D1 database, the real R2 bucket, or Workers
AI.

## Running

```
cd worker
npm install
npm test
```

## How it works

- `vitest.config.js` reads every file in `migrations/` with
  `readD1Migrations()` and exposes them to the test runtime as a
  `TEST_MIGRATIONS` binding.
- `test/apply-migrations.js` (a Vitest `setupFiles` entry) applies all of
  them, in order, to an isolated, in-memory local D1 instance before each
  test file runs — so every test starts from the exact schema production
  has, including every migration up to the latest.
- `remoteBindings: false` is set explicitly. Workers AI (`env.AI`) cannot
  be simulated locally by Miniflare at all — without this, Vitest tries
  to open a remote proxy session to the real Cloudflare account, which
  fails without a `CLOUDFLARE_API_TOKEN` (and would not be local-only
  even with one). No test here exercises AI-backed translation; that
  code path is out of scope for this test suite.
- `test/helpers.js` seeds `clients`/`applications`/`staff`/
  `bi_form_submissions` rows directly in D1 and builds authenticated
  `Request` objects, so most tests call the real Worker's exported
  `fetch(request, env)` end to end (real routing, real CORS/security
  headers, real CSRF Origin check) rather than unit-testing route
  functions in isolation.
- `test/access-jwt-helper.js` generates a real RSA keypair in-process and
  signs genuine Cloudflare Access JWTs with it, mocking only the one
  network call `lib/staffAuth.js` makes (fetching the team's JWKS) so the
  actual RSASSA-PKCS1-v1_5/SHA-256 signature verification path is
  exercised for real — not stubbed out — without any real Access tenant.

## Coverage (Stage 2 — existing-functionality regression)

- Customer authentication: magic-link request (incl. no account
  enumeration), single-use token verification, session issuance, logout,
  unauthenticated access rejection.
- Staff authentication: Access JWT verification (valid, expired, wrong
  audience, tampered signature, malformed header), the independent
  staff-allow-list cross-check (including an Access-valid-but-not-
  allow-listed identity, and an allow-listed-but-deactivated account),
  and the `/staff/*` route gate end to end.
- Application ownership: a client can read their own applications; a
  different client cannot read them by ID (404, not 403 — existence is
  never confirmed either); an unauthenticated request is rejected before
  any ownership check runs.
- Document upload/download: successful round trip; magic-byte sniffing
  rejecting a mislabeled non-PDF; the 15MB size cap; cross-client
  download rejection; a document ID requested under the wrong
  application ID being rejected even for its true owner.
- CSRF: a foreign Origin, and a missing Origin/Referer, are both rejected
  on state-changing requests even with a valid session cookie; the real
  site Origin is let through; `GET` requests are never subject to the
  check at all.

BI-form-specific routes, lifecycle transitions, questionnaire validation,
and staff-PDF access control are added in Stage 3 alongside the routes
they test, since those routes don't exist yet as of this file's commit.
