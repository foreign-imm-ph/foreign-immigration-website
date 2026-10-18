# FIS Smart Application System — Handover

**Status: IN PROGRESS.** This file is updated at each verified checkpoint, not only at session end. If this session ends mid-task, resume from "Exact next actions" below.

## Latest completed commit

`2142967` (branch `claude/fis-website-planning-r52sii`) — "Localize transactional emails into the customer's saved language" — this is the last commit as of the start of this directive ("FIS Smart Application System — Form Accuracy, Reliability, Customer Experience and Pre-Launch Certification"). Working tree was clean and on this branch when this directive began.

## This session's unlock: real original PDFs are now available locally

A Cloudflare API token with R2 read access was provided by the user for this session only. Using it, all 14 mapped forms' real, confidential original PDFs were downloaded (via `wrangler r2 object get ... --remote`) into a **local, non-repository, gitignored-equivalent scratch directory**:

```
/tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/fis-bi-originals/
```

**This directory is NOT inside the git repository and must never be committed.** It is session-local scratch space. The confidential originals policy (never commit real BI form PDFs to this repo) is unchanged and was not violated.

All 14 files verified as valid PDFs with page counts matching each form's own `coordinate-map.json` metadata (1-page: `2014-01-011`, `2014-08-015`, `2014-13-002`, `2014-13-006`, `2021-03-001`, `ADM05.QF.001`, `ARD04.QF.003`, `CCS-A-CDR-2016`, `CCS-A-NTSP-2016`, `IRD04.QF.004`; 2-page: `BOC04.QF.001`, `BOC04.QF.002`, `CGAF-002-Rev3`, `CGAF-003-Rev 2`).

No pre-rendered `backgrounds/<formId>.png` objects exist yet in the real R2 bucket (confirmed by a direct failed fetch) — unchanged from the prior session's note; the live-preview feature's synthetic-background test fixture remains the correct approach for browser tests in this environment.

**To resume real-PDF verification in a future session without re-downloading:** if this scratch directory still exists, just export:
```
export FIS_BI_ORIGINALS_DIR="/tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/fis-bi-originals"
```
If it no longer exists, the same Cloudflare API token (if still valid/provided again) and the same `wrangler r2 object get "fis-bi-forms-library/originals/<formId>.pdf" --file <dest> --remote` command will re-fetch them. **Never commit this token or the downloaded PDFs to the repository.**

## Verified functionality (carried over, unchanged, not re-audited this session)

Per the prior session's final report (`claude/fis-website-planning-r52sii` history through `2142967`): guest checkout, GCash manual payment + staff verification, Client Portal, Staff Portal exception workflow, 6-language localization (UI + now transactional emails), guided questionnaire with live preview and "I'm not sure" assistance, 7 newly-automated forms (`document_automated`), friendly form names, secure message attachments. Full detail in that session's two delivered reports (not re-litigated here).

## Form-by-form progress (this session)

_Updated as work proceeds — see below for current state._

| Form ID | Catalogue service | Original available? | Engine regression (real PDF) | Defects found | Readiness |
|---|---|---|---|---|---|
| CCS-A-CDR-2016 | svc-cdr | Yes (downloaded) | pending | — | pending |
| 2014-13-002 | svc-bi-clearance | Yes (downloaded) | pending | — | pending |
| 2014-13-006 | svc-travel-records | Yes (downloaded) | pending | — | pending |
| CCS-A-NTSP-2016 | svc-ntsp | Yes (downloaded) | pending | — | pending |
| 2014-08-015 | svc-acr-icard-cert | Yes (downloaded) | pending | — | pending |
| 2021-03-001 | svc-travel-pass | Yes (downloaded) | pending | — | pending |
| 2014-01-011 | svc-ext-reconsideration | Yes (downloaded) | pending | — | pending |
| ADM05.QF.001 | svc-ctc-records | Yes (downloaded) | pending | — | pending |
| ARD04.QF.003 | svc-ecc-application | Yes (downloaded) | pending | — | pending |
| IRD04.QF.004 | svc-cgaf-tvv-extension | Yes (downloaded) | pending | — | pending |
| BOC04.QF.001 | svc-cgaf-immigrant-visa | Yes (downloaded) | pending | — | pending |
| CGAF-003-Rev 2 | svc-cgaf-student-visa | Yes (downloaded) | pending (priority regression case) | — | pending |
| CGAF-002-Rev3 | none (no catalogue row -- see prior report) | Yes (downloaded) | pending | — | pending |
| BOC04.QF.002 | svc-cgaf-work-visa | Yes (downloaded) | pending | — | pending |

## Actual tests run and results

- `bi-forms-library/tests/run-all.js` with `FIS_BI_ORIGINALS_DIR` pointed at the real originals: **running, results pending** (this run exercises every previously-skipped golden-reference/pixel-comparison/cross-leakage test — see this file's next update for pass/fail counts).

## Missing original PDFs / blockers

**None currently** — all 14 mapped forms' originals were successfully retrieved this session. (Prior sessions' skip-gating remains correct/necessary for any environment without this access, e.g. CI.)

## Outstanding defects (ranked by severity)

### FIXED this session

1. **[CRITICAL — data integrity] `approveBiForm` silently truncated overflowing character-box fields on the real, released document, with zero signal to staff.**
   The shared engine (`bi-forms-library/engine/lib/pdf-fields.js`'s `populateCharField`) has always correctly *detected* when a customer's answer is longer than its field's character-box count and pushed a structured entry to an `overflowReport` array — but `worker/src/routes/staffBiForms.js`'s `approveBiForm()` never read that report. It wrote the (silently truncated) staff PDF and composed the customer preview regardless, and released both. Confirmed reproducible: a 67-character address against a 20-box field truncates silently on the real `CGAF-003-Rev 2` original with no warning anywhere in the product.
   **Fix:** `approveBiForm` now throws `HttpError(422, ...)` listing every overflowing field by name, before anything is written to R2/D1, whenever `buildStaffDocument`'s `overflowReport` is non-empty. `fieldsForAudience(..., "staff")` already returns every drawable field regardless of audience, so this single check covers the customer preview's identical box geometry too — no separate instrumentation of the WASM/`svg-compose.js` preview path was needed for this blocking gate. Recoverable: staff shortens/corrects the answer via the pre-existing "customer field completions/corrections" form, then retries Approve.
   **Verified:** `e2e/tests/13-overflow-guard-and-cgaf003-regression.spec.js`, against the REAL authorized `CGAF-003-Rev 2` original (not a synthetic stand-in) — confirms the 422 + exact field name in the error, confirms no document row is written on the blocked attempt, then confirms the corrected answer passes and the real generated PDF downloads as a valid, non-trivial, correctly-headed PDF. See "Actual tests run" below for pass/fail status of this specific journey.
   **Known residual gap, not fixed this session (lower severity, UX only):** `svg-compose.js`'s char-box drawing (used for the Client Portal's *live, in-progress* preview while the customer is still typing, and for `composeAndFinalizeCustomerPreview`'s SEPARATE rendering path — see note below) still truncates with no in-UI indicator of its own. Since `approveBiForm` now blocks before that final customer-preview composition is ever reached when any overflow exists, the *released* customer preview can no longer be wrong — but the *live, pre-submission* preview can still silently show truncated text while the customer is typing, with no visual cue. Recommended follow-up (not attempted this session, Priority 3/7 territory): surface an inline "this answer is too long for the official form" warning in the wizard itself, reusing the same `v.length > nBoxes` comparison `svg-compose.js` already has the data for.

_No other defects confirmed yet — see "actual tests run" for what has and hasn't been exercised against real originals._

## Exact next actions for resuming this session

1. Check the background task output for `bi-forms-library/tests/run-all.js` (task id `bk4u3hah6` as of this writing) for pass/fail counts.
2. Triage any failures: determine if the defect is in the shared engine (`bi-forms-library/engine/lib/*`), a specific form's `coordinate-map.json`/`questionnaire.json`, or the PDF original itself.
3. Fix at the shared source where the defect is systemic; fix the specific form's config only where it's form-specific, with evidence.
4. Re-run only the affected form's targeted test (not the full suite) to confirm the fix, per the efficiency mandate.
5. Generate fictional-data sample PDFs per form (customer + staff audience) and visually inspect.
6. Update the form-by-form table above and this file's defect list, commit.
7. Proceed to the remaining priorities (pipeline integrity, security negative tests) only after the above is solid.
