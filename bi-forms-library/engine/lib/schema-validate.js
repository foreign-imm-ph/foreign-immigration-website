// AJV-backed structural validation for the two per-form config files. This
// checks SHAPE only (required keys, types, enums) -- it runs in addition to,
// not instead of, field-permissions.js's fail-closed ownership/contradiction
// checks and config-consistency.js's cross-file checks. All three must pass
// before the engine will generate anything for a form.
//
// The validators are PRECOMPILED (schema/compiled-validators.js, generated
// by scripts/compile-schemas.js), not built here via ajv.compile() at
// runtime. That is a deliberate, confirmed-necessary choice, not a style
// preference: ajv.compile() generates a validator by running JS source
// through `new Function(...)`, and the real Cloudflare Workers runtime
// (workerd) refuses that outright -- "Uncaught EvalError: Code generation
// from strings disallowed for this context", confirmed directly against
// the actual workerd binary via `wrangler dev --local` (Phase 2 Stage 5.3).
// Since this module's top-level compile step used to run unconditionally
// at Worker startup (biFormEngine.js's module-load-time validateForm()
// loop), the Worker could never have started in production with the old
// ajv.compile() call -- invisible in @cloudflare/vitest-plugin's test
// harness, which does not enforce workerd's eval restriction the same
// way. The precompiled functions below contain no `new Function`/`eval`
// at all (verified directly), so this problem cannot recur regardless of
// which runtime loads this module.
const { validateCoordinateMapSchema, validateQuestionnaireSchema } = require("../schema/compiled-validators.js");

function formatErrors(errors) {
  return (errors || []).map((e) => `${e.instancePath || "(root)"} ${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`);
}

function assertCoordinateMapSchema(coordinateMap, formIdForError) {
  const valid = validateCoordinateMapSchema(coordinateMap);
  if (!valid) {
    throw new Error(
      `coordinate-map.json schema validation failed for form "${formIdForError}" -- generation refused.\n` +
      formatErrors(validateCoordinateMapSchema.errors).map((e) => `  - ${e}`).join("\n")
    );
  }
}

function assertQuestionnaireSchema(questionnaire, formIdForError) {
  const valid = validateQuestionnaireSchema(questionnaire);
  if (!valid) {
    throw new Error(
      `questionnaire.json schema validation failed for form "${formIdForError}" -- generation refused.\n` +
      formatErrors(validateQuestionnaireSchema.errors).map((e) => `  - ${e}`).join("\n")
    );
  }
}

module.exports = { assertCoordinateMapSchema, assertQuestionnaireSchema };
