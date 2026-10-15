# FIS Offering Inventory — Documents & Services

Produced for the "Order & Book Online" expansion (Master Development Directive).
Built from direct inspection of `bi-forms-library/inventory/forms-library-inventory.json`
(the committed 20-PDF R2 listing), `bi-forms-library/SERVICE_MAPPING.md`,
`bi-forms-library/configs/` (the only forms with a real, tested automated
pipeline), and all 16 `src/services/*.njk` pages. No price, requirement or
eligibility claim below is invented — "unknown"/"needs decision" is stated
wherever the repository does not already settle it.

## Legend — Offering Type

- **Type 1 — Automated document order**: a real `questionnaire.json` +
  `coordinate-map.json` exists and has passed the Forms Library's own test
  suite (`bi-forms-library/configs/<id>/`). Three forms qualify today.
- **Type 2 — Staff-processed document order**: the source PDF exists in R2,
  reproduction is permitted, and nothing flags it as a duplicate, notarization
  case, or BI-internal-only document — but no automated questionnaire/
  coordinate-map has been built, so a staff member fills and files it by hand
  after the customer pays and submits basic requirements online.
- **Type 3 — Bookable service**: Airport VIP Meet & Assist (the only service
  in this category today).
- **Type 4 — Not purchasable as a fillable request**: either the PDF *is* the
  issued certificate itself (never auto-generated for a customer), a
  checklist/reference document, or blocked by a `hold`/reproduction flag that
  needs resolving first.

## A. The three forms with a real, tested automated pipeline (Type 1)

| Form ID | Title | Best-fit service category | Status | Open decision |
|---|---|---|---|---|
| `CCS-A-CDR-2016` | Request for Certified True Copy of Derogatory Records | `motions-blacklist` | Built, demo-priced, previously activated in the Oct 2026 review's local preview | None — high-confidence mapping (the form's own name matches the category). Still needs a **real** price. |
| `2014-13-002` | Request for BI Clearance Certificate | **Ambiguous** — `motions-blacklist`, `exit-clearance`, or `extensions-compliance` are all reasonable (per `SERVICE_MAPPING.md`) | Built, previously demo-mapped to `exit-clearance` for testing only | **Needs your decision** on final category + real price |
| `2014-13-006` | Application Form for Request for Travel Records | **Ambiguous** — `legal-support`, `document-verification`, or `exit-clearance` (per `SERVICE_MAPPING.md`) | Built, never activated | **Needs your decision** on final category + real price |

## B. Ten additional forms suitable for staff-processed document orders today (Type 2)

Reproduction permitted, no duplicate/hold flag, no notarization complication, no "never auto-generate" flag. Configured in this phase as `document_manual` offerings — customer submits a short intake form and pays online; FIS staff prepares and files the actual paperwork, exactly as every non-checkout enquiry already works today, just with payment collected upfront instead of after a quotation.

| Form ID | Title | Best-fit category |
|---|---|---|
| `2014-01-011` | Request for Reconsideration on the Updating and Extension of Authorized Stay | `extensions-compliance` |
| `2014-08-015` | ACR I-Card Certification | `acr-icard` |
| `2021-03-001` | Travel Pass Application Form | `exit-clearance` |
| `ADM05.QF.001` | Request for Certified True Copy (CTC) of Records | `document-verification` |
| `ARD04.QF.003` | Emigration Clearance Certificate (ECC) Application Form | `exit-clearance` |
| `BOC04.QF.001` | Consolidated General Application Form for Immigrant Visa | `visa-applications` |
| `CCS-A-NTSP-2016` | Application for Certificate of Not the Same Person (NTSP) | `motions-blacklist` |
| `CCS-C-CPA-2016` | Request for Certification of Pending Application | `visa-applications` |
| `CGAF-003-Rev2` | Consolidated General Application Form for Student Visa and Special Study Permit | `visa-applications` |
| `IRD04.QF.004` | CGAF for Extension of Stay of Temporary Visitor's Visa | `extensions-compliance` |

All ten are created in this phase as catalogue rows with `offering_status = 'draft'` — visible only in the Staff Portal, not customers, until a price is set and an authorized admin explicitly activates each one.

## C. Blocked or not-yet-resolvable (Type 4 / hold — left untouched)

| Form ID | Title | Why it's excluded right now |
|---|---|---|
| `2015-08-006` | ACR I-Card Application (2-page version) | `reproduction: cannot_be_reproduced` on the form itself, plus a BI-internal verification section. Must not be offered. |
| `BOC04.QF.002` / `CGAF-002-Rev3` | Consolidated General Application Form, Non-Immigrant Visa/Work Permit | Flagged as likely duplicates of each other (same title, different file size) — needs confirming which revision BI currently accepts before either is built. |
| `IRD04.QF.008` | Request for Updating and Extension of Authorized Stay | Requires notarization (an off-platform step) and its reproduction permission is unconfirmed. |
| `ARD04.QF.001` | Emigration Clearance Certificate — the issued certificate itself | This *is* the government-issued certificate, not a request form. Never auto-generated for a customer. Reference-only. |
| `ARD04.QF.002` | Certificate of Exemption — the issued certificate itself | Same as above. |
| `BIFORM2021-03-002` | Travel Pass — Documentary Requirements checklist | A checklist, not a request form. Reference-only; pairs with `2021-03-001`. |

## D. Bookable service (Type 3)

| Service | Category | Status |
|---|---|---|
| Airport VIP Meet & Assist | `bookable_service` offering type | **Built and live as of the Order & Book Online Stage 1-8 work** (superseding this row's original note about the page's old 72-hour policy): online booking, the 120-hour rescheduling policy, policy acceptance, staff availability confirmation and refund tracking are all implemented and tested. Package pricing itself remains a business decision (see §G). |

Packages modelled as three catalogue rows sharing one `service_group`: **Arrival Only**, **Departure Only**, **Arrival & Departure (Round Trip)** — all `draft`, no price, until FIS sets real package prices.

## E. What this means for "more than two potential offerings"

Confirmed inventory for this phase: **3 Type-1 + 10 Type-2 + 3 Type-3 package rows = 16 catalogue rows**, against the prior review's 2 demo-only entries. Only the two already-reviewed Type-1 forms (`CCS-A-CDR-2016`, one already-demo'd Type-1) are activated with a (demo) price in this environment; everything else is deliberately left in `draft`/`ready_for_review` so no unapproved offering or price becomes customer-visible.

---

## F. Phase 4 discovery audit — beyond the Forms Library

Per the Phase 4 directive's instruction not to use "has a validated BI Form" as the deciding criterion for catalogue eligibility, this audit re-read **every one of the 16 public service-category pages** (`src/services/*.njk`, plus the homepage's own card set, which maps 1:1 to the same 16 categories — confirmed, no additional card exists) looking specifically for a bounded, separately-purchasable deliverable that does not depend on an automated BI Form.

**Finding: the Forms Library registry itself has no undiscovered forms.** The full R2 inventory (`forms-library-inventory.json`) lists exactly 20 PDFs; all 20 are already accounted for in Sections A-C above (13 built/draftable, 1 reproduction-blocked, 2 flagged as likely duplicates, 2 that are the issued certificate itself rather than a request form, 1 checklist, 1 requiring notarization). There was nothing to add here.

**Finding: 13 of the 16 service categories are consistently, explicitly enquiry-first in their own existing copy**, not merely by omission. Every one of `visa-and-immigration-applications`, `work-and-employment-visas`, `family-and-spousal-visas`, `residency-and-long-term-status`, `corporate-and-global-mobility`, `complex-and-tailored-immigration-assistance`, `legal-support-for-foreign-nationals`, `visa-and-immigration-document-verification`, and `extensions-and-compliance` (for everything beyond the two forms already in Section B) contains its own explicit statement that requirements/documents/pricing depend on individual circumstances assessed case by case — e.g. "The specific documents required depend on your circumstances. We will confirm exactly what applies once we understand your situation," repeated near-verbatim across most of these pages. Turning any of these into a fixed-price catalogue SKU would mean inventing a scope the page itself says doesn't exist. These remain **Category E (enquiry-first)** — already correctly served by their existing `/contact/?service=<slug>` CTA — and are not added to the catalogue as purchasable items.

**Three genuinely bounded candidates did emerge**, each a defined, scope-limited deliverable the page itself describes as a standalone step, not covered by any existing BI form mapping:

| Proposed ID | Public name | Source evidence | Type | Why it's bounded |
|---|---|---|---|---|
| `status-review-assessment` | Immigration Status Review | `src/services/immigration-status-review-and-regularisation.njk` — "We review the available information... and identify what appears current, incomplete, outstanding..." → "We explain your apparent position in plain language and identify the appropriate next step" | **C — Fixed-price professional service** (candidate) | The page's own 4-step process ends in a defined deliverable (a written status assessment + recommendation) *before* any further transaction is undertaken — the assessment itself, not everything that might follow it, is the bounded unit. |
| `lost-passport-bi-record-update` | Philippine Immigration Record Update (Lost/Replaced Passport) | `src/services/lost-passport-and-travel-document-assistance.njk` — "Reviewing and preparing the required Philippine immigration documentation once your replacement travel document is issued, and handling it on your behalf" | **B — Manually fulfilled document order** (candidate) | Explicitly scoped to the Philippine-side record-update step only (after the embassy/consulate, which FIS has no control over, has already issued the replacement) — a bounded, staff-processed filing, distinct from the open-ended "guide you through every stage" framing of the rest of the page. |
| `property-transfer-document-review` | Property Transaction Document Review & Readiness Check | `src/services/property-transfer-and-documentation-support.njk` — "Document Review & Transaction Readiness: Review and organisation of available property and transaction documents to help identify outstanding documentary requirements before processing begins" | **C — Fixed-price professional service** (candidate) | The one property-transfer sub-item framed as a bounded initial check rather than open-ended multi-agency coordination (the other 7 property-transfer cards — BIR, eCAR/ONETT, Registry of Deeds, etc. — explicitly involve government processing of unpredictable scope and stay Category E). |

These three are **proposed additional offerings requiring business confirmation** — not confirmed existing FIS products. No price, turnaround time, or document checklist is invented for any of them; each is added to the catalogue in Stage B as a `draft` row with only the description already evidenced above, with pricing, exact intake fields, and activation left entirely to staff/business decision.

## G. Comprehensive summary (Phase 4 discovery)

| Metric | Count |
|---|---|
| Total offerings discovered (existing + candidate) | **19** |
| Confirmed existing FIS offerings | 16 (3 automated documents + 10 manual documents + 3 Airport VIP packages) |
| Additional candidate offerings (new, this audit) | 3 |
| Automated document offerings | 3 |
| Manual document offerings | 10 confirmed + 1 candidate (`lost-passport-bi-record-update`) = 11 |
| Fixed-price professional services | 0 confirmed + 2 candidates (`status-review-assessment`, `property-transfer-document-review`) = 2 |
| Bookable services | 3 (Airport VIP packages) |
| Enquiry-only services (not added as catalogue SKUs) | 13 broad service categories, already served by `/contact/` |
| Excluded as unsuitable (duplicate/internal/issued-certificate/blocked) | 6 (`2015-08-006`, `BOC04.QF.002`/`CGAF-002-Rev3` pair, `IRD04.QF.008`, `ARD04.QF.001`, `ARD04.QF.002`, `BIFORM2021-03-002`) |
| Offerings requiring business clarification before any activation | All 19 (no final price is approved for any offering as of this audit) |

There is no arbitrary target number here, per the directive's own instruction — this is the complete result of actually reading every service page and the complete Forms Library registry, not a quota.
