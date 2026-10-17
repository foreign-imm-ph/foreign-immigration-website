// Local rasterization backend: shells out to `pdftoppm` (poppler-utils),
// exactly as all three original prototypes did by hand. The only
// implementation used in Phase 1.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

async function rasterize(pdfBytes, dpi) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fis-raster-"));
  const pdfPath = path.join(tmpDir, "in.pdf");
  const outPrefix = path.join(tmpDir, "out");
  try {
    fs.writeFileSync(pdfPath, pdfBytes);
    execFileSync("pdftoppm", ["-r", String(dpi), "-png", pdfPath, outPrefix]);
    const pngPath = `${outPrefix}-1.png`;
    if (!fs.existsSync(pngPath)) {
      throw new Error(`pdftoppm did not produce the expected output at ${pngPath}`);
    }
    return fs.readFileSync(pngPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Every form mapped before BOC04.QF.001 was a single PDF page, so
// rasterize()'s page-1-only assumption was always correct. A genuinely
// multi-page form's customerVisibleRegions can reference fields/regions on
// more than one real PDF page, so the customer-preview compositor
// (raster-pipeline.js's composeCustomerCanvas) needs every page's raster,
// not just the first -- this is that, returning one PNG Buffer per real
// PDF page in page order. `rasterize()` itself is left untouched so every
// existing single-page-only caller/behavior is unaffected.
async function rasterizeAllPages(pdfBytes, dpi) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fis-raster-"));
  const pdfPath = path.join(tmpDir, "in.pdf");
  const outPrefix = path.join(tmpDir, "out");
  try {
    fs.writeFileSync(pdfPath, pdfBytes);
    execFileSync("pdftoppm", ["-r", String(dpi), "-png", pdfPath, outPrefix]);
    const pages = [];
    for (let i = 1; ; i++) {
      const pngPath = `${outPrefix}-${i}.png`;
      if (!fs.existsSync(pngPath)) break;
      pages.push(fs.readFileSync(pngPath));
    }
    if (pages.length === 0) {
      throw new Error(`pdftoppm did not produce any output with prefix ${outPrefix}`);
    }
    return pages;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { rasterize, rasterizeAllPages };
