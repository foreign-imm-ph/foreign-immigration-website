# Real-Data-Safe Development and Testing Policy

Phase 2, decision F. Formalizes what was already practiced informally
throughout Phase 1 and Phase 2 into an explicit, written policy.

## The rule

**Every fixture, golden reference image, and automated test uses
synthetic, fictional applicant information only.** No real customer
name, passport number, address, phone number, or any other identifying
detail is ever committed to this repository, used in a test, or used to
generate a golden reference — not even a real customer's data with
details changed, since that still originates from an actual person.
"Representative" means structurally realistic (right format, right
length, right kind of edge case), not sourced from a real applicant in
any way.

## What this already covers (verified, not just asserted)

- **`bi-forms-library/configs/*/sample-data.json`** and
  **`bi-forms-library/tests/fixtures/**`**: every name (SMITH, TANAKA,
  REYES, etc.), passport number, and address in every committed fixture
  is fictional, carried forward from Phase 1's original prototypes,
  which were explicitly built and reviewed as fictional data from the
  start.
- **`bi-forms-library/tests/golden/**`**: generated from those same
  fictional fixtures — confirmed when they were first committed (Phase
  1) and unchanged since.
- **Worker tests** (`worker/test/*.test.js`): every client, application,
  and BI-form submission created in a test uses `helpers.js`'s
  `createTestClient()`/`createTestApplication()`, which generate a new
  random fictional identity per test run (e.g. `${id}@example.test`) —
  never a hardcoded "real-looking" identity reused across tests, and
  never anything resembling a real person.
- **Generated PDFs, uploaded documents, and original BI templates are
  never committed** — enforced today by `.gitignore` (`worker/.wrangler/`,
  `node_modules/`) plus simple discipline: every Phase 1/2 commit was
  individually reviewed before committing specifically to confirm no
  `.pdf`, no real-looking identity document, and no credential ever
  appears in the diff. This policy makes that discipline explicit and
  durable instead of implicit.

## What this does NOT yet fully address (a real gap, not papered over)

The policy above covers **development and automated testing** well. It
does not yet cover the **production/live-system boundary** the question
actually asks about: "ensure testing and development environments
cannot accidentally publish synthetic documents into real customer
accounts." That requires an environment-separation mechanism that
doesn't exist yet:

- There is no staging Worker environment today (confirmed in the
  original Phase 2 plan's inspection — no `wrangler.toml` environments
  are defined). Until one exists, "testing against a real-ish
  environment" and "testing against production" are the same thing by
  default, which is exactly the risk this requirement is about.
- **Recommendation** (not implemented — this is Stage 6's job per the
  approved plan, "prepare a separate staging strategy"): a
  `[env.staging]` block in `wrangler.toml` with its own D1 database and
  R2 bucket, so a synthetic test run against staging is structurally
  incapable of writing into the production database or bucket — not
  merely disciplined about not doing so. Until that exists, nobody
  should run exploratory or load testing against the real
  `fis-backend` D1/`fis-client-files` R2 bindings with anything other
  than data a staff member would be comfortable seeing in the real
  system, since there is currently no technical barrier preventing it.
- The Worker test suite built in Stage 2/3 never touches the real
  bindings at all (Miniflare's isolated local D1/R2 per test file — see
  `worker/TESTING.md`), so this specific gap does not affect anything
  built so far. It becomes relevant only once Stage 5/6 introduces real
  manual or exploratory testing against a deployed environment.

## Going forward

- Every new fixture, golden reference, or test added in any future stage
  must follow the same rule: synthetic only, reviewed before commit.
- Before Stage 6 (go-live), the staging-environment gap above should be
  closed — flagged here as a precondition for safe pre-production
  testing, not assumed solved by this document.
