// Validation utilities used by both the CLI's `validate` command and the
// automated regression suite. These generalize the manual scripts used
// during the 2026 security audit into reusable, always-run checks rather
// than something performed by hand only when someone remembers to ask.
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");
const { PDFDocument } = require("pdf-lib");

const PYTHON_BIN = "python3.13"; // system interpreter with Pillow pre-installed; the default `python3` on this image is 3.11 and lacks it
const CHECK_INK_SCRIPT = path.join(__dirname, "raster", "check_ink.py");

async function assertMetadata(pdfBytes, expectedTitle) {
  const doc = await PDFDocument.load(pdfBytes);
  const author = doc.getAuthor();
  const creator = doc.getCreator();
  const title = doc.getTitle();
  const errors = [];
  if (author !== "Foreign Immigration Services") errors.push(`Author is ${JSON.stringify(author)}, expected "Foreign Immigration Services"`);
  if (creator !== "FIS Forms Library") errors.push(`Creator is ${JSON.stringify(creator)}, expected "FIS Forms Library"`);
  if (title !== expectedTitle) errors.push(`Title is ${JSON.stringify(title)}, expected ${JSON.stringify(expectedTitle)}`);
  return { ok: errors.length === 0, errors };
}

// Decompresses every content stream in a PDF and searches for forbidden
// strings (staff-only data values that must never appear in a customer
// artifact). Also counts image XObjects, annotations, and embedded files,
// since an unexpected increase in any of those is itself a signal
// something leaked in beyond what was intended.
function auditContentStreams(pdfBytes, forbiddenStrings) {
  const data = Buffer.from(pdfBytes);
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  const leaks = [];
  let match;
  while ((match = streamRe.exec(data.toString("latin1"))) !== null) {
    const raw = Buffer.from(match[1], "latin1");
    let decompressed;
    try {
      decompressed = zlib.inflateSync(raw);
    } catch {
      continue;
    }
    const text = decompressed.toString("latin1");
    for (const needle of forbiddenStrings) {
      if (text.includes(needle)) leaks.push(needle);
    }
  }
  const str = data.toString("latin1");
  const imageCount = (str.match(/\/Subtype\s*\/Image/g) || []).length;
  const annotCount = (str.match(/\/Annots/g) || []).length;
  const embeddedFileCount = (str.match(/\/EmbeddedFile\b/g) || []).length;
  return {
    ok: leaks.length === 0 && annotCount === 0 && embeddedFileCount === 0,
    leaks: [...new Set(leaks)],
    imageCount,
    annotCount,
    embeddedFileCount,
  };
}

// Attempts the actual audit manipulation: restores MediaBox/CropBox/etc. to
// the full original page size and renders the result, then confirms
// nothing beyond the embedded canvas image is visible (i.e. the expanded
// area is blank). This is the literal "expand the page boundary and look"
// test from the 2026 security audit, run automatically.
async function auditBoundaryExpansion(customerPreviewBytes, fullPageWidthPt, fullPageHeightPt) {
  const doc = await PDFDocument.load(customerPreviewBytes);
  const page = doc.getPages()[0];
  const originalHeight = page.getHeight();
  page.setMediaBox(0, 0, fullPageWidthPt, fullPageHeightPt);
  page.setCropBox(0, 0, fullPageWidthPt, fullPageHeightPt);
  page.setBleedBox(0, 0, fullPageWidthPt, fullPageHeightPt);
  page.setTrimBox(0, 0, fullPageWidthPt, fullPageHeightPt);
  page.setArtBox(0, 0, fullPageWidthPt, fullPageHeightPt);
  const expandedBytes = await doc.save();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fis-audit-"));
  try {
    const pdfPath = path.join(tmpDir, "expanded.pdf");
    fs.writeFileSync(pdfPath, expandedBytes);
    execFileSync("pdftoppm", ["-r", "150", "-png", pdfPath, path.join(tmpDir, "expanded")]);
    const pngPath = path.join(tmpDir, "expanded-1.png");
    const checkScript = path.join(__dirname, "raster", "check_blank_margin.py");
    const outJson = path.join(tmpDir, "margin.json");
    // The original canvas now sits at the bottom of the expanded page
    // (pdf-lib places images at the coordinates given at draw time, which
    // were relative to the small page -- expanding MediaBox only adds
    // space above/around it). Check that the area above the original
    // canvas height is entirely blank (white).
    execFileSync(PYTHON_BIN, [checkScript, pngPath, String(150 / 72), String(originalHeight), outJson]);
    const result = JSON.parse(fs.readFileSync(outJson, "utf8"));
    return result;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function checkFieldInk(renderedPngPath, coordinateMap, resolved, dpi) {
  const scale = dpi / 72.0;
  const boxes = [];
  for (const [key, field] of Object.entries(coordinateMap.charBoxFields)) {
    const expectInk = key in resolved.values && String(resolved.values[key] ?? "").trim() !== "";
    boxes.push({ key, xLeftPt: field.colsPt[0], xRightPt: field.colsPt[field.colsPt.length - 1], yBottomPt: field.yBottomPt, yTopPt: field.yTopPt, pageHeightPt: coordinateMap.pageHeightPt, expectInk });
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fis-ink-"));
  try {
    const boxesPath = path.join(tmpDir, "boxes.json");
    const outPath = path.join(tmpDir, "out.json");
    fs.writeFileSync(boxesPath, JSON.stringify(boxes));
    execFileSync(PYTHON_BIN, [CHECK_INK_SCRIPT, renderedPngPath, String(scale), boxesPath, outPath]);
    const results = JSON.parse(fs.readFileSync(outPath, "utf8"));
    const mismatches = results.filter((r) => r.hasInk !== r.expectInk);
    return { ok: mismatches.length === 0, results, mismatches };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { assertMetadata, auditContentStreams, auditBoundaryExpansion, checkFieldInk };
