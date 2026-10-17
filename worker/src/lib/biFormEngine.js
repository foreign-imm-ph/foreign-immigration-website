// Bridges the Worker to the SAME shared FIS Forms Library engine the
// local CLI and test suite use (bi-forms-library/engine/lib/*) -- not a
// duplicate copy. Only the "pure" engine modules are imported here (no
// filesystem or subprocess dependency): schema/permission/consistency
// validation, questionnaire-answer completeness checking, field-bindings
// resolution, and the pdf-lib-only document assembly in
// render-pipeline.js. The raster/composite step (bi-forms-library/engine/
// lib/raster-pipeline.js) is NOT imported here -- it depends on Poppler, a
// native binary that cannot run inside a Workers isolate, and remains
// local-CLI/test-only until Stage 4 picks a Workers-compatible backend
// (see bi-forms-library/PHASE2_INTEGRATION_PLAN.md).
//
// Configs are statically imported (not read from disk at request time --
// there is no filesystem in a Workers isolate), so this registry must be
// updated by hand whenever a new form is migrated to the engine. All
// three forms currently migrated are registered below.
import coordinateMapCDR from "../../../bi-forms-library/configs/CCS-A-CDR-2016/coordinate-map.json" with { type: "json" };
import questionnaireCDR from "../../../bi-forms-library/configs/CCS-A-CDR-2016/questionnaire.json" with { type: "json" };
import coordinateMap002 from "../../../bi-forms-library/configs/2014-13-002/coordinate-map.json" with { type: "json" };
import questionnaire002 from "../../../bi-forms-library/configs/2014-13-002/questionnaire.json" with { type: "json" };
import coordinateMap006 from "../../../bi-forms-library/configs/2014-13-006/coordinate-map.json" with { type: "json" };
import questionnaire006 from "../../../bi-forms-library/configs/2014-13-006/questionnaire.json" with { type: "json" };
import coordinateMapNTSP from "../../../bi-forms-library/configs/CCS-A-NTSP-2016/coordinate-map.json" with { type: "json" };
import questionnaireNTSP from "../../../bi-forms-library/configs/CCS-A-NTSP-2016/questionnaire.json" with { type: "json" };
import coordinateMapACR from "../../../bi-forms-library/configs/2014-08-015/coordinate-map.json" with { type: "json" };
import questionnaireACR from "../../../bi-forms-library/configs/2014-08-015/questionnaire.json" with { type: "json" };
import coordinateMapTravelPass from "../../../bi-forms-library/configs/2021-03-001/coordinate-map.json" with { type: "json" };
import questionnaireTravelPass from "../../../bi-forms-library/configs/2021-03-001/questionnaire.json" with { type: "json" };
import coordinateMapRecon from "../../../bi-forms-library/configs/2014-01-011/coordinate-map.json" with { type: "json" };
import questionnaireRecon from "../../../bi-forms-library/configs/2014-01-011/questionnaire.json" with { type: "json" };
import coordinateMapADM05 from "../../../bi-forms-library/configs/ADM05.QF.001/coordinate-map.json" with { type: "json" };
import questionnaireADM05 from "../../../bi-forms-library/configs/ADM05.QF.001/questionnaire.json" with { type: "json" };
import coordinateMapARD04 from "../../../bi-forms-library/configs/ARD04.QF.003/coordinate-map.json" with { type: "json" };
import questionnaireARD04 from "../../../bi-forms-library/configs/ARD04.QF.003/questionnaire.json" with { type: "json" };

import { validateForm } from "../../../bi-forms-library/engine/lib/validate-form.js";
import { fieldsForAudience, staffOwnedFields } from "../../../bi-forms-library/engine/lib/field-permissions.js";
import { resolveFieldValues } from "../../../bi-forms-library/engine/lib/field-bindings.js";
import { validateAnswers, getRequiredStaffFields } from "../../../bi-forms-library/engine/lib/questionnaire-answers.js";
// render-pipeline.js is loaded lazily (dynamic import, inside
// getDocumentBuilders() below), not statically here, even though it is
// itself pure/Workers-safe pdf-lib code (verified directly -- see
// bi-forms-library/engine/lib/render-pipeline.js's own header comment and
// Stage 3a's commit). The reason is narrower than that: pdf-lib's package
// has no "exports" map, only legacy main/module fields, and the current
// local test harness (@cloudflare/vitest-plugin 1.4.1 -- a newly renamed,
// young package) fails to resolve it correctly when it is pulled in via a
// static import graph from a plain CommonJS file outside this package.
// Real wrangler/esbuild bundling handles the exact same import chain with
// no error (verified directly with `esbuild --bundle --platform=node`
// against this exact file). Lazy-loading it keeps every route that
// doesn't need document generation (listing, drafts, validation,
// lifecycle transitions) fully testable today, and isolates the one
// genuinely open question (a Workers-compatible raster backend, Stage 4)
// to the single code path that actually needs it.
export async function getDocumentBuilders() {
  return import("../../../bi-forms-library/engine/lib/render-pipeline.js");
}

const REGISTRY = {
  "CCS-A-CDR-2016": { coordinateMap: coordinateMapCDR, questionnaire: questionnaireCDR },
  "2014-13-002": { coordinateMap: coordinateMap002, questionnaire: questionnaire002 },
  "2014-13-006": { coordinateMap: coordinateMap006, questionnaire: questionnaire006 },
  "CCS-A-NTSP-2016": { coordinateMap: coordinateMapNTSP, questionnaire: questionnaireNTSP },
  "2014-08-015": { coordinateMap: coordinateMapACR, questionnaire: questionnaireACR },
  "2021-03-001": { coordinateMap: coordinateMapTravelPass, questionnaire: questionnaireTravelPass },
  "2014-01-011": { coordinateMap: coordinateMapRecon, questionnaire: questionnaireRecon },
  "ADM05.QF.001": { coordinateMap: coordinateMapADM05, questionnaire: questionnaireADM05 },
  "ARD04.QF.003": { coordinateMap: coordinateMapARD04, questionnaire: questionnaireARD04 },
};

// Fail-closed at module load, not per-request: if any registered form's
// config is broken, every request touching BI forms fails immediately
// and loudly (a 500, logged server-side) rather than generating against
// a form nobody has actually verified is still valid.
for (const [biFormId, { coordinateMap, questionnaire }] of Object.entries(REGISTRY)) {
  validateForm({ formId: biFormId, coordinateMap, questionnaire });
}

export const KNOWN_BI_FORM_IDS = Object.keys(REGISTRY);

export function getFormConfig(biFormId) {
  const entry = REGISTRY[biFormId];
  if (!entry) throw new Error(`Unknown BI form id: ${JSON.stringify(biFormId)}`);
  return entry;
}

// The approved object-key convention for the private fis-bi-forms-library
// R2 bucket (binding BI_FORMS_LIBRARY, see wrangler.toml), per
// bi-forms-library/inventory/forms-library-inventory.json: every
// inventoried form's original is at "originals/<formId>.pdf" -- all 20
// inventoried PDFs, not just the 3 currently engine-registered. Centralized
// here (not hand-typed at each call site) so a future form with a
// different key only needs an entry in this one map, not a code change at
// every caller.
//
// Deliberately NOT gated on KNOWN_BI_FORM_IDS/REGISTRY membership: a
// blank-form preview (buildWatermarkedFormPreview, below) is a separate
// capability from fillable-document generation, and directive section 8.2
// is explicit that "preview availability and generation readiness should
// be tracked separately" -- a form's original key is needed, and valid,
// whether or not that form has been through coordinate-mapping yet. Callers
// that DO require the full engine mapping (e.g. staffBiForms.js's
// approveBiForm) already call getFormConfig() first, which independently
// throws for anything not in REGISTRY -- removing the redundant check here
// does not weaken that gate.
const ORIGINAL_KEY_OVERRIDES = {};
export function originalTemplateKey(biFormId) {
  return ORIGINAL_KEY_OVERRIDES[biFormId] || `originals/${biFormId}.pdf`;
}

// Directive section 8.2's "preview availability, tracked separately from
// generation readiness": every PDF in the 20-document Forms Library that
// (a) is an actual fillable application form a prospective customer would
// benefit from seeing blank before starting a questionnaire, and (b) is
// NOT reproduction-restricted. Sourced directly from
// docs/BI_FORMS_LIBRARY_RECONCILIATION.md's own verified classification
// table (Section B) -- not re-derived or guessed here. Excludes:
// `2015-08-006` (reproduction prohibited on the form itself -- directive
// section 3's explicit instruction to preserve this restriction), the two
// actual government-issued certificate outputs (`ARD04.QF.001`,
// `ARD04.QF.002` -- never templates FIS fills in), and the Travel Pass
// checklist (`BIFORM2021-03-002` -- reference material, not a fillable
// form). A form appearing here has NO implication about whether it is
// engine-mapped (see REGISTRY/KNOWN_BI_FORM_IDS above) -- those are two
// independent questions, exactly as the directive requires.
export const PREVIEWABLE_FORM_IDS = [
  "CCS-A-CDR-2016",
  "2014-13-002",
  "2014-13-006",
  "2014-01-011",
  "2014-08-015",
  "2021-03-001",
  "ADM05.QF.001",
  "ARD04.QF.003",
  "BOC04.QF.001",
  "BOC04.QF.002",
  "CCS-A-NTSP-2016",
  "CCS-C-CPA-2016",
  "CGAF-002-Rev3",
  "CGAF-003-Rev 2",
  "IRD04.QF.004",
  "IRD04.QF.008",
];

// Stage 5.3's pre-rendered blank-region background PNG, generated offline
// via bi-forms-library/engine/scripts/generate-blank-backgrounds.js (see
// that script and svg-compose.js for why it must be pre-rendered rather
// than produced at request time). Same bucket, sibling prefix to
// originalTemplateKey() above -- not yet confirmed populated in the real
// bucket (see wrangler.toml's BI_FORMS_LIBRARY comment).
const BACKGROUND_KEY_OVERRIDES = {};
export function backgroundTemplateKey(biFormId) {
  if (!KNOWN_BI_FORM_IDS.includes(biFormId)) throw new Error(`Unknown BI form id: ${JSON.stringify(biFormId)}`);
  return BACKGROUND_KEY_OVERRIDES[biFormId] || `backgrounds/${biFormId}.png`;
}

// Official PDF preview (directive: "Preview Official BI Form", visible
// before the customer starts the questionnaire) -- the ORIGINAL blank
// template, watermarked "PREVIEW ONLY", never the customer's filled-in
// answers (that is composeAndFinalizeCustomerPreview's job, a completely
// separate pipeline). Reuses the existing watermark.js helper (already
// used by the filled-preview pipeline) at a fixed, modest opacity suited
// to a blank form -- deliberately NOT the per-form opacity tuned for the
// filled-preview pipeline, since that value was approved for a different
// visual context. Lazy-imported for the same pdf-lib/CJS bundling reason
// as getDocumentBuilders() above.
const BLANK_FORM_PREVIEW_WATERMARK_OPACITY = 0.15;
// No longer takes a coordinateMap: per directive section 8.2, a blank
// preview must be generatable for ANY previewable form (see
// PREVIEWABLE_FORM_IDS above), including the 16 that have no engine
// mapping at all and therefore no coordinate-map.json. Each page's own
// bounds are read directly from the loaded PDF via pdf-lib's
// getWidth()/getHeight() -- which is also strictly more correct than the
// single pageWidthPt/pageHeightPt pair the 3 mapped forms' configs
// recorded, since it watermarks EVERY page at ITS OWN actual size rather
// than assuming every page of a multi-page original shares page 1's
// dimensions.
export async function buildWatermarkedFormPreview(originalBytes) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const { addWatermark } = await import("../../../bi-forms-library/engine/lib/watermark.js");
  const doc = await PDFDocument.load(originalBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const page of doc.getPages()) {
    const bounds = { xLeft: 0, yBottom: 0, width: page.getWidth(), height: page.getHeight() };
    addWatermark(page, "PREVIEW ONLY", font, bounds, BLANK_FORM_PREVIEW_WATERMARK_OPACITY);
  }
  return doc.save();
}

export { fieldsForAudience, resolveFieldValues, validateAnswers, staffOwnedFields, getRequiredStaffFields };
