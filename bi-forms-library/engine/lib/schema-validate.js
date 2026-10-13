// AJV-backed structural validation for the two per-form config files. This
// checks SHAPE only (required keys, types, enums) -- it runs in addition to,
// not instead of, field-permissions.js's fail-closed ownership/contradiction
// checks and config-consistency.js's cross-file checks. All three must pass
// before the engine will generate anything for a form.
const Ajv = require("ajv");

// Plain `require()` of the schema JSON files, not fs.readFileSync: a
// bundler (wrangler's esbuild, for the Cloudflare Worker -- see Phase 2
// Stage 3) can inline these at build time with no filesystem access
// needed at runtime, exactly like any other require'd module. The Node
// CLI behaves identically either way.
const coordinateMapSchema = require("../schema/coordinate-map.schema.json");
const questionnaireSchema = require("../schema/questionnaire.schema.json");

// strictRequired is disabled: the questionnaire schema's conditional
// if/type===repeatable-group/then/required pattern legitimately requires
// properties declared on the parent "question" schema, not on the then
// branch itself, which strictRequired otherwise (over-eagerly) flags.
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });

const validateCoordinateMapSchema = ajv.compile(coordinateMapSchema);
const validateQuestionnaireSchema = ajv.compile(questionnaireSchema);

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
