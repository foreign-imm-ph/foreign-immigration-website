// AJV-backed structural validation for the two per-form config files. This
// checks SHAPE only (required keys, types, enums) -- it runs in addition to,
// not instead of, field-permissions.js's fail-closed ownership/contradiction
// checks and config-consistency.js's cross-file checks. All three must pass
// before the engine will generate anything for a form.
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

// strictRequired is disabled: the questionnaire schema's conditional
// if/type===repeatable-group/then/required pattern legitimately requires
// properties declared on the parent "question" schema, not on the then
// branch itself, which strictRequired otherwise (over-eagerly) flags.
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });

const coordinateMapSchema = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "schema", "coordinate-map.schema.json"), "utf8"));
const questionnaireSchema = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "schema", "questionnaire.schema.json"), "utf8"));

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
