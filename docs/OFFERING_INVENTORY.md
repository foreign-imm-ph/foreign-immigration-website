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
| Airport VIP Meet & Assist | New `bookable_service` offering type | The existing page currently states a **72-hour, transfer-only, non-refundable** policy with no stated refund-if-FIS-cannot-accommodate clause, and no online booking at all — pricing is "confirmed directly with our team." This directive's 120-hour / full-refund-if-FIS-cannot-accommodate policy **replaces** that published policy. Flagged for legal/business sign-off before production activation (Part 10 of the directive already anticipates this). |

Packages modelled as three catalogue rows sharing one `service_group`: **Arrival Only**, **Departure Only**, **Arrival & Departure (Round Trip)** — all `draft`, no price, until FIS sets real package prices.

## E. What this means for "more than two potential offerings"

Confirmed inventory for this phase: **3 Type-1 + 10 Type-2 + 3 Type-3 package rows = 16 catalogue rows**, against the prior review's 2 demo-only entries. Only the two already-reviewed Type-1 forms (`CCS-A-CDR-2016`, one already-demo'd Type-1) are activated with a (demo) price in this environment; everything else is deliberately left in `draft`/`ready_for_review` so no unapproved offering or price becomes customer-visible.
