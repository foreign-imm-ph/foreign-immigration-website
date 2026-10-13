// Cross-file consistency checks between a form's questionnaire.json and its
// coordinate-map.json. Schema validation (schema-validate.js) only confirms
// each file is well-shaped on its own; it cannot catch a question that
// references a field key that doesn't exist, or a conditional customer
// question that silently feeds a staff-controlled field without being
// marked as staff-reviewed. Those require reading both files together,
// which is what this module does. Fail-closed: any inconsistency throws.
function allFieldKeys(coordinateMap) {
  return new Set([
    ...Object.keys(coordinateMap.charBoxFields || {}),
    ...Object.keys(coordinateMap.checkboxFields || {}),
    ...Object.keys(coordinateMap.freeTextFields || {}),
  ]);
}

function fieldOwner(coordinateMap, key) {
  for (const coll of ["charBoxFields", "checkboxFields", "freeTextFields"]) {
    const field = (coordinateMap[coll] || {})[key];
    if (field) return field;
  }
  return null;
}

// Flattens questionnaire.questions, descending into repeatable-group
// subQuestions, so every question (top-level or per-entry) is checked.
function flattenQuestions(questions, groupContext) {
  const out = [];
  for (const q of questions || []) {
    out.push({ ...q, __groupContext: groupContext || null });
    if (q.type === "repeatable-group" && Array.isArray(q.subQuestions)) {
      out.push(...flattenQuestions(q.subQuestions, q));
    }
  }
  return out;
}

function assertConfigConsistency(coordinateMap, questionnaire, formIdForError) {
  const errors = [];
  const fieldKeys = allFieldKeys(coordinateMap);
  const flat = flattenQuestions(questionnaire.questions);
  const questionIds = new Set(flat.map((q) => q.id));

  for (const q of flat) {
    // forFields must reference real coordinate-map fields.
    for (const key of q.forFields || []) {
      if (q.type === "repeatable-group") continue; // group-level forFields (if any) are documentation only; per-entry keys are expanded fields checked via fieldBindings instead
      if (!fieldKeys.has(key)) {
        errors.push(`question "${q.id}": forFields references unknown coordinate-map field "${key}".`);
        continue;
      }
      const owner = fieldOwner(coordinateMap, key);
      const supplied = owner.roles && owner.roles.suppliedBy;
      if (supplied === "staff" && !q.informsStaffOnly) {
        errors.push(`question "${q.id}": targets field "${key}" (suppliedBy: "staff") but is not marked informsStaffOnly: true -- a customer question must never be wired to silently auto-populate a staff-controlled field.`);
      }
      if ((supplied === "bi_staff" || supplied === "customer_wet_ink") ) {
        errors.push(`question "${q.id}": targets field "${key}" (suppliedBy: ${JSON.stringify(supplied)}) -- this field is structurally non-drawable and must never be a questionnaire target.`);
      }
    }

    // showIf must reference a real sibling/ancestor question id.
    if (q.showIf && !questionIds.has(q.showIf.questionId)) {
      errors.push(`question "${q.id}": showIf.questionId "${q.showIf.questionId}" does not match any question id in this questionnaire.`);
    }
  }

  // fieldBindings: every referenced field key (after repeatableGroups
  // expansion) must exist in the coordinate map.
  const bindings = questionnaire.fieldBindings || {};
  for (const sel of bindings.checkboxSelect || []) {
    for (const [optionValue, fieldKey] of Object.entries(sel.options || {})) {
      if (!fieldKeys.has(fieldKey)) {
        errors.push(`fieldBindings.checkboxSelect (dataKey "${sel.dataKey}"): option ${JSON.stringify(optionValue)} targets unknown field "${fieldKey}".`);
      }
    }
  }
  for (const pair of bindings.wrappedPairs || []) {
    for (const key of [pair.line1, pair.line2]) {
      if (!fieldKeys.has(key)) {
        errors.push(`fieldBindings.wrappedPairs (dataKey "${pair.dataKey}"): references unknown field "${key}".`);
      }
    }
  }
  for (const cond of bindings.conditionalFallback || []) {
    for (const key of cond.fields || []) {
      if (!fieldKeys.has(key)) {
        errors.push(`fieldBindings.conditionalFallback (gate "${cond.gateDataKey}"): references unknown field "${key}".`);
      }
    }
  }
  for (const grp of bindings.repeatableGroups || []) {
    for (const subField of grp.subFields || []) {
      for (let n = 1; n <= grp.maxCount; n++) {
        const key = `${subField}_${n}`;
        if (!fieldKeys.has(key)) {
          errors.push(`fieldBindings.repeatableGroups (dataKey "${grp.dataKey}"): maxCount is ${grp.maxCount} but field "${key}" does not exist in coordinate-map.json -- the PDF does not have that many physical rows, or subField "${subField}" is misspelled.`);
        }
      }
    }
  }

  // A repeatable-group question's groupDataKey/maxCount should agree with
  // the matching fieldBindings.repeatableGroups entry, if both exist, so
  // the questionnaire and the drawing contract can't silently drift apart.
  for (const q of flat) {
    if (q.type !== "repeatable-group") continue;
    const match = (bindings.repeatableGroups || []).find((g) => g.dataKey === q.groupDataKey);
    if (!match) {
      errors.push(`question "${q.id}" (repeatable-group, groupDataKey "${q.groupDataKey}"): no matching fieldBindings.repeatableGroups entry with that dataKey.`);
    } else if (match.maxCount !== q.maxCount) {
      errors.push(`question "${q.id}": maxCount (${q.maxCount}) does not match fieldBindings.repeatableGroups["${q.groupDataKey}"].maxCount (${match.maxCount}).`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `questionnaire.json / coordinate-map.json consistency check failed for form "${formIdForError}" -- generation refused.\n` +
      errors.map((e) => `  - ${e}`).join("\n")
    );
  }
}

module.exports = { assertConfigConsistency };
