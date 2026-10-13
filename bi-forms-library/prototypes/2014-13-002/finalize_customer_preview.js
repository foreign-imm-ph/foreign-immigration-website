// Secure reconstruction (2026 audit retrofit): embeds the cropped
// single-region canvas into a brand-new PDF document (PDFDocument.create(),
// never derived from original.pdf), draws the PREVIEW ONLY watermark as
// vector text on top using the exact same sizing/centering logic and
// opacity (0.12) as the previously approved version, and applies the
// adopted metadata-minimization standard.
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

const DIR = __dirname;
const map = JSON.parse(fs.readFileSync(path.join(DIR, "coordinate-map.json"), "utf8"));
const dims = JSON.parse(fs.readFileSync(path.join(DIR, "canvas-dims.json"), "utf8"));

function addWatermark(page, text, font, bounds) {
  const angle = (28 * Math.PI) / 180;
  let size = 20;
  while (size > 8) {
    const w = font.widthOfTextAtSize(text, size);
    const footprintW = w * Math.cos(angle) + size * Math.sin(angle);
    const footprintH = w * Math.sin(angle) + size * Math.cos(angle);
    if (footprintW <= bounds.width * 0.92 && footprintH <= bounds.height * 0.92) break;
    size -= 0.5;
  }
  const textWidth = font.widthOfTextAtSize(text, size);
  const cx = bounds.xLeft + bounds.width / 2;
  const cy = bounds.yBottom + bounds.height / 2;
  const x = cx - (textWidth / 2) * Math.cos(angle);
  const y = cy - (textWidth / 2) * Math.sin(angle);
  page.drawText(text, {
    x, y, size, font,
    color: rgb(0.78, 0.1, 0.1),
    opacity: 0.12, // unchanged from the previously approved 2014-13-002 customer preview
    rotate: degrees(28),
  });
}

async function main() {
  const pngBytes = fs.readFileSync(path.join(DIR, "customer-canvas.png"));
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(pngBytes);
  const page = doc.addPage([dims.widthPt, dims.heightPt]);
  page.drawImage(png, { x: 0, y: 0, width: dims.widthPt, height: dims.heightPt });

  const wmFont = await doc.embedFont(StandardFonts.HelveticaBold);
  addWatermark(page, "PREVIEW ONLY | FOR BI APPLICATION PREPARATION THROUGH FIS", wmFont, {
    xLeft: 0, yBottom: 0, width: dims.widthPt, height: dims.heightPt,
  });

  doc.setAuthor("Foreign Immigration Services");
  doc.setCreator("FIS Forms Library");
  doc.setTitle(map.formTitle);

  fs.writeFileSync(path.join(DIR, "customer-preview.pdf"), await doc.save());
  console.log("Generated customer-preview.pdf:", dims.widthPt, "x", dims.heightPt, "pt");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
