#!/usr/bin/env node
// Precompiles the two config schemas (coordinate-map.schema.json,
// questionnaire.schema.json) into plain, static JS validator functions
// using ajv's own "standalone validation code" feature
// (https://ajv.js.org/standalone.html), committed to
// schema/compiled-validators.js and required directly by schema-validate.js
// instead of calling `ajv.compile()` at runtime.
//
// Why this exists at all: ajv's normal ajv.compile() builds a validator
// by generating JS source and running it through `new Function(...)` at
// runtime -- which the REAL Cloudflare Workers runtime refuses outright
// ("Uncaught EvalError: Code generation from strings disallowed for this
// context"), confirmed directly against the actual workerd binary via
// `wrangler dev --local` (not merely suspected -- see the Stage 5.3
// completion report for the exact repro). This was a pre-existing,
// Worker-startup-breaking bug introduced in Stage 1-3's AJV wiring,
// invisible in @cloudflare/vitest-plugin's test harness (which does not
// enforce the same eval restriction workerd does) and in plain Node --
// exactly the "harness success doesn't prove production compatibility"
// gap this phase's instructions warned about, just surfacing somewhere
// other than the renderer.
//
// Re-run this script (`node scripts/compile-schemas.js`) and commit the
// regenerated output whenever either schema file changes -- schema-validate.js
// no longer touches the raw .schema.json files or ajv.compile() at all.
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const standaloneCode = require("ajv/dist/standalone").default;

const coordinateMapSchema = require("../schema/coordinate-map.schema.json");
const questionnaireSchema = require("../schema/questionnaire.schema.json");

// Same options schema-validate.js has always used, plus code.source:true,
// which standalone code generation requires.
const ajv = new Ajv({
  allErrors: true,
  strict: true,
  strictRequired: false,
  code: { source: true, esm: false },
});
ajv.addSchema(coordinateMapSchema, "coordinateMapSchema");
ajv.addSchema(questionnaireSchema, "questionnaireSchema");

const moduleCode = standaloneCode(ajv, {
  validateCoordinateMapSchema: "coordinateMapSchema",
  validateQuestionnaireSchema: "questionnaireSchema",
});

const outPath = path.join(__dirname, "..", "schema", "compiled-validators.js");
const header =
  "// GENERATED FILE -- do not hand-edit. Produced by scripts/compile-schemas.js\n" +
  "// from coordinate-map.schema.json and questionnaire.schema.json. Re-run that\n" +
  "// script and commit the result whenever either schema file changes.\n";
fs.writeFileSync(outPath, header + moduleCode + "\n");
console.log(`Wrote ${outPath}`);
