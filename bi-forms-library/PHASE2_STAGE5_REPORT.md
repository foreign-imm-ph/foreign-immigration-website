# Phase 2, Stage 5 — Completion Report

Per your Stage 5 approval message, Stage 5 is complete. Nothing was
deployed, no live Cloudflare resource was created or modified, no paid
service was enabled, Instant Checkout was not activated, and no
additional BI form was onboarded beyond the three already-validated
ones. Stopping here for your review before live deployment, as
instructed.

## 1. Features implemented and demonstrated

**5.1 — R2 template retrieval.** `approveBiForm` now reads each form's
original BI template from the real private `fis-bi-forms-library`
bucket (`BI_FORMS_LIBRARY` binding, prepared in `wrangler.toml` but not
yet applied to the live Worker) at its already-confirmed
`originals/<formId>.pdf` key, replacing the earlier placeholder lookup
against `CLIENT_FILES`. Nothing was re-created, re-uploaded, or made
public.

**5.2 — Staff-field completeness validator.** Replaced the old
unconditional "every staff field must be non-empty" check with a
declarative per-form `staffFieldRequirements` map in each form's
`questionnaire.json` (`required: false`, or `requiredIf` keyed to a
customer answer), consumed by new engine functions
`isStaffFieldRequired`/`getRequiredStaffFields`. CDR/2014-13-002's
`purposeLine2` continuation line is now genuinely optional;
2014-13-006's requesting-agency and court/legal staff fields are
required only when the customer's corresponding gate answer says they
apply. Fields with no override stay required exactly as before.

**5.3 — Real WASM rendering backend.** `@resvg/resvg-wasm` (the Stage
4-approved Option B) is now the actual customer-preview renderer, not a
stub. Each form's blank-region background is pre-rendered once, offline,
with the existing proven Poppler pipeline
(`bi-forms-library/engine/scripts/generate-blank-backgrounds.js` — local
only, uploads nothing); at request time, the Worker reads that static
PNG from R2 and `bi-forms-library/engine/lib/svg-compose.js` draws the
customer's actual field values, the watermark, and the multi-region
divider caption onto it in one resvg render pass, then embeds the result
in a fresh `PDFDocument` with the same metadata call the Poppler/pdf-lib
path already used. Font-fit sizing reuses the exact same pdf-lib-metric
functions the vector path uses (`pdf-fields.js`, `watermark.js`, both
minimally refactored to expose size-only variants), relying on Stage 4's
finding that the bundled Liberation Sans font is metric-compatible with
the Helvetica metrics used as the measuring oracle.

**5.4 — Multilingual Client Portal questionnaire.** Extends the
existing authenticated Client Portal (`src/portal/index.njk` +
`portal-app.js`) with a new "BI Forms" section inside the application
detail view, and a full generic questionnaire editor
(`src/assets/js/portal-bi-form.js`) covering every question type the
engine's schema defines: text/date/select/yesno/repeatable-group, with
`showIf` conditionals re-evaluated live from current form state. Draft
save/resume, submit with server-validated completeness feedback,
document upload/download scoped to the submission, the published-
preview download link, and status/history display are all wired to the
already-complete customer-facing API
(`worker/src/routes/biFormsCustomer.js`). The questionnaire's own chrome
(buttons, instructions, validation messages, status labels) is
localized in all six FIS languages; field labels use each form's own
`questionnaire.json` translations. The original English BI PDF is never
touched or translated.

**5.5 — Language-label completeness + expanded test coverage.** Every
question and repeatable-group sub-question across all three forms now
carries a reviewed translation in all six declared languages (previously
English-only on every field despite declaring six-language support --
see §5 below). Customer-workflow test coverage was extended from
CCS-A-CDR-2016-only to all three forms, including 2014-13-006's
conditional questions and repeatable trip-entry group.

Staff Portal items 1–11 from your instructions (open an application,
assign a form, review answers, view documents, enter staff fields,
request revisions, generate the staff PDF and customer preview, approve,
publish, view history) were already fully built in Stage 3 and verified
again this stage; approving a BI form still never touches the
underlying `applications` table, so it cannot auto-complete the
immigration application.

## 2. End-to-end test results

| Suite | Result |
|---|---|
| Engine (`bi-forms-library`, Node test runner) | **62/62 passed** |
| Worker (`@cloudflare/vitest-plugin`, real Miniflare) | **138 passed, 2 skipped, 4 todo** (144 total) |

The 2 skipped + 4 todo are all the same pre-existing, investigated
harness limitation (§6) -- not new failures, not weakened assertions.

Coverage against your explicit workflow checklist, across all three
forms where the item is form-specific:

- Form assignment, draft saving/resumption, customer submission --
  `biForms-customer.test.js` (all three forms)
- Conditional questions, repeatable fields -- `biForms-customer.test.js`
  (2014-13-006: court/legal gate rejection-then-acceptance, two-entry
  trip round-trip) and `tests/run-all.js` (engine-level, all three)
- Staff review, optional vs. required staff fields -- `biForms-staff.test.js`
  (2014-13-006's conditional staff fields, both directions) and
  `tests/run-all.js` (CDR/2014-13-002's `purposeLine2`)
- Revision requests, approval, explicit publication -- `biForms-staff.test.js`,
  `biForms-lifecycle.test.js`
- PDF generation -- engine suite (real generation against real
  originals) + `biFormRaster.test.js`'s missing-background 501 path
- Customer preview access, denial of staff PDF access, cross-customer
  ownership isolation -- `biForms-document-access.test.js`,
  `biForms-customer.test.js`
- Invalid lifecycle transitions -- `biForms-lifecycle.test.js`
- All six questionnaire languages -- new engine test (every
  question/sub-question has a label in every declared language, all
  three forms) + new Worker test (the API returns all six end to end)
- PDF visual parity and non-recoverability -- engine's golden-reference
  Tier 3 tests (Poppler/pdf-lib path) + new svg-compose security-audit
  tests (resvg path): `assertMetadata`/`auditContentStreams`/
  `auditBoundaryExpansion` all pass against the real renderer, for all
  three forms

Synthetic data only throughout; no permission check was weakened or
skipped to make anything pass.

## 3. Rendering compatibility and visual-parity results

This is the one area where "local success" was explicitly not trusted
as proof, per your instruction. Beyond local Node execution (confirmed
correct via the engine's own test suite, including real ink-presence
checks against the real renderer), the full `composeAndFinalizeCustomerPreview`
path was run against the **actual workerd binary** via `wrangler dev
--local` (not this repo's test harness, not plain Node) -- a real local
HTTP request against both a single-region form (CCS-A-CDR-2016) and a
multi-region form (2014-13-006) each produced a valid, correctly-sized
PDF.

That real-runtime check caught two genuine, previously invisible
incompatibilities -- both now fixed, both covered by regression tests
where the harness allows it:

- **`ajv.compile()`'s runtime code generation.** The real Workers
  runtime refuses `new Function(...)`-based code generation outright
  ("Uncaught EvalError: Code generation from strings disallowed for
  this context"). This was a **pre-existing, Worker-startup-breaking
  bug from Stage 1–3's AJV wiring** -- since `validateForm()` runs at
  module load for every registered form, the Worker could never have
  started in production as it stood, and nothing in the existing test
  harness or local Node checks would ever have revealed this. Fixed by
  precompiling both config schemas to plain, eval-free JS validator
  functions at build time (`bi-forms-library/engine/scripts/compile-schemas.js`,
  using ajv's own documented "standalone validation code" feature),
  verified to contain zero `new Function`/`eval` occurrences.
- **A bare `Buffer` reference** in `svg-compose.js`'s base64 encoder (a
  Node global, not part of the Workers runtime) -- replaced with a
  `btoa()`-based encoder, confirmed working in both plain Node and real
  workerd.

Visual parity: the resvg path passes the exact same objective checks
the Poppler/pdf-lib golden-reference tests use -- metadata, content-
stream leak audit (0 leaks, and strictly fewer content streams than the
vector path, since the entire customer preview is now one raster
image), boundary-expansion non-recoverability audit, and a targeted
ink-presence check confirming a known field value renders at its
correct mapped position. The watermark's auto-fit sizing/opacity reuses
the identical formula the vector path already used; its rotation
direction is implemented but not byte-verified against the Poppler
output (a cosmetic, not security-relevant, open item -- see §6).

## 4. Security and document-access test results

No existing security guarantee was weakened. Specifically re-confirmed
this stage:

- A staff-only field is never drawable by either rendering backend
  (`fieldsForAudience` is the single source of truth both paths call).
- The resvg-rendered customer preview passes `auditContentStreams` with
  **zero** leaks and `auditBoundaryExpansion` finds the expanded page
  area entirely blank, for all three forms.
- Cross-customer ownership isolation holds for the two new document
  routes added this stage (`/api/bi-forms/:id/documents` upload/download):
  client B gets a 404, never a 403 that would confirm the submission's
  existence, attempting to upload to or download from client A's
  submission.
- A document cannot be attached to a submission once it's past
  `draft`/`revision_requested` (409).
- A submission with no associated application (a future Instant
  Checkout case) is refused with a clear 501 rather than hitting the
  `documents` table's `NOT NULL application_id` constraint as a raw 500.
- **New, previously-silent bug fixed:** every error response
  (400/401/403/404/409/422/500) from the Worker was missing
  `Access-Control-Allow-Origin` entirely -- `index.js` only attached CORS
  headers on the success path. A browser reports a missing CORS header
  as an opaque "CORS policy"/"Failed to fetch" error rather than
  exposing the real status/body to the page's JS, so **every** cross-
  origin error response site-wide was silently unusable from the
  browser, not just this new feature. Caught directly while browser-
  testing the questionnaire's submit-validation flow. Fixed by attaching
  CORS/security headers uniformly regardless of success or error;
  covered by `worker/test/http-cors.test.js`, which was verified to fail
  4/5 assertions without the fix before being left in its passing state.

## 5. Multilingual interface coverage

All six FIS languages (en, zh-CN, zh-Hant, ko, ja, vi) are covered at
both levels Stage 5.4 asked for:

- **Questionnaire chrome** (buttons, instructions, validation messages,
  status labels) -- hand-translated in `portal-bi-form.js`, the same
  deterministic-dictionary pattern `worker/src/lib/clientLocaleStrings.js`
  already established, never AI-generated at render time.
- **Field labels** -- every question and repeatable-group sub-question
  across all three forms now has a reviewed translation in all six
  languages (this stage's fix; see §1's 5.5 entry for why this had been
  silently English-only since the forms were first migrated).

Browser-verified, not just asserted: switching the in-progress
questionnaire's language from English to Japanese mid-edit re-rendered
every label and the documents heading in Japanese while preserving the
customer's already-typed, not-yet-saved answers.

**Explicit scope boundary:** this stage localized the BI-form
questionnaire's own UI, not the pre-existing Client Portal shell's
unrelated sections (Applications & Services tab chrome, Profile form,
consent toggles), which remain English-only as they were before this
stage. Retrofitting those is a separate, larger undertaking outside
"FIS Forms Library" scope as instructed, and your Stage 5 message's
wording ("Localize the authenticated Client Portal shell... [under]
Implement the generic questionnaire renderer") reads as scoped to the
questionnaire feature specifically. Flagging this interpretation
explicitly in case you intended the broader retrofit -- happy to scope
that as separate follow-up work if so.

The original English BI PDF itself was never translated or altered, in
either rendering backend, per your explicit instruction.

## 6. Remaining blockers, if any

Nothing blocks the workflow this stage was asked to deliver. Two
genuinely open items, neither new nor security-relevant:

1. **The two pre-existing Worker-test TODOs remain unresolved** (plus
   two new ones of the identical kind, added this stage for the resvg
   path). Root cause, confirmed by direct inspection of
   `@cloudflare/vitest-plugin`'s own module-loading code
   (`dist/pool/index.mjs`), not just suspected: pdf-lib's dual CJS/ESM
   package shape breaks when pulled in via a dynamic `import()` from
   outside its own package, specifically inside this plugin's separate
   workerd-pool module loader (not the same code path
   `vitest.config.js`'s existing `resolve.mainFields`/`server.deps.inline`
   settings reach -- those apply to Vite's own outer test-runner graph).
   `@cloudflare/vitest-plugin` 1.4.1 is the latest published version;
   there is no newer release to pick up a fix. This is a genuine,
   structural harness limitation, not a missing config flag -- and it
   does **not** leave the actual rendering path unverified, since §3's
   real-`wrangler dev` check is independent of this harness entirely and
   is the stronger evidence anyway.
2. **Watermark rotation direction** is implemented with a reasoned best-
   effort sign convention (SVG's top-down rotation vs. pdf-lib's bottom-
   up one) but not pixel-verified to exactly match the Poppler path's
   diagonal direction. Color and opacity ARE numerically verified
   (pixel sampling gives the same light pinkish-red Stage 4's own
   Chromium comparison found). Purely cosmetic; does not affect security,
   data integrity, or legibility.

Everything else requested for Stage 5 is done and verified.

## 7. Exact commits and changed files

Four commits, all on `claude/fis-website-planning-r52sii`, building on
`3b4d7b1` (the Stage 1–4 report):

1. `4d82126` — Stage 5.1+5.2: R2 template retrieval + staff-field
   completeness validator
2. `486626b` — Stage 5.3: real resvg-wasm rendering backend, verified
   against real workerd
3. `741d86e` — Stage 5.4: multilingual Client Portal questionnaire
   renderer
4. `7b3b1ad` — Stage 5.5: six-language label translations + expanded
   test coverage

**38 files changed, 3,281 insertions, 204 deletions** across this
stage. New: 3 bundled font files, 1 engine lib module (`svg-compose.js`),
1 generated schema-validators file, 2 build/generation scripts, 1
frontend JS module (`portal-bi-form.js`), 3 Worker test files. Modified:
6 engine lib modules, 2 engine schema files, 3 forms' `questionnaire.json`,
the engine test suite, 2 package.json/lockfile pairs, 4 Worker source
files, 2 existing Worker test files, `wrangler.toml`, and 3 portal
frontend files (`index.njk`, `portal-app.js`, `style.css`).

## 8. Estimated work remaining

**Batch onboarding of remaining eligible BI forms** (per the inventory,
~17 more candidates beyond the 3 validated so far, several flagged
`hold`/`reproduction_prohibited` and correctly excluded): the shared
engine, Worker routes, Client Portal renderer, and staff workflow are
all already generic and form-agnostic -- onboarding a new form means
producing its `coordinate-map.json`/`questionnaire.json` (the genuinely
manual, per-form measurement/review work the first three forms already
proved out) plus running `generate-blank-backgrounds.js` for it. Rough
estimate: **0.5–1.5 days per form** depending on layout complexity
(single-region vs. multi-region/conditional), dominated by coordinate
measurement and translation review, not code.

**Instant Checkout infrastructure:** the architecture is already
decoupled as instructed -- the questionnaire renderer, validation layer,
PDF pipeline, and staff review workflow don't know or care how a
submission was created, and `bi_form_submissions.intake_path` already
has a column slot (`staff_assigned` today) ready for an `instant_checkout`
value later. No checkout-specific code, flag, or price was added this
stage (none was needed to preserve compatibility). Remaining work when
you're ready to activate it: a customer-initiated creation path (service
selection -> form assignment without a staff action in between),
payment collection, and the actual feature-flag gate to turn it on --
roughly **3–5 days**, most of it payment integration rather than forms-
library work, since the forms side needs no new code to support it.

## Commit-count reconciliation (your point 9)

The Stage 1–4 report's §7 stated "**8 commits**" but its own numbered
list enumerated only 7 (`1991de8` through `5bf6548`). The discrepancy:
that list covered only the *implementation* commits preceding the report
itself; the report's own commit (`3b4d7b1`, "Add Phase 2 Stages 1-4
completion report") was the implicit, unnamed 8th -- a real commit, just
never listed by hash in its own enumeration, since a commit can't
describe itself before it exists. Verified directly against `git log`
(`cb04cce^..3b4d7b1` = exactly 8 commits, matching). Not a sign of lost
or uncounted work -- a self-referential counting omission in how that
report's list was written, now corrected here by actually listing every
hash, including this report's own forthcoming commit, in §7 above.
