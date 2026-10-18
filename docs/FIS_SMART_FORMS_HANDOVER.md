# FIS Smart Application System — Handover

## Latest completed commit

`756296e` (branch `claude/fis-website-planning-r52sii`) — "Block document generation on character-box overflow instead of silently truncating". Working tree clean at time of writing.

## This session's unlock: real original PDFs are now available locally

A Cloudflare API token with R2 read access was provided by the user for this session only. Using it, all 14 mapped forms' real, confidential original PDFs were downloaded (`wrangler r2 object get ... --remote`) into a **local, non-repository scratch directory**, and the matching blank-region background PNGs were generated offline from those same originals via the existing `generate-blank-backgrounds.js` script (also local-only, never uploaded to the real bucket):

```
/tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/fis-bi-originals/      (14 <formId>.pdf files)
/tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/fis-bi-backgrounds/   (14 <formId>.png files)
```

**Neither directory is inside the git repository and neither was committed.** The confidential-originals policy (never commit real BI form PDFs to this repo) is unchanged and was not violated. The Cloudflare API token itself was used only as a transient shell environment variable; it was never written to any file, config, or commit.

All 14 originals verified as valid PDFs with page counts matching each form's own `coordinate-map.json` metadata: 1-page — `2014-01-011`, `2014-08-015`, `2014-13-002`, `2014-13-006`, `2021-03-001`, `ADM05.QF.001`, `ARD04.QF.003`, `CCS-A-CDR-2016`, `CCS-A-NTSP-2016`, `IRD04.QF.004`; 2-page — `BOC04.QF.001`, `BOC04.QF.002`, `CGAF-002-Rev3`, `CGAF-003-Rev 2`.

**To resume real-PDF verification in a future session:** if these scratch directories still exist, export:
```
export FIS_BI_ORIGINALS_DIR="/tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/fis-bi-originals"
export FIS_BI_BACKGROUNDS_DIR="/tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/fis-bi-backgrounds"
```
If they no longer exist (a fresh container), a new Cloudflare API token with R2 read access on this account would need to be supplied again by the user; re-fetch with `wrangler r2 object get "fis-bi-forms-library/originals/<formId>.pdf" --file <dest> --remote` per form, then re-run `node bi-forms-library/engine/scripts/generate-blank-backgrounds.js <outDir>` with `FIS_BI_ORIGINALS_DIR` set. **Never commit the token or the downloaded PDFs/PNGs.**

## Verified functionality (carried over from prior sessions, not re-audited here)

Guest checkout, GCash manual payment + staff verification, Client Portal, Staff Portal exception workflow, 6-language localization (UI + transactional emails), guided questionnaire with live preview and "I'm not sure" assistance, 7 newly-automated forms (`document_automated`), friendly form names, secure message attachments, CGAF-002-Rev3/BOC04.QF.002 staff-assignment disambiguation. Full detail in this branch's commit history and the two reports delivered in the immediately preceding session.

## Form-by-form progress and readiness classification

Classification key (per the governing directive — never auto-assigned to "Owner approved"):
- **Engineering verified**: automated tests + available real-PDF checks pass; owner acceptance still outstanding.
- **Needs correction**: a reproducible defect exists.
- **Verification blocked**: required evidence unavailable.
- **Owner approved**: not assigned by this session — requires explicit owner sign-off, which has not occurred.

| Form ID | Catalogue service / automation | Original + real-PDF regression | Visual inspection | Readiness |
|---|---|---|---|---|
| `CCS-A-CDR-2016` | `svc-cdr`, document_automated | Real original used; engine suite passes (metadata/leak/boundary audits); has a committed golden reference, matched pixel-for-pixel | Previously inspected (prior sessions); baseline in this session's full regression re-confirmed clean | **Engineering verified** |
| `2014-13-002` | `svc-bi-clearance`, document_automated | Real original used; golden reference matched pixel-for-pixel | Previously inspected | **Engineering verified** |
| `2014-13-006` | `svc-travel-records`, document_automated | Real original used; golden reference matched; staff-only Court/Legal leak-isolation test passes | Previously inspected | **Engineering verified** |
| `CCS-A-NTSP-2016` | `svc-ntsp`, document_automated | Real original used; engine suite passes (no golden reference committed yet — see below) | Not visually inspected this session (budget triage; lower risk, single-page, simple layout) | **Engineering verified** (pending golden reference / visual spot-check) |
| `2014-08-015` | `svc-acr-icard-cert`, document_automated | Real original used; engine suite passes; has a golden reference, matched | Previously inspected | **Engineering verified** |
| `2021-03-001` | `svc-travel-pass`, document_automated | Real original used; engine suite passes (no golden reference committed yet); also covered end-to-end by Playwright journey 10 (confidential-gated, now unblockable with the downloaded original) | Not visually inspected this session | **Engineering verified** |
| `2014-01-011` | `svc-ext-reconsideration`, document_automated | Real original used; golden reference matched | Previously inspected | **Engineering verified** |
| `ADM05.QF.001` | `svc-ctc-records`, document_automated | Real original used; engine suite passes (no golden reference committed yet) | Not visually inspected this session | **Engineering verified** |
| `ARD04.QF.003` | `svc-ecc-application`, document_automated | Real original used; engine suite passes (no golden reference committed yet) | Not visually inspected this session | **Engineering verified** |
| `IRD04.QF.004` | `svc-cgaf-tvv-extension`, document_automated | Real original used; engine suite passes (no golden reference committed yet) | Not visually inspected this session | **Engineering verified** |
| `BOC04.QF.001` | `svc-cgaf-immigrant-visa`, document_manual | Real original used; engine suite passes (no golden reference committed yet); CLI generation: 0 overflow issues, all audits PASSED | **Yes, this session** — both pages rendered to PNG and inspected; page 2's institutional section (signatures, "DO NOT FILL OUT THIS PORTION", ACR I-Card release conditions) correctly blank/staff-only, no misplacement | **Engineering verified** |
| `BOC04.QF.002` | `svc-cgaf-work-visa`, document_manual | Real original used; engine suite passes (no golden reference committed yet); CLI generation: 0 overflow issues, all audits PASSED | Generated and rendered this session (both pages); not line-by-line re-described here, same clean result as BOC04.QF.001 | **Engineering verified** |
| `CGAF-002-Rev3` | none (no catalogue row) | Real original used; engine suite passes (no golden reference committed yet); CLI generation: 0 overflow issues, all audits PASSED | Generated and rendered this session (both pages) | **Engineering verified** (and separately: no catalogue offering exists — see prior session's owner-approval item, unchanged) |
| `CGAF-003-Rev 2` | `svc-cgaf-student-visa`, document_manual | **Priority regression case.** Real original used throughout. CLI baseline generation: 0 overflow issues, all audits PASSED. Stress test (deliberately long names/address, 3 missing fields): correctly detected and reported 3 overflow issues, each listing the exact field, value, character count and box count — no silent truncation. Full end-to-end Playwright journey (13) against the real original: guest order → wizard → payment → staff review → **approval correctly BLOCKED (422)** on the overlong field → staff correction via existing customer-fields form → **approval succeeds** → real generated PDF downloaded and byte-verified (valid PDF header, >50KB, non-trivial) | **Yes, this session** — both pages rendered to PNG and visually inspected in detail: every character-box field precisely aligned (checkbox X-marks, comb-grid names/dates/addresses), 0-indexed page routing confirmed correct (15 charBoxFields correctly target page 2, matching `render-pipeline.js`'s `field.page \|\| 0` convention — NOT a bug, verified by reading the engine source, not assumed), institutional section (Commissioner approval, Visa Implementation Stamp) correctly rendered blank. One cosmetic observation: the rendered PDF's own footer reads "Page 1 of 1" even on a 2-page form — confirmed via `pdftotext` that this text is baked into the **original government PDF itself**, not introduced by this engine; correctly left unmodified per the explicit instruction never to alter official government wording | **Engineering verified** |

**Note on "no golden reference committed yet":** this is a different, lower-severity condition than "original unavailable" — it means no PNG reference image has ever been saved to `bi-forms-library/tests/golden/<formId>/` to diff future renders against for regression purposes. All such forms' renders were still generated and validated this session (metadata check, content-stream leak audit, boundary-expansion audit, and — for `CGAF-003-Rev 2`, `BOC04.QF.001`, `BOC04.QF.002`, `CGAF-002-Rev3` — direct visual inspection). No new golden references were committed this session, per the explicit instruction not to treat an automatically-generated reference image as owner-certified; that remains a follow-up task requiring the form owner's (or at minimum a second engineer's) sign-off on a specific rendered image before it is locked in as the regression baseline.

## Actual tests run and results

1. **`bi-forms-library/tests/run-all.js`** with `FIS_BI_ORIGINALS_DIR` pointed at the real originals (all 14 forms): **210 passed / 0 failed / 22 skipped**. 18 of the 22 skips are "no golden reference committed yet" (9 forms × 2, see table above); the remaining 4 are for forms outside the 14-form scope (Class B/C/D forms this session didn't download originals for, e.g. `2015-08-006`, correctly still gated).
2. **`worker` vitest suite** (full, after the overflow-guard fix): **342 passed / 0 failed / 2 skipped / 4 todo** (two separate checkpoint runs, both clean).
3. **`worker/test/email.test.js`**: 16/16 (carried over from the immediately preceding session, re-confirmed in the full-suite runs above).
4. **New: `e2e/tests/13-overflow-guard-and-cgaf003-regression.spec.js`** (Playwright, against the real `CGAF-003-Rev 2` original + a real-original-derived background PNG, both local-only): **1 passed / 0 failed**. First time this project's test history has byte-verified an actual generated PDF for this specific form.
5. **CLI-level generation + overflow/leak/boundary audits** (`bi-forms-library/engine/cli.js generate`) run directly against real originals for `CGAF-003-Rev 2` (baseline + stress), `BOC04.QF.001`, `BOC04.QF.002`, `CGAF-002-Rev3`: all PASSED (0 overflow on baseline data; stress run correctly caught 3 deliberately-induced overflows).
6. **Full local Playwright suite**: run once as a checkpoint earlier in this multi-session effort (prior commit `2142967`) — 22 passed / 2 skipped / 0 failed. Not re-run in full after this session's changes (per the explicit "avoid repeated full-suite runs" instruction); the overflow-guard fix and journey 13 were verified with targeted runs instead, and the full worker vitest suite (which exercises every route-level precondition the fix touches) was re-run clean.

**Nothing in this document claims a skipped or unexecuted test as passed.** Where "no golden reference" skips remain, they are reported as skipped, not passed.

## Outstanding defects (ranked by severity)

### FIXED this session

1. **[CRITICAL — data integrity, now fixed] `approveBiForm` silently truncated overflowing character-box fields on the real, released document, with zero signal to staff.**
   See commit `756296e` for full detail. The shared engine (`pdf-fields.js`'s `populateCharField`) always correctly detected overflow and populated an `overflowReport`; `staffBiForms.js`'s `approveBiForm()` discarded it. Now blocks approval (422, naming every overflowing field) before anything is written to R2/D1. Verified end-to-end against the real `CGAF-003-Rev 2` original.

### Residual gaps (not fixed this session — documented, not silently ignored)

2. **[LOW severity — UX only] The live, in-progress Client Portal preview (`svg-compose.js`, used while the customer is still typing, and for the WASM-based final customer preview compositing) has no overflow DETECTION of its own** — it truncates silently at the character level exactly like the pdf-lib path used to. Because `approveBiForm` now blocks before the final customer-preview composition step is ever reached when overflow exists, **the released/official customer preview can no longer be wrong** — this gap only affects the transient, pre-submission live preview, which the customer can still correct before submitting regardless. Recommended follow-up: add the same `value.length > nBoxes` check `svg-compose.js`'s char-box renderer already has the raw data for, and surface it as an inline wizard warning. Not attempted this session (Priority 3/7 territory, lower urgency than the Priority 1 fix already made).
3. **[LOW severity — traceability, not a correctness bug] No per-document mapping/questionnaire version or answers-snapshot is stored alongside each generated `documents` row.** A generated PDF always correctly reflects whatever `customer_answers_json`/`staff_answers_json` existed at the moment of generation (verified — each Approve/Regenerate reads current data fresh and inserts a new, never-overwritten `documents` row with its own timestamp), but reconstructing exactly what values produced a specific historical document requires cross-referencing `bi_form_submissions` status-history timestamps rather than reading it directly off the document row. Not implemented this session: it would need a schema migration and is a traceability/auditability enhancement, not an active correctness defect, so it was deliberately deprioritized below the Priority 1 fix per the explicit instruction to prioritize correctness over new infrastructure. Flagged here rather than silently skipped.
4. **[Pre-existing, unrelated to form accuracy] `backgrounds/<formId>.png` objects do not exist in the real production R2 bucket** for any of the 14 forms (confirmed by a direct failed fetch this session). This session generated all 14 locally (see above) for local testing only, per the generation script's own explicit "local-only, not applied without separate authorization" policy. Uploading them to the real bucket — required before the live preview feature can work in production — needs separate, explicit authorization and is a deployment action, out of scope for this session.

## Security/privacy audit (Priority 9)

Reviewed, not re-built: `worker/test/biForms-document-access.test.js` (8 tests) already covers cross-customer document-access denial, staff-only `staff_pdf` never downloadable by a client, publication-gating of `customer_preview`, per-submission publication isolation, and mismatched-submission-ID rejection. `worker/test/messageAttachments.test.js` (5 tests) covers the equivalent for message attachments. Confirmed by direct code read that every customer-facing BI-form route (`biFormsCustomer.js`, including the live-preview endpoint added in the prior session) consistently calls `requireOwnedSubmission` before touching submission data — no route found that skips this check. **No new tests were added**; existing coverage was judged adequate rather than re-derived, per the explicit instruction not to re-audit already-verified features.

## Exact next actions for resuming this session

1. If continuing real-PDF verification: re-export `FIS_BI_ORIGINALS_DIR`/`FIS_BI_BACKGROUNDS_DIR` (see above) if the scratch directories survived, or request a fresh Cloudflare API token from the user if not.
2. Visually inspect the remaining forms not yet spot-checked this session: `CCS-A-NTSP-2016`, `2021-03-001`, `ADM05.QF.001`, `ARD04.QF.003`, `IRD04.QF.004` (single-page, lower risk than the multi-page family already inspected, but not yet confirmed). Use `bi-forms-library/engine/cli.js generate <formId> --original <path> --out <dir>` then `pdftoppm -png -r 120 <pdf> <prefix>`.
3. Decide (with the form owner, or independently if authorized) whether to commit any of the above as official golden-reference images under `bi-forms-library/tests/golden/<formId>/` — only after explicit review, never auto-committed.
4. If pursuing the residual gaps above: implement live-preview overflow indication (gap #2) before the version-snapshot traceability enhancement (gap #3), since #2 is customer-facing UX and #3 is purely internal.
5. Decide on the two carried-over owner-approval items from the prior session (CGAF-002-Rev3's catalogue status; whether to wire up the unused `sendInstantServicesConfirmation` email) — unchanged, not re-litigated this session.
