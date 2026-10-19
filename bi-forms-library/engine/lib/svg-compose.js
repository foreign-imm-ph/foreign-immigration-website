// Workers-compatible replacement for raster-pipeline.js's composeCustomerCanvas
// + finalizeCustomerPreview, built on Phase 2 Stage 4's approved choice:
// `@resvg/resvg-wasm` (WASM-compiled Rust SVG renderer) as the primary
// production rendering backend (bi-forms-library/STAGE4_RENDERING_COMPARISON.md
// section 7). Unlike raster-pipeline.js, this file imports no "fs", "os",
// "child_process", or "./raster" -- it is safe to import directly from the
// Cloudflare Worker, exactly like render-pipeline.js.
//
// Architecture: raster-pipeline.js's composeCustomerCanvas rasterizes the
// ACTUAL customer-fields PDF (with real field values already drawn by
// pdf-lib) via Poppler at request time -- not reproducible in a Workers
// isolate (no native binary, no filesystem). Rasterizing an arbitrary PDF
// at all has no Workers-compatible equivalent today (resvg renders SVG,
// not PDF). This module sidesteps that entirely: the BLANK original-form
// artwork for each form's approved customer-visible region(s) is rendered
// to a PNG exactly ONCE, offline, using the existing already-proven local
// Poppler pipeline (see scripts/generate-blank-backgrounds.js) -- not at
// request time, and never inside the Worker. That static background PNG
// is what the Worker reads from R2 at request time; THIS module then
// draws the customer's actual field values as SVG <text> on top of it (a
// single resvg render pass, no Poppler involved), watermark and the
// multi-region divider caption baked into the same SVG so the whole
// visible artifact comes from one render. The result is embedded into a
// brand-new PDFDocument exactly the way finalizeCustomerPreview() already
// does -- same metadata call, same "nothing of original.pdf's own PDF
// structure survives into the final file" security property -- so every
// existing audit (assertMetadata, auditContentStreams,
// auditBoundaryExpansion) applies unchanged regardless of which renderer
// produced the image.
//
// Text sizing (font-fit/shrink-to-fit for char boxes, checkboxes, free
// text, and the watermark) reuses the EXACT SAME fitting functions the
// pdf-lib path already uses (pdf-fields.js, watermark.js) -- those
// functions only need a font's widthOfTextAtSize() as a measuring oracle,
// which a pure pdf-lib StandardFonts.Helvetica font object provides
// without touching a PDF document or any raster backend. The actual
// glyphs are then painted by resvg using a bundled Liberation Sans font,
// chosen in Stage 4 specifically because it is metric-compatible with
// Helvetica/Arial -- so a size computed against pdf-lib's Helvetica
// metrics renders at materially the same footprint under resvg's
// Liberation Sans. This lets every sizing decision stay centralized in
// one already-tested place instead of being re-implemented against
// resvg's own (non-existent) text-measurement API.
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { Resvg, initWasm } = require("@resvg/resvg-wasm");

const { fieldsForAudience } = require("./field-permissions");
const { resolveFieldValues } = require("./field-bindings");
const { fitCharFontSize, fitFreeTextSize } = require("./pdf-fields");
const { computeWatermarkPlacement, WATERMARK_COLOR_RGB01 } = require("./watermark");
const { getRegions, getCanvasDims } = require("./render-pipeline");
const { applyMetadataStandard } = require("./metadata");

const DPI = 300; // must match the DPI the blank backgrounds were pre-rendered at (scripts/generate-blank-backgrounds.js)
const SCALE = DPI / 72;

// @resvg/resvg-wasm's initWasm() is a module-level singleton -- calling it
// twice throws. Guarded with a single shared promise so every call in this
// isolate's lifetime (one Worker can serve many requests) reuses the same
// initialized module instead of re-instantiating the ~2.5MB WASM binary
// per request.
let wasmInitPromise = null;
function ensureWasmInitialized(resvgWasmInput) {
  if (!wasmInitPromise) wasmInitPromise = initWasm(resvgWasmInput);
  return wasmInitPromise;
}

function escapeXmlText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function rgbToCss([r, g, b]) {
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

// Workers has no "Buffer" global (confirmed directly: ReferenceError under
// the real workerd runtime via `wrangler dev --local`, Phase 2 Stage 5.3 --
// Node-only, not part of the standard Web platform this isolate otherwise
// implements). `btoa`/`atob`, by contrast, ARE standard and available here.
// Chunked to avoid blowing the engine's argument-count limit on
// String.fromCharCode(...hugeArray) for a multi-megabyte background PNG.
function bytesToBase64(bytes) {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Finds which approved customer-visible region a point (in the ORIGINAL
// page's bottom-up PDF coordinate space) falls inside, then returns that
// point's position (points, top-down) within the stacked canvas raster-
// pipeline.js's compose_canvas.py physically crops/stacks into -- the
// same mapping, kept consistent so SVG text lands exactly where the
// pre-rendered background's regions were cropped to. `hintYBottom`/
// `hintYTop` identify the field the point belongs to (its own box, or the
// point itself for a single baseline) for the region lookup; every
// customer-visible field is guaranteed to fall fully within exactly one
// region by each form's own visibility design (see each coordinate-map.json's
// visibilityDesignNote), so a point outside every region indicates a real
// coordinate-map/region mismatch, not a value to guess at.
//
// `fieldPage` (0-indexed, default 0) is the field's OWN real PDF page.
// Every page of a multi-page form reuses the same (0..pageHeightPt)
// bottom-up coordinate space, so a y-range alone can match a region on the
// WRONG page (e.g. two full-page regions, one per page, have identical
// yBottomPt/yTopPt) -- the page must also agree, not just the y-range.
function mapPointToCanvasTdPt(pageHeightPt, regions, dims, yPdf, hintYBottom, hintYTop, fieldPage = 0) {
  // Tolerance of 0.1pt, not 0.01pt: a field's own yBottomPt/yTopPt and its
  // region's are independently measured/rounded values (both to 2 decimal
  // places), so a field sitting exactly on a region's own edge can differ
  // from it by a couple of hundredths of a point (e.g. 2014-08-015's own
  // passportNumber field at 401.88pt vs its region's yBottomPt at
  // 401.9pt) without that being an actual coordinate-map mistake -- a real
  // wrong-region mistake is off by many points, not a fraction of one (see
  // the identical reasoning already used for this same comparison in
  // tests/run-all.js's own canvas-height tolerance).
  const idx = regions.findIndex(
    (r) => (typeof r.page === "number" ? r.page : 0) === fieldPage && hintYBottom >= r.yBottomPt - 0.1 && hintYTop <= r.yTopPt + 0.1
  );
  if (idx === -1) {
    throw new Error(`Field on page ${fieldPage} at [${hintYBottom},${hintYTop}] does not fall within any approved customerVisibleRegions -- refusing to draw it.`);
  }
  const region = regions[idx];
  const regionTdTop = pageHeightPt - region.yTopPt;
  const preceding =
    dims.regionHeightsPt.slice(0, idx).reduce((s, h) => s + h, 0) + idx * (dims.regionCount > 1 ? dims.dividerPt : 0);
  const pointTd = pageHeightPt - yPdf;
  return preceding + (pointTd - regionTdTop);
}

// Builds the SVG <text> elements for every customer-visible field with a
// resolved, non-empty value. Mirrors render-pipeline.js's drawFields()
// field-by-field, but emits SVG markup instead of pdf-lib drawText calls.
function buildFieldTextElements(coordinateMap, measureFont, resolved, overflowFields) {
  const pageHeightPt = coordinateMap.pageHeightPt;
  const regions = getRegions(coordinateMap);
  const dims = getCanvasDims(coordinateMap);
  const customerFields = fieldsForAudience(coordinateMap, "customer");
  const elements = [];

  for (const key of Object.keys(customerFields.charBoxFields)) {
    const value = resolved.values[key];
    if (value === undefined) continue;
    const f = coordinateMap.charBoxFields[key];
    const v = String(value ?? "").toUpperCase();
    const nBoxes = f.colsPt.length - 1;
    // Same comparison pdf-fields.js's populateCharField uses for the
    // final-document overflow guard (worker/src/routes/staffBiForms.js's
    // approveBiForm, commit 756296e) -- this is what "preview and final
    // validation agree on overflow conditions" means in practice: one
    // formula (value.length > nBoxes), computed from the same
    // coordinate-map box count, never two independently-maintained
    // thresholds that could drift apart. Reported here (not thrown) --
    // the live preview must never block an in-progress draft; it only
    // surfaces the SAME fact the final guard will enforce at Approve,
    // early enough for the customer to self-correct if they want to.
    if (overflowFields && v.length > nBoxes) {
      overflowFields.push({ key, label: f.label, length: v.length, maxLength: nBoxes });
    }
    const chars = v.slice(0, nBoxes).split("");
    if (!chars.length) continue;
    const size = fitCharFontSize(measureFont, chars, f.colsPt[1] - f.colsPt[0], f.yTopPt - f.yBottomPt);
    const capHeight = size * 0.718;
    const baselinePdf = f.yBottomPt + (f.yTopPt - f.yBottomPt - capHeight) / 2;
    const tdPt = mapPointToCanvasTdPt(pageHeightPt, regions, dims, baselinePdf, f.yBottomPt, f.yTopPt, f.page || 0);
    chars.forEach((ch, i) => {
      if (!ch || ch === " ") return;
      const cx = (f.colsPt[i] + f.colsPt[i + 1]) / 2;
      elements.push(
        `<text x="${(cx * SCALE).toFixed(2)}" y="${(tdPt * SCALE).toFixed(2)}" font-size="${(size * SCALE).toFixed(2)}" text-anchor="middle" font-family="Liberation Sans" fill="black">${escapeXmlText(ch)}</text>`
      );
    });
  }

  for (const key of Object.keys(customerFields.checkboxFields)) {
    if (!resolved.checkboxMarks[key]) continue;
    const f = coordinateMap.checkboxFields[key];
    const size = fitCharFontSize(measureFont, ["X"], f.xRightPt - f.xLeftPt, f.yTopPt - f.yBottomPt, 12);
    const capHeight = size * 0.718;
    const baselinePdf = f.yBottomPt + (f.yTopPt - f.yBottomPt - capHeight) / 2;
    const tdPt = mapPointToCanvasTdPt(pageHeightPt, regions, dims, baselinePdf, f.yBottomPt, f.yTopPt, f.page || 0);
    const cx = (f.xLeftPt + f.xRightPt) / 2;
    elements.push(
      `<text x="${(cx * SCALE).toFixed(2)}" y="${(tdPt * SCALE).toFixed(2)}" font-size="${(size * SCALE).toFixed(2)}" text-anchor="middle" font-family="Liberation Sans" fill="black">X</text>`
    );
  }

  const wrappedKeys = new Set();
  for (const pair of resolved.values.__wrappedPairs || []) {
    if (!(pair.line1 in customerFields.freeTextFields)) continue;
    const f1 = coordinateMap.freeTextFields[pair.line1];
    const f2 = coordinateMap.freeTextFields[pair.line2];
    const available1 = f1.xEndPt - f1.xStartPt - 6;
    const fullSize = 11;
    const fullWidth = measureFont.widthOfTextAtSize(pair.text, fullSize);
    wrappedKeys.add(pair.line1);
    wrappedKeys.add(pair.line2);
    if (fullWidth <= available1) {
      pushFreeTextElement(elements, measureFont, pageHeightPt, regions, dims, f1, pair.text, available1);
      continue;
    }
    const words = pair.text.split(" ");
    let line1 = "";
    let i = 0;
    while (i < words.length) {
      const candidate = line1 ? `${line1} ${words[i]}` : words[i];
      if (measureFont.widthOfTextAtSize(candidate, fullSize) > available1) break;
      line1 = candidate;
      i++;
    }
    const line2 = words.slice(i).join(" ");
    pushFreeTextElement(elements, measureFont, pageHeightPt, regions, dims, f1, line1, available1);
    const available2 = f2.xEndPt - f2.xStartPt - 6;
    pushFreeTextElement(elements, measureFont, pageHeightPt, regions, dims, f2, line2, available2);
  }
  for (const key of Object.keys(customerFields.freeTextFields)) {
    if (wrappedKeys.has(key)) continue;
    const value = resolved.values[key];
    if (value === undefined) continue;
    const f = coordinateMap.freeTextFields[key];
    const available = f.xEndPt - f.xStartPt - 6;
    pushFreeTextElement(elements, measureFont, pageHeightPt, regions, dims, f, String(value ?? ""), available);
  }

  return elements;
}

// Directive section 6 (real-time preview field highlighting): returns the
// SAME canvas pixel rect this module would draw `fieldKey`'s value at, for
// a highlight overlay -- never a separately-eyeballed box, so a highlight
// can never silently drift out of sync with where the field's value
// actually renders. Returns null for a field that either doesn't exist, is
// not customer-visible (never highlights a staff-only field to a
// customer), or doesn't fall within an approved customerVisibleRegions
// entry (the same "refuse to draw" rule buildFieldTextElements's own calls
// to mapPointToCanvasTdPt enforce, caught here rather than thrown since an
// unhighlightable field should just mean no highlight, not a broken
// preview).
function highlightRectForField(coordinateMap, fieldKey) {
  const pageHeightPt = coordinateMap.pageHeightPt;
  const regions = getRegions(coordinateMap);
  const dims = getCanvasDims(coordinateMap);
  const customerFields = fieldsForAudience(coordinateMap, "customer");

  let xMinPt, xMaxPt, yBottomPt, yTopPt, page;
  if (fieldKey in customerFields.charBoxFields) {
    const f = coordinateMap.charBoxFields[fieldKey];
    xMinPt = f.colsPt[0];
    xMaxPt = f.colsPt[f.colsPt.length - 1];
    yBottomPt = f.yBottomPt;
    yTopPt = f.yTopPt;
    page = f.page || 0;
  } else if (fieldKey in customerFields.checkboxFields) {
    const f = coordinateMap.checkboxFields[fieldKey];
    xMinPt = f.xLeftPt;
    xMaxPt = f.xRightPt;
    yBottomPt = f.yBottomPt;
    yTopPt = f.yTopPt;
    page = f.page || 0;
  } else if (fieldKey in customerFields.freeTextFields) {
    const f = coordinateMap.freeTextFields[fieldKey];
    xMinPt = f.xStartPt;
    xMaxPt = f.xEndPt;
    // freeTextFields declare only a baseline, not a box -- approximated
    // with a generous ascent/descent per line (visual highlight only,
    // never used to draw the actual value).
    const lines = f.maxLines || 1;
    yBottomPt = f.baselinePt - 4 - 12 * (lines - 1);
    yTopPt = f.baselinePt + 9;
    page = f.page || 0;
  } else {
    return null;
  }

  let tdTop, tdBottom;
  try {
    tdTop = mapPointToCanvasTdPt(pageHeightPt, regions, dims, yTopPt, yBottomPt, yTopPt, page);
    tdBottom = mapPointToCanvasTdPt(pageHeightPt, regions, dims, yBottomPt, yBottomPt, yTopPt, page);
  } catch {
    return null;
  }

  return {
    xPx: xMinPt * SCALE,
    yPx: tdTop * SCALE,
    widthPx: (xMaxPt - xMinPt) * SCALE,
    heightPx: (tdBottom - tdTop) * SCALE,
    page,
  };
}

// Directive section 6: the union of every forFields entry's own box, for a
// whole question (a question may bind to more than one field -- e.g. a
// wrapped two-line free-text pair). Returns null if none of the question's
// fields are highlightable (see highlightRectForField).
function highlightRectForQuestion(coordinateMap, question) {
  const boxes = (question.forFields || [])
    .map((key) => highlightRectForField(coordinateMap, key))
    .filter(Boolean);
  if (!boxes.length) return null;
  // Only ever union boxes on the SAME page -- a question whose fields
  // somehow spanned two pages would otherwise produce a meaningless
  // combined rect; keep the first page's boxes only, which covers every
  // real case in this project (no question's forFields spans pages today).
  const page = boxes[0].page;
  const samePage = boxes.filter((b) => b.page === page);
  const xPx = Math.min(...samePage.map((b) => b.xPx));
  const yPx = Math.min(...samePage.map((b) => b.yPx));
  const xMaxPx = Math.max(...samePage.map((b) => b.xPx + b.widthPx));
  const yMaxPx = Math.max(...samePage.map((b) => b.yPx + b.heightPx));
  return { xPx, yPx, widthPx: xMaxPx - xPx, heightPx: yMaxPx - yPx, page };
}

function pushFreeTextElement(elements, measureFont, pageHeightPt, regions, dims, f, text, availableWidthPt) {
  if (!text) return;
  const { size } = fitFreeTextSize(measureFont, text, availableWidthPt);
  const tdPt = mapPointToCanvasTdPt(pageHeightPt, regions, dims, f.baselinePt, f.baselinePt, f.baselinePt, f.page || 0);
  const x = f.xStartPt + 3;
  elements.push(
    `<text x="${(x * SCALE).toFixed(2)}" y="${(tdPt * SCALE).toFixed(2)}" font-size="${(size * SCALE).toFixed(2)}" text-anchor="start" font-family="Liberation Sans" fill="black">${escapeXmlText(text)}</text>`
  );
}

function buildWatermarkElement(coordinateMap, measureFont, dims) {
  const bounds = { xLeft: 0, yBottom: 0, width: dims.widthPt, height: dims.heightPt };
  const { size, angleDeg, cx, cy, opacity } = computeWatermarkPlacement(
    coordinateMap.watermark.text,
    measureFont,
    bounds,
    coordinateMap.watermark.opacity
  );
  // Centered on the canvas and rotated about that center -- SVG's
  // text-anchor="middle" plus a rotate() transform sidesteps needing to
  // replicate pdf-lib's own pre-rotation (x,y) anchor-point formula; only
  // the auto-fit SIZE (which does need real font metrics) is shared with
  // the pdf-lib path via computeWatermarkPlacement().
  const cxPx = (cx * SCALE).toFixed(2);
  const cyTdPx = ((dims.heightPt - cy) * SCALE).toFixed(2);
  const sizePx = (size * SCALE).toFixed(2);
  // SVG rotates clockwise for a positive angle in its top-down coordinate
  // system; pdf-lib's degrees(28) rotates counter-clockwise in PDF's
  // bottom-up system. Negating here keeps the watermark's visual diagonal
  // direction consistent with the existing Poppler/pdf-lib output rather
  // than mirroring it.
  return `<text x="${cxPx}" y="${cyTdPx}" font-size="${sizePx}" text-anchor="middle" dominant-baseline="middle" font-family="Liberation Sans" font-weight="bold" fill="${rgbToCss(WATERMARK_COLOR_RGB01)}" fill-opacity="${opacity}" transform="rotate(${-angleDeg} ${cxPx} ${cyTdPx})">${escapeXmlText(coordinateMap.watermark.text)}</text>`;
}

function buildDividerCaptionElement(dims) {
  if (dims.regionCount <= 1 || dims.dividerPt <= 0) return "";
  const regionAHeightPt = dims.regionHeightsPt[0];
  const dividerCenterTdPt = regionAHeightPt + dims.dividerPt / 2;
  const yPx = (dividerCenterTdPt * SCALE).toFixed(2);
  const xPx = ((dims.widthPt / 2) * SCALE).toFixed(2);
  const lineY = ((regionAHeightPt + dims.dividerPt / 2) * SCALE).toFixed(2);
  // Mirrors raster-pipeline.js's finalizeCustomerPreview -- see its own
  // comment for why a same-page split (hidden staff-only content below)
  // and a genuine cross-page break need different caption text.
  const samePage = !dims.regionPages || dims.regionPages.length < 2 || dims.regionPages[0] === dims.regionPages[1];
  const caption = samePage
    ? "FIS staff prepare the remaining sections of this form"
    : "This form continues on the next page";
  return (
    `<line x1="${(40 * SCALE).toFixed(2)}" y1="${lineY}" x2="${((dims.widthPt - 40) * SCALE).toFixed(2)}" y2="${lineY}" stroke="rgb(190,190,190)" stroke-width="${(2 * SCALE).toFixed(2)}"/>` +
    `<text x="${xPx}" y="${(parseFloat(yPx) - 4 * SCALE).toFixed(2)}" font-size="${(9 * SCALE).toFixed(2)}" text-anchor="middle" font-family="Liberation Sans" font-style="italic" fill="rgb(115,115,115)">${escapeXmlText(caption)}</text>`
  );
}

// Builds the complete SVG document for one form's composed customer-
// preview canvas: the pre-rendered blank background image, every
// customer-visible field value, the multi-region divider caption (if
// any), and the watermark -- one single document, rendered by resvg in
// one pass.
async function buildComposedSvg(coordinateMap, questionnaire, data, backgroundPngBytes) {
  const measureDoc = await PDFDocument.create();
  const measureFont = await measureDoc.embedFont(StandardFonts.Helvetica);

  const dims = getCanvasDims(coordinateMap);
  const widthPx = Math.round(dims.widthPt * SCALE);
  const heightPx = Math.round(dims.heightPt * SCALE);

  const bindings = (questionnaire && questionnaire.fieldBindings) || {};
  const resolved = resolveFieldValues(bindings, data);

  const overflowFields = [];
  const fieldElements = buildFieldTextElements(coordinateMap, measureFont, resolved, overflowFields);
  const dividerElement = buildDividerCaptionElement(dims);
  const watermarkElement = buildWatermarkElement(coordinateMap, measureFont, dims);

  const backgroundBase64 = bytesToBase64(backgroundPngBytes instanceof Uint8Array ? backgroundPngBytes : new Uint8Array(backgroundPngBytes));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
    <rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="white"/>
    <image x="0" y="0" width="${widthPx}" height="${heightPx}" href="data:image/png;base64,${backgroundBase64}"/>
    ${fieldElements.join("\n    ")}
    ${dividerElement}
    ${watermarkElement}
  </svg>`;

  return { svg, widthPx, heightPx, dims, overflowFields };
}

// Renders the composed SVG to PNG via resvg-wasm. `resvgWasmInput` is the
// compiled WASM module/bytes (a WebAssembly.Module when called from the
// Worker via a static `import ... from "*.wasm"`, or raw bytes read from
// disk when called from the local background-generation script/tests --
// this module never reads the .wasm file itself, keeping it free of any
// "fs" dependency). `fontBuffers` are the actual TTF bytes resvg paints
// glyphs with (Liberation Sans, Stage 4's chosen metric-compatible
// substitute for system fonts, which Workers isolates don't have at all).
async function renderComposedPng(svg, widthPx, heightPx, resvgWasmInput, fontBuffers) {
  await ensureWasmInitialized(resvgWasmInput);
  const resvg = new Resvg(svg, {
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Liberation Sans" },
    fitTo: { mode: "width", value: widthPx },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  resvg.free();
  return png;
}

// Full pipeline: compose SVG -> render to PNG via resvg -> embed into a
// brand-new PDFDocument with the same metadata call finalizeCustomerPreview()
// already uses. No original.pdf bytes or structure are ever touched here
// -- only a flat raster image is embedded, identical in kind to what the
// Poppler/pdf-lib path already produces, so every existing security audit
// (assertMetadata, auditContentStreams, auditBoundaryExpansion) applies
// unchanged.
async function composeAndFinalizeCustomerPreviewWasm({
  coordinateMap,
  questionnaire,
  data,
  backgroundPngBytes,
  resvgWasmInput,
  fontBuffers,
}) {
  const { svg, widthPx, heightPx, dims } = await buildComposedSvg(coordinateMap, questionnaire, data, backgroundPngBytes);
  const canvasPng = await renderComposedPng(svg, widthPx, heightPx, resvgWasmInput, fontBuffers);

  const doc = await PDFDocument.create();
  const png = await doc.embedPng(canvasPng);
  const page = doc.addPage([dims.widthPt, dims.heightPt]);
  page.drawImage(png, { x: 0, y: 0, width: dims.widthPt, height: dims.heightPt });
  await applyMetadataStandard(doc, coordinateMap.formTitle);
  return { bytes: await doc.save(), dims };
}

module.exports = {
  buildComposedSvg,
  renderComposedPng,
  composeAndFinalizeCustomerPreviewWasm,
  highlightRectForField,
  highlightRectForQuestion,
  ensureWasmInitialized,
  mapPointToCanvasTdPt,
};
