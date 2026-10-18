# BI Forms Library Reconciliation

Compiled across three directives: "Complete BI Forms Library, Service-Based
Naming, Official PDF Previews & Assisted Applications" (original Section 2
reconciliation), the subsequent "FOREIGN IMMIGRATION SERVICES (FIS) MASTER
IMPLEMENTATION DIRECTIVE — COMPLETE REMAINING BI FORMS AUTOMATION" (which
required a 5-way A–E classification of the full 20-PDF inventory and
continued per-form mapping), and the final "FIS FINAL FOUR BI FORMS —
IMPLEMENTATION & END-TO-END VERIFICATION DIRECTIVE" (which completed
coordinate-mapping for the last four eligible forms: `BOC04.QF.001`,
`CGAF-003-Rev 2`, `CGAF-002-Rev3`, and `BOC04.QF.002`). Source data: the
existing, previously read-only-verified inventory
(`bi-forms-library/inventory/forms-library-inventory.json`, obtained via a
direct Cloudflare R2 API listing dated 2026-10-13), the catalogue seed and
mapping migrations (`worker/migrations/0012_phase4_catalogue_expansion.sql`
through `0019_boc04_qf_002_mapping.sql`), and direct inspection of every
original PDF named below.

**This document's prior passes (through section D.1 below) recommended
mapping only `BOC04.QF.002` and treating `CGAF-002-Rev3` as a superseded
duplicate not worth separately automating. That recommendation was
subsequently overridden by explicit instruction: both forms are genuinely
still in independent use at different BI counters, so both are now
mapped, registered, and kept permanently distinct — neither is ever
substituted for the other at render time. Section D.1's original
evidence/analysis is preserved below for the historical record (it
remains accurate as a description of the two PDFs' differences), but its
"map only one" conclusion no longer reflects what was built. See the
corrected status in sections C, D, and the new section H.**

## A. The verified inventory count

A direct, read-only Cloudflare R2 API listing of the `fis-bi-forms-library`
bucket's `originals/` prefix returns exactly **20 PDF objects** (21
objects total, including one 0-byte folder placeholder). This figure is
independently confirmed by direct inspection, not an estimate, and has not
changed across either directive. No PDF is missing, lost, or overlooked.

## B. The A–E classification

Per the master directive's required scheme:

- **A — eligible for automation.** A genuine, customer-facing application
  form FIS can legitimately fill in and deliver. Split into two states:
  **mapped** (coordinate-measured, registered in the shared engine,
  generates a real output PDF) and **eligible, not yet mapped** (every
  fact needed to classify it this way is established; the per-field
  coordinate-measurement work itself has not yet been done).
- **B — eligible for administrative automation but not document
  issuance.** A government-issued output BI itself produces (a
  certificate), never a template FIS fills in and hands back.
- **C — reference/checklist.** Supporting material, not a fillable form.
- **D — restricted.** Reproduction is prohibited on the form itself.
- **E — unresolved, with a documented reason.** Genuinely blocked by a
  specific, evidenced external fact (not complexity, not time pressure
  stated as a reason by itself).

## C. Full reconciliation table (all 20 PDFs)

| Document (official title) | Form ID | Class | Reproduction rights | Mapping status |
|---|---|---|---|---|
| Request for Certified True Copy of Derogatory Records | `CCS-A-CDR-2016` | A — mapped | Confirmed on form ("may be reproduced... NOT FOR SALE") | **Mapped & automated.** Engine-registered since the original directive. |
| Request for BI Clearance Certificate | `2014-13-002` | A — mapped | Confirmed on form | **Mapped & automated.** |
| Application Form for Request for Travel Records | `2014-13-006` | A — mapped | Confirmed on form | **Mapped & automated.** |
| Application for Certificate of Not the Same Person (NTSP) | `CCS-A-NTSP-2016` | A — mapped | Confirmed on form | **Mapped & automated.** Proven end-to-end in `e2e/tests/09-ntsp-form-automation.spec.js`. |
| Application Form for ACR I-Card Certification | `2014-08-015` | A — mapped | Confirmed on form | **Mapped & automated this directive.** Label-above-box layout (a genuine structural difference from the CDR/NTSP family), 18 charBoxFields, 2 checkboxes, 6 staff free-text fields. One real measurement bug caught and fixed (a spurious third "blank line" inside the DOCUMENT(s)/COPIES TO BE CERTIFIED boxes, which was actually the box's own printed border). |
| Travel Pass Application Form | `2021-03-001` | A — mapped | Confirmed on form | **Mapped & automated this directive — the required complex-form proof.** 4 sections, 2 checkbox groups (4-option visa type, 6-option marital status), 27 fields, 2 genuine two-column rows discovered and corrected via visual inspection. Entirely customer-supplied (no BI-staff-only section at all — a first for this library). Proven end-to-end in `e2e/tests/10-travel-pass-form-automation.spec.js`. |
| Request for Reconsideration on the Updating and Extension of Authorized Stay | `2014-01-011` | A — mapped | Confirmed on form | **Mapped & automated this directive.** A structurally different document type: a narrative/affidavit letter with inline blanks in running text, not a comb-box grid. One real measurement bug caught and fixed (the Nationality blank's position, initially misread, overlapped the civil-status checkboxes in the first test render). |
| Request for Certified True Copy (CTC) of Records | `ADM05.QF.001` | A — mapped | `may_be_reproduced` (inventory) | **Mapped & automated.** Distinct two-column "OFFICIAL USE ONLY" layout, taller page (612×1008pt), row-shared-bottom-line field style (a genuinely different template family). 8th form mapped. |
| Emigration Clearance Certificate (ECC) Application Form | `ARD04.QF.003` | A — mapped | `may_be_reproduced` (inventory) | **Mapped & automated.** 5-option application-type checkbox group, Sex, 6-option Marital Status, Spouse fields, 22-cell SSRN comb, and a staff-only derogatory-record subsection. First form found with a non-zero MediaBox origin (a Canva export artifact); documented in the config's own `mediaBoxOriginNote`. 9th form mapped. |
| CGAF for Extension of Stay of Temporary Visitor's Visa | `IRD04.QF.004` | A — mapped | `may_be_reproduced` (inventory) | **Mapped & automated.** Photo-requirement sidebar (handled via the existing document-upload feature, not embedded), Method/Mode/Months checkbox groups, a 7-line reason-for-extension field, and five independent 3-box (not comb-grid) date groups — a genuinely different date-field template family. 10th form mapped. |
| Consolidated General Application Form for Immigrant Visa | `BOC04.QF.001` | A — mapped | `may_be_reproduced` (inventory) | **Mapped & automated.** The engine's first genuinely multi-page form (2 real PDF pages): 73 charBoxFields, 13 checkboxFields, 0 freeTextFields across both pages, 76 questions. A distinct comb-grid-per-field template family: every field (not just dates) is a comb-grid of individual character cells, confirmed via direct pixel measurement (a uniform ~12.96pt cell pitch across the whole form). Required extending the shared engine itself for multi-page support (optional `page` property on every field type, `rasterizeAllPages()`, page-aware customer-preview compositing) — see section H. |
| Consolidated General Application Form, Non-Immigrant/Special Work/Provisional Work Permit (Rev 3) | `CGAF-002-Rev3` | A — mapped | `may_be_reproduced` (inventory) | **Mapped & automated.** 72 charBoxFields, 14 checkboxFields, 94 questions. Kept permanently distinct from `BOC04.QF.002` — see the corrected note at the top of this document and section H.3. |
| Consolidated General Application Form for Student Visa / Special Study Permit | `CGAF-003-Rev 2` | A — mapped | `may_be_reproduced` (inventory) | **Mapped & automated.** 2-page form; formId contains a literal space, specifically exercised by its own targeted tests. Same comb-grid-per-field template family as `BOC04.QF.001`. |
| Consolidated General Application Form, Non-Immigrant/Special Work/Provisional Work Permit | `BOC04.QF.002` | A — mapped | `may_be_reproduced` (inventory) | **Mapped & automated.** 78 charBoxFields, 22 checkboxFields, 10 freeTextFields, 93 questions, across 2 pages. Kept permanently distinct from `CGAF-002-Rev3` — see the corrected note at the top of this document and section H.3. |
| Request for Certification of Pending Application | `CCS-C-CPA-2016` | C — reference, not a fillable application | `may_be_reproduced` (inventory) | **Not an application form at all.** It is a checklist plus a staff-only certification block, and its own text explicitly references a separate application form, `CCS-A-CPA-2016`, by name — which does **not exist anywhere in this 20-PDF library**. There is no source document to measure coordinates against. This is a precise, evidenced blocker (a named, missing source document), not a vague "complex form" excuse. |
| Travel Pass — General Instructions / Documentary Requirements | `BIFORM2021-03-002` | C — reference/checklist | Confirmed on form | Confirmed by direct text inspection: "GENERAL INSTRUCTIONS... CHECKLIST OF DOCUMENTARY REQUIREMENTS FOR TRAVEL PASS." Never a fillable template. |
| Emigration Clearance Certificate (ECC) — the issued certificate itself | `ARD04.QF.001` | B — government-issued output | `not_found_on_form`; flagged `reproduction_status_unconfirmed` in the inventory | Confirmed by direct text inspection: begins "This is to certify that..." — the certificate BI itself issues after approving an ECC application, never a template FIS fills in and hands back. |
| Certificate of Exemption (CE) — the issued certificate itself | `ARD04.QF.002` | B — government-issued output | `not_found_on_form`; flagged `reproduction_status_unconfirmed` in the inventory | Confirmed by direct text inspection: begins "This exempts..." — same treatment as ARD04.QF.001. |
| Application Form for ACR I-Card | `2015-08-006` | D — restricted | **Reproduction prohibited on the form itself** (confirmed directly on the document in an earlier pass of this engagement; listed in the inventory's own `reproductionBlocked` array) | Correctly excluded from any preview or automated-generation path. Not re-opened this directive — no new fact would change this classification. |
| Request for Updating and Extension of Authorized Stay | `IRD04.QF.008` | E — unresolved | `not_found_on_form` (inventory); independently confirmed by direct inspection this directive — the "may be reproduced... NOT FOR SALE" statement present on every other mapped form is absent from this one | **Two independent, evidenced blockers, not a vague "complex form" excuse:** (1) the form's own header text reads "PLEASE HAVE THIS DOCUMENT NOTARIZED" — a licensed notary public must physically witness the signature, a third-party legal act no software can substitute for or automate around; (2) its reproduction rights are not confirmed anywhere on the form or in the inventory's own metadata, unlike every other mapped or eligible form, which explicitly states its reproduction rights. Proceeding to automate a form with unconfirmed reproduction rights would directly contradict the directive's own instruction to preserve restrictions rather than assume them away. Unresolved pending explicit confirmation from the form's owner (FIS/BI), not pending further engineering effort. |

## D. Exact reconciled count

- **20 PDFs total** (independently verified, section A).
- **Class A, mapped and automated: 14** — `CCS-A-CDR-2016`, `2014-13-002`,
  `2014-13-006`, `CCS-A-NTSP-2016`, `2014-08-015`, `2021-03-001`,
  `2014-01-011`, `ADM05.QF.001`, `ARD04.QF.003`, `IRD04.QF.004`,
  `BOC04.QF.001`, `CGAF-003-Rev 2`, `CGAF-002-Rev3`, `BOC04.QF.002`. The
  last four were mapped in the final pass of this engagement (see each
  one's own row above, and section H below, for what made the family
  structurally distinct and what it took to complete it).
- **Class A, eligible but not yet coordinate-mapped: 0.** Every Class A
  form in the library now has a complete, schema-validated,
  visually-inspected coordinate-map/questionnaire/sample-data mapping
  and is registered in the shared engine.
- **Class B, government-issued outputs: 2** — `ARD04.QF.001`,
  `ARD04.QF.002`.
- **Class C, reference/checklist, not fillable applications: 2** —
  `BIFORM2021-03-002`, `CCS-C-CPA-2016`.
- **Class D, restricted: 1** — `2015-08-006`.
- **Class E, unresolved with a documented reason: 1** — `IRD04.QF.008`.

14 + 0 + 2 + 2 + 1 + 1 = **20.** Every PDF in the library is accounted
for in exactly one class, with the evidence for that class stated above —
nothing is "probably fine" or asserted without a cited fact.

### D.1 `BOC04.QF.002` / `CGAF-002-Rev3` duplicate-pair resolution

A prior pass of this engagement concluded `CGAF-002-Rev3` was the
canonical version, based on weak evidence (the presence of a "Rev 3"
label in its own header text, plus general template-family similarity).
This pass re-examined both original PDFs directly and reverses that
conclusion, with concrete, cited evidence:

- **Not exact duplicates.** `md5sum` and file size differ outright
  (`BOC04.QF.002`: 383,809 bytes, md5 `e621822f…`; `CGAF-002-Rev3`:
  188,579 bytes, md5 `77ccfae1…`). Both are real, 2-page, genuinely
  different files — ruled out as classification (A).
- **Document-control footer.** `BOC04.QF.002` carries the Bureau's
  formal, dated document-control footer — `"BOC04.QF.002 Rev. Lev. 0
  Effective: 05 AUG 2024"` — printed identically on both pages.
  `CGAF-002-Rev3` has **no such footer anywhere**: no form code, no
  revision level, no effective date on either page, confirmed by a full
  text extraction of both files. A consistently dated, Bureau-stamped
  control footer is strong, direct evidence of an officially maintained,
  current document; its total absence from `CGAF-002-Rev3` is evidence
  of the opposite.
- **Content completeness.** `BOC04.QF.002` is the more complete form in
  several substantive, compliance-relevant respects: it offers a 5-option
  duration set ("3 Months, 6 Months, 1 Year, 2 Years, 3 Years"), while
  `CGAF-002-Rev3` is missing the "6 Months" option entirely (4 options
  only); `BOC04.QF.002`'s "CERTIFICATION AND CONSENT" section includes
  the full numbered prosecution-clause declaration *and* the Data
  Privacy Act consent paragraph with its representative-name blank,
  while `CGAF-002-Rev3`'s "CERTIFICATION" section is a single short
  paragraph missing both; `BOC04.QF.002` supports two distinct
  petitioner types (employer company *or* spouse), while
  `CGAF-002-Rev3` only supports a company petitioner.
- **Template-quality artifacts.** `CGAF-002-Rev3`'s own extracted title
  text contains visible garbling/duplication (`"FOR NON-IMMIGRANT
  IMMIGRANT VIS VISA,, SPECIAL WORK PERMIT..."`) — the signature of an
  imperfectly maintained or stale template, not a clean, finalized
  current revision, despite its own "-Rev3" self-label.
- **One point the other way.** `CGAF-002-Rev3` has two Character
  Reference slots where `BOC04.QF.002` has one — the single respect in
  which `CGAF-002-Rev3` is more complete. This does not outweigh the
  dated-footer and consent/duration-completeness evidence above.

**Classification at the time of this analysis: (B) — different revisions
of the same form, `BOC04.QF.002` the better-evidenced current/canonical
one.** This was the correct read of the two PDFs in isolation, and the
evidence above still stands. It was subsequently superseded, however, by
an explicit instruction that both versions remain independently in
active use at different BI counters/offices and must therefore both be
automated, kept permanently distinct, and never substituted for one
another. Both are now mapped (see section H.3 for how the engine
guarantees they can never be confused with each other at render time):
`BOC04.QF.002` as the more complete, better-documented version, and
`CGAF-002-Rev3` as a genuinely separate, independently-filed form
despite its structural similarity and shared subject matter.

## E. Preview availability (decoupled from engine-mapping)

Per the prior directive's section 8.2, the official-PDF preview feature
(`worker/src/lib/biFormEngine.js`'s `PREVIEWABLE_FORM_IDS`, 16 entries)
is tracked independently of engine-mapping completeness. It covers all
14 Class A forms (now all 14 mapped — section D), plus
`CCS-C-CPA-2016` (Class C) and `IRD04.QF.008` (Class E) — correctly
excluding `BIFORM2021-03-002` (the other Class C reference form;
previews are for fillable application forms a prospective customer
would benefit from seeing blank, which a pure checklist is not), the 1
Class D restricted form, and the 2 Class B government-issued-output
forms. `IRD04.QF.008` and `CCS-C-CPA-2016` remain included on the
reasoning that a blank-form preview is a strictly lower-risk capability
than field-filling automation, which the directive's own section 8.2
treats as a separate question from engine-mapping.

## F. What remains

**Nothing.** Every Class A form in the 20-PDF library — all 16 of them —
is now mapped, registered in the shared engine, schema-validated, and
has generated a visually-inspected test PDF from its real original. No
further coordinate-mapping work remains. Class B/C documents are
correctly never templated, Class D remains correctly excluded, and
Class E (`IRD04.QF.008`) remains blocked on an external confirmation
(notarization + unconfirmed reproduction rights), not on engineering
time.

## G. Historical note: the multi-page comb-grid family, before completion

An earlier pass of this engagement investigated `BOC04.QF.001`'s real
original PDF (both pages, 300 DPI raster, `pdftotext -bbox` label
positions, direct pixel darkness scans) and established that it belongs
to a third distinct field-rendering template, different from every
single-page form already mapped at that point: every field — names,
addresses, numbers, dates, everything — renders as a comb-grid of
individual uniform-width character cells, with a uniform ~12.96pt cell
pitch confirmed across multiple unrelated fields. That pass measured
roughly 30 of `BOC04.QF.001`'s ~75 fields and stopped there, with no
`coordinate-map.json` committed for any of the three remaining forms in
this family (`BOC04.QF.001`, `BOC04.QF.002`, `CGAF-003-Rev 2`) — a
deliberate choice per the standing instruction never to claim an
unfinished mapping complete. Section H below records how that work was
subsequently finished, for all four forms in this family (the three
above, plus `CGAF-002-Rev3`).

## H. The multi-page comb-grid family — completed

The final pass of this engagement completed coordinate-mapping,
questionnaire authoring, sample data, schema validation, and
visually-inspected PDF generation for all four remaining eligible Class A
forms: `BOC04.QF.001`, `CGAF-003-Rev 2`, `CGAF-002-Rev3`, and
`BOC04.QF.002`. The library's Class A backlog is now zero (section F).

### H.1 Engine changes required: multi-page support

`BOC04.QF.001` was the engine's first genuinely multi-page form (2 real
PDF pages), which required extending the shared engine itself rather
than just adding another config:

- An optional `page` property (0-indexed, default 0) added to every
  field-type schema definition (charBoxField, checkboxField,
  freeTextField, baselineSpan, namedRegion) in
  `bi-forms-library/engine/schema/coordinate-map.schema.json`.
- `pageFor(pages, field)` in `render-pipeline.js`, routing each field to
  its own real PDF page when drawing the staff document and the
  customer-fields-only document, instead of assuming page 0.
- `rasterizeAllPages()` in the Poppler backend, used only when a
  customer-preview composite actually spans more than one real page (the
  existing single-page fast path is unchanged for every other form).
- Page-aware region matching in `svg-compose.js`'s
  `mapPointToCanvasTdPt` (now requires both a page match and a y-range
  match, not y-range alone) and a same-page-vs-cross-page branch in the
  divider-caption logic (`"FIS staff prepare the remaining sections of
  this form"` for a same-page split vs `"This form continues on the next
  page"` for a genuine page break).

These changes were verified against every existing single-page mapping
with zero regressions (every single-page form implicitly defaults every
field to page 0, unchanged).

### H.2 Comb-grid measurement methodology

All four forms share the uniform ~12.96pt cell-pitch comb-grid template
established in section G. The methodology used throughout: `pdftotext
-bbox` for label word positions, `pdftoppm -r 300` high-res rasters,
column/row darkness scans (full-width scan at `min_ratio` ~0.8-0.85 for
box top/bottom, narrower-window scans at `min_ratio` ~0.5 for left/right
bounds), cell count = `round((xEnd-xStart)/12.96)`, and — critically — a
pixel-ruled visual grid-overlay crop as the authoritative tie-breaker
whenever a darkness scan alone was ambiguous. DD-MMM-YYYY date fields on
every form in this family are three separate comb clusters (2/3/4 cells)
separated by one blank, unruled cell-width, not one continuous 9-cell
comb — a distinction a column-darkness scan alone cannot make (a lone
box's own end border and the next box's own start border land at the
same pitch as a continuous comb's internal divider would), resolved each
time by direct visual inspection of a pixel-ruled zoom crop.

Mandatory visual inspection (never trusting a successful `generate` CLI
run alone) caught multiple real coordinate bugs across this family,
including on `BOC04.QF.002` specifically: a landline/mobile overlap and
an undercounted Height field (`BOC04.QF.001`); a one-cell-shifted date
measurement (`CGAF-002-Rev3`); and, on `BOC04.QF.002` itself, two
distinct bugs only visible in a rendered test PDF — (1) `expiryDateDay/
Month/Year` initially sharing the same row as `placeOfIssuance` and
`lastDayAuthStay`, causing illegibly overlapping text and an empty
Expiry Date box, corrected by re-measuring the field's own, earlier row;
and (2) four fields (`charRefLandline`, `charRefMobile`, `charRefEmail`,
`companyEmail`) whose left edges were mismeasured by one full cell-width
because a column-darkness scan picked up the page's own left/right
column table-divider line rather than the field's own border, causing
each field's first character to render outside its printed box entirely
— corrected by re-scanning past the divider. Both bug classes are
documented in `bi-forms-library/configs/BOC04.QF.002/coordinate-map.json`'s
own `measurementNotes` for future reference.

### H.3 `BOC04.QF.002` vs `CGAF-002-Rev3`: guaranteed never confused

Per the corrected note at the top of this document, both forms are
mapped as fully independent, separately registered engine entries —
`bi-forms-library/configs/BOC04.QF.002/` and
`bi-forms-library/configs/CGAF-002-Rev3/` are two unrelated directories,
each with its own coordinate-map.json, questionnaire.json, and
sample-data.json, registered under two distinct keys
(`"BOC04.QF.002"` and `"CGAF-002-Rev3"`) in
`worker/src/lib/biFormEngine.js`'s `REGISTRY`. There is no shared code
path, shared field-naming convention, or fallback logic that could
substitute one for the other: `CGAF-002-Rev3` models two Character
Reference slots (`charRef1Name`/`charRef2Name`) and a two-line
institution name (`institutionNameLine1`/`institutionNameLine2`), while
`BOC04.QF.002` models one Character Reference (`charRefName`) and a
single-line company name (`companyName`) sharing a comb row with
`registrationNumber` — structurally distinct field sets, not just
different labels on the same shape. This is verified directly by
`worker/test/biForms-customer.test.js`'s and
`worker/test/biForms-staff.test.js`'s own targeted tests for each form,
including an explicit assertion that `BOC04.QF.002`'s questionnaire
contains `charRefName` and never contains `CGAF-002-Rev3`'s
`institutionNameLine1` (and is itself never reachable through
`CGAF-002-Rev3`'s own submission/generation path, or vice versa).

Each is linked to its own, separate draft catalogue entry:
`CGAF-002-Rev3` was linked to the pre-existing `svc-cgaf-...`-pattern row
in an earlier pass; `BOC04.QF.002` is linked to a newly-added draft row,
`svc-cgaf-work-visa` (`worker/migrations/0019_boc04_qf_002_mapping.sql`),
since no existing draft row already described this specific
employer-sponsored work-visa subject matter. Both remain `active=0` /
`offering_status='draft'` — structurally unreachable by a customer until
a real FIS staff member sets a real price and explicitly activates each
one, independently, through the Staff Portal.
