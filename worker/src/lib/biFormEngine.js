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

import { validateForm } from "../../../bi-forms-library/engine/lib/validate-form.js";
import { fieldsForAudience } from "../../../bi-forms-library/engine/lib/field-permissions.js";
import { resolveFieldValues } from "../../../bi-forms-library/engine/lib/field-bindings.js";
import { validateAnswers } from "../../../bi-forms-library/engine/lib/questionnaire-answers.js";
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

export { fieldsForAudience, resolveFieldValues, validateAnswers };
