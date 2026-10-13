// Draws the "PREVIEW ONLY" watermark as vector text on top of the embedded
// customer-preview image. Auto-sizes to fit within `bounds` (the actual
// visible canvas, not the full original page) so it's never clipped.
// Opacity is a per-form config value, not a hardcoded literal -- CDR and
// 2014-13-002 each have their own previously-approved opacity (0.22 and
// 0.12 respectively), preserved exactly through config rather than code.
const { rgb, degrees } = require("pdf-lib");

const WATERMARK_ANGLE_DEG = 28;
const WATERMARK_COLOR_RGB01 = [0.78, 0.1, 0.1]; // rgb(), 0-1 scale -- same triple other callers (e.g. svg-compose.js) convert to their own color syntax

// Auto-sized/positioned placement for the diagonal watermark, computed
// independently of HOW the text is actually drawn (pdf-lib's page.drawText
// below, or an SVG <text>+transform in svg-compose.js) -- extracted so
// both call the exact same fitting/centering math rather than keeping two
// copies in sync by hand.
function computeWatermarkPlacement(text, font, bounds, opacity) {
  const angle = (WATERMARK_ANGLE_DEG * Math.PI) / 180;
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
  return { x, y, size, angleDeg: WATERMARK_ANGLE_DEG, cx, cy, opacity };
}

function addWatermark(page, text, font, bounds, opacity) {
  const { x, y, size } = computeWatermarkPlacement(text, font, bounds, opacity);
  page.drawText(text, {
    x, y, size, font,
    color: rgb(...WATERMARK_COLOR_RGB01),
    opacity,
    rotate: degrees(WATERMARK_ANGLE_DEG),
  });
}

module.exports = { addWatermark, computeWatermarkPlacement, WATERMARK_ANGLE_DEG, WATERMARK_COLOR_RGB01 };
