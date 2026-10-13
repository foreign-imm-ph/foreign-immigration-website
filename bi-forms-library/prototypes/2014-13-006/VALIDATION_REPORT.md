# Validation Report — BI FORM 2014-13-006, "Application Form for Request for Travel Records"

**Data used:** 100% fictional (Kenji Haruto Tanaka, Japanese citizen, one reported trip) — see `sample-data.json`. Nothing in the FIS repository, website, database, or Cloudflare resources was touched. Original PDF retrieved read-only from `fis-bi-forms-library/originals/2014-13-006.pdf`.

## Decisions implemented exactly as approved

1. First Landline/Mobile block: staff-only, never drawn on the customer document.
2. Requesting Foundation/Agency/Embassy/Others + its Landline/Mobile: staff-only. (The conditional "did an external institution request this" questionnaire step is documented as `questionnaireNote` in `coordinate-map.json` for the Client Portal build — not implemented as UI here, since that's a separate system, but the field-ownership contract it feeds is built and enforced.)
3. Court/Legal section: conditional logic implemented in `generate.js` — `data.courtLegalApplies` gates whether the client's answers are used; when `false` (as in this sample), "N/A" is written to all three fields after the staff-controlled fallback, never left blank or guessed.
4. Signature-line Contact Number: staff-only. Signature and Date themselves are not auto-filled, exactly as instructed.
5. Customer PDF built from exactly two regions — personal information through Province/Zip Code, and Arrival/Departure/Flight — with everything between and below excluded.

## How "must not be recoverable" is satisfied (stronger guarantee than the single-crop forms)

This form's approved customer-visible content isn't contiguous, so the MediaBox/CropBox technique used for CCS-A-CDR-2016 and 2014-13-002 (which still leaves the full original content stream physically present in the file, just outside the visible box) couldn't satisfy "must not be recoverable" on its own. The generation pipeline instead:

1. `generate.js` builds `customer-fields-fullpage.pdf` — a **fresh** copy of the blank template with only the two approved regions' fields drawn (identity/address + Arrival/Departure/Flight). Staff-only fields are never written to this object.
2. That intermediate is rendered to a 300 DPI PNG, and **only** the two approved regions are cropped from it and composited onto a new canvas with a visible divider (`compose_customer_canvas.py`).
3. `finalize_customer_preview.js` builds `customer-preview.pdf` as a **brand-new PDF document** (`PDFDocument.create()`) — not derived from `original.pdf` at all — containing only that composited image plus the watermark and divider caption, drawn as vector text on top.

Verified directly against the delivered file:
- **Exactly one image XObject** in the whole PDF (confirmed via regex count) — there is no second hidden image, no leftover reference to the original template.
- Decompressed every content stream and searched for the staff-only mobile number, "Requesting," "Court," and the BI-only section headings — **none present anywhere in the file**.
- Zero annotations, zero embedded files/attachments, no JavaScript, no XMP metadata stream.
- Because the customer document was never built from `original.pdf`, there is no underlying content stream to recover by expanding a box or manipulating metadata — the excluded content was never written to this file, at any point in the pipeline, not merely hidden.

**Trade-off, disclosed:** the customer PDF's visible content (including the applicant's own entered data) is now a raster image rather than selectable PDF text. This is a deliberate consequence of guaranteeing non-recoverability for a non-contiguous region set, consistent with the "preview only" framing — the staff PDF (unaffected, still normal selectable PDF text) remains the authoritative, complete official document.

**Known limitation to flag for later:** this technique depends on `pdftoppm` (poppler) for rasterization, which is not available inside a Cloudflare Worker. A production implementation would need either a different rendering approach (e.g. a pre-rendering service, or a WASM-based rasterizer) or to accept this generation step runs outside the Worker (e.g. in a scheduled job or a separate render service) and stores the result in R2. This is the same open question already logged in the Forms Library spec (standardizing the raster-recompose technique) — not a new problem, just the first time it had to actually be built.

## Alignment and overflow

`overflow-report.json`: empty. Every field — including the three-row Arrival/Departure/Flight grid and the DOB/Gender/Passport row this form uniquely shares — rendered correctly on the first pass: one character per box, centered both ways, correct grouping (confirmed the DD/MMM/YYYY and the 7-box Flight Number groups by direct visual zoom, not spacing arithmetic, after the same "gap equals box width" ambiguity recurred).

## Two detection pitfalls from prior forms, re-checked rather than assumed

1. **Other Name 1/2 label collision** — the same bug (the printed "1"/"2" row-number glyph read as a box border) recurred on this form too. Checked via the same partial-height vs. full-height pixel-fraction test before trusting the measurement, and corrected. Confirmed clean in the rendered output.
2. **Box-group boundaries with equal gap-and-box spacing** — recurred for the Arrival/Departure Date and Flight Number groups. Resolved by direct 600%-equivalent visual zoom (counting boxes by eye), not by assuming the prior forms' DOB grouping logic applied here unchanged.

## Metadata-minimization standard — adopted and applied

Both `staff-preview.pdf` and `customer-preview.pdf` now carry `Author: Foreign Immigration Services`, `Creator: FIS Forms Library`, and `Title: Application Form for Request for Travel Records` — confirmed via `pdfinfo` — replacing the inherited "Mabi's"/"Microsoft® Word 2010" values seen on the original template and on the two earlier (unmodified, per instruction) prototypes.

## Files in this delivery

- `staff-preview.pdf` / `.png` — full original form, every field, BI-only sections untouched.
- `customer-preview.pdf` / `.png` — the two approved regions only, watermarked, divider-captioned.
- `coordinate-map.json` — full field-level coordinates and role assignments.
- `sample-data.json` — fictional test fixture.
- `overflow-report.json` — empty.
- `generate.js`, `compose_customer_canvas.py`, `finalize_customer_preview.js` — the three-stage generation pipeline source.

Awaiting your review before committing or starting another form. Nothing has been deployed.
