# Stage 2 — Alignment Report: BI FORM 2014-13-002, "Request for BI Clearance Certificate"

**Data used:** 100% fictional (Maria Santos Reyes, Spanish citizen) — see `sample-data.json`.
**Status:** Clean on the first generation pass — zero overflow issues, zero security-check failures. No further correction cycles were needed (unlike the CDR prototype, which needed two fixes before reaching this state).

This is an isolated scratchpad prototype. Nothing in the FIS repository, website, database, or Cloudflare resources was touched. The original PDF was retrieved read-only from `fis-bi-forms-library/originals/2014-13-002.pdf`; the previously-delivered CCS-A-CDR-2016 prototype and its files were not modified.

## Customer-visible boundary (per your explicit instruction)

Ends immediately after Passport Number. Measured directly from this form's own PDF (not copied from CDR): Passport Number's bottom border sits at 455.2–455.6pt (top-down) and the "Contact Number(s) in the Philippines" heading's own topmost ink begins at 455.60pt — essentially no gap at all on this form, tighter than CDR's. The crop boundary was set to the border's own edge (480.4pt bottom-up) since there was no spare margin to work with. Verified by direct pixel inspection of the rendered customer PDF: the cut lands cleanly on the box's border with no trace of the heading.

## Security verification (same test applied to CCS-A-CDR-2016, repeated here)

- `pdfinfo -box` confirms MediaBox, CropBox, BleedBox, TrimBox, and ArtBox are all constrained to the approved region (480.40–936pt) — not just the viewing box.
- Decompressed every content stream in `customer-preview.pdf` and confirmed the staff-only mobile number and Purpose text are **not present anywhere in the file** — because, as with CDR, the customer document is built by loading a fresh copy of the blank template and only ever calling the applicant-field population function on it. `populateFisFields` (Landline, Mobile, Purpose) is never invoked on that object.
- Confirmed the CCS Window and Claim Stub remain completely blank in the staff preview — no customer or FIS data was written there.

## Two detection pitfalls from the CDR prototype, independently re-checked here (not assumed fixed)

1. **"Other Name 1/2" row-label collision.** The same bug that affected CDR (the printed "1"/"2" row-number glyph being mistaken for a box-border) was checked for directly via a pixel-shape scan before trusting the coordinate map, and the same correction (dropping the false first divider) was applied. Confirmed clean in the rendered output — no collision.
2. **Date of Birth group boundaries.** An initial automated reading returned 12 evenly-spaced points with no obvious grouping, because the gap between the DD/MMM/YYYY groups happens to equal exactly one box-width — the same spacing used within a group. This was resolved by direct visual inspection at 600 DPI (not by assuming CDR's 2-3-4 grouping applied here too), which confirmed the groups are genuinely 2/3/4 boxes with real white gaps between them.

## Field ownership (settled by your explicit instruction, not re-opened)

Customer-visible: Last Name, First/Given Name, Middle Name, Other Name(s) 1 & 2, Date of Birth, Gender, Place of Birth, Citizenship/Nationality, full address block, Passport Number.
Staff-only, never shown to the customer: Landline, Mobile, Purpose, Date, Signature.
BI-only, never populated: CCS Window, Claim Stub.

## Fields requiring no adjustment

Every character-box field, both Gender checkboxes, the three-group Date of Birth field, and the Purpose free text rendered correctly on the first pass: one character per box, centered both ways, legible black text at the largest size that fits each box.

## Off-form instructions (new for this form, not present on CDR)

This form requires a supporting document (passport bio-page or valid government ID photocopy) and, if filed by a representative, a BI Accreditation ID or SPA — both captured as `offFormInstructions` in the coordinate map, to be shown as translated Client Portal notices rather than exposed as PDF sections. Draft English wording only; translation still needed before production use, same caution as the CDR prototype's equivalent notices.

## Files delivered

- `staff-preview.pdf` / `staff-preview.png` — full original form, all applicant + FIS fields filled, BI-only sections untouched.
- `customer-preview.pdf` / `customer-preview.png` — cropped to end immediately after Passport Number, with the required preview watermark.
- `coordinate-map.json` — the form-specific coordinate map, independently measured and verified.
- `overflow-report.json` — empty; the sample data fit every field with no truncation.

Awaiting your review before any further action. Nothing has been deployed.
