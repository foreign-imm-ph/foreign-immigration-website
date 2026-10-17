# BI Forms Library Reconciliation

Compiled across two directives: "Complete BI Forms Library, Service-Based
Naming, Official PDF Previews & Assisted Applications" (original Section 2
reconciliation) and the subsequent "FOREIGN IMMIGRATION SERVICES (FIS)
MASTER IMPLEMENTATION DIRECTIVE — COMPLETE REMAINING BI FORMS AUTOMATION"
(which required a 5-way A–E classification of the full 20-PDF inventory
and continued per-form mapping). Source data: the existing, previously
read-only-verified inventory
(`bi-forms-library/inventory/forms-library-inventory.json`, obtained via a
direct Cloudflare R2 API listing dated 2026-10-13, re-confirmed against a
second direct listing during this pass — unchanged), the catalogue seed
(`worker/migrations/0012_phase4_catalogue_expansion.sql`), and direct
inspection of every original PDF named below.

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
| Consolidated General Application Form for Immigrant Visa | `BOC04.QF.001` | A — eligible, not yet mapped | `may_be_reproduced` (inventory) | 2-page form. **Investigated this pass, not completed — see section G.** A distinct third template family: every field (not just dates) is a comb-grid of individual character cells, confirmed via direct pixel measurement (a uniform ~12.96pt cell pitch across the whole form). ~45-50 such fields across 2 pages. |
| Consolidated General Application Form, Non-Immigrant/Special Work/Provisional Work Permit (Rev 3) | `CGAF-002-Rev3` | A — eligible, superseded duplicate | `may_be_reproduced` (inventory) | 2-page form. **Duplicate-pair finding reversed this pass** (see section D.1): `BOC04.QF.002` is the better-evidenced current/canonical version, not this one. Not separately mapped. Same comb-grid-per-field template family as `BOC04.QF.001`/`BOC04.QF.002` (see section G). |
| Consolidated General Application Form for Student Visa / Special Study Permit | `CGAF-003-Rev 2` | A — eligible, not yet mapped | `may_be_reproduced` (inventory) | 2-page form. Not yet coordinate-measured; same comb-grid-per-field template family as `BOC04.QF.001` (see section G). |
| Consolidated General Application Form, Non-Immigrant/Special Work/Provisional Work Permit | `BOC04.QF.002` | A — eligible, not yet mapped | `may_be_reproduced` (inventory) | 2-page form. **Determined canonical over `CGAF-002-Rev3` this pass** (see section D.1) — carries the Bureau's formal dated document-control footer, a complete 5-option month/year duration set (Rev3 is missing "6 Months"), and the full prosecution-clause/Data-Privacy-Act consent paragraph (Rev3's is a shorter, less complete paragraph). Not yet coordinate-measured; same comb-grid-per-field template family as `BOC04.QF.001` (see section G). |
| Request for Certification of Pending Application | `CCS-C-CPA-2016` | C — reference, not a fillable application | `may_be_reproduced` (inventory) | **Not an application form at all.** It is a checklist plus a staff-only certification block, and its own text explicitly references a separate application form, `CCS-A-CPA-2016`, by name — which does **not exist anywhere in this 20-PDF library**. There is no source document to measure coordinates against. This is a precise, evidenced blocker (a named, missing source document), not a vague "complex form" excuse. |
| Travel Pass — General Instructions / Documentary Requirements | `BIFORM2021-03-002` | C — reference/checklist | Confirmed on form | Confirmed by direct text inspection: "GENERAL INSTRUCTIONS... CHECKLIST OF DOCUMENTARY REQUIREMENTS FOR TRAVEL PASS." Never a fillable template. |
| Emigration Clearance Certificate (ECC) — the issued certificate itself | `ARD04.QF.001` | B — government-issued output | `not_found_on_form`; flagged `reproduction_status_unconfirmed` in the inventory | Confirmed by direct text inspection: begins "This is to certify that..." — the certificate BI itself issues after approving an ECC application, never a template FIS fills in and hands back. |
| Certificate of Exemption (CE) — the issued certificate itself | `ARD04.QF.002` | B — government-issued output | `not_found_on_form`; flagged `reproduction_status_unconfirmed` in the inventory | Confirmed by direct text inspection: begins "This exempts..." — same treatment as ARD04.QF.001. |
| Application Form for ACR I-Card | `2015-08-006` | D — restricted | **Reproduction prohibited on the form itself** (confirmed directly on the document in an earlier pass of this engagement; listed in the inventory's own `reproductionBlocked` array) | Correctly excluded from any preview or automated-generation path. Not re-opened this directive — no new fact would change this classification. |
| Request for Updating and Extension of Authorized Stay | `IRD04.QF.008` | E — unresolved | `not_found_on_form` (inventory); independently confirmed by direct inspection this directive — the "may be reproduced... NOT FOR SALE" statement present on every other mapped form is absent from this one | **Two independent, evidenced blockers, not a vague "complex form" excuse:** (1) the form's own header text reads "PLEASE HAVE THIS DOCUMENT NOTARIZED" — a licensed notary public must physically witness the signature, a third-party legal act no software can substitute for or automate around; (2) its reproduction rights are not confirmed anywhere on the form or in the inventory's own metadata, unlike every other mapped or eligible form, which explicitly states its reproduction rights. Proceeding to automate a form with unconfirmed reproduction rights would directly contradict the directive's own instruction to preserve restrictions rather than assume them away. Unresolved pending explicit confirmation from the form's owner (FIS/BI), not pending further engineering effort. |

## D. Exact reconciled count

- **20 PDFs total** (independently verified, section A).
- **Class A, mapped and automated: 10** — `CCS-A-CDR-2016`, `2014-13-002`,
  `2014-13-006`, `CCS-A-NTSP-2016`, `2014-08-015`, `2021-03-001`,
  `2014-01-011`, `ADM05.QF.001`, `ARD04.QF.003`, `IRD04.QF.004`. The last
  three were mapped this pass (see each one's own row above for what
  made it structurally distinct).
- **Class A, eligible but not yet coordinate-mapped: 4** —
  `BOC04.QF.001`, `CGAF-003-Rev 2`, `BOC04.QF.002`, `CGAF-002-Rev3` (the
  last two as a resolved duplicate pair — `BOC04.QF.002` is the
  canonical mapping target, `CGAF-002-Rev3` a superseded duplicate not
  separately mapped; see D.1). All 4 are structurally confirmed fillable
  and reproducible, each a genuinely large 2-page, 50+ field form (on
  the order of 2-3x a typical single-page form's field count); the
  per-field pixel-measurement work itself has not yet been performed.
- **Class B, government-issued outputs: 2** — `ARD04.QF.001`,
  `ARD04.QF.002`.
- **Class C, reference/checklist, not fillable applications: 2** —
  `BIFORM2021-03-002`, `CCS-C-CPA-2016`.
- **Class D, restricted: 1** — `2015-08-006`.
- **Class E, unresolved with a documented reason: 1** — `IRD04.QF.008`.

10 + 4 + 2 + 2 + 1 + 1 = **20.** Every PDF in the library is accounted
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

**Classification: (B) — different revisions of the same form.**
`BOC04.QF.002` is the better-evidenced current/canonical version.
`CGAF-002-Rev3` is preserved in the library as a superseded prior
revision, not deleted or hidden, per the standing instruction to
preserve both originals regardless of which is canonical. `BOC04.QF.002`
is the mapping target if/when this form family is coordinate-measured;
`CGAF-002-Rev3` would only need separate mapping if a future owner
confirms both versions remain independently in active use.

## E. Preview availability (decoupled from engine-mapping)

Per the prior directive's section 8.2, the official-PDF preview feature
(`worker/src/lib/biFormEngine.js`'s `PREVIEWABLE_FORM_IDS`) is tracked
independently of engine-mapping completeness. It already covers all 16
Class A forms (both mapped and eligible-not-yet-mapped) plus the two
Class C reference forms' own originals are not included (previews are for
fillable application forms a prospective customer would benefit from
seeing blank, which a checklist is not) — correctly excluding the 1
Class D restricted form and the 2 Class B government-issued-output forms,
and correctly including `IRD04.QF.008` (Class E) on the reasoning that a
blank-form preview is a strictly lower-risk capability than
field-filling automation and the directive's own section 8.2 treats them
as separate questions; this was not revisited this pass, since no new
fact changes that determination.

## F. What remains

The 4 eligible-not-yet-mapped Class A forms (`BOC04.QF.001`,
`CGAF-003-Rev 2`, `BOC04.QF.002`, and `CGAF-002-Rev3` as `BOC04.QF.002`'s
superseded duplicate) are the complete, exact scope of further
coordinate-mapping work this library needs before every eligible
application form is automated. All four are large, 2-page, 50+ field
forms. No other PDF in the library requires or would benefit from
further engineering work: Class B/C documents are correctly never
templated, Class D remains correctly excluded, and Class E remains
blocked on an external confirmation, not on more engineering time.

## G. The `BOC04.QF.001` / `BOC04.QF.002` / `CGAF-003-Rev 2` template family — investigated, not completed this pass

This pass directly measured `BOC04.QF.001`'s real original PDF (both
pages, 300 DPI raster, `pdftotext -bbox` label positions, direct pixel
darkness scans) before starting any coordinate-map file, per the same
process used for the 10 already-mapped forms. That measurement work
established a precise, evidenced characterization of this form family,
not a vague complexity claim:

- **A third distinct field-rendering template**, different from both
  families already mapped this pass. CDR/NTSP/ACR used solid rectangles
  or combs only for dates; `ARD04.QF.003` and `IRD04.QF.004` mix solid
  rectangles with comb dates or plain 3-box dates. `BOC04.QF.001`
  renders **every single field — names, addresses, numbers, dates,
  everything — as a comb-grid of individual uniform-width character
  cells**, confirmed by direct pixel measurement of multiple fields
  (`Present Immigration Status`, `Last Name`, `Other Name(s)/Alias(es)
  1` and `2`) independently converging on the same ~12.96pt cell pitch.
- **Confirmed tractable, not abandoned as "too complex."** The cell-pitch
  constant was verified across unrelated fields, the DD-MMM-YYYY
  date-group structure (2+3+4 cells, confirmed by a pixel-ruled visual
  overlay, exactly the same convention as `ARD04.QF.003`'s date combs)
  was reproduced correctly for all 4 of `BOC04.QF.001`'s date fields,
  and roughly 30 of the form's ~45-50 fields were successfully measured
  (borders, cell counts, and x/y bounds all recorded) before this pass
  stopped.
- **Why this pass stopped before completing a coordinate-map.json.**
  Even with the cell-pitch shortcut, this form has roughly 3-4x the
  number of individually-measured boxes of any single form already
  mapped (every row is its own comb needing its own top/bottom/left/
  right measurement, where e.g. `IRD04.QF.004` needed only one box per
  field) across 2 pages, plus `BOC04.QF.002` and `CGAF-003-Rev 2` share
  this same family and would each need the same volume of per-field
  measurement again. Completing even one of the three to this
  engagement's established bar — full field-level measurement,
  schema validation, an actually-generated and visually-inspected test
  PDF, engine registration, and targeted tests — was not achievable
  within this pass without risking an incomplete, uncommitted,
  half-measured config being left behind. Per the directive's own
  instruction not to claim an unfinished mapping complete, **no
  `coordinate-map.json`/`questionnaire.json` was started or committed
  for any of the three** — the working tree is clean, and the 10
  forms mapped this engagement (including this pass's 3:
  `ADM05.QF.001`, `ARD04.QF.003`, `IRD04.QF.004`) are the complete,
  verified, shippable result.
- **Concrete continuation point for a future pass:** the cell-pitch
  constant (~12.96pt), the proven measurement approach (box top/bottom
  via a full-width darkness scan at `min_ratio` ~0.8-0.85, left/right
  via an outer-column scan at `min_ratio` ~0.5, cell count =
  `round((xEnd-xStart)/12.96)`), and the confirmed 4-DD-MMM-YYYY-field
  pattern are all reusable directly against `BOC04.QF.001` first (most
  measurement already done), then `BOC04.QF.002` and `CGAF-003-Rev 2`
  (same family, not yet started).
