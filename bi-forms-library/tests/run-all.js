// FIS BI Forms Library engine regression suite, built on Node's built-in
// test runner (node:test), per approved architecture decision #1.
//
// Two tiers:
//   - Config-level tests (schema, field-permissions, cross-file
//     consistency, fieldBindings resolution against fixtures) need no
//     original BI PDF and always run.
//   - PDF-level tests (actual generation, targeted ink/position checks,
//     metadata/content-stream/boundary-expansion audits) need each form's
//     real original.pdf. Original BI templates are confidential and are
//     never committed to this repository, so these tests look for them
//     via the FIS_BI_ORIGINALS_DIR environment variable (a local directory
//     containing <formId>.pdf for each form) and are SKIPPED, not failed,
//     when it isn't set -- so the config-level tests still protect any
//     clone of this repo, while the full suite runs wherever the
//     originals are available locally.
//
// Run: node --test run-all.js   (or `npm test` from engine/)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ENGINE_DIR = path.join(__dirname, "..", "engine");
const FIXTURES_DIR = path.join(__dirname, "fixtures");

const { loadFormConfig, listFormIds } = require(path.join(ENGINE_DIR, "lib", "config-loader"));
const { validateForm } = require(path.join(ENGINE_DIR, "lib", "validate-form"));
const { fieldsForAudience } = require(path.join(ENGINE_DIR, "lib", "field-permissions"));
const { resolveFieldValues } = require(path.join(ENGINE_DIR, "lib", "field-bindings"));
const { validateAnswers, getRequiredStaffFields } = require(path.join(ENGINE_DIR, "lib", "questionnaire-answers"));
const { staffOwnedFields } = require(path.join(ENGINE_DIR, "lib", "field-permissions"));
const {
  buildStaffDocument,
  buildCustomerFieldsDocument,
  getRegions,
} = require(path.join(ENGINE_DIR, "lib", "render-pipeline"));
const { composeCustomerCanvas, finalizeCustomerPreview } = require(path.join(ENGINE_DIR, "lib", "raster-pipeline"));
const { getCanvasDims } = require(path.join(ENGINE_DIR, "lib", "render-pipeline"));
const { composeAndFinalizeCustomerPreviewWasm, highlightRectForField, highlightRectForQuestion, buildComposedSvg, SCALE: COMPOSE_SCALE } = require(path.join(ENGINE_DIR, "lib", "svg-compose"));
const { assertMetadata, auditContentStreams, auditBoundaryExpansion, checkFieldInk } = require(path.join(ENGINE_DIR, "lib", "validate"));
const raster = require(path.join(ENGINE_DIR, "lib", "raster"));
const { execFileSync } = require("child_process");

const FONTS_DIR = path.join(ENGINE_DIR, "assets", "fonts");
const RESVG_WASM_PATH = path.join(ENGINE_DIR, "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm");
function loadResvgFontBuffers() {
  return ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf", "LiberationSans-Italic.ttf"].map((f) =>
    fs.readFileSync(path.join(FONTS_DIR, f))
  );
}

const GOLDEN_DIR = path.join(__dirname, "golden");
const COMPARE_SCRIPT = path.join(ENGINE_DIR, "lib", "raster", "compare_png.py");
const GOLDEN_DPI = 150;

const FORM_IDS = listFormIds();
const ORIGINALS_DIR = process.env.FIS_BI_ORIGINALS_DIR;

function originalPathFor(formId) {
  if (!ORIGINALS_DIR) return null;
  const p = path.join(ORIGINALS_DIR, `${formId}.pdf`);
  return fs.existsSync(p) ? p : null;
}

function loadFixture(formId, name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, formId, name), "utf8"));
}

// ---------------------------------------------------------------------
// Tier 1: config-level tests -- always run, no original PDF required.
// ---------------------------------------------------------------------

test("every form has a non-empty configs/ directory", () => {
  assert.ok(FORM_IDS.length >= 3, `expected at least the 3 migrated forms, found: ${FORM_IDS.join(", ")}`);
});

// Directive section 6 (real-time preview field highlighting): geometry
// correctness, independent of any original PDF or resvg rendering --
// pure coordinate math against the already-committed, non-confidential
// coordinate-map.json/questionnaire.json.
test("highlightRectForField: a customer-visible charBoxField returns a sane, positive-area rect matching its own measured span", () => {
  const { coordinateMap } = loadFormConfig("CCS-A-CDR-2016");
  const rect = highlightRectForField(coordinateMap, "lastName");
  assert.ok(rect, "expected a rect for a known customer-visible field");
  const f = coordinateMap.charBoxFields.lastName;
  const SCALE = COMPOSE_SCALE; // must track svg-compose.js's own SCALE, never a second hardcoded copy
  assert.ok(rect.widthPx > 0 && rect.heightPx > 0, "rect must have positive area");
  assert.ok(Math.abs(rect.widthPx - (f.colsPt[f.colsPt.length - 1] - f.colsPt[0]) * SCALE) < 0.01, "width must match the field's own full comb span");
  assert.ok(Math.abs(rect.heightPx - (f.yTopPt - f.yBottomPt) * SCALE) < 0.01, "height must match the field's own measured row height");
  assert.equal(rect.page, 0);
});

test("highlightRectForField: a staff-only field never returns a rect (never highlighted to a customer)", () => {
  const { coordinateMap } = loadFormConfig("CCS-A-CDR-2016");
  assert.equal(coordinateMap.freeTextFields.documentsToBeCertified.roles.visibleTo.includes("customer"), false, "fixture assumption: this field must actually be staff-only");
  assert.equal(highlightRectForField(coordinateMap, "documentsToBeCertified"), null);
});

test("highlightRectForField: an unknown field key returns null, not a throw", () => {
  const { coordinateMap } = loadFormConfig("CCS-A-CDR-2016");
  assert.equal(highlightRectForField(coordinateMap, "no-such-field"), null);
});

test("highlightRectForQuestion: a single-field question's rect matches highlightRectForField directly", () => {
  const { coordinateMap, questionnaire } = loadFormConfig("CCS-A-CDR-2016");
  const question = questionnaire.questions.find((q) => q.id === "lastName");
  assert.ok(question, "fixture assumption: CCS-A-CDR-2016 has a lastName question");
  const direct = highlightRectForField(coordinateMap, "lastName");
  const viaQuestion = highlightRectForQuestion(coordinateMap, question);
  // Approximate, not exact: the union path re-derives xPx/yPx/widthPx/
  // heightPx via Math.min/Math.max over a single-element array, which can
  // differ from the direct value by float-rounding noise far below any
  // visually meaningful amount (confirmed: ~1e-13px here).
  for (const k of ["xPx", "yPx", "widthPx", "heightPx", "page"]) {
    assert.ok(Math.abs(viaQuestion[k] - direct[k]) < 1e-6, `${k}: expected ~${direct[k]}, got ${viaQuestion[k]}`);
  }
});

test("highlightRectForQuestion: a gender checkboxSelect question's rect is the union of both its checkbox options", () => {
  const { coordinateMap, questionnaire } = loadFormConfig("CCS-A-CDR-2016");
  const question = questionnaire.questions.find((q) => q.dataKey === "gender" || q.id === "gender");
  assert.ok(question, "fixture assumption: CCS-A-CDR-2016 has a gender question");
  const rect = highlightRectForQuestion(coordinateMap, question);
  assert.ok(rect, "expected a unioned rect for the gender question");
  const m = highlightRectForField(coordinateMap, "genderM");
  const fm = highlightRectForField(coordinateMap, "genderF");
  assert.ok(rect.xPx <= Math.min(m.xPx, fm.xPx) + 0.01, "union must start at or before the leftmost option");
  assert.ok(rect.xPx + rect.widthPx >= Math.max(m.xPx + m.widthPx, fm.xPx + fm.widthPx) - 0.01, "union must end at or after the rightmost option");
});

for (const formId of FORM_IDS) {
  test(`${formId}: config passes schema + field-permissions + cross-file consistency`, () => {
    const { coordinateMap, questionnaire } = loadFormConfig(formId);
    assert.doesNotThrow(() => validateForm({ formId, coordinateMap, questionnaire }));
  });

  // Stage 5.4/5.5: the questionnaire schema's six-language `languages`
  // array only declares which locales a form CLAIMS to support --
  // nothing previously checked that every question (and every
  // repeatable-group sub-question) actually carries a translated label
  // for each one. All three forms were, in fact, English-only on every
  // question until this stage, despite declaring full six-language
  // support -- caught while building the Client Portal's questionnaire
  // renderer, which otherwise silently falls back to the English label
  // for a customer who selected a different language.
  test(`${formId}: every question (and repeatable-group sub-question) has a label in all six declared languages`, () => {
    const { questionnaire } = loadFormConfig(formId);
    const missing = [];
    for (const q of questionnaire.questions) {
      for (const lang of questionnaire.languages) {
        if (!q.labels || !q.labels[lang]) missing.push(`${q.id}.${lang}`);
      }
      if (q.type === "repeatable-group") {
        for (const sub of q.subQuestions || []) {
          for (const lang of questionnaire.languages) {
            if (!sub.labels || !sub.labels[lang]) missing.push(`${q.id}.${sub.id}.${lang}`);
          }
        }
      }
    }
    assert.deepEqual(missing, [], `${formId}: missing label(s) for ${missing.join(", ")}`);
  });

  test(`${formId}: fieldsForAudience never returns a bi_staff or customer_wet_ink field for either audience`, () => {
    const { coordinateMap } = loadFormConfig(formId);
    for (const audience of ["staff", "customer"]) {
      const fields = fieldsForAudience(coordinateMap, audience);
      for (const coll of ["charBoxFields", "checkboxFields", "freeTextFields"]) {
        for (const [key, field] of Object.entries(fields[coll])) {
          const supplied = field.roles.suppliedBy;
          assert.ok(
            supplied === "customer" || supplied === "staff",
            `${formId}.${coll}.${key}: fieldsForAudience(${audience}) returned a field with suppliedBy=${supplied}, which must never be drawable`
          );
        }
      }
    }
  });

  test(`${formId}: customer audience never includes a staff-only field`, () => {
    const { coordinateMap } = loadFormConfig(formId);
    const customerFields = fieldsForAudience(coordinateMap, "customer");
    for (const coll of ["charBoxFields", "checkboxFields", "freeTextFields"]) {
      for (const [key, field] of Object.entries(customerFields[coll])) {
        assert.ok(field.roles.visibleTo.includes("customer"), `${formId}.${coll}.${key} appeared in customer fields without visibleTo:customer`);
      }
    }
  });

  test(`${formId}: customerVisibleRegions (or legacy crop box) resolves without error`, () => {
    const { coordinateMap } = loadFormConfig(formId);
    const regions = getRegions(coordinateMap);
    assert.ok(Array.isArray(regions) && regions.length >= 1);
    for (const r of regions) {
      assert.ok(r.yTopPt > r.yBottomPt, `${formId}: region ${r.id || "(legacy)"} has yTopPt <= yBottomPt`);
      assert.ok(r.xRightPt > r.xLeftPt, `${formId}: region ${r.id || "(legacy)"} has xRightPt <= xLeftPt`);
    }
  });
}

// --- 2014-13-006-specific: conditional fields, repeatable groups ---

test("2014-13-006: court/legal NO path forces N/A regardless of any stray data", () => {
  const { coordinateMap, questionnaire } = loadFormConfig("2014-13-006");
  const data = loadFixture("2014-13-006", "baseline-court-no.json");
  const resolved = resolveFieldValues(questionnaire.fieldBindings, data);
  assert.equal(resolved.values.courtName, "N/A");
  assert.equal(resolved.values.courtBranchPlace, "N/A");
  assert.equal(resolved.values.courtContactNumber, "N/A");
});

test("2014-13-006: court/legal YES path uses the supplied values verbatim", () => {
  const { questionnaire } = loadFormConfig("2014-13-006");
  const data = loadFixture("2014-13-006", "court-yes.json");
  const resolved = resolveFieldValues(questionnaire.fieldBindings, data);
  assert.equal(resolved.values.courtName, data.courtName);
  assert.equal(resolved.values.courtBranchPlace, data.courtBranchPlace);
  assert.equal(resolved.values.courtContactNumber, data.courtContactNumber);
});

for (const [fixtureName, expectedCounts] of [["trips-1.json", 1], ["trips-2.json", 2], ["trips-3.json", 3]]) {
  test(`2014-13-006: ${fixtureName} resolves exactly ${expectedCounts} trip entry(ies) and leaves the rest unset`, () => {
    const { questionnaire } = loadFormConfig("2014-13-006");
    const data = loadFixture("2014-13-006", fixtureName);
    const resolved = resolveFieldValues(questionnaire.fieldBindings, data);
    for (let n = 1; n <= 3; n++) {
      if (n <= expectedCounts) {
        assert.ok(`arrivalDay_${n}` in resolved.values, `expected arrivalDay_${n} to be set`);
      } else {
        assert.ok(!(`arrivalDay_${n}` in resolved.values), `expected arrivalDay_${n} to be unset (only ${expectedCounts} trip(s) supplied)`);
      }
    }
  });
}

test("2014-13-006: a 4th trip entry is refused (the PDF has only 3 physical rows)", () => {
  const { questionnaire } = loadFormConfig("2014-13-006");
  const data = loadFixture("2014-13-006", "trips-4-invalid.json");
  assert.throws(() => resolveFieldValues(questionnaire.fieldBindings, data), /only provides 3 rows/);
});

// --- validateAnswers (questionnaire-answers.js): customer-submission
// completeness checks, distinct from schema-validate.js (which only
// checks questionnaire.json's own shape). ---

for (const formId of FORM_IDS) {
  test(`${formId}: validateAnswers accepts the form's own sample-data.json as complete`, () => {
    const { questionnaire, sampleData } = loadFormConfig(formId);
    const result = validateAnswers(questionnaire, sampleData);
    assert.ok(result.ok, `expected sample-data.json to be a complete, valid submission: ${JSON.stringify(result.errors)}`);
  });

  test(`${formId}: validateAnswers rejects a submission missing a required field`, () => {
    const { questionnaire, sampleData } = loadFormConfig(formId);
    // Picks the form's own first required question's dataKey rather than
    // assuming every form has a "lastName" field -- not every form does
    // (e.g. 2014-01-011 is a letter-format document that asks for a single
    // combined "fullName" instead of separate name fields).
    const requiredQuestion = questionnaire.questions.find((q) => q.required !== false && q.dataKey);
    assert.ok(requiredQuestion, "expected this form to have at least one required question to test against");
    const broken = { ...sampleData };
    delete broken[requiredQuestion.dataKey];
    const result = validateAnswers(questionnaire, broken);
    assert.ok(!result.ok, "expected a missing required field to be rejected");
    assert.ok(result.errors.some((e) => e.includes(requiredQuestion.id)));
  });
}

test("2014-13-006: validateAnswers requires courtName only when courtLegalApplies is true", () => {
  const { questionnaire } = loadFormConfig("2014-13-006");
  const courtNo = loadFixture("2014-13-006", "baseline-court-no.json");
  assert.ok(validateAnswers(questionnaire, courtNo).ok, "court=no with courtName='N/A' should be a complete submission");

  const courtYesMissing = { ...courtNo, courtLegalApplies: true, courtName: undefined };
  const result = validateAnswers(questionnaire, courtYesMissing);
  assert.ok(!result.ok);
  assert.ok(result.errors.some((e) => e.includes("courtName")));
});

test("2014-13-006: validateAnswers treats a fully-blank repeatable-group entry as absent, not incomplete", () => {
  const { questionnaire } = loadFormConfig("2014-13-006");
  const oneTrip = loadFixture("2014-13-006", "trips-1.json");
  // trips-1.json supplies exactly one array entry; baseline-court-no.json
  // instead pads the array to 3 entries with every sub-field empty --
  // both must validate as "exactly one trip reported".
  assert.ok(validateAnswers(questionnaire, oneTrip).ok);
  const padded = loadFixture("2014-13-006", "baseline-court-no.json");
  assert.ok(validateAnswers(questionnaire, padded).ok, `padded-blank-rows fixture should validate: ${JSON.stringify(validateAnswers(questionnaire, padded).errors)}`);
});

test("2014-13-006: validateAnswers rejects a repeatable-group entry with only some sub-fields filled in", () => {
  const { questionnaire } = loadFormConfig("2014-13-006");
  const data = loadFixture("2014-13-006", "trips-1.json");
  const partial = { ...data, trips: [{ ...data.trips[0] }, { arrivalDay: "01" }] }; // second entry has a value but is missing the rest
  const result = validateAnswers(questionnaire, partial);
  assert.ok(!result.ok);
  assert.ok(result.errors.some((e) => e.startsWith("trips[1].") && e !== "trips[1].arrivalDay: required"));
});

test("2014-13-006: validateAnswers does not require additionalTravelHistory (required: false)", () => {
  const { questionnaire } = loadFormConfig("2014-13-006");
  const data = loadFixture("2014-13-006", "trips-1.json");
  const withoutExtra = { ...data };
  delete withoutExtra.additionalTravelHistory;
  assert.ok(validateAnswers(questionnaire, withoutExtra).ok);
});

// --- getRequiredStaffFields / isStaffFieldRequired (questionnaire-answers.js):
// the staff-field completeness rules approveBiForm enforces, distinct
// from validateAnswers above (which checks CUSTOMER answers). ---

for (const [formId, optionalKey] of [["CCS-A-CDR-2016", "purposeLine2"], ["2014-13-002", "purposeLine2"]]) {
  test(`${formId}: getRequiredStaffFields excludes ${optionalKey} (required: false)`, () => {
    const { coordinateMap, questionnaire } = loadFormConfig(formId);
    const staffFields = staffOwnedFields(coordinateMap);
    assert.ok(staffFields.some((f) => f.key === optionalKey), `expected ${optionalKey} to be a staff-owned field`);
    const required = getRequiredStaffFields(staffFields, questionnaire, {});
    assert.ok(!required.some((f) => f.key === optionalKey), `expected ${optionalKey} to be excluded from required staff fields`);
  });
}

test("2014-13-006: getRequiredStaffFields requires landline2/mobile2/requestingAgency only when requestingAgencyApplies is true", () => {
  const { coordinateMap, questionnaire } = loadFormConfig("2014-13-006");
  const staffFields = staffOwnedFields(coordinateMap);
  const conditionalKeys = ["landline2", "mobile2", "requestingAgency"];

  const whenNo = getRequiredStaffFields(staffFields, questionnaire, { requestingAgencyApplies: false });
  for (const key of conditionalKeys) {
    assert.ok(!whenNo.some((f) => f.key === key), `expected ${key} to not be required when requestingAgencyApplies is false`);
  }

  const whenYes = getRequiredStaffFields(staffFields, questionnaire, { requestingAgencyApplies: true });
  for (const key of conditionalKeys) {
    assert.ok(whenYes.some((f) => f.key === key), `expected ${key} to be required when requestingAgencyApplies is true`);
  }
});

test("2014-13-006: getRequiredStaffFields requires courtName/courtBranchPlace/courtContactNumber only when courtLegalApplies is true", () => {
  const { coordinateMap, questionnaire } = loadFormConfig("2014-13-006");
  const staffFields = staffOwnedFields(coordinateMap);
  const conditionalKeys = ["courtName", "courtBranchPlace", "courtContactNumber"];

  const whenNo = getRequiredStaffFields(staffFields, questionnaire, { courtLegalApplies: false });
  for (const key of conditionalKeys) {
    assert.ok(!whenNo.some((f) => f.key === key), `expected ${key} to not be required when courtLegalApplies is false`);
  }

  const whenYes = getRequiredStaffFields(staffFields, questionnaire, { courtLegalApplies: true });
  for (const key of conditionalKeys) {
    assert.ok(whenYes.some((f) => f.key === key), `expected ${key} to be required when courtLegalApplies is true`);
  }
});

test("2014-13-006: getRequiredStaffFields always requires landline1/mobile1/signatureLineContactNumber regardless of either gate", () => {
  const { coordinateMap, questionnaire } = loadFormConfig("2014-13-006");
  const staffFields = staffOwnedFields(coordinateMap);
  const unconditionalKeys = ["landline1", "mobile1", "signatureLineContactNumber"];
  const required = getRequiredStaffFields(staffFields, questionnaire, { requestingAgencyApplies: false, courtLegalApplies: false });
  for (const key of unconditionalKeys) {
    assert.ok(required.some((f) => f.key === key), `expected ${key} to always be required`);
  }
});

// ---------------------------------------------------------------------
// Tier 2: PDF-level tests -- need each form's real original.pdf.
// ---------------------------------------------------------------------

for (const formId of FORM_IDS) {
  const originalPath = originalPathFor(formId);
  const skip = !originalPath;
  const skipReason = `FIS_BI_ORIGINALS_DIR not set or missing ${formId}.pdf -- original BI templates are confidential and are not committed to this repository`;
  // Not every mapped form has a customer-visible char-box field --
  // 2014-01-011, for instance, is checkbox-only (civil status). Overflow
  // can only ever apply to a char-box field, so the three overflow tests
  // below skip cleanly for such a form rather than asserting a false
  // universal invariant.
  const hasCustomerCharBoxField = Object.keys(fieldsForAudience(loadFormConfig(formId).coordinateMap, "customer").charBoxFields).length > 0;

  test(`${formId}: baseline fixture generates with zero overflow and passes all security audits`, { skip: skip && skipReason }, async () => {
    const { coordinateMap, questionnaire, sampleData } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);
    const bindings = questionnaire.fieldBindings || {};
    const data = sampleData;

    const staff = await buildStaffDocument(originalBytes, coordinateMap, bindings, data);
    assert.equal(staff.overflowReport.length, 0, `unexpected overflow in staff doc: ${JSON.stringify(staff.overflowReport)}`);

    const custFields = await buildCustomerFieldsDocument(originalBytes, coordinateMap, bindings, data);
    assert.equal(custFields.overflowReport.length, 0, `unexpected overflow in customer-fields doc: ${JSON.stringify(custFields.overflowReport)}`);

    const { canvasPng, dims } = await composeCustomerCanvas(custFields.bytes, coordinateMap, 300);
    const previewBytes = await finalizeCustomerPreview(canvasPng, dims, coordinateMap, coordinateMap.watermark.text, coordinateMap.watermark.opacity);

    const meta = await assertMetadata(previewBytes, coordinateMap.formTitle);
    assert.ok(meta.ok, `metadata check failed: ${JSON.stringify(meta.errors)}`);

    const resolved = resolveFieldValues(bindings, data);
    const staffFields = fieldsForAudience(coordinateMap, "staff");
    const customerFields = fieldsForAudience(coordinateMap, "customer");
    const forbidden = [];
    for (const coll of ["charBoxFields", "checkboxFields", "freeTextFields"]) {
      for (const key of Object.keys(staffFields[coll])) {
        if (customerFields[coll][key]) continue;
        const v = resolved.values[key];
        if (typeof v === "string" && v.trim() !== "") forbidden.push(v);
      }
    }
    const streamAudit = auditContentStreams(previewBytes, forbidden);
    assert.ok(streamAudit.ok, `content-stream audit failed: ${JSON.stringify(streamAudit)}`);

    const boundaryAudit = await auditBoundaryExpansion(previewBytes, coordinateMap.pageWidthPt, coordinateMap.pageHeightPt);
    assert.ok(boundaryAudit.blank, `boundary-expansion audit found non-blank pixels outside the approved region: ${JSON.stringify(boundaryAudit)}`);

    // Region-boundary check: the composed canvas' declared dimensions must
    // agree with the sum of the approved regions' heights (plus dividers),
    // catching a coordinate-map region that silently grew or shrank.
    const regions = getRegions(coordinateMap);
    const expectedHeight = regions.reduce((sum, r) => sum + (r.yTopPt - r.yBottomPt), 0) + (dims.dividerPt || 0) * Math.max(0, regions.length - 1);
    // Tolerance accounts for pixel quantization inherent to the raster
    // crop-and-recompose step (each region edge is truncated to a whole
    // pixel at 300 DPI before being converted back to points) -- this is
    // expected sub-pixel rounding, not a region-boundary regression. The
    // bound used here (2 edges per region, 1px worst case each) is
    // generous enough to never mask an actual wrong-region mistake, which
    // would be off by many points, not a fraction of one.
    const scale = 300 / 72;
    const tolerance = regions.length * 2 * (1 / scale);
    assert.ok(Math.abs(dims.heightPt - expectedHeight) < tolerance, `composed canvas height ${dims.heightPt} does not match expected ${expectedHeight} (tolerance ${tolerance.toFixed(3)}pt)`);
  });

  // "FIS Smart Application System" directive: "Verify that preview
  // validation and final-document validation agree on overflow
  // conditions." Feeds the SAME deliberately-overlong value into both
  // pipelines -- buildStaffDocument (the final-document guard
  // staffBiForms.js's approveBiForm, commit 756296e, blocks on) and
  // buildComposedSvg (the live Client Portal preview, this commit) --
  // and asserts both flag the identical field. A silent disagreement
  // here (one truncates unflagged where the other catches it) would be
  // exactly the kind of drift the directive is guarding against.
  test(`${formId}: live-preview overflow detection agrees with the final-document overflow guard`, { skip: (skip && skipReason) || (!hasCustomerCharBoxField && "no customer-visible char-box field on this form") }, async () => {
    const { coordinateMap, questionnaire, sampleData } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);
    const bindings = questionnaire.fieldBindings || {};

    const customerFields = fieldsForAudience(coordinateMap, "customer");
    const charBoxKeys = Object.keys(customerFields.charBoxFields);
    const targetKey = charBoxKeys[0];
    const nBoxes = coordinateMap.charBoxFields[targetKey].colsPt.length - 1;
    const overlongValue = "X".repeat(nBoxes + 5);
    const data = Object.assign({}, sampleData, { [targetKey]: overlongValue });

    const staffDoc = await buildStaffDocument(originalBytes, coordinateMap, bindings, data);
    const finalFlagsTarget = staffDoc.overflowReport.some((o) => o.issue.includes(`"${overlongValue}"`));
    assert.ok(finalFlagsTarget, `expected the final-document guard to flag the deliberately overlong ${targetKey}: ${JSON.stringify(staffDoc.overflowReport)}`);

    const { canvasPng: backgroundPngBytes } = await composeCustomerCanvas(originalBytes, coordinateMap, 300);
    const { overflowFields } = await buildComposedSvg(coordinateMap, questionnaire, data, backgroundPngBytes);
    const previewFlagsTarget = overflowFields.some((o) => o.key === targetKey && o.length === overlongValue.length && o.maxLength === nBoxes);
    assert.ok(previewFlagsTarget, `expected the live-preview overflow detector to flag the same deliberately overlong ${targetKey}: ${JSON.stringify(overflowFields)}`);
  });

  // Ordinary (non-overflowing) values must never be flagged by either
  // pipeline -- the baseline-fixture test above already proves this for
  // buildStaffDocument; this proves buildComposedSvg agrees too.
  test(`${formId}: live-preview overflow detector reports nothing for the ordinary baseline fixture`, { skip: (skip && skipReason) || (!hasCustomerCharBoxField && "no customer-visible char-box field on this form") }, async () => {
    const { coordinateMap, questionnaire, sampleData } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);
    const { canvasPng: backgroundPngBytes } = await composeCustomerCanvas(originalBytes, coordinateMap, 300);
    const { overflowFields } = await buildComposedSvg(coordinateMap, questionnaire, sampleData, backgroundPngBytes);
    assert.equal(overflowFields.length, 0, `unexpected live-preview overflow on baseline fixture data: ${JSON.stringify(overflowFields)}`);
  });

  test(`${formId}: live-preview overflow clears once the answer is corrected to fit`, { skip: (skip && skipReason) || (!hasCustomerCharBoxField && "no customer-visible char-box field on this form") }, async () => {
    const { coordinateMap, questionnaire, sampleData } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);
    const customerFields = fieldsForAudience(coordinateMap, "customer");
    const targetKey = Object.keys(customerFields.charBoxFields)[0];
    const nBoxes = coordinateMap.charBoxFields[targetKey].colsPt.length - 1;
    const { canvasPng: backgroundPngBytes } = await composeCustomerCanvas(originalBytes, coordinateMap, 300);

    const overlongData = Object.assign({}, sampleData, { [targetKey]: "X".repeat(nBoxes + 5) });
    const overlong = await buildComposedSvg(coordinateMap, questionnaire, overlongData, backgroundPngBytes);
    assert.ok(overlong.overflowFields.some((o) => o.key === targetKey), "expected the overlong value to be flagged first");

    const correctedData = Object.assign({}, sampleData, { [targetKey]: "X".repeat(Math.max(1, nBoxes - 1)) });
    const corrected = await buildComposedSvg(coordinateMap, questionnaire, correctedData, backgroundPngBytes);
    assert.ok(!corrected.overflowFields.some((o) => o.key === targetKey), `expected the corrected, in-bounds value to clear the warning for ${targetKey}: ${JSON.stringify(corrected.overflowFields)}`);
  });

  test(`${formId}: targeted per-field ink check -- every customer-visible field with a value is actually drawn, every staff-only field is absent from the customer-fields document`, { skip: skip && skipReason }, async () => {
    const { coordinateMap, questionnaire, sampleData } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);
    const bindings = questionnaire.fieldBindings || {};
    const resolved = resolveFieldValues(bindings, sampleData);

    const custFields = await buildCustomerFieldsDocument(originalBytes, coordinateMap, bindings, sampleData);
    const dpi = 300;
    // Every form before BOC04.QF.001 is single-page, so rasterizing just
    // page 1 (raster.rasterize) and checking every field against it was
    // always correct. A genuinely multi-page form's own fields can live on
    // different real PDF pages (via each field's optional `page`,
    // default 0) -- raster.rasterizeAllPages() + grouping fields by their
    // own page below is what makes this check meaningful for those too,
    // without changing anything about the single-page case (it still
    // takes exactly one raster.rasterize() call internally, now just
    // emitted by the allPages path at index 0).
    const allPagePngs = await raster.rasterizeAllPages(custFields.bytes, dpi);
    const fieldsByPage = new Map();
    for (const [key, field] of Object.entries(coordinateMap.charBoxFields)) {
      const pageIdx = typeof field.page === "number" ? field.page : 0;
      if (!fieldsByPage.has(pageIdx)) fieldsByPage.set(pageIdx, {});
      fieldsByPage.get(pageIdx)[key] = field;
    }
    const customerFieldSet = fieldsForAudience(coordinateMap, "customer");
    const tmpDir = require("os").tmpdir();
    for (const [pageIdx, pageFields] of fieldsByPage) {
      const tmpPng = path.join(tmpDir, `fis-inktest-${formId}-p${pageIdx}-${Date.now()}.png`);
      fs.writeFileSync(tmpPng, allPagePngs[pageIdx]);
      try {
        // Only check char-box fields here -- checkFieldInk's box geometry
        // is keyed to charBoxFields; checkbox/free-text leakage is already
        // covered by the content-stream audit above.
        const subsetMap = { ...coordinateMap, charBoxFields: pageFields };
        const ink = await checkFieldInk(tmpPng, subsetMap, { values: resolved.values }, dpi);
        for (const r of ink.results) {
          const isCustomerVisible = Boolean(customerFieldSet.charBoxFields[r.key]);
          const hasValue = typeof resolved.values[r.key] === "string" && resolved.values[r.key].trim() !== "";
          if (isCustomerVisible && hasValue) {
            assert.ok(r.hasInk, `expected ink for customer-visible field "${r.key}" (value ${JSON.stringify(resolved.values[r.key])}) but found none -- possible coordinate regression`);
          }
          if (!isCustomerVisible) {
            assert.ok(!r.hasInk || !hasValue, `staff-only field "${r.key}" unexpectedly has ink in the customer-fields document`);
          }
        }
      } finally {
        fs.unlinkSync(tmpPng);
      }
    }
  });

  test(`${formId}: overlong fixture is flagged in overflowReport, not silently truncated`, { skip: skip && skipReason }, async () => {
    const { coordinateMap, questionnaire } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);
    const bindings = questionnaire.fieldBindings || {};
    const overlongPath = path.join(FIXTURES_DIR, formId, formId === "2014-13-006" ? "overlong.json" : "overlong.json");
    if (!fs.existsSync(overlongPath)) return; // no overlong fixture defined for this form
    const data = loadFixture(formId, "overlong.json");
    const staff = await buildStaffDocument(originalBytes, coordinateMap, bindings, data);
    assert.ok(staff.overflowReport.length > 0, `expected the overlong fixture to be flagged in overflowReport for ${formId}, but none were reported`);
  });
}

// --- Stage 5.3: svg-compose.js (the Workers-compatible resvg-wasm
// customer-preview compositor) -- distinct from composeCustomerCanvas/
// finalizeCustomerPreview above (the Poppler/pdf-lib path raster-
// pipeline.js uses, local-CLI/test-only). These tests run the REAL
// resvg-wasm renderer (the same npm package the Worker bundles), not a
// stub, against each form's actual pre-rendered blank-region background
// (generated here via the same composeCustomerCanvas() Poppler path,
// exactly as scripts/generate-blank-backgrounds.js does) and the same
// security audits the Poppler/pdf-lib path's own tests already use. ---
for (const formId of FORM_IDS) {
  const originalPath = originalPathFor(formId);
  const skip = !originalPath;
  const skipReason = `FIS_BI_ORIGINALS_DIR not set or missing ${formId}.pdf`;

  test(`${formId}: getCanvasDims() (pure, Workers-safe) agrees with composeCustomerCanvas()'s own Poppler-derived dims`, { skip: skip && skipReason }, async () => {
    const { coordinateMap } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);
    const { dims: rasterDims } = await composeCustomerCanvas(originalBytes, coordinateMap, 300);
    const pureDims = getCanvasDims(coordinateMap);
    assert.equal(pureDims.widthPt, rasterDims.widthPt);
    // Sub-point tolerance: raster-pipeline.js's compose_canvas.py rounds
    // each region's pixel boundaries to whole pixels at 300dpi before
    // converting back to points, a quantization getCanvasDims()'s pure
    // arithmetic doesn't have -- the same documented tolerance the
    // existing "composed canvas height" test above uses.
    assert.ok(Math.abs(pureDims.heightPt - rasterDims.heightPt) < 0.5, `${pureDims.heightPt} vs ${rasterDims.heightPt}`);
    assert.equal(pureDims.regionCount, rasterDims.regionCount);
    assert.equal(pureDims.dividerPt, rasterDims.dividerPt);
  });

  test(`${formId}: svg-compose.js's resvg-wasm customer preview passes every existing security audit (metadata, content-stream, boundary-expansion)`, { skip: skip && skipReason }, async () => {
    const { coordinateMap, questionnaire, sampleData } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);
    // The blank background a real deployment would read from R2,
    // generated here via the exact same local Poppler pipeline
    // scripts/generate-blank-backgrounds.js uses offline.
    const { canvasPng: backgroundPngBytes } = await composeCustomerCanvas(originalBytes, coordinateMap, 300);

    const { bytes, dims } = await composeAndFinalizeCustomerPreviewWasm({
      coordinateMap,
      questionnaire,
      data: sampleData,
      backgroundPngBytes,
      resvgWasmInput: fs.readFileSync(RESVG_WASM_PATH),
      fontBuffers: loadResvgFontBuffers(),
    });

    const meta = await assertMetadata(bytes, coordinateMap.formTitle);
    assert.ok(meta.ok, `metadata check failed: ${JSON.stringify(meta.errors)}`);

    const staffFields = fieldsForAudience(coordinateMap, "staff");
    const customerFields = fieldsForAudience(coordinateMap, "customer");
    const resolved = resolveFieldValues(questionnaire.fieldBindings || {}, sampleData);
    const forbidden = [];
    for (const coll of ["charBoxFields", "checkboxFields", "freeTextFields"]) {
      for (const key of Object.keys(staffFields[coll])) {
        if (customerFields[coll][key]) continue;
        const v = resolved.values[key];
        if (typeof v === "string" && v.trim() !== "") forbidden.push(v);
      }
    }
    const streamAudit = auditContentStreams(bytes, forbidden);
    assert.ok(streamAudit.ok, `content-stream audit failed: ${JSON.stringify(streamAudit)}`);
    // The resvg path bakes everything (background, field values,
    // watermark, divider caption) into ONE raster image -- stricter than
    // the Poppler/pdf-lib path's own guarantee, since there is no text
    // content stream of any kind to audit in the first place.
    assert.equal(streamAudit.imageCount, 1);

    const boundaryAudit = await auditBoundaryExpansion(bytes, dims.widthPt, dims.heightPt);
    assert.ok(boundaryAudit.blank, `boundary-expansion audit found non-blank pixels outside the approved region: ${JSON.stringify(boundaryAudit)}`);
  });

  test(`${formId}: svg-compose.js draws visible ink for a known customer-visible field at its expected position`, { skip: skip && skipReason }, async () => {
    const { coordinateMap, questionnaire, sampleData } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);
    const { canvasPng: backgroundPngBytes } = await composeCustomerCanvas(originalBytes, coordinateMap, 300);
    const { bytes, dims } = await composeAndFinalizeCustomerPreviewWasm({
      coordinateMap,
      questionnaire,
      data: sampleData,
      backgroundPngBytes,
      resvgWasmInput: fs.readFileSync(RESVG_WASM_PATH),
      fontBuffers: loadResvgFontBuffers(),
    });

    const dpi = 300;
    const png = await raster.rasterize(bytes, dpi);
    const tmpPng = path.join(require("os").tmpdir(), `fis-resvg-inktest-${formId}-${Date.now()}.png`);
    fs.writeFileSync(tmpPng, png);
    try {
      // A known customer-visible field's character box, mapped from
      // original-page PDF space into this form's (possibly region-cropped)
      // canvas space. Different forms name their equivalent field
      // differently ("lastName" does not exist on every form's own
      // coordinate-map.json), so the field used here is picked dynamically
      // -- the first customer-visible charBoxField (in declaration order)
      // with a non-empty sample value that falls on region[0]'s own real
      // PDF page, rather than one hardcoded key. Region[0] always starts
      // at its own page's top edge (see each form's customerVisibleRegions),
      // so the only shift needed is subtracting that region's own
      // yBottomPt (how much was cropped off the BOTTOM of the page before
      // this region's canvas began). checkFieldInk() is written in terms
      // of a coordinateMap + pageHeightPt, so a minimal synthetic map
      // standing in for "canvas space" is enough to reuse it as-is.
      const resolved = resolveFieldValues(questionnaire.fieldBindings || {}, sampleData);
      const customerFields = fieldsForAudience(coordinateMap, "customer");
      const regions = getRegions(coordinateMap);
      const region0Page = typeof regions[0].page === "number" ? regions[0].page : 0;
      const candidateKey = Object.keys(customerFields.charBoxFields).find((key) => {
        const v = resolved.values[key];
        if (typeof v !== "string" || v.trim() === "") return false;
        const field = coordinateMap.charBoxFields[key];
        const fieldPage = typeof field.page === "number" ? field.page : 0;
        return fieldPage === region0Page && field.yBottomPt >= regions[0].yBottomPt - 0.1 && field.yTopPt <= regions[0].yTopPt + 0.1;
      });
      if (!candidateKey) return; // this form's customer-visible content is entirely freeTextFields/checkboxFields (no comb-grid charBoxFields at all) -- checkFieldInk()'s geometry is charBoxFields-only, nothing to check here
      const f = coordinateMap.charBoxFields[candidateKey];
      const firstRegionYBottomPt = regions[0].yBottomPt;
      const canvasMap = {
        charBoxFields: {
          [candidateKey]: { ...f, yTopPt: f.yTopPt - firstRegionYBottomPt, yBottomPt: f.yBottomPt - firstRegionYBottomPt },
        },
        pageHeightPt: dims.heightPt,
      };
      const expectedValue = String(sampleData[candidateKey] ?? resolved.values[candidateKey]).toUpperCase();
      assert.ok(expectedValue.length > 0, `fixture sanity: ${candidateKey} must be non-empty for this check to mean anything`);
      const ink = await checkFieldInk(tmpPng, canvasMap, { values: { [candidateKey]: resolved.values[candidateKey] } }, dpi);
      const result = ink.results.find((r) => r.key === candidateKey);
      assert.ok(result && result.hasInk, `expected ink at the "${candidateKey}" field's position in the resvg-rendered canvas for ${formId}, found none`);
    } finally {
      fs.unlinkSync(tmpPng);
    }
  });
}

// ---------------------------------------------------------------------
// Tier 3: golden-reference parity. Committed PNGs (fictional sample data
// only -- see tests/golden/<formId>/) are the visual record of what each
// form's output looked like when last approved. Generation here is fully
// deterministic (vector text at fixed coordinates, rasterized by the same
// Poppler build), so an exact pixel match is the bar, not a fuzzy
// similarity score -- any regression, however small, shows up as a
// nonzero diff.
// ---------------------------------------------------------------------

for (const formId of FORM_IDS) {
  const originalPath = originalPathFor(formId);
  const skip = !originalPath;
  const skipReason = `FIS_BI_ORIGINALS_DIR not set or missing ${formId}.pdf`;

  for (const audience of ["staff", "customer"]) {
    const goldenPath = path.join(GOLDEN_DIR, formId, audience === "staff" ? "staff.png" : "customer-preview.png");

    test(`${formId}: ${audience} render matches the committed golden reference pixel-for-pixel`, { skip: (skip && skipReason) || (!fs.existsSync(goldenPath) && `no golden reference committed yet at ${goldenPath}`) }, async () => {
      const { coordinateMap, questionnaire, sampleData } = loadFormConfig(formId);
      const originalBytes = fs.readFileSync(originalPath);
      const bindings = questionnaire.fieldBindings || {};
      const data = sampleData;

      let candidateBytes;
      if (audience === "staff") {
        candidateBytes = (await buildStaffDocument(originalBytes, coordinateMap, bindings, data)).bytes;
      } else {
        const custFields = await buildCustomerFieldsDocument(originalBytes, coordinateMap, bindings, data);
        const { canvasPng, dims } = await composeCustomerCanvas(custFields.bytes, coordinateMap, 300);
        candidateBytes = await finalizeCustomerPreview(canvasPng, dims, coordinateMap, coordinateMap.watermark.text, coordinateMap.watermark.opacity);
      }

      const candidatePng = await raster.rasterize(candidateBytes, GOLDEN_DPI);
      const tmpPng = path.join(require("os").tmpdir(), `fis-golden-candidate-${formId}-${audience}-${Date.now()}.png`);
      const tmpJson = path.join(require("os").tmpdir(), `fis-golden-diff-${formId}-${audience}-${Date.now()}.json`);
      fs.writeFileSync(tmpPng, candidatePng);
      try {
        execFileSync("python3.13", [COMPARE_SCRIPT, goldenPath, tmpPng, tmpJson]);
        const result = JSON.parse(fs.readFileSync(tmpJson, "utf8"));
        assert.ok(result.sameSize, `${formId} ${audience}: golden is ${JSON.stringify(result.goldenSize)}, candidate is ${JSON.stringify(result.candidateSize)}`);
        assert.equal(result.diffPixels, 0, `${formId} ${audience}: ${result.diffPixels} of ${result.totalPixels} pixels differ from the golden reference (bbox ${JSON.stringify(result.bbox)}) -- visual regression`);
      } finally {
        fs.unlinkSync(tmpPng);
        if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson);
      }
    });
  }
}

test("2014-13-006: a distinctive staff-only marker string in the Court/Legal YES path never appears in the customer preview", { skip: !originalPathFor("2014-13-006") && "FIS_BI_ORIGINALS_DIR not set or missing 2014-13-006.pdf" }, async () => {
  const formId = "2014-13-006";
  const { coordinateMap, questionnaire } = loadFormConfig(formId);
  const originalBytes = fs.readFileSync(originalPathFor(formId));
  const bindings = questionnaire.fieldBindings || {};
  const data = loadFixture(formId, "court-yes.json");
  assert.ok(data.courtName.includes("LEAKCHECK-MARKER"));

  const custFields = await buildCustomerFieldsDocument(originalBytes, coordinateMap, bindings, data);
  const { canvasPng, dims } = await composeCustomerCanvas(custFields.bytes, coordinateMap, 300);
  const previewBytes = await finalizeCustomerPreview(canvasPng, dims, coordinateMap, coordinateMap.watermark.text, coordinateMap.watermark.opacity);

  const streamAudit = auditContentStreams(previewBytes, [data.courtName, data.courtBranchPlace, data.courtContactNumber]);
  assert.ok(streamAudit.ok, `staff-only court-section marker leaked into the customer preview: ${JSON.stringify(streamAudit)}`);

  const boundaryAudit = await auditBoundaryExpansion(previewBytes, coordinateMap.pageWidthPt, coordinateMap.pageHeightPt);
  assert.ok(boundaryAudit.blank, "expanding the customer preview's page boundary revealed non-blank content");
});
