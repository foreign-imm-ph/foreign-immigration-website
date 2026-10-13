# Follow-up Report — BI FORM 2014-13-006, items 1–3

No approved boundaries, field ownership, or regions were changed for this or any other form. No commits made. Nothing deployed.

## 1. Three-row test (`sample-data-three-trips.json`)

Filled all three Arrival/Departure/Flight entries with distinct fictional dates and flight numbers (Feb 2025/PR0431-0432, Jun 2024/NH0862-0861, Dec 2023-Jan 2024/CX0906-0905) and reran the full pipeline.

- **Overflow:** zero issues (`overflow-report-three-trips.json` is empty) — every flight number (6 characters) fit cleanly within the 7-box field at a legible size.
- **Alignment:** confirmed visually (`customer-preview-three-trips.png`) — all three rows render independently, correctly aligned to their own row's y-position, with no bleed or misalignment between rows. Row 3's December-to-January date correctly stays in its own row despite spanning a year boundary (no special handling needed, it's just two independent date fields).
- The single-trip version remains the primary delivered sample (`sample-data.json`, `staff-preview.pdf`, `customer-preview.pdf`); the three-trip run is kept as a separate verification artifact (`*-three-trips.*`), not the default.

## 2. Multilingual questionnaire support for up to three trips

Added a `questionnaireDesign` block to `coordinate-map.json` (planning/contract only, no UI built):

- **Trip entries:** a repeatable block, exactly 3 instances matching the PDF's 3 physical rows — Arrival Date, Arrival Flight Number, Departure Date, Departure Flight Number per entry. Labels follow the existing bilingual pattern (English label, translation in parentheses).
- **Beyond three trips:** a separate free-text field — "If you need to report more than three trips, describe them here for FIS staff to arrange separately" — routed to staff for manual handling. This is deliberately *not* a 4th structured entry, since the PDF has no 4th row; staff decide how to handle overflow (supplementary note, split request, etc.) rather than the system silently dropping or misplacing data.
- **Court/Legal conditional:** the approved Yes/No gate ("Are you requesting your travel records for court proceedings or another legal purpose?") is documented the same way — the questionnaire answer informs staff, who control what actually goes on the PDF, exactly as approved.

## 3. Production-compatible rendering recommendation

The raster-recompose technique (render → crop → composite → embed as image in a new PDF) that makes this form's customer preview provably safe depends on `pdftoppm` (poppler), which doesn't run inside a Cloudflare Worker. Two Workers-compatible paths, for your approval before either is built:

**Option A — Cloudflare Browser Rendering (recommended as primary candidate).** Cloudflare's own Workers Browser Rendering binding runs a headless browser server-side as a native platform capability (not third-party infrastructure). The approach: store each approved region as an HTML template (a background image of the blank region + absolutely-positioned text for the customer's data, styled with the same font-fit logic already proven here), render it via the Browser Rendering binding's screenshot/PDF capability, directly producing the final image or PDF. Advantages: no new WASM/image-processing dependency, reuses ordinary HTML/CSS skills already used for the Eleventy site, and the rendering happens entirely within Cloudflare's own platform.

**Option B — Pre-rendered templates + WASM image compositing.** Rasterize each approved *blank* region once, offline (exactly as done in this prototype), store those as static PNGs in R2, and at request time draw the customer's characters onto a copy of those templates using a Workers-compatible WASM image/raster library (e.g. the `resvg`/`photon` family already common in Workers image-generation use cases), then embed the result into a PDF via pdf-lib (pure JS, already Workers-compatible). Advantage: no browser automation involved; drawback: introduces a new WASM dependency and reimplements some of the font-fit/centering logic in that library's terms.

Both are documented here as a **recommendation only** — no package installed, no binding enabled, no Cloudflare resource created or changed. This decision (and which option) needs your approval before any implementation work starts, consistent with the Forms Library spec's existing open decision on standardizing the generation technique across forms.
