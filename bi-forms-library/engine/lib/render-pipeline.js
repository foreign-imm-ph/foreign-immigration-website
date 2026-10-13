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

// Draws a given field set (as returned by fieldsForAudience) onto a page.
// `values`/`checkboxMarks`/`wrappedPairs` come from field-bindings.js's
// resolveFieldValues() -- this function is purely mechanical and has no
// per-form knowledge at all.
function drawFields(page, font, coordinateMap, fields, resolved, overflowReport) {
  for (const key of Object.keys(fields.charBoxFields)) {
    if (key in resolved.values) {
      populateCharField(page, font, coordinateMap, key, resolved.values[key], overflowReport);
    }
  }
  for (const key of Object.keys(fields.checkboxFields)) {
    if (resolved.checkboxMarks[key]) drawCheckbox(page, font, coordinateMap, key);
  }
  const wrappedKeys = new Set();
  for (const pair of resolved.values.__wrappedPairs || []) {
    if (pair.line1 in fields.freeTextFields) {
      drawWrappedFreeText(page, font, coordinateMap, pair.line1, pair.line2, pair.text, overflowReport);
      wrappedKeys.add(pair.line1);
      wrappedKeys.add(pair.line2);
    }
  }
  for (const key of Object.keys(fields.freeTextFields)) {
    if (wrappedKeys.has(key)) continue;
    if (key in resolved.values) {
      drawFreeText(page, font, coordinateMap, key, String(resolved.values[key] ?? ""), overflowReport);
    }
  }
}

async function buildStaffDocument(originalBytes, coordinateMap, bindings, data) {
  const doc = await PDFDocument.load(originalBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.getPages()[0];
  const overflowReport = [];
  const resolved = resolveFieldValues(bindings, data);
  const staffFields = fieldsForAudience(coordinateMap, "staff");
  drawFields(page, font, coordinateMap, staffFields, resolved, overflowReport);
  await applyMetadataStandard(doc, coordinateMap.formTitle);
  const stampFont = await doc.embedFont(StandardFonts.HelveticaOblique);
  page.drawText("PROTOTYPE - FICTIONAL DATA - NOT FOR FILING", {
    x: 36, y: 16, size: 7, font: stampFont, color: rgb(0.55, 0.55, 0.55),
  });
  return { bytes: await doc.save(), overflowReport };
}

async function buildCustomerFieldsDocument(originalBytes, coordinateMap, bindings, data) {
  const doc = await PDFDocument.load(originalBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.getPages()[0];
  const overflowReport = [];
  const resolved = resolveFieldValues(bindings, data);
  const customerFields = fieldsForAudience(coordinateMap, "customer");
  drawFields(page, font, coordinateMap, customerFields, resolved, overflowReport);
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

module.exports = {
  buildStaffDocument,
  buildCustomerFieldsDocument,
  getRegions,
  drawFields,
};
