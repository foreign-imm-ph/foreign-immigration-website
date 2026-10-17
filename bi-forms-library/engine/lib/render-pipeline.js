// Pure PDF-assembly logic shared by every form: builds the full staff
// document and the (unresolved) customer-fields-only document, both
// straight from pdf-lib with no filesystem, subprocess, or raster
// dependency of any kind. This is what makes these functions directly
// importable by the Cloudflare Worker (Phase 2 Stage 3) as well as the
// local Node CLI -- the SAME code runs in both places, unmodified.
//
// The next step of the secure-reconstruction pipeline -- rasterizing,
// cropping, and compositing the customer-fields document into a final
// customer preview -- needs a raster backend (Poppler locally; still
// undecided for production, see bi-forms-library/PHASE2_INTEGRATION_PLAN.md
// Stage 4) and lives in raster-pipeline.js instead, which only the local
// Node CLI and test suite import. Nothing in this file may import "fs",
// "os", "path", "child_process", or "./raster" -- that boundary is the
// whole point of the split.
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const { fieldsForAudience } = require("./field-permissions");
const { populateCharField, drawCheckbox, drawFreeText, drawWrappedFreeText } = require("./pdf-fields");
const { resolveFieldValues } = require("./field-bindings");
const { applyMetadataStandard } = require("./metadata");

// Every form mapped before BOC04.QF.001 was a single PDF page, so every
// field implicitly belonged to "the page" and this module took a single
// `page` object. BOC04.QF.001 is the first genuinely multi-page form (2
// pages) -- some fields (Character References, Petitioner's Information,
// ACR I-Card, the signature block) print on page 2, not page 1. A field's
// optional `page` property (0-indexed; omitted = page 0) now says which
// PDF page it belongs to, and `pages` (the full array from
// doc.getPages(), not a single page) is threaded through so each field is
// drawn onto its own real page rather than every field landing on page 1
// regardless of where it actually prints. This is a pure routing change --
// every single-page form's fields all implicitly resolve to pages[0],
// unchanged from before.
function pageFor(pages, field) {
  const idx = typeof field.page === "number" ? field.page : 0;
  const page = pages[idx];
  if (!page) throw new Error(`Field references page ${idx} but the document only has ${pages.length} page(s).`);
  return page;
}

// Draws a given field set (as returned by fieldsForAudience) across the
// document's real pages. `values`/`checkboxMarks`/`wrappedPairs` come from
// field-bindings.js's resolveFieldValues() -- this function is purely
// mechanical and has no per-form knowledge at all.
function drawFields(pages, font, coordinateMap, fields, resolved, overflowReport) {
  for (const key of Object.keys(fields.charBoxFields)) {
    if (key in resolved.values) {
      const page = pageFor(pages, coordinateMap.charBoxFields[key]);
      populateCharField(page, font, coordinateMap, key, resolved.values[key], overflowReport);
    }
  }
  for (const key of Object.keys(fields.checkboxFields)) {
    if (resolved.checkboxMarks[key]) {
      const page = pageFor(pages, coordinateMap.checkboxFields[key]);
      drawCheckbox(page, font, coordinateMap, key);
    }
  }
  const wrappedKeys = new Set();
  for (const pair of resolved.values.__wrappedPairs || []) {
    if (pair.line1 in fields.freeTextFields) {
      const page = pageFor(pages, coordinateMap.freeTextFields[pair.line1]);
      drawWrappedFreeText(page, font, coordinateMap, pair.line1, pair.line2, pair.text, overflowReport);
      wrappedKeys.add(pair.line1);
      wrappedKeys.add(pair.line2);
    }
  }
  for (const key of Object.keys(fields.freeTextFields)) {
    if (wrappedKeys.has(key)) continue;
    if (key in resolved.values) {
      const page = pageFor(pages, coordinateMap.freeTextFields[key]);
      drawFreeText(page, font, coordinateMap, key, String(resolved.values[key] ?? ""), overflowReport);
    }
  }
}

async function buildStaffDocument(originalBytes, coordinateMap, bindings, data) {
  const doc = await PDFDocument.load(originalBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const overflowReport = [];
  const resolved = resolveFieldValues(bindings, data);
  const staffFields = fieldsForAudience(coordinateMap, "staff");
  drawFields(pages, font, coordinateMap, staffFields, resolved, overflowReport);
  await applyMetadataStandard(doc, coordinateMap.formTitle);
  const stampFont = await doc.embedFont(StandardFonts.HelveticaOblique);
  for (const page of pages) {
    page.drawText("PROTOTYPE - FICTIONAL DATA - NOT FOR FILING", {
      x: 36, y: 16, size: 7, font: stampFont, color: rgb(0.55, 0.55, 0.55),
    });
  }
  return { bytes: await doc.save(), overflowReport };
}

async function buildCustomerFieldsDocument(originalBytes, coordinateMap, bindings, data) {
  const doc = await PDFDocument.load(originalBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const overflowReport = [];
  const resolved = resolveFieldValues(bindings, data);
  const customerFields = fieldsForAudience(coordinateMap, "customer");
  drawFields(pages, font, coordinateMap, customerFields, resolved, overflowReport);
  await applyMetadataStandard(doc, coordinateMap.formTitle);
  return { bytes: await doc.save(), overflowReport };
}

function getRegions(coordinateMap) {
  if (coordinateMap.customerVisibleRegions && Array.isArray(coordinateMap.customerVisibleRegions.regions)) {
    return coordinateMap.customerVisibleRegions.regions;
  }
  if (coordinateMap.customerPreviewCropBox) {
    const cb = coordinateMap.customerPreviewCropBox;
    return [{ xLeftPt: cb.xLeftPt, xRightPt: cb.xRightPt, yBottomPt: cb.yBottomPt, yTopPt: cb.yTopPt }];
  }
  throw new Error("No customerVisibleRegions or customerPreviewCropBox defined -- refusing to guess a visible region.");
}

// The same fixed divider height raster-pipeline.js's composeCustomerCanvas
// has always passed to compose_canvas.py ("22"pt) for a multi-region form
// -- centralized here as a named constant now that a second caller
// (svg-compose.js, Phase 2 Stage 5.3) needs the identical value without
// depending on raster-pipeline.js itself (which requires Poppler/fs and is
// not Workers-safe).
const REGION_DIVIDER_PT = 22;

// Computes the composed multi-region canvas's logical dimensions PURELY
// from coordinateMap -- no raster/Poppler step needed, since every region
// is already known to be full-page-width (verified across all three
// migrated forms) and the only arithmetic involved is summing declared
// region heights plus fixed dividers. This is what let Stage 5.3's
// Workers-compatible compositor (svg-compose.js) size its output SVG
// canvas without needing compose_canvas.py's own (Poppler-dependent)
// dims.json -- the two are required to agree, and a shared regression
// test (tests/run-all.js) checks that directly.
function getCanvasDims(coordinateMap) {
  const regions = getRegions(coordinateMap);
  const regionHeightsPt = regions.map((r) => r.yTopPt - r.yBottomPt);
  const regionPages = regions.map((r) => (typeof r.page === "number" ? r.page : 0));
  const regionCount = regions.length;
  const dividerPt = regionCount > 1 ? REGION_DIVIDER_PT : 0;
  const heightPt = regionHeightsPt.reduce((s, h) => s + h, 0) + dividerPt * Math.max(0, regionCount - 1);
  return {
    widthPt: coordinateMap.pageWidthPt,
    heightPt,
    dividerPt,
    regionHeightsPt,
    regionCount,
    regionPages,
  };
}

module.exports = {
  buildStaffDocument,
  buildCustomerFieldsDocument,
  getRegions,
  getCanvasDims,
  REGION_DIVIDER_PT,
  drawFields,
};
