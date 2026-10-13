# FIS Forms Library — R2 Inventory & Classification

**Status:** Read-only inspection only. No website, Worker, D1, R2 object, GitHub, or deployment changes were made. Verified directly against the live `fis-bi-forms-library` bucket via the Cloudflare API on 2026-10-13.

**Credential handling note:** the API token you provided was used only as a shell environment variable for this session's Cloudflare calls — it was never written to any file, never committed, and does not appear in this document or any repo file. Because it was pasted directly into the conversation, treat it as exposed regardless of its 14 Oct expiry: recommend revoking it from the dashboard once this phase of work is done, rather than waiting for it to lapse on its own.

## 1–2. Access verified

- Authenticated successfully (`wrangler whoami`) against account **Foreignimmigrationservices.ph@gmail.com's Account** (`1c557802167a5fab6c7dffd22177ea72`).
- `fis-bi-forms-library` **exists** (created 2026-10-13, APAC location). `fis-client-files` (the existing bucket) is also still present and untouched.
- **Note for later:** Wrangler's CLI has no `r2 object list` subcommand (only `get`/`put`/`delete`). Listing was done via Cloudflare's plain REST API (`GET /accounts/{id}/r2/buckets/{bucket}/objects`), authenticated with the same token — **no separate S3-compatible Access Key/Secret was needed**, confirming the earlier assessment.

## 3. Inventory vs. expected count

`originals/` contains **21 R2 objects**: 20 PDFs + one 0-byte object (`originals/` itself — a folder placeholder created by the upload UI, not a document; harmless, but don't count it as a 19th/21st form).

**20 PDFs matches your stated total (18 + 2 CGAF).** I do not have an authoritative named checklist of "the original 18" anywhere in this repo or in the earlier project audit to verify *which* 18 by name — only the count. Please treat the classification below as what to check that list against, not as independent proof nothing is missing.

**No duplicate R2 keys** (all 20 filenames are unique). One **likely content duplicate** found by reading the PDFs themselves (not just filenames):

> **`BOC04.QF.002.pdf`** and **`CGAF-002-Rev3.pdf`** both print the identical title *"CONSOLIDATED GENERAL APPLICATION FORM FOR NON-IMMIGRANT VISA, SPECIAL WORK PERMIT AND PROVISIONAL WORK PERMIT"* (CGAF-002-Rev3 adds "[EXCEPT STUDENT VISA AND SSP]"). Different file sizes (384KB vs 189KB) and no "BOC04" code appears on CGAF-002-Rev3's own text, so this looks like an **old-code/new-code pair for the same logical BI form** — BOC04.QF.002 possibly superseded by CGAF-002-Rev3, or vice versa. Needs your/staff confirmation of which is current before either enters the library as `active`.

One **filename/printed-code mismatch**: the file named `2015-08-006.pdf` prints **"BI FORM 2014-08-006 Rev 0"** inside the document — the year in the filename (2015) doesn't match the year BI printed on the form itself (2014). Recorded both below; flag for your confirmation of which is correct.

**Update (re-verified against live R2 before this commit):** the Student Visa / Special Study Permit form was re-uploaded at a new key, `originals/CGAF-003-Rev 2.pdf` (hyphen after "003"; replaces the earlier `originals/CGAF-003 Rev 2.pdf`, no longer present — new upload timestamp 2026-10-13T08:11:43Z, different file size). Re-read directly from R2 and confirmed it still prints the same official code, title, and revision ("BI FORM CGAF-003-Rev 2", Consolidated General Application Form for Student Visa and Special Study Permit, 2 pages, may be reproduced). The table below reflects the corrected key.

## 4–5. Structured inventory

Official code and title are **as printed on each form** (not inferred). R2 keys are exact and unchanged — nothing was renamed or moved.

| R2 key (`originals/...`) | Official code (as printed) | Title | Rev | Pages | Reproduction notice | `documentType` |
|---|---|---|---|---|---|---|
| `2014-01-011.pdf` | BI FORM 2014-01-011 | Request for Reconsideration on the Updating and Extension of Authorized Stay | Rev 0 | 1 | May be reproduced | application_request |
| `2014-08-015.pdf` | BI FORM 2014-08-015 | Application Form for Alien Certificate of Registration Identity Card (ACR I-Card) Certification | Rev 0 | 1 | May be reproduced | application_request |
| `2014-13-002.pdf` | BI FORM 2014-13-002 | Request for BI Clearance Certificate | Rev 0 | 1 | May be reproduced | application_request |
| `2014-13-006.pdf` | BI FORM 2014-13-006 | Application Form for Request for Travel Records | Rev 0 | 1 | May be reproduced | application_request |
| `2015-08-006.pdf` | BI FORM 2014-08-006 ⚠ (filename says 2015) | Application Form for Alien Certificate of Registration Identity Card (ACR I-Card) | Rev 0 | 2 | **Cannot be reproduced** ⚠ | application_request (hybrid — includes a BI-internal "Checked by / Identity Verified" section) |
| `2021-03-001.pdf` | BI FORM 2021-03-001 | Travel Pass Application Form | Rev 0 | 1 | May be reproduced | application_request |
| `ADM05.QF.001.pdf` | ADM05.QF.001 | Request for Certified True Copy (CTC) of Records | — | 1 | May be reproduced | application_request |
| `ARD04.QF.001.pdf` | ARD04.QF.001, Rev. Lev. 1 | **Emigration Clearance Certificate (ECC)** — the issued certificate itself (has SSRN/GOR serial number fields) | Lev. 1 | 1 | Not found on form | **bi_certificate** |
| `ARD04.QF.002.pdf` | ARD04.QF.002, Rev. Lev. 1 | **Certificate of Exemption (CE)** — the issued certificate itself | Lev. 1 | 1 | Not found on form | **bi_certificate** |
| `ARD04.QF.003.pdf` | ARD04.QF.003 | Emigration Clearance Certificate (ECC) **Application Form** (the request form, distinct from .001/.002 above) | — | 1 | May be reproduced | application_request |
| `BIFORM2021-03-002.pdf` | BIFORM2021-03-002 | Travel Pass — General Instructions / Documentary Requirements checklist (pairs with `2021-03-001.pdf`) | — | 1 | May be reproduced | **checklist** |
| `BOC04.QF.001.pdf` | BOC04.QF.001 | Consolidated General Application Form for Immigrant Visa | — | 2 | May be reproduced | application_request |
| `BOC04.QF.002.pdf` | BOC04.QF.002 | Consolidated General Application Form for Non-Immigrant Visa, Special Work Permit and Provisional Work Permit | — | 2 | May be reproduced | application_request — **possible duplicate of CGAF-002-Rev3, see above** |
| `CCS-A-CDR-2016.pdf` | CCS-A-CDR-2016 | Request for Certified True Copy of Derogatory Records | — | 1 | May be reproduced | application_request — **already built** (prior prototype) |
| `CCS-A-NTSP-2016.pdf` | CCS-A-NTSP-2016 | Application for Certificate of Not the Same Person (NTSP) | — | 1 | May be reproduced | application_request |
| `CCS-C-CPA-2016.pdf` | CCS-C-CPA-2016 | Request for Certification of Pending Application | — | 1 | May be reproduced | application_request |
| `CGAF-002-Rev3.pdf` | CGAF-002, Rev 3 | Consolidated General Application Form for Non-Immigrant Visa, Special Work Permit and Provisional Work Permit (except student visa/SSP) | Rev 3 | 2 | May be reproduced | application_request — **possible duplicate, see above** |
| `CGAF-003-Rev 2.pdf` | CGAF-003, Rev 2 | Consolidated General Application Form for Student Visa and Special Study Permit | Rev 2 | 2 | May be reproduced | application_request — **one of the 2 CGAF forms you mentioned** |
| `IRD04.QF.004.pdf` | IRD04.QF.004 | Consolidated General Application Form (CGAF) for Extension of Stay of Temporary Visitor's Visa | — | 1 | May be reproduced | application_request |
| `IRD04.QF.008.pdf` | IRD04.QF.008 | Request for Updating and Extension of Authorized Stay | — | 1 | **Not found on form** ⚠ | application_request — **requires notarization** (printed on the form itself) |

Note: three other forms besides the two you named also carry "Consolidated General Application Form (CGAF)" in their title (`BOC04.QF.001`, `BOC04.QF.002`, `IRD04.QF.004`) — CGAF is BI's name for a *family* of forms, not unique to the two files literally prefixed `CGAF-`. Flagging so it isn't confused with "the two additional CGAF forms" you specifically meant (`CGAF-002-Rev3.pdf` and `CGAF-003 Rev 2.pdf`), which are both accounted for above.

## 6. Candidates for Client Portal assignment (your review/approval required — nothing decided here)

**Reasonable candidates**, pending the same coordinate-mapping + visibility-region build CCS-A-CDR-2016 already went through:
2014-01-011, 2014-08-015, 2014-13-002, 2014-13-006, 2021-03-001, ADM05.QF.001, ARD04.QF.003, BOC04.QF.001, CCS-A-NTSP-2016, CCS-C-CPA-2016, CGAF-003 Rev 2, IRD04.QF.004.

**Hold — need resolution before considering:**
- `2015-08-006.pdf` — explicitly says it **cannot** be reproduced; don't build this one until BI's position is clarified.
- `BOC04.QF.002.pdf` / `CGAF-002-Rev3.pdf` — resolve the likely duplicate first; build whichever is current, not both.
- `IRD04.QF.008.pdf` — no reproduction notice found, and it requires notarization — candidate only once reproduction rights are confirmed and a notarization instruction (per the approved visibility policy's "off-form instructions," section 7.5) is drafted.

**Not customer-assignable as questionnaires at all** (structural, not just "pending review"):
- `ARD04.QF.001.pdf`, `ARD04.QF.002.pdf` — these are the **issued certificates themselves**, not application forms. Per the Forms Library's existing hard rule, `bi_certificate`-typed entries are never auto-generated as official output. They could still enter the library as `reference_only` (e.g. so staff/clients can see what the certificate looks like), never as something a client "fills out."
- `BIFORM2021-03-002.pdf` — a checklist/instructions document, not a fillable form; candidate for `reference_only`, shown alongside the `2021-03-001.pdf` Travel Pass application rather than assigned on its own.

## 7. Architecture preserved

Nothing above touches the approved Forms Library design from earlier in this project: the default-deny customer-visibility policy, the two-gate (role + region) model, multilingual questionnaire rendering, staff-only fields, and the separate staff/customer PDF generation path all still apply unchanged to every form above once each gets its own coordinate map, role assignments, and visibility regions — exactly the work already done for CCS-A-CDR-2016, repeated per form.

## Recommended next step

Pick **one** of the clean, uncomplicated candidates (e.g. `2014-13-002.pdf`, Request for BI Clearance Certificate — single page, no flagged issues) and run it through the same pixel-coordinate-mapping and inspect-and-correct cycle used for CCS-A-CDR-2016, as a second proof point before scaling to the rest. Resolve the three flagged items (cannot-reproduce form, likely duplicate, notarization form) in parallel, since they need your input rather than more technical work from me.
