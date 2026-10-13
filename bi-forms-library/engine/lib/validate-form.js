// Bundles the full fail-closed pre-flight sequence that must pass, in this
// order, before the engine generates anything for a form. Used by both
// `cli.js validate` (checks only) and `cli.js generate` (checks, then
// generates only if every check passes -- generation never runs with an
// unvalidated config, structurally, not by caller discipline).
const { assertCoordinateMapSchema, assertQuestionnaireSchema } = require("./schema-validate");
const { assertFieldPermissions } = require("./field-permissions");
const { assertConfigConsistency } = require("./config-consistency");

function validateForm({ formId, coordinateMap, questionnaire }) {
  assertCoordinateMapSchema(coordinateMap, formId);
  assertQuestionnaireSchema(questionnaire, formId);
  assertFieldPermissions(coordinateMap, formId);
  assertConfigConsistency(coordinateMap, questionnaire, formId);
}

module.exports = { validateForm };
