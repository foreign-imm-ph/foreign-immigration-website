// Pluggable raster-backend interface. The rendering pipeline calls only
// this function -- it never shells out to a specific tool directly -- so
// the backend can be swapped (e.g. for a future Cloudflare Browser
// Rendering backend) without touching render-pipeline.js.
//
// IMPORTANT: the local Chromium proof of concept (see
// bi-forms-library/BROWSER_RENDERING_POC_REPORT.md) showed the *technique*
// of HTML+CSS -> screenshot works, but that does NOT establish that
// Cloudflare's hosted Browser Rendering (a different Chromium build,
// running inside Cloudflare's own sandboxed infrastructure, with its own
// font/rendering environment) produces pixel-identical output. A
// `browser-rendering-backend.js` would need to pass the same golden-
// reference regression tests as this backend before replacing it anywhere.
// No such backend is implemented in Phase 1.
const poppler = require("./poppler-backend");

const BACKENDS = {
  poppler,
};

const ACTIVE_BACKEND = "poppler"; // only implemented backend in Phase 1

/**
 * Renders a PDF (as bytes) to a PNG (as bytes) at the given DPI.
 * @param {Buffer} pdfBytes
 * @param {number} dpi
 * @returns {Promise<Buffer>} PNG bytes
 */
async function rasterize(pdfBytes, dpi) {
  const backend = BACKENDS[ACTIVE_BACKEND];
  return backend.rasterize(pdfBytes, dpi);
}

module.exports = { rasterize, BACKENDS, ACTIVE_BACKEND };
