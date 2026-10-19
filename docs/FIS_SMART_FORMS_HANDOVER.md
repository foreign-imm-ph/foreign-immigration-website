# FIS Smart Application System — Handover

## Latest completed commit

See "Fifth Production Release, Guest-Checkout Email Fix & Live-Preview Crash Fix" immediately below for this session's own commits (the newest work). Prior to that: `aa3b6a9` → `8e41878` (live-preview overflow warning fix) → `2713e59` (prior handover) → `756296e` (final-document overflow guard).

**Development branch** (`claude/fis-website-planning-r52sii`) **HEAD**: `593c4ec` — "Fix live-preview Worker crash on multi-page forms: lower background render DPI 300 -> 144". Working tree clean, pushed.

**Production**: `main` branch HEAD `8050afd` (docs-only commit, fast-forwarded — no functional change to the published site over `98609c5`). Live Worker version **`dbe186df-7ed4-46b9-a42b-93692d844397`**, deployed from commit `98609c5` (the fifth production release — see `docs/FIS_PRODUCTION_INTEGRATION_AND_RELEASE.md` §14 for its full execution record). **Production does NOT yet have this session's DPI fix (`593c4ec`)** — that commit exists only on the dev branch, not deployed, per explicit instruction to pause before any further production action.

## Fifth Production Release, Guest-Checkout Email Fix & Live-Preview Crash Fix (this session)

Covers, in chronological order: (a) execution of the fifth production release (migrations `0017`–`0022`, Worker deploy, site publish — already fully documented in `docs/FIS_PRODUCTION_INTEGRATION_AND_RELEASE.md` §14, not repeated here), and (b) investigating and fixing the owner-reported "Missing official BI form preview" issue on the newly-released Smart Application System, which is this section's main subject. Development paused here for a scheduled usage-allowance reset (resuming Saturday 24 October) — **nothing in part (b) has been deployed or uploaded to any production resource.**

### Confirmed causes (vs. hypotheses) of the broken live preview

1. **CONFIRMED — missing R2 objects.** All 14 `backgrounds/<formId>.png` objects are absent from the production `fis-bi-forms-library` R2 bucket. Verified directly this session via 14 individual `wrangler r2 object get --remote` existence checks (not inferred): every one returned "not found." This matches the owner-visible symptom exactly — `worker/src/lib/biFormRaster.js` throws `HttpError(501, ...)` when a background is missing, `biFormsCustomer.js`'s `/preview-image` route catches it and returns `{available:false}`, and `portal-bi-form.js` renders "A live preview isn't available for this form yet." This is a content/ops gap, not a code defect — the degrade-gracefully behavior is working exactly as designed.
2. **CONFIRMED — a second, more serious problem, found only by testing with the real asset instead of the test suite's synthetic 1x1 PNG stand-in.** Uploading a real background is necessary but was **not sufficient**: the 4 two-page forms' backgrounds (`BOC04.QF.001`, `BOC04.QF.002`, `CGAF-002-Rev3`, `CGAF-003-Rev 2`), rendered at the original 300 DPI (~58MB raw pixel data per form), caused the Worker to **lose its connection entirely** during live-preview composition (SVG embed + resvg-wasm render) — directly reproduced twice, for both `BOC04.QF.001` and `BOC04.QF.002` (the largest of the four), against a real local Workers runtime (`wrangler dev --local`, not a mock). The existing `try/catch` around this call in `biFormsCustomer.js` never saw the failure — this is a connection-level/isolate-level abort, not a catchable JS exception. Single-page forms are confirmed unaffected (`CCS-A-CDR-2016` rendered correctly at the original 300 DPI).
3. **Hypothesis, not directly instrumented**: the specific failure mechanism is believed to be the Workers isolate's memory ceiling (Cloudflare Workers limit this at 128MB; decoding + compositing + re-encoding a ~58MB raw two-page raster inside resvg-wasm plausibly exceeds it with V8/wasm overhead). This is the most consistent explanation and guided the fix, but **no explicit "out of memory" error was ever captured** — the only observed symptom was an abrupt, uncatchable "Network connection lost." Treat the mechanism as a strong inference, not a confirmed root cause, if this resurfaces differently in the future.
4. `CGAF-002-Rev3` and `CGAF-003-Rev 2` (the other two 2-page forms, same page-count/size class as the two tested) were **not individually crash-tested live** — only confirmed to regenerate cleanly at the new DPI through the same consistency check the tested forms passed. High confidence they behave the same as `BOC04.QF.001`/`BOC04.QF.002`, but this is inferred from size/structure similarity, not independently reproduced. Worth a quick direct check before activating either form's catalogue offering.

### Exact changes implemented (commit `593c4ec`, dev branch only)

- `bi-forms-library/engine/lib/svg-compose.js` and `bi-forms-library/engine/scripts/generate-blank-backgrounds.js`: shared `DPI` constant lowered from `300` to `144` (exactly 2x the PDF point base — chosen empirically: it was the only tested value that regenerates all 14 forms' backgrounds without tripping the existing `pureDims`/`rasterDims` geometry-consistency safety check; 150 DPI's rounding broke that check for one form, `2014-08-015`). `svg-compose.js` now also exports its `SCALE` constant.
- `bi-forms-library/tests/run-all.js`: fixed a latent, now-exposed test bug — one test independently re-hardcoded `SCALE = 300/72` instead of importing the real constant from `svg-compose.js`, so it silently drifted out of sync the moment DPI changed (this was the one test failure found mid-session; root-caused as a test-only staleness bug, not a real defect, and fixed by importing the shared constant instead of re-declaring it, so this specific drift can't recur).
- **Not committed, not uploaded anywhere**: the actual regenerated background PNGs. All 14 were regenerated locally at the new 144 DPI and are cached, confidential, outside the repository at:
  ```
  /tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/fis-bi-backgrounds-144dpi/   (14 <formId>.png files, ready to upload)
  ```
  (The original 300 DPI set generated in a prior session is still at the sibling `fis-bi-backgrounds/` directory — superseded, do not upload those.)

### Test results

- `bi-forms-library/tests/run-all.js` (engine's own regression suite, real confidential originals, full run after the fix): **274 tests, 246 pass, 0 fail, 28 skipped** (pre-existing — no golden reference committed yet for several forms; unrelated to this change, same skips as before).
- `worker/` vitest suite (full): **342 passed, 0 failed, 2 skipped, 4 todo**.
- Direct browser verification (ad hoc Playwright, run locally, not committed — ephemeral by design, matching the confidential-asset convention): real content (not the synthetic 1x1 stand-in) confirmed rendering correctly for `CCS-A-CDR-2016` (single-page) and `BOC04.QF.001`/`BOC04.QF.002` (both two-page, the largest), on both desktop and mobile viewports, including the open/close toggle and the enlarge control, with no crash at the new DPI. Screenshots were visually reviewed (official form layout intact, correctly blank, no sensitive content, no misalignment).

### Remaining production work (none of it done — owner approval required first)

1. Upload all 14 regenerated 144 DPI backgrounds (path above) to the production `fis-bi-forms-library` R2 bucket at `backgrounds/<formId>.png`, e.g. `wrangler r2 object put fis-bi-forms-library/backgrounds/CCS-A-CDR-2016.png --file=... --remote`.
2. Deploy the dev branch's current Worker code (commit `593c4ec`, includes the DPI fix) to production (`wrangler deploy`, bare, no `--env`) — production is still running the pre-fix Worker (`dbe186df...`, from `98609c5`).
3. No D1 migration, no site/`main` change, no catalogue/pricing change is needed for this fix — steps 1–2 alone restore the live-preview feature.
4. Recommended before activating either `CGAF-002-Rev3` or `CGAF-003-Rev 2` specifically (see confirmed-causes point 4 above): one direct live-preview check against real content for each, since only the other two 2-page forms were actually crash-tested.

### Outstanding defects, ranked

1. **[Was CRITICAL, now fixed — pending deployment] Live-preview Worker crash on 2-page forms at the original 300 DPI.** Fixed in commit `593c4ec`; not yet deployed (see "Remaining production work" above).
2. **[Operational, not a code defect] Missing R2 background objects in production.** Root cause of the original symptom; fix is the upload in "Remaining production work" item 1, pending owner approval.
3. **[LOW, unconfirmed assumption carried forward] `CGAF-002-Rev3`/`CGAF-003-Rev 2` 2-page live-preview behavior inferred, not directly tested** — see confirmed-causes point 4. Recommend a quick direct check before either is activated, not before the general fix is deployed.
4. All previously-recorded residual gaps (per-document version/answers-snapshot traceability; the staging DNS CNAME; golden-reference sign-off decisions) are unchanged by this session — see their original entries further down this document, not repeated here.

### Exact next steps for Saturday (24 October) — do not repeat the investigation above

1. Confirm with the owner: approve uploading the 14 cached 144 DPI backgrounds (path above) to production R2, and approve deploying dev branch commit `593c4ec` to the production Worker.
2. If approved: backup, upload the 14 backgrounds, `wrangler deploy` (no `--env`), then smoke-test exactly the live-preview feature end-to-end against the real production Worker for at least one single-page and one two-page form (a real click-through, not just an HTTP status check) — this is the one piece of direct production verification that hasn't happened yet for the actual fix.
3. Per "Remaining production work" item 4: do the one quick direct check on `CGAF-002-Rev3`/`CGAF-003-Rev 2` if either is being considered for catalogue activation.
4. Resume the owner's stated next objective from before this fix: configuring and activating real services one at a time through the published Staff Portal.

## Staging Environment Built (this session)

The owner reviewed `docs/FIS_STAGING_PLAN.md` and `docs/FIS_SMART_FORMS_HANDOVER.md` and approved building the private staging environment, with one architecture correction (shared-parent-domain, `staging.foreignimmigration.ph` / `staging-api.foreignimmigration.ph`, instead of the originally-proposed separate `pages.dev`/`workers.dev` domains — discovered during this session to be necessary because the existing session-cookie mechanism can't work across two unrelated domains). Full detail, exact resources, verification results, and the one remaining owner action (a single DNS record neither available API token could create) are all in **`docs/FIS_STAGING_PLAN.md`** (rewritten this session to reflect what was actually built, not what was proposed).

Summary: the staging Worker (`fis-backend-staging`), its isolated D1 database (all 22 migrations applied, zero customer data) and two isolated R2 buckets (one populated with all 14 confidential BI form originals + preview backgrounds, copied from local scratch materials, never committed to git) are fully deployed and verified end-to-end — 17 of 18 explicit acceptance checks passed against the real staging Worker (guest checkout, questionnaire, this session's own live-preview overflow warning, payment, staff verification, staff review, secure document access, order history). The one unverified step (final PDF generation via Approve) hit a `wrangler dev`-local CPU-time limit, not an application defect — see the staging plan's section 6 for why. Three Cloudflare Access applications (one per surface: staging API, staging frontend custom domain, and the Pages project's own default domain as a backstop) gate everything, using a newly-created One-Time-PIN identity provider and a policy restricted to the Cloudflare account's own owner email (read directly from the Cloudflare account, never a personal email hardcoded into the repo). No production resource was touched — verified directly via the Cloudflare API before and after every step.

Files changed this session: `worker/wrangler.toml` (new `[env.staging]` block), `package.json` (new `build:staging` script), `scripts/set-staging-api-base.js` (new — staging-only build postprocess, inert for the production build), `functions/_middleware.js` (new — Cloudflare Pages Function, the Access-gating backstop for the shared `pages.dev` domain), `docs/FIS_STAGING_PLAN.md` (rewritten), this handover.

**Owner action still needed**: add one CNAME DNS record (`staging` → `fis-staging.pages.dev`, proxied) to finish wiring up the staging frontend's custom domain — see the staging plan's section 4 for the exact value and why neither available API token could do this step itself.

## Final Development Session — Preservation, Live-Preview Fix, Visual Inspections, Staging Plan

This section records the outcome of the "FIS — Final Development Session, GitHub Preservation and Staging Preparation" directive. It supersedes nothing above (kept intact as history) but is the authoritative status as of session end.

### 1. Preservation check (directive item 1)

Confirmed at session start: repository `foreign-imm-ph/foreign-immigration-website`, branch `claude/fis-website-planning-r52sii`, latest commit `2713e59`, working tree clean. All prior session's work (the overflow guard commit `756296e` and its handover commit `2713e59`) was already pushed — nothing was found uncommitted.

### 2. Live-preview overflow fix (directive item 2) — DONE, commit `8e41878`

The gap recorded below as "Residual gap #2" (in the pre-existing section further down this document) is now fixed. Summary:

- `bi-forms-library/engine/lib/svg-compose.js`'s `buildFieldTextElements`/`buildComposedSvg` now collects an `overflowFields` array using the exact same `value.length > nBoxes` comparison `pdf-fields.js`'s `populateCharField` (the final-document guard, commit `756296e`) already uses, against the same coordinate-map box-count data — not a second, independently-maintained threshold.
- `worker/src/lib/biFormRaster.js` and `worker/src/routes/biFormsCustomer.js` thread `overflowFields` through to the live-preview JSON response (`/api/bi-forms/.../preview-image`).
- `src/assets/js/portal-bi-form.js` renders a non-blocking, localized (`overflowWarning` STRINGS key, all 6 languages) warning beside the affected field, stating the character count, the form's actual limit, that the full answer is already saved untouched, and what the customer can do. It **never blocks** continuing or checkout — only the final-document guard at Approve does that; this is a warning surfaced earlier, not a second gate.
- CSS: `.portal-overflow-warning` added to `src/assets/css/style.css`.
- Tests added to `bi-forms-library/tests/run-all.js` (per-form, 14 forms): an agreement test (same overlong value fed to both `buildStaffDocument` and `buildComposedSvg`, asserts both flag the identical field), a zero-false-positive test against ordinary baseline data, and a correction-clears-the-warning test. Two forms (`2014-01-011`, `IRD04.QF.004`) have no customer-visible char-box field at all (checkbox-only forms) — these three tests skip cleanly for those two, rather than asserting a false universal invariant (an early version of this test wrongly assumed every form has one, caught and fixed before committing — see "Actual tests run" below).
- A new Playwright test (`e2e/tests/08-bi-form-wizard.spec.js`) drives the real wizard UI: types a 40+ character `lastName` (CCS-A-CDR-2016's field has 39 boxes), asserts the warning appears with the correct box count, asserts the input's value is never truncated, then corrects it and asserts the warning clears.
- All verified passing before commit (see "Actual tests run" below). Pushed as `8e41878`.

**Environment note for the next session**: this branch's e2e suite needs `worker/.dev.vars` (gitignored, never committed) with `PUBLIC_SITE_URL="http://127.0.0.1:8080"` and `DEV_STAFF_BYPASS_EMAIL="dev-staff@local.test"` — documented in `e2e/README.md` and written identically by `.github/workflows/e2e.yml`'s CI step. A fresh container/session has no `.dev.vars` file; create it (exact two lines above) before running `npx playwright test` locally. This is routine, not a defect — CI does the same thing on every run.

### 3. Visual inspections of the 5 remaining forms (directive item 3) — DONE

All 5 confidential originals were still present in this session's scratch directory (`FIS_BI_ORIGINALS_DIR`, same path as the prior session). Each form's staff document and customer-fields document were generated from sample data, rasterized to PNG at 200 DPI, and visually compared side-by-side against the real original:

| Form ID | Finding |
|---|---|
| `CCS-A-NTSP-2016` | Clean. All char-box fields (name, DOB, address, passport, contact) aligned precisely; gender checkbox (F) correctly marked; staff-only "Certification and Clearance Section" window and the "Claim Stub" both correctly rendered blank (no customer data placed there); zero overflow. |
| `2021-03-001` | Clean. "SPECIAL VISA FOR EMPLOYMENT GENERATION" and "Married" checkboxes correctly marked; all name/address/date char-boxes aligned; spouse name/address correctly populated only because marital status triggered it; zero overflow. |
| `ADM05.QF.001` | Clean. "Female" checkbox correctly marked; "Date Requested" and "Date of Birth" comb-boxes aligned with no drift; staff-only "Verified By / Date-Time / Remarks / Document(s) to be CTC / Copies to be CTC" fields and the "Claim Stub" correctly separate from the customer-fields document (already proven by the existing automated per-field ink-check test for this form); zero overflow. |
| `ARD04.QF.003` | Clean. "Emigration Clearance Certificate", "Married", "Female" checkboxes correctly marked; mobile-number "+63" static prefix correctly preserved ahead of the filled number; SSRN/Derogatory Record box (staff-only) correctly separate from customer view; all three date-of-birth/admission/departure comb-box groups aligned; zero overflow. |
| `IRD04.QF.004` | Clean. "Personal", "Regular", "Two (2) months", "M", "Married" checkboxes all correctly marked; multi-line "reason for extension" free text correctly wrapped across its allotted lines; "Name and signature of evaluator" (staff-only) correctly left for staff; all comb-box date groups aligned; zero overflow. |

**No confirmed defects found in any of the 5.** Per the governing directive, none of these is marked "owner-approved" — this is an engineering inspection only; owner sign-off is a separate, explicit step not taken by this session. No mapping or configuration changes were made to any of the 5 forms (none were needed).

### 4. Staging environment plan (directive item 4) — DONE, plan only

See **`docs/FIS_STAGING_PLAN.md`** (new, committed this session) for the full proposed architecture: a separate Cloudflare Pages project (frontend, building only from this branch) plus a second Wrangler `[env.staging]` environment on the existing `fis-backend` Worker code (API), both on default `*.pages.dev`/`*.workers.dev` subdomains — no DNS changes, no new paid infrastructure, isolated D1 + R2, Cloudflare Access gating the *entire* staging surface (reusing the existing Zero Trust team), and email reliably suppressed by simply never setting `RESEND_API_KEY` on the staging Worker (confirmed this session that the existing code already no-ops safely without it). **Nothing has been deployed or created in Cloudflare.** The plan ends with an explicit numbered list of approval decisions the owner needs to make before anything is provisioned.

### 5. This handover (directive item 5) — DONE (this update)

### 6/7/8. Usage-limit discipline, deployment constraints, final report

No merge to `main`, no deployment, no production Cloudflare resource touched, no catalogue/price/payment-method changes, no re-litigation of already-verified form mappings. See the "Final report" at the very end of this document for the exact 8-point summary the directive requires.

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
| `CCS-A-NTSP-2016` | `svc-ntsp`, document_automated | Real original used; engine suite passes (no golden reference committed yet — see below) | **Visually inspected this Final Development Session** — clean, no defects (see section 3 above) | **Engineering verified** |
| `2014-08-015` | `svc-acr-icard-cert`, document_automated | Real original used; engine suite passes; has a golden reference, matched | Previously inspected | **Engineering verified** |
| `2021-03-001` | `svc-travel-pass`, document_automated | Real original used; engine suite passes (no golden reference committed yet); also covered end-to-end by Playwright journey 10 (confidential-gated, now unblockable with the downloaded original) | **Visually inspected this Final Development Session** — clean, no defects (see section 3 above) | **Engineering verified** |
| `2014-01-011` | `svc-ext-reconsideration`, document_automated | Real original used; golden reference matched | Previously inspected | **Engineering verified** |
| `ADM05.QF.001` | `svc-ctc-records`, document_automated | Real original used; engine suite passes (no golden reference committed yet) | **Visually inspected this Final Development Session** — clean, no defects (see section 3 above) | **Engineering verified** |
| `ARD04.QF.003` | `svc-ecc-application`, document_automated | Real original used; engine suite passes (no golden reference committed yet) | **Visually inspected this Final Development Session** — clean, no defects (see section 3 above) | **Engineering verified** |
| `IRD04.QF.004` | `svc-cgaf-tvv-extension`, document_automated | Real original used; engine suite passes (no golden reference committed yet) | **Visually inspected this Final Development Session** — clean, no defects (see section 3 above) | **Engineering verified** |
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

### Final Development Session's own test runs (this session, on top of the above)

7. **`bi-forms-library/tests/run-all.js`, full run** with `FIS_BI_ORIGINALS_DIR` set (all 14 forms, including the 3 new overflow tests added per form): first run caught a genuine test-fixture bug (2 forms with no customer-visible char-box field broke an assumption in the new tests' own setup, not a production-code defect) — **4 failed**, root-caused and fixed (tests now skip cleanly for those 2 forms), then **confirmed via a targeted rerun of just the overflow tests** (`--test-name-pattern="overflow"`, not the full suite, per the "don't rerun unnecessarily" instruction): **64 passed / 0 failed / 6 skipped** (6 = 2 forms × 3 tests, correctly skipped for having no char-box field).
8. **New Playwright test** (`e2e/tests/08-bi-form-wizard.spec.js`, "live-preview overflow warning"): run standalone against a real `wrangler dev` process: **1 passed**. (Required creating the gitignored, undocumented-as-missing `worker/.dev.vars` first — see the environment note in the "Final Development Session" section above; this is routine local/CI setup, not a code change.)

**Nothing in this document claims a skipped or unexecuted test as passed.** Where "no golden reference" skips remain, they are reported as skipped, not passed.

## Outstanding defects (ranked by severity)

### FIXED this session

1. **[CRITICAL — data integrity, now fixed] `approveBiForm` silently truncated overflowing character-box fields on the real, released document, with zero signal to staff.**
   See commit `756296e` for full detail. The shared engine (`pdf-fields.js`'s `populateCharField`) always correctly detected overflow and populated an `overflowReport`; `staffBiForms.js`'s `approveBiForm()` discarded it. Now blocks approval (422, naming every overflowing field) before anything is written to R2/D1. Verified end-to-end against the real `CGAF-003-Rev 2` original.

### FIXED in the Final Development Session (this session)

2. **[Was LOW severity — UX only, now FIXED] The live, in-progress Client Portal preview had no overflow DETECTION of its own.** See commit `8e41878` and the "Final Development Session" section above for full detail. `svg-compose.js` now reports the same `value.length > nBoxes` condition the final-document guard already enforces, and the wizard shows a non-blocking, localized, per-field warning. Verified to agree with the final-document guard by direct automated test (same overlong input, both pipelines flag the same field) across all 14 forms (12 with a customer-visible char-box field; 2 checkbox-only forms correctly have nothing to flag).

### Residual gaps (not fixed this session — documented, not silently ignored)

3. **[LOW severity — traceability, not a correctness bug] No per-document mapping/questionnaire version or answers-snapshot is stored alongside each generated `documents` row.** A generated PDF always correctly reflects whatever `customer_answers_json`/`staff_answers_json` existed at the moment of generation (verified — each Approve/Regenerate reads current data fresh and inserts a new, never-overwritten `documents` row with its own timestamp), but reconstructing exactly what values produced a specific historical document requires cross-referencing `bi_form_submissions` status-history timestamps rather than reading it directly off the document row. Not implemented this session: it would need a schema migration and is a traceability/auditability enhancement, not an active correctness defect, so it was deliberately deprioritized below the Priority 1 fix per the explicit instruction to prioritize correctness over new infrastructure. Flagged here rather than silently skipped.
4. **[Pre-existing, unrelated to form accuracy] `backgrounds/<formId>.png` objects do not exist in the real production R2 bucket** for any of the 14 forms (confirmed by a direct failed fetch this session). This session generated all 14 locally (see above) for local testing only, per the generation script's own explicit "local-only, not applied without separate authorization" policy. Uploading them to the real bucket — required before the live preview feature can work in production — needs separate, explicit authorization and is a deployment action, out of scope for this session.

## Security/privacy audit (Priority 9)

Reviewed, not re-built: `worker/test/biForms-document-access.test.js` (8 tests) already covers cross-customer document-access denial, staff-only `staff_pdf` never downloadable by a client, publication-gating of `customer_preview`, per-submission publication isolation, and mismatched-submission-ID rejection. `worker/test/messageAttachments.test.js` (5 tests) covers the equivalent for message attachments. Confirmed by direct code read that every customer-facing BI-form route (`biFormsCustomer.js`, including the live-preview endpoint added in the prior session) consistently calls `requireOwnedSubmission` before touching submission data — no route found that skips this check. **No new tests were added**; existing coverage was judged adequate rather than re-derived, per the explicit instruction not to re-audit already-verified features.

## Exact next actions for resuming this session

All 4 engineering-priority items from the prior handover (real-PDF verification, live-preview overflow fix, visual inspections, golden-reference decision groundwork) are now either done or reduced to owner decisions, not engineering work. What's left:

1. **Owner decisions needed before any further engineering work** (nothing below is blocked on usage/time, all are blocked on the owner):
   - Review and approve (or redirect) `docs/FIS_STAGING_PLAN.md` — see its own numbered approval-steps section. Nothing in Cloudflare has been created yet.
   - Decide whether to commit any of this session's (or prior sessions') rendered sample PDFs as official golden-reference images under `bi-forms-library/tests/golden/<formId>/` for the 9 forms still missing one (`CCS-A-NTSP-2016`, `2021-03-001`, `ADM05.QF.001`, `ARD04.QF.003`, `IRD04.QF.004`, `BOC04.QF.001`, `BOC04.QF.002`, `CGAF-002-Rev3`, `CGAF-003-Rev 2`) — only after explicit review, never auto-committed.
   - Decide on the two carried-over owner-approval items from a prior session (CGAF-002-Rev3's catalogue status; whether to wire up the unused `sendInstantServicesConfirmation` email) — unchanged, not re-litigated this session.
   - Sign off (or not) on owner acceptance for any form currently "Engineering verified" — no form in this document has been marked "Owner approved" by any session; that step is exclusively the owner's.
2. **If/when staging is approved**: follow `docs/FIS_STAGING_PLAN.md`'s exact resource list and command shapes (new Cloudflare Pages project, new D1 database + migrations, new R2 bucket(s), new Cloudflare Access application, `wrangler deploy --env staging`).
3. **Residual gap #3** (per-document version/answers-snapshot traceability, see above) remains open and low-priority — a schema migration, not a correctness fix. Pick it up only if there's no owner-decision work pending and usage budget allows a full engineering cycle (don't start it with limited remaining budget, per the directive's own priority order).
4. **To resume real-PDF work in a future session** (visual spot-checks, golden-reference capture, etc.): re-export `FIS_BI_ORIGINALS_DIR` (see the top of this document) if the scratch directories survived this container's lifetime, or request a fresh Cloudflare API token from the user if not.

## Final report (per the "Final Development Session" directive's required 8-point summary)

1. **Exact latest commit pushed to GitHub**: `8e41878` ("Warn on live-preview field overflow instead of silently truncating"), branch `claude/fis-website-planning-r52sii`. This handover update and `docs/FIS_STAGING_PLAN.md` are committed in a follow-up commit at the very end of this session (see this document's own top commit reference once that lands).
2. **Working tree**: clean as of the commit above, except this handover update and the new staging-plan document, both committed together immediately after this document was finalized.
3. **Outstanding issues fixed this session**: the live-preview silent-truncation gap (residual gap #2 from the prior handover) — now detects overflow, warns the customer in all 6 languages, never blocks, and is verified to agree with the final-document guard.
4. **Forms visually verified this session**: `CCS-A-NTSP-2016`, `2021-03-001`, `ADM05.QF.001`, `ARD04.QF.003`, `IRD04.QF.004` — all 5, all clean, no defects found (none marked owner-approved).
5. **Tests passed / skipped**: see "Actual tests run" above in full; headline numbers — engine suite 64/64 new overflow tests passing (6 correctly skipped for the 2 checkbox-only forms), new Playwright overflow-warning test passing, full worker vitest suite previously clean and not touched by this session's changes in a way that would invalidate it (no worker route logic changed beyond threading one new JSON field through).
6. **Staging readiness**: a complete architecture plan exists (`docs/FIS_STAGING_PLAN.md`) but **nothing has been deployed**. Approval needed on: the overall Pages+Workers-environment approach, the BI-forms-library bucket-sharing decision, and explicit authorization to create each new Cloudflare resource listed in the plan.
7. **Exact next action on resume**: read this document's "Exact next actions" section above — in short, the engineering queue is empty pending owner decisions; the next session should start by asking the owner which of the decisions in that section to act on, rather than starting new engineering work unprompted.
