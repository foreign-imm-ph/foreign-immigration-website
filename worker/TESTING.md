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

## Coverage (Stage 3 — BI-form routes, lifecycle, access control)

- Lifecycle transitions (`lib/biForms.js` `assertTransitionAllowed`): the
  full 7×7 status matrix is tested exhaustively, not spot-checked — every
  allowed transition succeeds and every other pair is rejected. A
  realistic end-to-end run (draft → submit → review → request revision →
  resubmit → review → approve → publish) is verified against real D1,
  including the full chronological `bi_form_status_history` trail and
  the `approved → revision_requested` / `published → revision_requested`
  safety-valve transitions.
- Customer-facing BI-form routes: a client sees only their own assigned
  forms; `GET` returns the questionnaire but never the coordinate map
  (field positions, staff-only field names); drafts can only be edited
  while `draft`/`revision_requested`; an incomplete submission is
  rejected with the specific missing fields named; a complete one
  transitions to `submitted`; a submission cannot be submitted twice;
  every endpoint rejects an unauthenticated request; cross-client ID
  guessing is rejected at every one of these (404, and the guessed-at
  row is confirmed unmodified in D1).
- Staff-facing BI-form routes: assigning a form to an application
  (rejecting an unknown form id); the assignment appearing on the
  existing application detail page; starting review; staff-field save
  rejected before review has started; `request-revision` requiring a
  note; `publish` and `cancel` as isolated state transitions; every
  staff route rejecting a request with no valid Access identity.
- Document access control (Phase 2 decision 2.7 — the core security
  requirement of this phase): a client can **never** download a
  `staff_pdf` document, including their own, through any route; a
  `customer_preview` is refused until its owning submission is actually
  published; publication is per-submission (one submission's publish
  does not leak a different submission's still-unpublished preview);
  cross-client access is rejected for both kinds; staff can download
  both kinds through the staff route; a mismatched submission ID in a
  staff download URL is rejected even when the document ID itself is
  real; the customer-facing document-listing endpoint never lists a
  `staff_pdf` or an unpublished `customer_preview`.

## Known test-harness limitation (not a gap in the code it tests)

`approveBiForm`'s actual document-generation step (`getDocumentBuilders()`
in `lib/biFormEngine.js`, which lazily loads the shared engine's
`render-pipeline.js` and therefore `pdf-lib`) cannot be exercised through
`worker.fetch()` in this harness. Two independent causes, both isolated
and documented in code:

1. `@cloudflare/vitest-plugin` 1.4.1 (a newly renamed, young package)
   fails to resolve `pdf-lib`'s dual CJS/ESM package shape when it's
   pulled in via a static import graph — confirmed to be a test-harness-
   only issue, since a direct `esbuild --bundle --platform=node` of the
   exact same import chain (what `wrangler deploy` actually uses)
   succeeds cleanly with no error.
2. `vi.mock()` can stub this import when called directly from a test
   file's own module scope, but **not** when the real Worker `fetch()`
   handler runs inside the plugin's simulated Workers isolate — that is
   a genuinely separate module registry from Vitest's own mocking
   system, with no supported way (as of this version) to stub an
   internal module used only by code executing inside it.

Every precondition check leading up to that point (status guards,
staff-field completeness, original-template availability) is fully
tested. The generation code itself is independently verified correct by
the shared engine's own 45-test Node suite
(`bi-forms-library/tests/run-all.js`, which exercises
`buildStaffDocument`/`buildCustomerFieldsDocument` extensively against
all three real forms, including pixel-exact golden-reference parity) and
by the direct esbuild bundle check above. Two tests are marked
`it.todo(...)` rather than deleted, so this gap stays visible and is the
first thing to re-verify once a Stage 4 raster backend is wired in (at
which point the whole path can be exercised against a real, deployed
Worker instead).
