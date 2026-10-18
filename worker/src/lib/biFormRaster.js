// The Workers-compatible customer-preview raster/compose backend
// approved in Phase 2 Stage 4 (bi-forms-library/STAGE4_RENDERING_COMPARISON.md,
// Option B) and wired in during Stage 5.3: `@resvg/resvg-wasm` compositing
// the customer's resolved field values, the watermark, and (for a multi-
// region form) the staff-section divider caption onto a pre-rendered
// blank-region background PNG, in a single render pass. See
// bi-forms-library/engine/lib/svg-compose.js for the actual SVG-building/
// resvg-driving logic (shared, pure, Workers-safe) -- this file is only
// the seam that supplies it with what only the Worker (or only a plain
// Node script) can provide: the WASM binary/font bytes bundled into this
// specific runtime, and the pre-rendered background read from R2.
//
// routes/staffBiForms.js never needs to know any of this -- it only
// calls composeAndFinalizeCustomerPreview(), unchanged from Stage 3's
// original seam.
//
// Verified against the REAL Cloudflare Workers runtime, not merely local
// Node or this suite's Miniflare test harness (see test/biFormRaster.test.js's
// header comment for why the harness itself can't exercise the full path,
// and why that's a tooling gap, not an unverified claim): booted via
// `wrangler dev --local` against the actual workerd binary and exercised
// over a real local HTTP request for both a single-region form
// (CCS-A-CDR-2016) and a multi-region form (2014-13-006), each producing
// a valid, correctly-sized PDF. That same real-runtime check is also what
// caught two genuine Workers-incompatibilities invisible to both plain
// Node and this test harness: ajv.compile()'s runtime `new Function(...)`
// (workerd refuses code generation from strings outright -- fixed by
// precompiling the two config schemas, see schema-validate.js) and a bare
// "Buffer" reference in svg-compose.js (a Node global, not part of the
// Workers runtime -- fixed with a btoa()-based encoder). Both would have
// silently broken the live Worker; neither was visible without actually
// running inside workerd.
import resvgWasmModule from "@resvg/resvg-wasm/index_bg.wasm";
import fontRegular from "../../../bi-forms-library/engine/assets/fonts/LiberationSans-Regular.ttf";
import fontBold from "../../../bi-forms-library/engine/assets/fonts/LiberationSans-Bold.ttf";
import fontItalic from "../../../bi-forms-library/engine/assets/fonts/LiberationSans-Italic.ttf";
import { backgroundTemplateKey } from "./biFormEngine.js";
import { HttpError } from "./storage.js";

const fontBuffers = [fontRegular, fontBold, fontItalic].map((buf) => new Uint8Array(buf));

// svg-compose.js is loaded lazily, the same way getDocumentBuilders()
// lazily loads render-pipeline.js (biFormEngine.js's own comment explains
// why: pdf-lib's dual CJS/ESM shape trips up the local test harness's
// static-import resolution, even though real wrangler/esbuild bundling
// handles it fine). svg-compose.js pulls in pdf-lib transitively, so the
// same constraint applies.
async function getComposer() {
  return import("../../../bi-forms-library/engine/lib/svg-compose.js");
}

// Directive section 6's live preview, DURING questionnaire completion --
// a separate, much cheaper call than composeAndFinalizeCustomerPreview
// below (which this file already uses at approval time): skips the
// pdf-lib wrap step entirely (buildComposedSvg + renderComposedPng
// directly) since the caller wants a displayable image, not a document,
// and returns null rather than throwing when no background exists yet for
// this form -- a live preview is a convenience on top of an already-
// working wizard, not something that should ever block or break
// questionnaire completion itself. `data` is the customer's current,
// possibly incomplete draft answers; nothing here validates completeness
// (validateAnswers is for submission, not this).
export async function renderDraftPreviewImage(env, biFormId, coordinateMap, questionnaire, data, activeQuestion) {
  const backgroundKey = backgroundTemplateKey(biFormId);
  const backgroundObject = await env.BI_FORMS_LIBRARY.get(backgroundKey);
  if (!backgroundObject) return null;
  const backgroundPngBytes = new Uint8Array(await backgroundObject.arrayBuffer());

  const { buildComposedSvg, renderComposedPng, highlightRectForQuestion } = await getComposer();
  const { svg, widthPx, heightPx } = await buildComposedSvg(coordinateMap, questionnaire, data, backgroundPngBytes);
  const pngBytes = await renderComposedPng(svg, widthPx, heightPx, resvgWasmModule, fontBuffers);
  const highlight = activeQuestion ? highlightRectForQuestion(coordinateMap, activeQuestion) : null;
  return { pngBytes, widthPx, heightPx, highlight };
}

export async function composeAndFinalizeCustomerPreview(env, biFormId, coordinateMap, questionnaire, data) {
  const backgroundKey = backgroundTemplateKey(biFormId);
  const backgroundObject = await env.BI_FORMS_LIBRARY.get(backgroundKey);
  if (!backgroundObject) {
    throw new HttpError(
      501,
      `Pre-rendered background for "${biFormId}" was not found at ${backgroundKey} in the fis-bi-forms-library bucket (BI_FORMS_LIBRARY binding). Generate it locally with bi-forms-library/engine/scripts/generate-blank-backgrounds.js and upload it to that key before this form's customer preview can be generated. The full staff PDF has already been generated and stored.`
    );
  }
  const backgroundPngBytes = new Uint8Array(await backgroundObject.arrayBuffer());

  const { composeAndFinalizeCustomerPreviewWasm } = await getComposer();
  const { bytes } = await composeAndFinalizeCustomerPreviewWasm({
    coordinateMap,
    questionnaire,
    data,
    backgroundPngBytes,
    resvgWasmInput: resvgWasmModule,
    fontBuffers,
  });
  return bytes;
}
