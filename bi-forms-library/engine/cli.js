#!/usr/bin/env node
// Single shared entry point for every form in the FIS BI Forms Library
// engine. `generate` never runs against an unvalidated config -- the full
// fail-closed check sequence (schema, field-permissions, cross-file
// consistency) always runs first, and generation is refused if any of it
// fails.
//
// Usage:
//   node cli.js validate <formId>          validate one form's config
//   node cli.js validate --all             validate every configured form
//   node cli.js generate <formId> --original <path to original.pdf>
//                        [--data <path to a data JSON file>]
//                        [--audience staff|customer|both]   (default: both)
//                        [--out <output directory>]          (default: a new temp dir)
//                        [--dpi <n>]                          (default: 300)
const fs = require("fs");
const path = require("path");
const os = require("os");

const { loadFormConfig, listFormIds } = require("./lib/config-loader");
const { validateForm } = require("./lib/validate-form");
const { fieldsForAudience } = require("./lib/field-permissions");
const { resolveFieldValues } = require("./lib/field-bindings");
const {
  buildStaffDocument,
  buildCustomerFieldsDocument,
  composeCustomerCanvas,
  finalizeCustomerPreview,
} = require("./lib/render-pipeline");
const { assertMetadata, auditContentStreams, auditBoundaryExpansion } = require("./lib/validate");

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function runValidateOne(formId) {
  const { coordinateMap, questionnaire } = loadFormConfig(formId);
  validateForm({ formId, coordinateMap, questionnaire });
  console.log(`${formId}: PASSED (schema, field-permissions, cross-file consistency)`);
}

function cmdValidate(flags, positional) {
  const targets = flags.all ? listFormIds() : positional;
  if (targets.length === 0) {
    throw new Error("validate: specify a formId, or pass --all to validate every configured form.");
  }
  let failed = 0;
  for (const formId of targets) {
    try {
      runValidateOne(formId);
    } catch (e) {
      failed++;
      console.error(`${formId}: FAILED`);
      console.error(e.message);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} of ${targets.length} form(s) failed validation.`);
    process.exitCode = 1;
  }
}

async function cmdGenerate(flags, positional) {
  const formId = positional[0];
  if (!formId) throw new Error("generate: a formId is required, e.g. `node cli.js generate CCS-A-CDR-2016 --original /path/to/original.pdf`");
  if (!flags.original) throw new Error("generate: --original <path to the original BI PDF> is required. Original templates are confidential and are never committed to this repository, so the engine never assumes a default location for one.");

  const { coordinateMap, questionnaire, sampleData } = loadFormConfig(formId);
  validateForm({ formId, coordinateMap, questionnaire });

  const originalPath = flags.original;
  if (!fs.existsSync(originalPath)) throw new Error(`generate: --original path does not exist: ${originalPath}`);
  const originalBytes = fs.readFileSync(originalPath);

  let data;
  if (flags.data) {
    data = JSON.parse(fs.readFileSync(flags.data, "utf8"));
  } else if (sampleData) {
    data = sampleData;
  } else {
    throw new Error(`generate: no --data path given and no sample-data.json found for "${formId}".`);
  }

  const audience = flags.audience || "both";
  if (!["staff", "customer", "both"].includes(audience)) {
    throw new Error(`generate: --audience must be "staff", "customer", or "both" (got ${JSON.stringify(audience)}).`);
  }
  const dpi = flags.dpi ? Number(flags.dpi) : 300;

  const outDir = flags.out || fs.mkdtempSync(path.join(os.tmpdir(), `fis-${formId}-`));
  fs.mkdirSync(outDir, { recursive: true });

  const bindings = questionnaire.fieldBindings || {};
  const report = { formId, audience, outDir, staff: null, customer: null };

  if (audience === "staff" || audience === "both") {
    const staff = await buildStaffDocument(originalBytes, coordinateMap, bindings, data);
    const outPath = path.join(outDir, `${formId}-staff.pdf`);
    fs.writeFileSync(outPath, staff.bytes);
    report.staff = { path: outPath, overflowReport: staff.overflowReport };
    console.log(`staff document: ${outPath} (${staff.overflowReport.length} overflow issue(s))`);
  }

  if (audience === "customer" || audience === "both") {
    if (!coordinateMap.watermark) {
      throw new Error(`generate: coordinate-map.json for "${formId}" has no "watermark" property (text + opacity) -- refusing to guess a watermark for a customer-facing artifact.`);
    }
    const custFields = await buildCustomerFieldsDocument(originalBytes, coordinateMap, bindings, data);
    const { canvasPng, dims } = await composeCustomerCanvas(custFields.bytes, coordinateMap, dpi);
    const previewBytes = await finalizeCustomerPreview(canvasPng, dims, coordinateMap, coordinateMap.watermark.text, coordinateMap.watermark.opacity);
    const outPath = path.join(outDir, `${formId}-customer-preview.pdf`);
    fs.writeFileSync(outPath, previewBytes);

    // Standard post-generation self-check: the core non-recoverability
    // invariant always runs, every time a customer artifact is produced --
    // not only when someone remembers to run the full regression suite.
    const resolved = resolveFieldValues(bindings, data);
    const staffOnlyFields = fieldsForAudience(coordinateMap, "staff");
    const customerFields = fieldsForAudience(coordinateMap, "customer");
    const forbidden = [];
    for (const coll of ["charBoxFields", "checkboxFields", "freeTextFields"]) {
      for (const key of Object.keys(staffOnlyFields[coll])) {
        if (customerFields[coll][key]) continue; // also customer-visible, not a leak candidate
        const v = resolved.values[key];
        if (typeof v === "string" && v.trim() !== "") forbidden.push(v);
      }
    }
    const metaCheck = await assertMetadata(previewBytes, coordinateMap.formTitle);
    const streamAudit = auditContentStreams(previewBytes, forbidden);
    const boundaryAudit = await auditBoundaryExpansion(previewBytes, coordinateMap.pageWidthPt, coordinateMap.pageHeightPt);

    report.customer = { path: outPath, metaCheck, streamAudit, boundaryAudit, overflowReport: custFields.overflowReport };
    console.log(`customer preview: ${outPath} (${custFields.overflowReport.length} overflow issue(s))`);
    console.log(`  metadata check: ${metaCheck.ok ? "PASSED" : "FAILED " + JSON.stringify(metaCheck.errors)}`);
    console.log(`  content-stream audit: ${streamAudit.ok ? "PASSED" : "FAILED"} (leaks=${streamAudit.leaks.length}, images=${streamAudit.imageCount}, annots=${streamAudit.annotCount}, embeddedFiles=${streamAudit.embeddedFileCount})`);
    console.log(`  boundary-expansion non-recoverability audit: ${boundaryAudit.blank ? "PASSED (blank)" : "FAILED (non-blank pixels found)"}`);

    if (!metaCheck.ok || !streamAudit.ok || !boundaryAudit.blank) {
      fs.writeFileSync(path.join(outDir, `${formId}-generation-report.json`), JSON.stringify(report, null, 2));
      throw new Error(`generate: customer preview for "${formId}" failed a security self-check -- refusing to leave it in place as a trusted artifact. See ${outDir}/${formId}-generation-report.json`);
    }
  }

  fs.writeFileSync(path.join(outDir, `${formId}-generation-report.json`), JSON.stringify(report, null, 2));
  console.log(`report: ${path.join(outDir, `${formId}-generation-report.json`)}`);
}

async function main() {
  const [, , command, ...rest] = process.argv;
  const { flags, positional } = parseFlags(rest);
  try {
    if (command === "validate") {
      cmdValidate(flags, positional);
    } else if (command === "generate") {
      await cmdGenerate(flags, positional);
    } else {
      console.error("Usage: node cli.js <validate|generate> ...");
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}

main();
