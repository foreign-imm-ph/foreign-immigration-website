// Validates a customer's submitted questionnaire ANSWERS against a form's
// questionnaire.json -- distinct from schema-validate.js (which only
// checks that questionnaire.json itself is well-formed) and from
// field-bindings.js's resolveFieldValues() (which turns already-valid
// answers into PDF field values, and only throws on a hard structural
// violation like exceeding a repeatable group's maxCount). This is the
// "is this submission complete enough to submit" check the BI-form
// lifecycle's draft/revision_requested -> submitted transition requires
// (see bi-forms-library/BI_FORM_LIFECYCLE.md).
//
// Pure logic, no filesystem/subprocess dependency -- safe to import from
// the Cloudflare Worker exactly like the other pure engine modules.

function isGateSatisfied(showIf, answers) {
  if (!showIf) return true;
  return answers[showIf.questionId] === showIf.equals;
}

function isRequired(question) {
  return question.required !== false; // default true, per the schema's documented convention
}

function validateAnswers(questionnaire, answers) {
  const errors = [];
  const data = answers && typeof answers === "object" ? answers : {};

  for (const q of questionnaire.questions || []) {
    if (q.type === "repeatable-group") {
      const items = data[q.groupDataKey];
      if (items === undefined || items === null) {
        // An entirely absent repeatable group is only an error if it's
        // marked required (default true, same as any other question).
        if (isRequired(q)) errors.push(`${q.id}: expected an array at "${q.groupDataKey}"`);
        continue;
      }
      if (!Array.isArray(items)) {
        errors.push(`${q.id}: "${q.groupDataKey}" must be an array`);
        continue;
      }
      if (items.length > q.maxCount) {
        errors.push(`${q.id}: ${items.length} entries supplied but at most ${q.maxCount} are allowed`);
        continue;
      }
      items.forEach((item, i) => {
        // A fully-blank entry (every sub-field empty or absent) is treated
        // as "no entry here", not an incomplete required one -- this is
        // what lets a UI that always submits a fixed number of row slots
        // (some intentionally left blank) coexist with one that submits
        // only the rows actually filled in, without the blank placeholder
        // rows ever failing validation.
        const hasAnyValue = (q.subQuestions || []).some((sub) => {
          const v = item ? item[sub.dataKey] : undefined;
          return typeof v === "string" && v.trim() !== "";
        });
        if (!hasAnyValue) return;
        for (const sub of q.subQuestions || []) {
          if (!isRequired(sub)) continue;
          const v = item ? item[sub.dataKey] : undefined;
          if (typeof v !== "string" || v.trim() === "") {
            errors.push(`${q.id}[${i}].${sub.dataKey}: required`);
          }
        }
      });
      continue;
    }

    if (!isGateSatisfied(q.showIf, data)) continue; // not currently applicable; absence is fine
    if (!isRequired(q)) continue;

    const v = data[q.dataKey];
    if (q.type === "yesno") {
      if (typeof v !== "boolean") errors.push(`${q.id}: required (yes/no)`);
    } else if (q.type === "select") {
      if (!Array.isArray(q.options) || !q.options.includes(v)) {
        errors.push(`${q.id}: must be one of ${JSON.stringify(q.options || [])}`);
      }
    } else {
      // text | date
      if (typeof v !== "string" || v.trim() === "") errors.push(`${q.id}: required`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// Determines whether a STAFF-controlled field is currently required for
// approval, given this submission's CUSTOMER answers -- distinct from
// validateAnswers() above (which checks customer answers themselves).
// Some staff fields are only meaningful conditionally (e.g. a court
// contact number only matters if the customer said this request is for
// a court/legal purpose); treating every staff field as unconditionally
// required blocks approval on fields nobody will ever fill in. Declared
// per form in questionnaire.json's optional `staffFieldRequirements` map:
//   { "fieldKey": { "required": false } }
//     -- never required (e.g. a free-text continuation line that's
//        often legitimately blank)
//   { "fieldKey": { "requiredIf": { "customerAnswerKey": "x", "equals": true } } }
//     -- required only when the customer's answer to question "x"
//        equals the given value
// A staff field with no entry in this map defaults to required (same
// convention questionnaire.json's own per-question `required` uses).
function isStaffFieldRequired(fieldKey, questionnaire, customerAnswers) {
  const rule = (questionnaire.staffFieldRequirements || {})[fieldKey];
  if (!rule) return true;
  if (rule.required === false) return false;
  if (rule.requiredIf) {
    const data = customerAnswers && typeof customerAnswers === "object" ? customerAnswers : {};
    return data[rule.requiredIf.customerAnswerKey] === rule.requiredIf.equals;
  }
  return true;
}

// `staffFields` is the array shape field-permissions.js's
// staffOwnedFields() returns ({key, label, coll}[]) -- kept as a
// parameter rather than imported here so this module has no dependency
// on field-permissions.js and stays trivially unit-testable.
function getRequiredStaffFields(staffFields, questionnaire, customerAnswers) {
  return staffFields.filter((f) => isStaffFieldRequired(f.key, questionnaire, customerAnswers));
}

module.exports = { validateAnswers, isStaffFieldRequired, getRequiredStaffFields };
