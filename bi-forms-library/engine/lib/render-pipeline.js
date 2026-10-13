// Orchestrates the four-stage secure-reconstruction pipeline shared by all
// three forms:
//   1. buildStaffDocument      -- full page, every drawable field, BI-only
//                                 sections and wet-ink fields untouched.
//   2. buildCustomerFieldsDocument -- fresh copy, ONLY customer-visible
//                                 fields drawn. Nothing else is written to
//                                 this object, for any form.
//   3. composeCustomerCanvas   -- rasterizes (2), crops the one-or-many
//                                 approved regions, composites them (with a
//                                 divider when there's more than one) onto
//                                 a single new canvas image.
//   4. finalizeCustomerPreview -- embeds that canvas into a BRAND-NEW
//                                 PDFDocument (never derived from the
//                                 original template), draws the watermark
//                                 on top, applies the metadata standard.
//
// This is the generalization of what CCS-A-CDR-2016, 2014-13-002, and
// 2014-13-006 already do -- same guarantee, same technique, now driven by
// config instead of being hand-written three times.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const { fieldsForAudience } = require("./field-permissions");
const { populateCharField, drawCheckbox, drawFreeText, drawWrappedFreeText } = require("./pdf-fields");
const { resolveFieldValues } = require("./field-bindings");
const { applyMetadataStandard } = require("./metadata");
const { addWatermark } = require("./watermark");
const raster = require("./raster");

const PYTHON_BIN = "python3.13"; // system interpreter with Pillow pre-installed; the default `python3` on this image is 3.11 and lacks it
const COMPOSE_SCRIPT = path.join(__dirname, "raster", "compose_canvas.py");

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

async function composeCustomerCanvas(customerFieldsBytes, coordinateMap, dpi = 300) {
  const pngBytes = await raster.rasterize(customerFieldsBytes, dpi);
  const regions = getRegions(coordinateMap);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fis-compose-"));
  try {
    const srcPng = path.join(tmpDir, "src.png");
    const regionsJson = path.join(tmpDir, "regions.json");
    const outPng = path.join(tmpDir, "canvas.png");
    const outDims = path.join(tmpDir, "dims.json");
    fs.writeFileSync(srcPng, pngBytes);
    fs.writeFileSync(regionsJson, JSON.stringify(regions));
    const scale = dpi / 72.0;
    execFileSync(PYTHON_BIN, [COMPOSE_SCRIPT, srcPng, String(coordinateMap.pageHeightPt), String(scale), "22", regionsJson, outPng, outDims]);
    return { canvasPng: fs.readFileSync(outPng), dims: JSON.parse(fs.readFileSync(outDims, "utf8")) };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function finalizeCustomerPreview(canvasPngBytes, dims, coordinateMap, watermarkText, watermarkOpacity) {
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(canvasPngBytes);
  const page = doc.addPage([dims.widthPt, dims.heightPt]);
  page.drawImage(png, { x: 0, y: 0, width: dims.widthPt, height: dims.heightPt });

  const wmFont = await doc.embedFont(StandardFonts.HelveticaBold);
  addWatermark(page, watermarkText, wmFont, { xLeft: 0, yBottom: 0, width: dims.widthPt, height: dims.heightPt }, watermarkOpacity);

  if (dims.regionCount > 1 && dims.dividerPt > 0) {
    const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
    const caption = "FIS staff prepare the remaining sections of this form";
    const capSize = 9;
    const regionAHeightPt = dims.regionHeightsPt[0];
    const dividerCenterY = dims.heightPt - regionAHeightPt - dims.dividerPt / 2;
    const capWidth = italic.widthOfTextAtSize(caption, capSize);
    page.drawText(caption, {
      x: dims.widthPt / 2 - capWidth / 2,
      y: dividerCenterY - capSize / 2,
      size: capSize, font: italic, color: rgb(0.45, 0.45, 0.45),
    });
  }

  await applyMetadataStandard(doc, coordinateMap.formTitle);
  return doc.save();
}

module.exports = {
  buildStaffDocument,
  buildCustomerFieldsDocument,
  composeCustomerCanvas,
  finalizeCustomerPreview,
  getRegions,
  drawFields,
};
