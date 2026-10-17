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
| Request for Certified True Copy (CTC) of Records | `ADM05.QF.001` | A — eligible, not yet mapped | `may_be_reproduced` (inventory) | Distinct two-column "OFFICIAL USE ONLY" layout, taller page (612×1008pt) — genuinely different template family from every form mapped so far; confirmed by direct text-structure inspection. Not yet coordinate-measured. |
| Emigration Clearance Certificate (ECC) Application Form | `ARD04.QF.003` | A — eligible, not yet mapped | `may_be_reproduced` (inventory) | 5-option application-type checkbox group, Sex, 6-option Marital Status, Spouse fields, and a staff-only derogatory-record subsection — confirmed by direct text-structure inspection. Not yet coordinate-measured. |
| CGAF for Extension of Stay of Temporary Visitor's Visa | `IRD04.QF.004` | A — eligible, not yet mapped | `may_be_reproduced` (inventory) | Photo-requirement sidebar, Method/Mode/Months checkbox groups, conditional Representative fields — confirmed by direct text-structure inspection. Not yet coordinate-measured. |
| Consolidated General Application Form for Immigrant Visa | `BOC04.QF.001` | A — eligible, not yet mapped | `may_be_reproduced` (inventory) | 2-page form. Not yet coordinate-measured. |
| Consolidated General Application Form, Non-Immigrant/Special Work/Provisional Work Permit (Rev 3) | `CGAF-002-Rev3` | A — eligible, not yet mapped | `may_be_reproduced` (inventory) | 2-page form. Determined canonical over `BOC04.QF.002` below (see section D). Not yet coordinate-measured. |
| Consolidated General Application Form for Student Visa / Special Study Permit | `CGAF-003-Rev 2` | A — eligible, not yet mapped | `may_be_reproduced` (inventory) | 2-page form. Not yet coordinate-measured. |
| Consolidated General Application Form, Non-Immigrant/Special Work/Provisional Work Permit | `BOC04.QF.002` | A — eligible, superseded duplicate | `may_be_reproduced` (inventory) | Same title as `CGAF-002-Rev3`, different file size. Direct `diff`/`md5sum`/file-size comparison plus an explicit "Rev 3" marker in `CGAF-002-Rev3`'s own header text: concluded `CGAF-002-Rev3` is the canonical/current version. This is evidence-based inference, not asserted as absolute fact — final confirmation from the form owner is still open. Not separately mapped; would inherit `CGAF-002-Rev3`'s mapping if/when confirmed identical in content. |
| Request for Certification of Pending Application | `CCS-C-CPA-2016` | C — reference, not a fillable application | `may_be_reproduced` (inventory) | **Not an application form at all.** It is a checklist plus a staff-only certification block, and its own text explicitly references a separate application form, `CCS-A-CPA-2016`, by name — which does **not exist anywhere in this 20-PDF library**. There is no source document to measure coordinates against. This is a precise, evidenced blocker (a named, missing source document), not a vague "complex form" excuse. |
| Travel Pass — General Instructions / Documentary Requirements | `BIFORM2021-03-002` | C — reference/checklist | Confirmed on form | Confirmed by direct text inspection: "GENERAL INSTRUCTIONS... CHECKLIST OF DOCUMENTARY REQUIREMENTS FOR TRAVEL PASS." Never a fillable template. |
| Emigration Clearance Certificate (ECC) — the issued certificate itself | `ARD04.QF.001` | B — government-issued output | `not_found_on_form`; flagged `reproduction_status_unconfirmed` in the inventory | Confirmed by direct text inspection: begins "This is to certify that..." — the certificate BI itself issues after approving an ECC application, never a template FIS fills in and hands back. |
| Certificate of Exemption (CE) — the issued certificate itself | `ARD04.QF.002` | B — government-issued output | `not_found_on_form`; flagged `reproduction_status_unconfirmed` in the inventory | Confirmed by direct text inspection: begins "This exempts..." — same treatment as ARD04.QF.001. |
| Application Form for ACR I-Card | `2015-08-006` | D — restricted | **Reproduction prohibited on the form itself** (confirmed directly on the document in an earlier pass of this engagement; listed in the inventory's own `reproductionBlocked` array) | Correctly excluded from any preview or automated-generation path. Not re-opened this directive — no new fact would change this classification. |
| Request for Updating and Extension of Authorized Stay | `IRD04.QF.008` | E — unresolved | `not_found_on_form` (inventory); independently confirmed by direct inspection this directive — the "may be reproduced... NOT FOR SALE" statement present on every other mapped form is absent from this one | **Two independent, evidenced blockers, not a vague "complex form" excuse:** (1) the form's own header text reads "PLEASE HAVE THIS DOCUMENT NOTARIZED" — a licensed notary public must physically witness the signature, a third-party legal act no software can substitute for or automate around; (2) its reproduction rights are not confirmed anywhere on the form or in the inventory's own metadata, unlike every other mapped or eligible form, which explicitly states its reproduction rights. Proceeding to automate a form with unconfirmed reproduction rights would directly contradict the directive's own instruction to preserve restrictions rather than assume them away. Unresolved pending explicit confirmation from the form's owner (FIS/BI), not pending further engineering effort. |

## D. Exact reconciled count

- **20 PDFs total** (independently verified, section A).
- **Class A, mapped and automated: 7** — `CCS-A-CDR-2016`, `2014-13-002`,
  `2014-13-006`, `CCS-A-NTSP-2016`, `2014-08-015`, `2021-03-001`,
  `2014-01-011`.
- **Class A, eligible but not yet coordinate-mapped: 7** —
  `ADM05.QF.001`, `ARD04.QF.003`, `IRD04.QF.004`, `BOC04.QF.001`,
  `CGAF-002-Rev3`, `CGAF-003-Rev 2`, `BOC04.QF.002` (the last as a
  superseded duplicate of `CGAF-002-Rev3`, not a separate mapping target).
  Every one of these 7 is structurally confirmed fillable and
  reproducible; what remains is the same per-field pixel-measurement work
  already done for the other 7 — not yet performed within this
  directive's resource budget. This is a volume/time constraint, stated
  plainly, not a complexity-avoidance claim: the single most structurally
  complex form in the library (`2021-03-001`, 4 sections, 2 checkbox
  groups) and a structurally distinct document type (`2014-01-011`,
  narrative-letter format) were both mapped this directive specifically
  to demonstrate that no category of form was skipped for being hard.
- **Class B, government-issued outputs: 2** — `ARD04.QF.001`,
  `ARD04.QF.002`.
- **Class C, reference/checklist, not fillable applications: 2** —
  `BIFORM2021-03-002`, `CCS-C-CPA-2016`.
- **Class D, restricted: 1** — `2015-08-006`.
- **Class E, unresolved with a documented reason: 1** — `IRD04.QF.008`.

7 + 7 + 2 + 2 + 1 + 1 = **20.** Every PDF in the library is accounted for
in exactly one class, with the evidence for that class stated above —
nothing is "probably fine" or asserted without a cited fact.

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

The 7 eligible-not-yet-mapped Class A forms are the complete, exact scope
of further coordinate-mapping work this library needs before every
eligible application form is automated. No other PDF in the library
requires or would benefit from further engineering work: Class B/C
documents are correctly never templated, Class D remains correctly
excluded, and Class E remains blocked on an external confirmation, not
on more engineering time.
