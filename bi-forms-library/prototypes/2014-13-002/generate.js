// Isolated prototype -- scratchpad only. Does not touch the FIS repository,
// website, database, or any Cloudflare resource.
//
// Populates BI FORM 2014-13-002 ("Request for BI Clearance Certificate")
// using a form-specific coordinate map (coordinate-map.json) derived
// independently from this PDF's own measured box-grid pixel positions --
// not copied from the CCS-A-CDR-2016 prototype. Customer-visible boundary
// is fixed per explicit instruction: ends immediately after Passport Number.
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

const DIR = __dirname;
const map = JSON.parse(fs.readFileSync(path.join(DIR, "coordinate-map.json"), "utf8"));
const data = JSON.parse(fs.readFileSync(path.join(DIR, "sample-data.json"), "utf8"));

const overflowReport = [];

function fitCharFontSize(font, chars, boxW, boxH, maxSize = 13) {
  const hPad = 2.2;
  const vPad = 2.0;
  let size = maxSize;
  while (size > 4) {
    const widest = Math.max(...chars.map((c) => font.widthOfTextAtSize(c, size)));
    if (widest <= boxW - 2 * hPad && size <= boxH - 2 * vPad) break;
    size -= 0.25;
  }
  return size;
}

function drawCharInBox(page, font, char, x1, x2, yBottom, yTop, size) {
  if (!char || char === " ") return;
  const w = font.widthOfTextAtSize(char, size);
  const capHeight = size * 0.718;
  const x = x1 + (x2 - x1 - w) / 2;
  const y = yBottom + (yTop - yBottom - capHeight) / 2;
  page.drawText(char, { x, y, size, font, color: rgb(0, 0, 0) });
}

function populateCharField(page, font, fieldKey, value) {
  const f = map.charBoxFields[fieldKey];
  if (!f) throw new Error(`Unknown char-box field: ${fieldKey}`);
  const v = String(value ?? "").toUpperCase();
  const nBoxes = f.colsPt.length - 1;
  if (v.length > nBoxes) {
    overflowReport.push({
      field: f.label,
      issue: `Value "${value}" is ${v.length} characters but the form provides only ${nBoxes} boxes. Truncated to fit -- flag for staff review.`,
    });
  }
  const chars = v.slice(0, nBoxes).split("");
  const size = fitCharFontSize(font, chars.length ? chars : ["A"], f.colsPt[1] - f.colsPt[0], f.yTopPt - f.yBottomPt);
  chars.forEach((ch, i) => {
    drawCharInBox(page, font, ch, f.colsPt[i], f.colsPt[i + 1], f.yBottomPt, f.yTopPt, size);
  });
  return size;
}

function drawCheckbox(page, font, fieldKey) {
  const f = map.checkboxFields[fieldKey];
  const size = fitCharFontSize(font, ["X"], f.xRightPt - f.xLeftPt, f.yTopPt - f.yBottomPt, 12);
  drawCharInBox(page, font, "X", f.xLeftPt, f.xRightPt, f.yBottomPt, f.yTopPt, size);
}

// Splits `text` across purposeLine1 + purposeLine2 if it doesn't fit on one line.
function drawPurpose(page, font, text) {
  const f1 = map.freeTextFields.purposeLine1;
  const available1 = f1.xEndPt - f1.xStartPt - 6;
  const size = 11;
  const fullWidth = font.widthOfTextAtSize(text, size);
  if (fullWidth <= available1) {
    page.drawText(text, { x: f1.xStartPt + 3, y: f1.baselinePt, size, font, color: rgb(0, 0, 0) });
    return;
  }
  const words = text.split(" ");
  let line1 = "";
  let i = 0;
  while (i < words.length) {
    const candidate = line1 ? `${line1} ${words[i]}` : words[i];
    if (font.widthOfTextAtSize(candidate, size) > available1) break;
    line1 = candidate;
    i++;
  }
  const line2 = words.slice(i).join(" ");
  page.drawText(line1, { x: f1.xStartPt + 3, y: f1.baselinePt, size, font, color: rgb(0, 0, 0) });
  const f2 = map.freeTextFields.purposeLine2;
  const available2 = f2.xEndPt - f2.xStartPt - 6;
  if (font.widthOfTextAtSize(line2, size) > available2) {
    overflowReport.push({
      field: "Purpose (line 2, continuation)",
      issue: `Continuation "${line2}" still exceeds the second line. Needs shortening.`,
    });
  }
  page.drawText(line2, { x: f2.xStartPt + 3, y: f2.baselinePt, size, font, color: rgb(0, 0, 0) });
}

function populateApplicantFields(page, font) {
  for (const key of [
    "lastName", "firstName", "middleName", "otherName1", "otherName2",
    "placeOfBirth", "citizenship", "address1", "barangay", "provinceZip", "passportNumber",
  ]) {
    populateCharField(page, font, key, data[key]);
  }
  populateCharField(page, font, "dobDay", data.dobDay);
  populateCharField(page, font, "dobMonth", data.dobMonth);
  populateCharField(page, font, "dobYear", data.dobYear);
  drawCheckbox(page, font, data.gender === "M" ? "genderM" : "genderF");
}

function populateFisFields(page, font) {
  populateCharField(page, font, "landline", data.landline);
  populateCharField(page, font, "mobile", data.mobile);
  drawPurpose(page, font, data.purpose);
}

function addWatermark(page, text, bounds) {
  const font = page.doc.watermarkFont;
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
    opacity: 0.12,
    rotate: degrees(28),
  });
}

async function main() {
  const originalBytes = fs.readFileSync(path.join(DIR, "original.pdf"));

  // ---------- STAFF PREVIEW: full original page, all applicant + FIS
  // fields, BI-only sections left completely untouched. ----------
  const staffDoc = await PDFDocument.load(originalBytes);
  const staffFont = await staffDoc.embedFont(StandardFonts.Helvetica);
  const staffPage = staffDoc.getPages()[0];
  populateApplicantFields(staffPage, staffFont);
  populateFisFields(staffPage, staffFont);
  const staffSmallFont = await staffDoc.embedFont(StandardFonts.HelveticaOblique);
  staffPage.drawText("PROTOTYPE - FICTIONAL DATA - NOT FOR FILING", {
    x: 36, y: 16, size: 7, font: staffSmallFont, color: rgb(0.55, 0.55, 0.55),
  });
  fs.writeFileSync(path.join(DIR, "staff-preview.pdf"), await staffDoc.save());

  // ---------- CUSTOMER PREVIEW: a FRESH copy of the blank template with
  // ONLY applicant-owned fields drawn -- FIS-only fields (landline, mobile,
  // purpose) are never written to this document at all, not merely cropped
  // out. Cropped immediately after Passport Number per explicit instruction.
  const customerDoc = await PDFDocument.load(originalBytes);
  const customerFont = await customerDoc.embedFont(StandardFonts.Helvetica);
  const customerPage = customerDoc.getPages()[0];
  populateApplicantFields(customerPage, customerFont);
  const wmFont = await customerDoc.embedFont(StandardFonts.HelveticaBold);
  customerDoc.watermarkFont = wmFont;
  const cb = map.customerPreviewCropBox;
  const cropWidth = cb.xRightPt - cb.xLeftPt;
  const cropHeight = cb.yTopPt - cb.yBottomPt;
  addWatermark(customerPage, "PREVIEW ONLY | FOR BI APPLICATION PREPARATION THROUGH FIS", {
    xLeft: cb.xLeftPt, yBottom: cb.yBottomPt, width: cropWidth, height: cropHeight,
  });
  customerPage.setCropBox(cb.xLeftPt, cb.yBottomPt, cropWidth, cropHeight);
  customerPage.setMediaBox(cb.xLeftPt, cb.yBottomPt, cropWidth, cropHeight);
  fs.writeFileSync(path.join(DIR, "customer-preview.pdf"), await customerDoc.save());

  fs.writeFileSync(path.join(DIR, "overflow-report.json"), JSON.stringify(overflowReport, null, 2));
  console.log("Generated staff-preview.pdf and customer-preview.pdf");
  console.log("Overflow issues:", overflowReport.length);
  if (overflowReport.length) console.log(JSON.stringify(overflowReport, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
