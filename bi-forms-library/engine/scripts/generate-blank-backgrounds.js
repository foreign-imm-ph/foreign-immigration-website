#!/usr/bin/env node
// Generates the pre-rendered blank-region background PNG each form's
// Workers-compatible customer-preview compositor (../lib/svg-compose.js)
// composites the customer's actual field values on top of, replacing the
// per-request Poppler rasterization raster-pipeline.js's composeCustomerCanvas
// does today -- see svg-compose.js's header comment for why a per-request
// raster step has no Workers-compatible equivalent, and why the background
// must instead be pre-rendered exactly once, offline, like this.
//
// Deliberately LOCAL-ONLY and NOT run automatically: this script uses the
// existing, already-proven Poppler-based raster pipeline (raster-pipeline.js),
// which depends on a native binary and a filesystem -- the same reasons
// that pipeline cannot run inside a Worker are exactly why this generation
// step must happen here, ahead of time, rather than at request time.
//
// This script does NOT upload anything to Cloudflare. Phase 2 Stage 5's
// authorization boundary (see bi-forms-library/PHASE2_INTEGRATION_PLAN.md
// and the Stage 5 approval message) explicitly excludes modifying live
// Cloudflare resources without separate approval -- generating these PNGs
// locally is prepared and explained, not applied. Upload them to the
// existing private fis-bi-forms-library R2 bucket (BI_FORMS_LIBRARY
// binding) at backgrounds/<formId>.png, e.g.:
//   wrangler r2 object put fis-bi-forms-library/backgrounds/CCS-A-CDR-2016.png --file=<output>/CCS-A-CDR-2016.png
// only once that's explicitly authorized.
//
// Usage: FIS_BI_ORIGINALS_DIR=/path/to/originals node generate-blank-backgrounds.js [outDir]
// (originals are confidential and never committed -- same convention tests/run-all.js uses)
const fs = require("fs");
const path = require("path");

const { loadFormConfig, listFormIds } = require("../lib/config-loader");
const { getCanvasDims } = require("../lib/render-pipeline");
const { composeCustomerCanvas } = require("../lib/raster-pipeline");

const DPI = 300; // must match svg-compose.js's DPI constant exactly

async function main() {
  const originalsDir = process.env.FIS_BI_ORIGINALS_DIR;
  if (!originalsDir) {
    console.error("FIS_BI_ORIGINALS_DIR must be set to a local directory containing <formId>.pdf for each form.");
    process.exit(1);
  }
  const outDir = process.argv[2] || path.join(__dirname, "..", "..", "generated-backgrounds");
  fs.mkdirSync(outDir, { recursive: true });

  for (const formId of listFormIds()) {
    const originalPath = path.join(originalsDir, `${formId}.pdf`);
    if (!fs.existsSync(originalPath)) {
      console.warn(`Skipping ${formId}: no original at ${originalPath}`);
      continue;
    }
    const { coordinateMap } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);

    // The untouched original.pdf bytes, not run through pdf-lib/
    // buildCustomerFieldsDocument at all -- the literal blank original
    // form artwork, no field values of any kind (not even an unmarked
    // gender checkbox -- resolveFieldValues() fails closed on a
    // checkboxSelect with no selection, by design, so a true "draw
    // nothing" pass isn't expressible as data anyway). This is exactly
    // the static background every real submission's values get
    // composited onto at request time.
    const { canvasPng, dims: rasterDims } = await composeCustomerCanvas(originalBytes, coordinateMap, DPI);

    const pureDims = getCanvasDims(coordinateMap);
    if (Math.abs(pureDims.heightPt - rasterDims.heightPt) > 0.5 || pureDims.widthPt !== rasterDims.widthPt) {
      throw new Error(
        `${formId}: getCanvasDims() (pure, used by svg-compose.js) disagrees with composeCustomerCanvas()'s own Poppler-derived dims -- ${JSON.stringify(pureDims)} vs ${JSON.stringify(rasterDims)}. Refusing to generate a background the Workers path would size inconsistently.`
      );
    }

    const outPath = path.join(outDir, `${formId}.png`);
    fs.writeFileSync(outPath, canvasPng);
    console.log(`${formId}: wrote ${outPath} (${rasterDims.widthPt}x${rasterDims.heightPt.toFixed(2)}pt, ${dims_px(rasterDims)}px @ ${DPI}dpi)`);
  }

  function dims_px(d) {
    const scale = DPI / 72;
    return `${Math.round(d.widthPt * scale)}x${Math.round(d.heightPt * scale)}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
