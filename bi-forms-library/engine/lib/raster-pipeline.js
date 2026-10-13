// The raster half of the secure-reconstruction pipeline: rasterizes the
// customer-fields document, crops/composites the approved region(s), and
// embeds the result into a brand-new PDFDocument with the watermark drawn
// on top. This is deliberately a SEPARATE file from render-pipeline.js
// (Phase 2 Stage 3): it depends on "fs", "os", "path", "child_process",
// and the local Poppler raster backend (./raster), none of which exist in
// a Cloudflare Workers isolate. Only the local Node CLI and the engine's
// own test suite import this file -- the Worker never does, and never
// will until a Workers-compatible raster backend replaces ./raster (see
// bi-forms-library/PHASE2_INTEGRATION_PLAN.md Stage 4; not decided yet).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const { applyMetadataStandard } = require("./metadata");
const { addWatermark } = require("./watermark");
const { getRegions } = require("./render-pipeline");
const raster = require("./raster");

const PYTHON_BIN = "python3.13"; // system interpreter with Pillow pre-installed; the default `python3` on this image is 3.11 and lacks it
const COMPOSE_SCRIPT = path.join(__dirname, "raster", "compose_canvas.py");

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
  composeCustomerCanvas,
  finalizeCustomerPreview,
};
