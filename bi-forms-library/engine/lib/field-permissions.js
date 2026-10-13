// Fail-closed field-permission validation. This module runs before any PDF
// is generated for any form, and refuses to proceed (throws, non-zero exit)
// rather than guessing, whenever a field's ownership/visibility metadata is
// missing, malformed, or self-contradictory.
//
// The core rule the rest of the engine depends on: a field with no (or
// invalid) `roles` is never treated as customer-visible by default. Silence
// is a hard failure here, never a fallback.

const VALID_AUDIENCES = ["customer", "staff"];
const VALID_SUPPLIED_BY = ["customer", "staff", "bi_staff", "customer_wet_ink"];
const VALID_APPROVED_BY = ["staff", "n/a"];

// Only fields supplied by the customer or by FIS staff are ever drawn by
// any generation path, for either audience. bi_staff and customer_wet_ink
// fields are never drawn, structurally -- not because the caller remembers
// to skip them, but because no code path here accepts them as a draw
// target. This is what satisfies "BI-only sections and wet-ink signatures
// must remain non-generatable regardless of supplied input."
const DRAWABLE_SUPPLIED_BY = ["customer", "staff"];

function fail(errors, context, fieldKey, message) {
  errors.push(`${context}.${fieldKey}: ${message}`);
}

function validateRoles(roles, context, fieldKey, errors) {
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) {
    fail(errors, context, fieldKey, 'missing "roles" object -- refusing to generate rather than assume a default.');
    return;
  }
  if (!roles.suppliedBy || !VALID_SUPPLIED_BY.includes(roles.suppliedBy)) {
    fail(errors, context, fieldKey, `roles.suppliedBy is missing or not one of [${VALID_SUPPLIED_BY.join(", ")}] (got ${JSON.stringify(roles.suppliedBy)}).`);
  }
  if (!Array.isArray(roles.visibleTo) || roles.visibleTo.length === 0) {
    fail(errors, context, fieldKey, "roles.visibleTo is missing, empty, or not an array -- a field with no declared audience is never treated as customer-visible.");
  } else {
    for (const aud of roles.visibleTo) {
      if (!VALID_AUDIENCES.includes(aud)) {
        fail(errors, context, fieldKey, `roles.visibleTo contains an unknown audience ${JSON.stringify(aud)}.`);
      }
    }
  }
  if (!Array.isArray(roles.editableBy) || roles.editableBy.length === 0) {
    fail(errors, context, fieldKey, "roles.editableBy is missing, empty, or not an array.");
  }
  if (roles.approvedBy === undefined || roles.approvedBy === null || roles.approvedBy === "") {
    fail(errors, context, fieldKey, "roles.approvedBy is missing.");
  } else if (typeof roles.approvedBy === "string" && !VALID_APPROVED_BY.includes(roles.approvedBy)) {
    // Not a hard failure by itself (approvedBy can reasonably be extended),
    // but flagged so an unrecognized value is never silently accepted either.
    fail(errors, context, fieldKey, `roles.approvedBy ${JSON.stringify(roles.approvedBy)} is not one of [${VALID_APPROVED_BY.join(", ")}].`);
  }

  // --- Contradiction checks ---
  const visibleTo = Array.isArray(roles.visibleTo) ? roles.visibleTo : [];
  const editableBy = Array.isArray(roles.editableBy) ? roles.editableBy : [];

  if (roles.suppliedBy === "bi_staff" && visibleTo.includes("customer")) {
    fail(errors, context, fieldKey, 'CONTRADICTION: suppliedBy is "bi_staff" but visibleTo includes "customer" -- BI-only content must never be customer-visible.');
  }
  if (roles.suppliedBy === "customer_wet_ink" && visibleTo.includes("customer")) {
    fail(errors, context, fieldKey, 'CONTRADICTION: suppliedBy is "customer_wet_ink" but visibleTo includes "customer" -- a wet-ink signature field must never be marked customer-visible in a generated artifact.');
  }
  const hasNoneEditor = editableBy.includes("none") || editableBy.includes("none_system_generated");
  if (hasNoneEditor && editableBy.length > 1) {
    fail(errors, context, fieldKey, 'CONTRADICTION: editableBy lists "none"/"none_system_generated" alongside other editors -- a field that can never be system-generated cannot also have other editors.');
  }
  if (DRAWABLE_SUPPLIED_BY.includes(roles.suppliedBy) && hasNoneEditor) {
    fail(errors, context, fieldKey, `CONTRADICTION: suppliedBy is ${JSON.stringify(roles.suppliedBy)} (drawable) but editableBy forbids system generation -- these cannot both be true.`);
  }
  if (!DRAWABLE_SUPPLIED_BY.includes(roles.suppliedBy) && !hasNoneEditor && editableBy.length > 0) {
    fail(errors, context, fieldKey, `CONTRADICTION: suppliedBy is ${JSON.stringify(roles.suppliedBy)} (never drawn) but editableBy does not forbid system generation -- expected "none" or "none_system_generated".`);
  }
}

/**
 * Validates every field's roles in a coordinate map. Throws with the full
 * list of problems (never just the first one) if anything is missing,
 * malformed, or contradictory. Returns silently (no return value) if clean.
 */
function assertFieldPermissions(coordinateMap, formIdForError) {
  const errors = [];
  for (const coll of ["charBoxFields", "checkboxFields", "freeTextFields"]) {
    for (const [key, field] of Object.entries(coordinateMap[coll] || {})) {
      validateRoles(field.roles, coll, key, errors);
    }
  }
  if (coordinateMap.signatureBlock) {
    validateRoles(coordinateMap.signatureBlock.roles, "signatureBlock", "(shared)", errors);
  }
  if (Array.isArray(coordinateMap.biOnlySections)) {
    coordinateMap.biOnlySections.forEach((section, i) => {
      validateRoles(section.roles, "biOnlySections", `[${i}] ${section.label || "(unlabeled)"}`, errors);
    });
  }
  if (errors.length > 0) {
    throw new Error(
      `Field-permission validation failed for form "${formIdForError}" -- generation refused.\n` +
      errors.map((e) => `  - ${e}`).join("\n")
    );
  }
}

/**
 * Returns the subset of charBoxFields/checkboxFields/freeTextFields that
 * should be drawn for the given audience ("staff" draws every drawable
 * field; "customer" draws only fields whose visibleTo includes "customer").
 * Fields with suppliedBy outside DRAWABLE_SUPPLIED_BY are never returned,
 * for either audience, regardless of what the caller asks for.
 */
function fieldsForAudience(coordinateMap, audience) {
  if (!VALID_AUDIENCES.includes(audience)) {
    throw new Error(`fieldsForAudience: unknown audience ${JSON.stringify(audience)}`);
  }
  const out = { charBoxFields: {}, checkboxFields: {}, freeTextFields: {} };
  for (const coll of ["charBoxFields", "checkboxFields", "freeTextFields"]) {
    for (const [key, field] of Object.entries(coordinateMap[coll] || {})) {
      const supplied = field.roles && field.roles.suppliedBy;
      if (!DRAWABLE_SUPPLIED_BY.includes(supplied)) continue;
      if (audience === "staff") {
        out[coll][key] = field;
      } else if (Array.isArray(field.roles.visibleTo) && field.roles.visibleTo.includes("customer")) {
        out[coll][key] = field;
      }
    }
  }
  return out;
}

/**
 * Returns a flat list of every staff-controlled (suppliedBy: "staff")
 * field across all three field collections, with its label -- used by
 * the staff-review UI/API to know which fields it's responsible for
 * collecting, and by the approval completeness check (see
 * questionnaire-answers.js's getRequiredStaffFields()) to know which of
 * those are actually required for THIS submission.
 */
function staffOwnedFields(coordinateMap) {
  const out = [];
  for (const coll of ["charBoxFields", "checkboxFields", "freeTextFields"]) {
    for (const [key, field] of Object.entries(coordinateMap[coll] || {})) {
      if (field.roles && field.roles.suppliedBy === "staff") out.push({ key, label: field.label, coll });
    }
  }
  return out;
}

module.exports = { assertFieldPermissions, fieldsForAudience, staffOwnedFields, VALID_AUDIENCES, VALID_SUPPLIED_BY };
