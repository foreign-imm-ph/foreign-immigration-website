# BI Forms Library — Implementation Roadmap

**Status:** Planning only. No PDF prototyping, Cloudflare changes, or deployment in this document. Based on the committed 20-PDF inventory (`bi-forms-library/inventory/forms-library-inventory.json`, commit `29f0131`) plus the two completed, approved prototypes (CCS-A-CDR-2016, commit history; BI FORM 2014-13-002, commit `c434ff8`).

**Preserved, not re-opened:** CCS-A-CDR-2016's field ownership (Landline/Mobile/Documents-to-be-certified/Purpose are staff-only) and 2014-13-002's ownership (Landline/Mobile/Purpose are staff-only); both forms' customer preview ending immediately after Passport Number. **That crop point is specific to these two forms' own measured layouts and is not generalized to any other form below** — each form's crop boundary will be independently measured from its own PDF when its turn comes, exactly as both completed prototypes were.

**Approved with adjustments (this revision):**
1. Every "instant checkout candidate" label below is **provisional** — it marks technical/structural suitability only. No form goes live on the instant-checkout path until you separately approve that service's eligibility, pricing, required documents, and operational workflow. Prototype build work is not an approval to sell the service.
2. Each form's current BI acceptance must be confirmed before its service is **activated** for customers. Prototype development (coordinate mapping, questionnaire, previews) may proceed beforehand — the confirmation gate sits at activation, not at the start of build work.
3. The metadata-minimization standard below is now **adopted**, not just proposed, effective starting with the next prototype (2014-13-006).

## Distinct form types vs. alternate revisions (per your instruction)

Only **one** genuine "same form, different code" situation exists in the 20: **`BOC04.QF.002` and `CGAF-002-Rev3`** print the identical title (Non-Immigrant Visa/Special Work Permit/Provisional Work Permit CGAF) at different file sizes — this looks like an old-code/new-code pair for one form, not two forms, and is held pending your confirmation of which is current (already flagged in the inventory).

Everything else that sounds similar is a **distinct form**, not a revision of another, specifically:
- The "extension/updating of authorized stay" cluster (`2014-01-011`, `IRD04.QF.004`, `IRD04.QF.008`) — three different codes, different exact purposes (a reconsideration letter, a CGAF-style extension for temporary visitors, and a general updating/extension request), not one form in three copies.
- The "certified true copy" cluster (`CCS-A-CDR-2016`, `CCS-A-NTSP-2016`, `ADM05.QF.001`, `2014-08-015`) — four different certificate/record types being requested, not duplicates.
- The CGAF family (`BOC04.QF.001`, `CGAF-003-Rev 2`, `IRD04.QF.004`, and the flagged `BOC04.QF.002`/`CGAF-002-Rev3` pair) — "CGAF" is BI's name for a form family covering different visa categories, not a single form.

## Roadmap by tier

### Tier 0 — Complete, approved, committed
| Form | Code / Rev |
|---|---|
| Request for Certified True Copy of Derogatory Records | CCS-A-CDR-2016 |
| Request for BI Clearance Certificate | BI FORM 2014-13-002, Rev 0 |

### Tier 1 — Build next (same proven template family or high business value, moderate complexity)
| Form | Code / Rev | Access path | Verification needed? | Complexity | Why this tier |
|---|---|---|---|---|---|
| Application Form for Request for Travel Records | BI FORM 2014-13-006, Rev 0 | Instant checkout candidate | No | **Low** | Same single-page personal-info layout as the just-completed 2014-13-002; likely the fastest remaining build |
| Emigration Clearance Certificate (ECC) Application Form | ARD04.QF.003 | Instant checkout candidate | No | **Medium** (category checkboxes: ECC/CE/Renewal/Paper-based/Order to Leave) | ECC is one of the most commonly requested BI documents for departing foreign nationals/OFWs — high business value |
| CGAF for Extension of Stay of Temporary Visitor's Visa | IRD04.QF.004 | Instant checkout candidate | No | **Medium** (adds authorized-representative name fields) | Visa/stay extension is likely high-volume for FIS's client base |

### Tier 2 — Medium priority (valuable, moderate-to-added complexity)
| Form | Code / Rev | Access path | Verification needed? | Complexity | Notes |
|---|---|---|---|---|---|
| Application Form for ACR I-Card Certification | BI FORM 2014-08-015, Rev 0 | Instant checkout candidate | No | **Medium** | Has a "documents/copies to be certified" free-text pair, similar to CDR's staff-authored field pattern |
| Request for Certified True Copy (CTC) of Records | ADM05.QF.001 | Instant checkout candidate | No | **Medium** | Has its own "OFFICIAL USE ONLY" BI-internal header box to identify and exclude, distinct from CDR's/2014-13-002's layout |
| Application for Certificate of Not the Same Person (NTSP) | CCS-A-NTSP-2016 | Instant checkout candidate | No | **Medium** | Requires a 2x2 photo — an off-form "attach your photo" Client Portal instruction, not a PDF field |
| Request for Certification of Pending Application | CCS-C-CPA-2016 | Instant checkout candidate | No | **Low-Medium** | Same general family as CDR; notes English-only/capital-letters requirement on the form itself |
| Travel Pass Application Form | BI FORM 2021-03-001, Rev 0 | Staff assignment recommended | No | **Medium-High** | Category checkboxes (SVEG/RA8756/PD1034/RA7837) add selection logic beyond a simple personal-info grid |
| Travel Pass — General Instructions / Documentary Requirements | BIFORM2021-03-002 | **Reference only** | No | **N/A — no fields to map** | Checklist content, not a questionnaire; pairs with 2021-03-001 as a static Client Portal reference page. Cheap to add alongside it. |
| Request for Reconsideration on Updating/Extension of Authorized Stay | BI FORM 2014-01-011, Rev 0 | Staff assignment recommended | No | **Medium** | Letter-style opening rather than a pure form grid — layout needs its own fresh measurement |

### Tier 3 — Larger lift (multi-page, specialized fields; worth doing, schedule later)
| Form | Code / Rev | Access path | Verification needed? | Complexity | Notes |
|---|---|---|---|---|---|
| Consolidated General Application Form for Immigrant Visa | BOC04.QF.001 | Staff assignment recommended | No | **High** | 2 pages, likely the most field-dense form in the set |
| Consolidated General Application Form for Student Visa and Special Study Permit | CGAF-003, Rev 2 | Staff assignment recommended | No | **High** | 2 pages, photo requirement, specialized fields (Course/Degree, School Year) |

### Tier 4 — Hold: blocked on your decision, not on build complexity
| Form | Code / Rev | Blocker |
|---|---|---|
| Application Form for ACR I-Card | BI FORM 2014-08-006 (file `2015-08-006.pdf`) | States "cannot be reproduced" — do not build until BI's position is clarified |
| Consolidated General Application Form, Non-Immigrant Visa/SWP/PWP | BOC04.QF.002 **and** CGAF-002-Rev3 | Likely same form under two codes — confirm which is current; build only that one |
| Request for Updating and Extension of Authorized Stay | IRD04.QF.008 | No reproduction notice found on the form; also requires notarization (needs an off-form instruction design, same pattern as the supporting-document notices already built for 2014-13-002) |

### Tier 5 — Catalogue only, never generated
| Form | Code / Rev | Why |
|---|---|---|
| Emigration Clearance Certificate (ECC) — the issued certificate itself | ARD04.QF.001, Lev. 1 | `bi_certificate` — per the Forms Library's standing rule, never auto-generated as an official issued document. Candidate for `reference_only` cataloguing (so staff/clients can see what it looks like), nothing more. |
| Certificate of Exemption (CE) — the issued certificate itself | ARD04.QF.002, Lev. 1 | Same reasoning as above |

## Validity confirmation gate (applies across the whole set, not called out per row above)

Several forms date to 2014–2016 (Rev 0 in most cases). A form being reproducible doesn't guarantee it's still the version BI currently accepts — the mid-session CGAF-003 replacement and the BOC04.QF.002/CGAF-002-Rev3 situation are both concrete evidence that BI's own form inventory has already moved since some of these were issued.

**Per your adjustment:** this is a gate on *activation*, not on *build work*. For every form: confirming with BI (or a recent successful filing) that the Rev 0/current revision is still accepted is required before that form's service is switched on for customers — coordinate mapping, questionnaire design, and preview generation may all proceed beforehand, exactly as 2014-13-006 does below.

## Adopted metadata-minimization standard (future prototypes, effective immediately)

The committed 2014-13-002 prototype's customer PDF carries over the original template's `Author` ("Mabi's") and `Creator` ("Microsoft® Word 2010") fields — confirmed harmless (present on the public blank form itself, not customer data) but unnecessary in a client-facing file. **Adopted as standard practice**, applied to every future form's `generate.js`, starting with 2014-13-006:

- `pdfDoc.setAuthor("Foreign Immigration Services")` (or empty) — replaces the inherited personal name
- `pdfDoc.setCreator("FIS Forms Library")` — replaces the inherited authoring-software name
- `pdfDoc.setTitle("<official form title>")` — helpful, non-sensitive, improves on having no title
- Leave `Producer` as pdf-lib's own default (accurate, harmless) and `CreationDate` untouched (it's the original form's own provenance, not a leak)

This only rewrites the Info dictionary — it has no effect on the form's visible content, layout, or any field. Not applied retroactively to the already-committed CCS-A-CDR-2016 or 2014-13-002 prototypes, per the instruction to preserve what's committed; revisiting those two as a small, separate cleanup later remains an option if you want full consistency.

## Suggested overall build order

1. 2014-13-006 (near-identical to 2014-13-002 — fastest remaining win)
2. ARD04.QF.003 and IRD04.QF.004 (high business value, moderate complexity)
3. The four Tier 2 instant-checkout candidates (2014-08-015, ADM05.QF.001, CCS-A-NTSP-2016, CCS-C-CPA-2016), plus 2021-03-001 + its checklist companion
4. BOC04.QF.001 and CGAF-003 (larger, multi-page forms)
5. Tier 4 items, as each blocker is resolved
6. Tier 5 items added to the catalogue as `reference_only` whenever convenient — no automation work required

All "instant checkout candidate" / "staff assignment recommended" labels throughout the tables above are provisional (adjustment 1) — none authorize a live, purchasable service on their own.

Awaiting your approval of this roadmap (or changes to it) before starting the next prototype.
