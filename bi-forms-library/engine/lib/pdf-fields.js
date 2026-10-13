// Shared PDF field-drawing primitives, extracted verbatim from the three
// prototypes (CCS-A-CDR-2016, 2014-13-002, 2014-13-006), which had
// byte-for-byte identical implementations of these functions. No behavior
// change from what was already approved and committed.
const { rgb } = require("pdf-lib");

function fitCharFontSize(font, chars, boxW, boxH, maxSize = 13) {
  const hPad = 2.2; // pt padding each side
  const vPad = 2.0;
  let size = maxSize;
  while (size > 4) {
    const widest = Math.max(...chars.map((c) => font.widthOfTextAtSize(c, size)));
    if (widest <= boxW - 2 * hPad && size <= boxH - 2 * vPad) break;
    size -= 0.25;
  }
  return size;
}

// Centers a single character inside [x1,x2] x [yBottom,yTop] (PDF point
// space). Vertical centering uses Helvetica's cap-height ratio (~0.718 of
// font size), appropriate since every value is rendered upper case.
function drawCharInBox(page, font, char, x1, x2, yBottom, yTop, size) {
  if (!char || char === " ") return;
  const w = font.widthOfTextAtSize(char, size);
  const capHeight = size * 0.718;
  const x = x1 + (x2 - x1 - w) / 2;
  const y = yBottom + (yTop - yBottom - capHeight) / 2;
  page.drawText(char, { x, y, size, font, color: rgb(0, 0, 0) });
}

// Populates one character-box field. Pushes a structured entry to
// overflowReport (never silently truncates) if the value is longer than
// the field provides room for.
function populateCharField(page, font, coordinateMap, fieldKey, value, overflowReport) {
  const f = coordinateMap.charBoxFields[fieldKey];
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
  const size = chars.length
    ? fitCharFontSize(font, chars, f.colsPt[1] - f.colsPt[0], f.yTopPt - f.yBottomPt)
    : 13;
  chars.forEach((ch, i) => {
    drawCharInBox(page, font, ch, f.colsPt[i], f.colsPt[i + 1], f.yBottomPt, f.yTopPt, size);
  });
}

function drawCheckbox(page, font, coordinateMap, fieldKey) {
  const f = coordinateMap.checkboxFields[fieldKey];
  if (!f) throw new Error(`Unknown checkbox field: ${fieldKey}`);
  const size = fitCharFontSize(font, ["X"], f.xRightPt - f.xLeftPt, f.yTopPt - f.yBottomPt, 12);
  drawCharInBox(page, font, "X", f.xLeftPt, f.xRightPt, f.yBottomPt, f.yTopPt, size);
}

// Free-text single-line field, shrinking to a 6pt floor before flagging
// overflow (never silently clips without flagging).
function drawFreeText(page, font, coordinateMap, fieldKey, text, overflowReport) {
  const f = coordinateMap.freeTextFields[fieldKey];
  if (!f) throw new Error(`Unknown free-text field: ${fieldKey}`);
  const available = f.xEndPt - f.xStartPt - 6;
  let size = 11;
  let w = font.widthOfTextAtSize(text, size);
  while (w > available && size > 6) {
    size -= 0.25;
    w = font.widthOfTextAtSize(text, size);
  }
  if (w > available) {
    overflowReport.push({
      field: f.label,
      issue: `Text "${text}" does not fit even at the minimum 6pt floor (needs ${w.toFixed(1)}pt, line provides ${available.toFixed(1)}pt).`,
    });
  }
  page.drawText(text, { x: f.xStartPt + 3, y: f.baselinePt, size, font, color: rgb(0, 0, 0) });
}

// Word-wraps across two freeTextFields entries (e.g. "purposeLine1" /
// "purposeLine2") if the text doesn't fit on the first line.
function drawWrappedFreeText(page, font, coordinateMap, line1Key, line2Key, text, overflowReport) {
  const f1 = coordinateMap.freeTextFields[line1Key];
  const available1 = f1.xEndPt - f1.xStartPt - 6;
  const size = 11;
  const fullWidth = font.widthOfTextAtSize(text, size);
  if (fullWidth <= available1) {
    drawFreeText(page, font, coordinateMap, line1Key, text, overflowReport);
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
  const f2 = coordinateMap.freeTextFields[line2Key];
  const available2 = f2.xEndPt - f2.xStartPt - 6;
  if (font.widthOfTextAtSize(line2, size) > available2) {
    overflowReport.push({
      field: f2.label || line2Key,
      issue: `Continuation "${line2}" still exceeds the second line. Needs shortening.`,
    });
  }
  page.drawText(line2, { x: f2.xStartPt + 3, y: f2.baselinePt, size, font, color: rgb(0, 0, 0) });
}

module.exports = {
  fitCharFontSize,
  drawCharInBox,
  populateCharField,
  drawCheckbox,
  drawFreeText,
  drawWrappedFreeText,
};
