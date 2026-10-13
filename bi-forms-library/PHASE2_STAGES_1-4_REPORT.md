# Phase 2, Stages 1–4 — Completion Report

Per your approval and implementation instructions, Stages 1 through 4
are complete. Nothing was deployed, no Cloudflare resource was created
or modified, no paid service was enabled, Instant Checkout was not
activated, and no additional BI form was migrated. Stopping here for
your review before Stage 5, as instructed.

## 1. D1 migration files (additive, not applied to production)

`worker/migrations/0009_bi_form_lifecycle.sql` — adds, purely
additively:
- `bi_form_submissions` (one row per BI-form instance assigned to a
  client; separate `customer_answers_json`/`staff_answers_json` columns
  mirroring the engine's fail-closed field-permission split)
- `bi_form_status_history` (full chronological transition log, mirroring
  the existing `application_status_history` convention)
- `document_requests.bi_form_submission_id` (nullable link)
- `documents.kind` (`client_upload`/`staff_pdf`/`customer_preview`,
  defaults to `client_upload` so every existing row is unaffected) and
  `documents.bi_form_submission_id`

Verified by applying migrations 0001–0009 in sequence against a fresh
local D1 instance and round-tripping sample rows through every new
table/column.

## 2. BI-form lifecycle

`bi-forms-library/BI_FORM_LIFECYCLE.md` defines 7 states (your
requested minimum 6, plus `cancelled` — reasoned explicitly, since
without it the only way to represent "assigned in error" or "no longer
needed" would be deleting a row and losing the audit trail this whole
schema exists to preserve) and the full transition table, including two
safety-valve transitions (`approved → revision_requested` and
`published → revision_requested`) for correcting a mistake before or
after publication. Explicitly decoupled from `applications.status` —
verified by code: no BI-form route anywhere writes to
`application_status_history`.

## 3. Worker test suite and results

Previously: no automated tests existed for the Worker at all. Now:
**11 test files, 123 tests, 121 passing, 2 marked `it.todo`** (both the
same single, narrow, documented test-harness limitation — see §8).

Coverage: customer auth, staff Access-JWT verification (a real
in-process-generated keypair, genuine RSASSA-PKCS1-v1_5/SHA-256
signature verification, not stubbed), application ownership, document
upload/download, CSRF — all regression-tested before any BI-form code
touched them — plus, new this phase: the full 7×7 lifecycle-transition
matrix tested exhaustively, customer-facing BI-form routes (list/get/
draft/submit, with cross-client ID-guessing attempts rejected and
confirmed unmodified in D1), staff-facing BI-form routes (assign,
review, staff-fields, request-revision, publish, cancel), and — the
core security requirement of this phase — direct tests confirming a
`staff_pdf` is **never** downloadable by a client through any route, a
`customer_preview` is refused until its owning submission is actually
published, publication is per-submission (one submission's publish
never leaks a different one's), and a mismatched submission ID in a
staff download URL is rejected even with a real document ID. Full
detail: `worker/TESTING.md`.

## 4. Shared engine integration / API contracts

`worker/src/lib/biFormEngine.js` imports the real
`bi-forms-library/engine/lib/*` modules directly — not a duplicate
copy. Field-permissions, field-bindings, schema-validate,
config-consistency, the new `questionnaire-answers.js` (submission
completeness validation, built this phase and reused — not
reimplemented — by the customer submit route), and the pure
(`pdf-lib`-only) half of `render-pipeline.js` all run inside the Worker
today, verified two ways: loading with Node's `fs`/`os`/`child_process`
built-ins explicitly blocked (simulating a Workers isolate), and loading
inside the actual Miniflare-simulated Workers runtime via the new test
suite.

New routes implementing the full lifecycle:
customer-facing (`routes/biFormsCustomer.js`: list, get, save/resume
draft, submit, list published documents) and staff-facing
(`routes/staffBiForms.js`: assign, review queue, start review, save
staff fields, request revision, approve, publish, cancel, download),
wired into the existing dispatchers and onto the existing application
detail page (a new "BI Forms" card, not a disconnected flow).

**Critical fix found and applied during this work:** the existing
*generic* document-download route (`routes/documents.js`), not only a
new BI-forms-specific one, needed patching — a generated `staff_pdf`
document has an ordinary `application_id`/`client_id` like any upload,
so without this fix it would have remained fully downloadable through
the pre-existing endpoint regardless of any new BI-forms-specific
protection. Now fixed in the one shared path every application-scoped
document goes through.

Engine preparatory changes (committed just before the Worker
integration, zero behavior change — verified by the engine's own
unmodified 45-test suite, including pixel-exact golden parity, both
before and after): `render-pipeline.js` split into pure vs.
raster-dependent modules; `schema-validate.js` switched from
`fs.readFileSync` to a plain `require()` of its JSON schemas, so a
bundler can inline them.

## 5. Browser Rendering vs. WASM feasibility findings

Full detail: `bi-forms-library/STAGE4_RENDERING_COMPARISON.md`. Both
options were **actually tested locally** against all three forms and
the golden references, not just researched — including feeding a
locally-rendered screenshot through the real, unmodified
secure-reconstruction code (metadata, content-stream audit,
boundary-expansion non-recoverability audit), which passed unchanged
for both. Headline findings:
- Both reproduce all three forms accurately (0/14 mismatches each, on
  the engine's own objective per-field ink-presence check).
- **Correction to the approved Phase 2 plan**: Browser Rendering does
  *not* require the Workers Paid plan (available on Free, with tighter
  limits) — but the Free plan's 10ms CPU-time-per-request limit means
  neither option is realistically Free-plan-viable regardless, since a
  single WASM render alone measured 196–409ms here.
- Recommendation: **Option B (WASM/`resvg-wasm`) as primary**, Option A
  as documented fallback — reversing Phase 1's provisional lean now
  that Option B has actually been tested. Nothing wired in; the Stage 3
  seam (`getDocumentBuilders()` / `biFormRaster.js`) remains open
  pending your decision.

## 6. Service-to-form mapping proposal

Full detail: `bi-forms-library/SERVICE_MAPPING.md`.
`CCS-A-CDR-2016 → motions-blacklist` (high confidence — the form's own
name matches). `2014-13-002` and `2014-13-006` are flagged as genuinely
ambiguous with 2–3 reasonable candidates each, left for your decision.
Confirmed by direct inspection: no `checkoutEligible` flag is `true`
anywhere; Instant Checkout remains entirely unbuilt.

Also delivered: `bi-forms-library/TESTING_DATA_POLICY.md` — formalizes
the already-practiced synthetic-data-only rule and names one real,
unaddressed gap honestly (no staging Worker environment yet, so
nothing today technically prevents a test run from reaching production
bindings — a Stage 6 precondition, not solved here).

## 7. Files changed and commits

**8 commits**, `1991de8` through `5bf6548`, all on
`claude/fis-website-planning-r52sii`:

1. `1991de8` — Stage 1: lifecycle definition + D1 migration
2. `7045afa` — Stage 2: Worker test harness + regression tests
3. `a092f55` — Stage 3a: engine pure/raster module split
4. `9ed7634` — Stage 3b: `questionnaire-answers.js`
5. `9cbe876` — Stage 3: engine integration + BI-form Worker routes
6. `efd05d4` — Stage 4: rendering backend comparison
7. `5bf6548` — Decisions E & F: service mapping + testing data policy

(Plus `cb04cce`/`1cae68f`, the Phase 2 plan itself and its commit-count
reconciliation, from before this implementation work began.)

**49 files changed, 5199 insertions, 521 deletions** across this
implementation work. New: 1 D1 migration, 5 Worker lib modules, 2 Worker
route modules, 7 Worker test files, 1 engine lib module, 6 planning/
report documents. Modified: `worker/src/index.js`,
`worker/src/routes/{staff,documents}.js`, `worker/src/lib/staffHtml.js`,
`worker/package.json`+lockfile, `bi-forms-library/engine/{cli.js,
lib/render-pipeline.js, lib/schema-validate.js, schema/questionnaire
.schema.json}`, `bi-forms-library/tests/run-all.js`, and the 2014-13-006
config/fixtures (adding the previously-missing `requestingAgencyApplies`
field — a real gap the new completeness validator surfaced).

Dependencies added: `pdf-lib@1.17.1`/`ajv@8.17.1` (exact-pinned to match
the engine) and `@cloudflare/vitest-plugin@^1.4.1`/`vitest@^4.1.11` (dev)
to `worker/package.json`. `npm audit` flags one moderate advisory in
`ajv` (a ReDoS in its `$data` option) — not applicable here, since
nothing in this codebase enables `$data`.

## 8. Remaining costs, risks, and technical blockers

**Costs:** none incurred (nothing enabled). Going forward, per §5:
Workers Paid plan (~$5/mo base) is realistically required either way;
Option A (Browser Rendering) adds a small usage-based charge on top
likely near $0 at FIS's probable volume; Option B (WASM) does not.

**Risks / blockers:**
- **No raster backend is wired in yet** (expected — that's your Stage 4
  decision to make from §5's findings). `approveBiForm` will throw a
  clear 501 for the customer-preview step until one is chosen and
  implemented.
- **No original BI template is uploaded to R2 for any form yet.**
  `approveBiForm` checks for `bi-form-templates/<formId>/original.pdf`
  and refuses with a clear error if absent — confirmed this blocks
  approval for all three forms today, by design (originals are
  confidential and were never committed to the repo).
- **Test-harness limitation** (not a code defect): `@cloudflare/
  vitest-plugin` 1.4.1 cannot resolve `pdf-lib`'s dual CJS/ESM package
  shape when it's reached via a static import graph from outside the
  `worker/` package, and `vi.mock()` cannot stub an internal module used
  only by code running inside the plugin's simulated Workers isolate.
  Confirmed to be test-harness-only: a direct `esbuild --bundle
  --platform=node` of the exact same import chain (what `wrangler
  deploy` actually uses) succeeds cleanly. Two tests are marked
  `it.todo(...)` rather than deleted, so the gap stays visible; the
  underlying generation code is independently verified by the engine's
  own 45-test suite instead.
- **Staff-field completeness check is coarser than ideal:** every
  staff-owned coordinate-map field is currently treated as
  unconditionally required for approval, which doesn't yet distinguish
  a field that's legitimately often blank (e.g. 2014-13-006's
  `purposeLine2` continuation line) from one that genuinely isn't. Not
  fixed in this phase; noted in code and in `worker/test/
  biForms-staff.test.js`.
- **`documents.application_id` is `NOT NULL`,** so a BI-form submission
  with no linked application (the future Instant Checkout path) cannot
  yet have generated documents stored against it. Not a problem for the
  in-scope staff-assigned path (always has an application), but a
  schema accommodation Instant Checkout will eventually need.
- **Client Portal app shell is still English-only** (carried forward
  from the original Phase 2 plan's inspection — unchanged by Stages
  1–4, since no customer-facing UI was built yet).
- **Service-to-form mapping has two open ambiguities** (§6) needing
  your decision before Stage 5's Client Portal work can reference a
  confirmed category.

## 9. Recommended next stage

Per your instruction, stopping here. Before Stage 5 begins, the
concrete decisions needed from you are: (a) which rendering backend to
pursue from §5, (b) the two ambiguous service-slug mappings from §6,
and (c) confirmation to proceed with Stage 5 (staff-assigned workflow +
multilingual Client Portal questionnaire UI) using the API contracts
built in Stage 3 as-is, or any changes you want made to them first.
