# FIS Forms Library Engine — Phase 1 Completion Report

Phase 1 (shared engine architecture, implemented locally per the approved
migration plan) is complete. This report covers test results, visual
parity, security validation, files/dependencies changed, commit hashes,
and remaining blockers before Client Portal integration, as requested.

## 1. Test results

Full regression suite (`bi-forms-library/tests/run-all.js`, Node's
built-in `node:test`): **35 tests, 35 passing, 0 failing**, run against a
freshly reinstalled `node_modules` (from the committed `package-lock.json`,
confirming the pinned `ajv@8.17.1` / `pdf-lib@1.17.1` versions reproduce
exactly) with `FIS_BI_ORIGINALS_DIR` pointed at the three forms' real
original PDFs (kept locally only; never committed).

Without `FIS_BI_ORIGINALS_DIR` set (i.e. on a fresh clone of this repo,
where original BI templates are intentionally absent): **19 passing, 16
skipping cleanly, 0 failing**. The 19 that always run are schema
validation, fail-closed field-permission checks, and cross-file
consistency checks for all three forms, plus pure-logic tests of the
conditional/repeatable field-binding behavior (Court/Legal Yes/No,
1/2/3-trip resolution, the 4-trip rejection) — none of which need a PDF.

No failures in either mode. (One assertion -- a region-boundary height
check -- needed a small tolerance adjustment early on to account for
expected sub-pixel rasterization rounding at 300 DPI; this was a test
calibration fix, not an engine defect, and is reflected in the committed
test file.)

## 2. Visual parity findings

- **Golden-reference pixel parity**: `tests/golden/<formId>/{staff.png,customer-preview.png}` are committed for all three forms (fictional sample data only). The regression suite regenerates both documents from the same fixtures and asserts an **exact pixel match (`diffPixels: 0`)** against each golden — not a fuzzy similarity threshold. All 6 renders (3 forms × 2 audiences) matched exactly.
- **Manual visual inspection**: all three forms' engine-generated customer previews and staff documents were rendered and visually compared against the previously approved layouts from commit `960c5a9`. CDR and 2014-13-002 preserve their single-region crop boundary (ending immediately after Passport Number) and watermark opacity (0.22 / 0.12 respectively) exactly. 2014-13-006 preserves its two-region composite with the divider caption ("FIS staff prepare the remaining sections of this form"), the Court/Legal N/A fallback, and correctly leaves unused trip rows blank.
- No layout, boundary, ownership, or watermark value was changed from what was previously approved; the engine is a faithful consolidation, not a reimplementation.

## 3. Security validation results

Every customer-preview generation (via the CLI and via the test suite) runs, automatically:

- **Metadata assertion**: Author "Foreign Immigration Services", Creator "FIS Forms Library", Title matching the form — PASSED for all three forms.
- **Content-stream audit**: decompresses every content stream and searches for staff-only field values; also counts image XObjects (expect exactly 1 — the embedded composed canvas), annotations (expect 0), and embedded files (expect 0) — PASSED for all three forms, including a dedicated adversarial test that plants a distinctive marker string in 2014-13-006's staff-only Court/Legal fields (Court/Legal = YES path) and confirms it cannot be found anywhere in the customer preview.
- **Boundary-expansion non-recoverability audit**: restores MediaBox/CropBox/BleedBox/TrimBox/ArtBox to the full original page size and renders the result — the literal "expand the page and look" test from the 2026 audit, now run automatically on every generation rather than only on request. PASSED for all three forms: the expanded area is entirely blank, confirming the secure-reconstruction technique (render → crop → composite → embed in a brand-new PDFDocument never derived from the original) holds under the engine exactly as it did under the hand-written retrofits.
- **Fail-closed field-permission validation**: verified against real production data (all three forms' actual coordinate-map.json) with zero false positives, and independently confirmed to correctly refuse six distinct deliberately-broken scenarios (missing roles, contradictory roles, unknown field references in a questionnaire, a conditional customer question wired to a staff-controlled field without `informsStaffOnly`, mismatched repeatable-group `maxCount`, and a repeatable group configured for more rows than the PDF physically has).
- **Structurally non-drawable fields**: `fieldsForAudience()` cannot return a `bi_staff` or `customer_wet_ink` field for any audience, by construction (not by caller discipline) — asserted directly in the test suite for all three forms.

## 4. Files and dependencies added or changed

New, under `bi-forms-library/`:

- `engine/` — `cli.js`; `lib/` (field-permissions, pdf-fields, metadata, watermark, field-bindings, render-pipeline, validate, schema-validate, config-consistency, config-loader, validate-form, raster/ with a pluggable-backend `index.js` + `poppler-backend.js` + Python helper scripts); `schema/` (coordinate-map.schema.json, questionnaire.schema.json); `package.json` + `package-lock.json`.
- `configs/CCS-A-CDR-2016/`, `configs/2014-13-002/`, `configs/2014-13-006/` — each form's `coordinate-map.json` (previously approved values plus an added `watermark` block preserving the exact previously-approved text/opacity), `questionnaire.json` (new — formalizes the six-language question set, conditional logic, and repeatable groups, including migrating 2014-13-006's informal `questionnaireDesign` note), `sample-data.json`.
- `tests/run-all.js`, `tests/fixtures/**` (overlong values, Court/Legal Yes/No, 1/2/3-trip and invalid-4-trip scenarios — fictional data only), `tests/golden/**` (committed PNGs, fictional data only).
- `prototypes/README.md` and a superseded-notice header added to all 9 of the original per-form scripts (no behavior change).

Dependencies: exactly the two approved — `ajv@8.17.1` and `pdf-lib@1.17.1`, both exact-pinned in `engine/package.json`, with `engine/package-lock.json` committed and verified to reproduce those exact versions on a clean install. Raster backend remains Poppler (`pdftoppm`) only; Cloudflare Browser Rendering is not wired in, per instruction.

## 5. Commit hashes (this phase)

1. `341a6fb` — shared engine core (field-permissions, render-pipeline, raster, validate) + AJV schemas
2. `7c0e6ac` — CLI entry point + all three forms migrated to `configs/`
3. `3af2624` — regression suite + fixtures
4. `e80925e` — golden reference images + pixel-parity test
5. `3dde2b9` — `prototypes/` marked superseded

All five are pushed to `claude/fis-website-planning-r52sii`.

## 6. Remaining blockers before Client Portal integration

None of these were in scope for Phase 1 and none block Phase 1 itself — they are open items for whatever comes next:

- **No production rendering backend is wired in.** The engine's raster step still shells out to local Poppler (`pdftoppm`), which does not run inside a Cloudflare Worker. The screenshot-based Browser Rendering approach was recommended in the earlier POC but has not been implemented, approved for live use, or load-tested against the engine's actual output.
- **No Client Portal UI exists.** `questionnaire.json` defines the question contract (languages, conditional logic, repeatable groups) that a UI would need to honor, but no frontend consumes it yet.
- **Staff-side data entry is undefined.** Fields with `suppliedBy: "staff"` (contact numbers, Requesting Agency, Court/Legal section, Purpose, Documents to be Certified) are populated via whatever `data` object is passed to the engine; there is no staff tooling yet that produces that data object from a real review workflow.
- **Only 3 of 20 inventoried forms are migrated.** Extending to the rest of the roadmap is explicitly out of scope for this phase.
- **No live infrastructure was touched.** No Worker, D1, R2, or deployment changes were made; nothing here is reachable by the live website yet.

Phase 1 is complete pending your review.
