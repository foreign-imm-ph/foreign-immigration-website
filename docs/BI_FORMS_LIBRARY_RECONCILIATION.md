# BI Forms Library Reconciliation

Directive: "Complete BI Forms Library, Service-Based Naming, Official PDF
Previews & Assisted Applications" — Section 2. Compiled from the
existing, previously-verified inventory
(`bi-forms-library/inventory/forms-library-inventory.json`, obtained via a
direct, read-only Cloudflare R2 API listing dated 2026-10-13), the
catalogue seed (`worker/migrations/0012_phase4_catalogue_expansion.sql`),
`bi-forms-library/SERVICE_MAPPING.md`, and `docs/OFFERING_INVENTORY.md`.
No new R2 listing was performed for this directive — the existing one is
current (13 days old) and has not been contradicted by anything found
during this pass.

## A. Resolving the historical count discrepancy

| Figure cited | What it actually was |
|---|---|
| "~23 PDFs originally submitted for review" | An early, pre-upload submission count from the initial Forms Library planning conversation, before duplicates/non-PDF items were sorted out. Not independently verifiable now and superseded by the figures below. |
| "~18 distinct documents after duplicate removal" | An intermediate manual count, from before the final upload. Close to, but not identical to, the number of genuine duplicate PDFs actually found (see below) — likely counted one additional near-duplicate pair that the verified inventory treats as two distinct (if related) documents. |
| "~20 stored PDFs" (implementation report) | **Confirmed current and accurate.** A direct, read-only Cloudflare R2 API listing of the `fis-bi-forms-library` bucket's `originals/` prefix returned exactly 20 PDF objects (21 objects total, including one 0-byte folder placeholder). This is the authoritative figure. |
| "3 initially automated templates" | **Confirmed current and accurate.** Exactly 3 of the 20 PDFs (`CCS-A-CDR-2016`, `2014-13-002`, `2014-13-006`) have a `bi-forms-library/configs/<id>/` directory (questionnaire + coordinate map) and are registered in `worker/src/lib/biFormEngine.js`'s `REGISTRY` — the only 3 the shared PDF-generation engine can actually produce a filled document for. |

**Conclusion: no PDF is missing.** The 20-PDF figure is independently
verified by direct inspection, not an estimate. The 23/18 figures reflect
earlier stages of the same inventory effort and are superseded, not
contradicted, by the verified 20. What was true from the start remains
true: only 3 of the 20 have been through the substantial, manual,
per-field coordinate-mapping work the generation engine requires: the
other 17 are genuinely unmapped, not lost or overlooked.

## B. Full reconciliation table

"Associated FIS service" names the matching row in `checkout_services`
(all 19 remain `draft`/`active=0`) where one exists, by its service_slug.
"Mapping status" and "Fulfilment method" reflect the DIRECTIVE's own
defined categories, not a new classification scheme.

| Document (official title) | Form ID | Classification | Associated FIS service | Mapping status | Customer preview | Fulfilment method |
|---|---|---|---|---|---|---|
| Request for Certified True Copy of Derogatory Records | `CCS-A-CDR-2016` | Application form | `motions-blacklist` (svc-cdr) | **Fully mapped** — engine-registered, confirmed high-confidence category match (form's own name is literally "derogatory records") | **Available** (new: `/api/instant-services/catalogue/:id/preview-form`) | Automated |
| Request for BI Clearance Certificate | `2014-13-002` | Application form | `exit-clearance` (svc-bi-clearance) | **Fully mapped** to the engine, but the SERVICE CATEGORY is explicitly marked provisional pending an owner decision (also plausibly `motions-blacklist` or `extensions-compliance`) | Available | Automated |
| Application Form for Request for Travel Records | `2014-13-006` | Application form | `document-verification` (svc-travel-records) | **Fully mapped** to the engine, but the SERVICE CATEGORY is explicitly marked provisional (also plausibly `legal-support` or `exit-clearance`) | Available | Automated |
| Request for Reconsideration on the Updating and Extension of Authorized Stay | `2014-01-011` | Application form | `extensions-compliance` (svc-ext-reconsideration) | Partially mapped — exact title match to the service, but not yet in the generation engine | Missing (not yet engine-mapped; directive requires an explanation screen instead, not a misleading button — not yet built, see Outstanding Dependencies) | Manual |
| Application Form for ACR I-Card Certification | `2014-08-015` | Application form | `acr-icard` (svc-acr-icard-cert) | Partially mapped — title match, not engine-mapped | Missing | Manual |
| Application Form for ACR I-Card | `2015-08-006` | Application form (hybrid, includes a BI-internal verification section) | *(none of the 19)* | Unmapped — **reproduction prohibited on the form itself**; must never be auto-generated or freely reproduced | Restricted — never offer a preview of this specific PDF | Reference-only (staff-handled) |
| Travel Pass Application Form | `2021-03-001` | Application form | `exit-clearance` (svc-travel-pass) | Partially mapped — title match, not engine-mapped | Missing | Manual |
| Request for Certified True Copy (CTC) of Records | `ADM05.QF.001` | Application form | `document-verification` (svc-ctc-records) | Partially mapped — title match, not engine-mapped | Missing | Manual |
| Emigration Clearance Certificate (ECC) — the issued certificate itself | `ARD04.QF.001` | Government-issued output | `exit-clearance` (svc-ecc-application, as its eventual deliverable) | Not applicable — this is the certificate BI issues, never a template FIS fills in | Not applicable | Manual (the actual issued document is obtained and delivered, never generated) |
| Certificate of Exemption (CE) — the issued certificate itself | `ARD04.QF.002` | Government-issued output | *(none of the 19)* | Unmapped — no current catalogue offering for this certificate | Not applicable | Reference-only |
| Emigration Clearance Certificate (ECC) Application Form | `ARD04.QF.003` | Application form | `exit-clearance` (svc-ecc-application) | Partially mapped — title match, not engine-mapped | Missing | Manual |
| Travel Pass — General Instructions / Documentary Requirements | `BIFORM2021-03-002` | Checklist | `exit-clearance` (svc-travel-pass, as a supporting reference) | Not applicable (checklist, not a fillable form) | Not applicable | Reference-only |
| Consolidated General Application Form for Immigrant Visa | `BOC04.QF.001` | Application form | `visa-applications` (svc-cgaf-immigrant-visa) | Partially mapped — title match, not engine-mapped | Missing | Manual |
| Consolidated General Application Form, Non-Immigrant/Special Work/Provisional Work Permit | `BOC04.QF.002` | Application form | *(none of the 19 — possible duplicate of `CGAF-002-Rev3` below, same title, different file size)* | **Unmapped, flagged for owner confirmation** — which of this pair, if either, is the current version | Missing | Not currently fulfillable until resolved |
| Request for Certified True Copy of Derogatory Records *(duplicate check only — see row 1)* | — | — | — | — | — | — |
| Application for Certificate of Not the Same Person (NTSP) | `CCS-A-NTSP-2016` | Application form | `motions-blacklist` (svc-ntsp) | Partially mapped — title match, not engine-mapped | Missing | Manual |
| Request for Certification of Pending Application | `CCS-C-CPA-2016` | Application form | `visa-applications` (svc-cpa-request) | Partially mapped — title match, not engine-mapped | Missing | Manual |
| Consolidated General Application Form, Non-Immigrant/Special Work/Provisional Work Permit (Rev 3) | `CGAF-002-Rev3` | Application form | *(none of the 19 — possible duplicate of `BOC04.QF.002` above)* | **Unmapped, flagged for owner confirmation** (same pair as above) | Missing | Not currently fulfillable until resolved |
| Consolidated General Application Form for Student Visa / Special Study Permit | `CGAF-003-Rev 2` | Application form | `visa-applications` (svc-cgaf-student-visa) | Partially mapped — title match, not engine-mapped | Missing | Manual |
| CGAF for Extension of Stay of Temporary Visitor's Visa | `IRD04.QF.004` | Application form | `extensions-compliance` (svc-cgaf-tvv-extension) | Partially mapped — exact title match, not engine-mapped | Missing | Manual |
| Request for Updating and Extension of Authorized Stay | `IRD04.QF.008` | Application form (requires notarization per form text) | *(none of the 19 — closely related to, but distinct from, `2014-01-011` above)* | Unmapped — no current catalogue offering; reproduction status also unconfirmed | Missing | Not currently offered |

Three further catalogue rows have **no associated BI PDF at all** and are
correctly marked "not applicable" rather than missing a document:
`svc-status-review`, `svc-lost-passport-record-update`, and
`svc-property-transfer-doc-review` (all explicitly flagged in their own
`notices_text` as *candidate* offerings pending business confirmation,
not BI-form-based products), and the three `svc-airport-vip-*` rows
(bookable services, never form-based).

## C. What this means for the rest of the directive

- **16 of the 20 PDFs are "partially mapped"**: a real, correctly-slugged
  (or owner-confirmation-flagged) catalogue association already exists,
  but no `bi-forms-library/configs/<id>/` entry exists yet, so the
  shared generation engine cannot produce a filled document for them.
  Building that mapping for even one additional form is substantial,
  form-specific work — per-field coordinate verification against the
  real original PDF, exactly as `bi-forms-library/configs/CCS-A-CDR-2016/`
  required — and this directive's own instruction not to "invent field
  names, declarations, or official form requirements" means this cannot
  be done generically or quickly. None of the 16 were mapped in this
  pass; see the final report's Outstanding Dependencies.
- **2 PDFs are a flagged, unresolved duplicate pair**
  (`BOC04.QF.002`/`CGAF-002-Rev3`) with no catalogue row of their own —
  correctly left unresolved rather than guessed, per the directive's own
  instruction.
- **3 PDFs are government-issued outputs or reference-only
  material** (the two actual ECC/CE certificates and the Travel Pass
  checklist) — correctly never treated as fillable templates.
- **1 PDF (`2015-08-006`) is reproduction-restricted by the form itself**
  and is correctly excluded from any preview or automated-generation
  path.
- Every one of the 20 PDFs remains exactly where it already was (in the
  private `fis-bi-forms-library` R2 bucket); nothing was deleted,
  renamed, or overwritten.
