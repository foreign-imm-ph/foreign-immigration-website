# Validation Report — BI FORM 2014-13-002 ("Request for BI Clearance Certificate")

**Revision:** Stage 2, post-approval refinement. Field mapping and crop boundary are unchanged from the approved version — only the customer-preview watermark opacity was adjusted, per instruction.

## Change made

Watermark opacity on the customer preview reduced from 0.22 to 0.12 (`generate.js`, `addWatermark`). Still diagonal, still reads "PREVIEW ONLY | FOR BI APPLICATION PREPARATION THROUGH FIS," now visibly lighter so the applicant's own entered details stay easy to read underneath it. No other change to text, layout, fonts, or positions.

## 1. Visual alignment — re-checked, unchanged from the approved version

All character-box fields, the Gender checkbox, and the Date of Birth 2/3/4 grouping render identically to the approved Stage 2 preview (the watermark change doesn't touch field-drawing code). Re-inspected visually after regeneration to confirm.

## 2. Text overflow

`overflow-report.json`: empty. Zero issues, same as the approved version — the watermark change doesn't affect any character-box or free-text field.

## 3. Restricted-data security checks

| Check | Result |
|---|---|
| MediaBox / CropBox / BleedBox / TrimBox / ArtBox all constrained to the approved region (not just the viewing box) | **Pass** — all five identical: `0.00 480.40 612.00 936.00` |
| Staff-only data (Mobile number, Purpose text) absent from the customer PDF's decompressed content streams | **Pass** — searched every stream after zlib decompression; neither value appears anywhere in the file |
| Annotations (`/Annots`) | **Pass** — none present |
| Embedded files / attachments (`/EmbeddedFile`, `/EmbeddedFiles`, `/Filespec`, `/Names`) | **Pass** — none present |
| JavaScript | **Pass** — none (`pdfinfo`: "JavaScript: no") |
| XMP metadata stream | **Pass** — none present |
| Document Info dictionary (Author/Creator/Producer) | **Flagged, not a new leak — see below** |

### Metadata finding (flagged per your explicit request to check this)

The customer PDF's Author ("Mabi's") and Creator ("Microsoft® Word 2010") fields are inherited from the **original blank BI template itself** — confirmed by checking `original.pdf` directly, which carries the identical values. This is not customer or FIS data, not something this automation added, and the same information is already present in the publicly-reproducible blank form everyone downloads. It's included here only because you specifically asked for a metadata check, not because it represents a new exposure. If you'd like it scrubbed anyway for a cleaner-looking output file, that's a small addition (`pdfDoc.setAuthor("")`, `setCreator("")` in `generate.js`) — flagging as optional, not done without your say-so since it touches the file's own identifying metadata.

## 4. Field ownership and crop boundary

Unchanged from the version you approved. Not re-opened.

## Files in this commit

- `generate.js` — prototype source (includes the opacity change)
- `coordinate-map.json` — the form-specific coordinate map
- `sample-data.json` — fictional test fixture data
- `overflow-report.json` — latest validation output (empty)
- `VALIDATION_REPORT.md` / `ALIGNMENT_REPORT.md` — this report and the original Stage 2 alignment report

**Not committed:** `original.pdf` (the retrieved BI template), `staff-preview.pdf`/`.png`, `customer-preview.pdf`/`.png` — generated output artifacts, kept out of the repository per instruction. These remain available in this session's delivered files for your review.
