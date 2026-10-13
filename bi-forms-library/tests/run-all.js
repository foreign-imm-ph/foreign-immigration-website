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
const {
  buildStaffDocument,
  buildCustomerFieldsDocument,
  composeCustomerCanvas,
  finalizeCustomerPreview,
  getRegions,
} = require(path.join(ENGINE_DIR, "lib", "render-pipeline"));
const { assertMetadata, auditContentStreams, auditBoundaryExpansion, checkFieldInk } = require(path.join(ENGINE_DIR, "lib", "validate"));
const raster = require(path.join(ENGINE_DIR, "lib", "raster"));
const { execFileSync } = require("child_process");

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

for (const formId of FORM_IDS) {
  test(`${formId}: config passes schema + field-permissions + cross-file consistency`, () => {
    const { coordinateMap, questionnaire } = loadFormConfig(formId);
    assert.doesNotThrow(() => validateForm({ formId, coordinateMap, questionnaire }));
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

// ---------------------------------------------------------------------
// Tier 2: PDF-level tests -- need each form's real original.pdf.
// ---------------------------------------------------------------------

for (const formId of FORM_IDS) {
  const originalPath = originalPathFor(formId);
  const skip = !originalPath;
  const skipReason = `FIS_BI_ORIGINALS_DIR not set or missing ${formId}.pdf -- original BI templates are confidential and are not committed to this repository`;

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

  test(`${formId}: targeted per-field ink check -- every customer-visible field with a value is actually drawn, every staff-only field is absent from the customer-fields document`, { skip: skip && skipReason }, async () => {
    const { coordinateMap, questionnaire, sampleData } = loadFormConfig(formId);
    const originalBytes = fs.readFileSync(originalPath);
    const bindings = questionnaire.fieldBindings || {};
    const resolved = resolveFieldValues(bindings, sampleData);

    const custFields = await buildCustomerFieldsDocument(originalBytes, coordinateMap, bindings, sampleData);
    const dpi = 300;
    const png = await raster.rasterize(custFields.bytes, dpi);
    const tmpPng = path.join(require("os").tmpdir(), `fis-inktest-${formId}-${Date.now()}.png`);
    fs.writeFileSync(tmpPng, png);
    try {
      const customerFieldSet = fieldsForAudience(coordinateMap, "customer");
      const expectCustomerVisible = {};
      for (const key of Object.keys(customerFieldSet.charBoxFields)) expectCustomerVisible[key] = true;
      // Only check char-box fields here -- checkFieldInk's box geometry is
      // keyed to charBoxFields; checkbox/free-text leakage is already
      // covered by the content-stream audit above.
      const subsetMap = { ...coordinateMap, charBoxFields: Object.fromEntries(Object.keys(coordinateMap.charBoxFields).map((k) => [k, coordinateMap.charBoxFields[k]])) };
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
