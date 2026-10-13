// Draws the "PREVIEW ONLY" watermark as vector text on top of the embedded
// customer-preview image. Auto-sizes to fit within `bounds` (the actual
// visible canvas, not the full original page) so it's never clipped.
// Opacity is a per-form config value, not a hardcoded literal -- CDR and
// 2014-13-002 each have their own previously-approved opacity (0.22 and
// 0.12 respectively), preserved exactly through config rather than code.
const { rgb, degrees } = require("pdf-lib");

function addWatermark(page, text, font, bounds, opacity) {
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
    opacity,
    rotate: degrees(28),
  });
}

module.exports = { addWatermark };
