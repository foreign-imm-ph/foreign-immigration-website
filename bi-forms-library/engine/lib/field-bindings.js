// Resolves a form's raw questionnaire-shaped answers (data.json) into a
// FLAT map of {fieldKey: value} and {fieldKey: true} for marked checkboxes,
// using a form's declared `fieldBindings` config. This is where each form's
// special-casing (checkbox selection, wrapped free text, conditional
// fallback-to-N/A, repeatable trip groups) lives -- as data, not as
// per-form JavaScript. The drawing code downstream never needs to know
// which form it's drawing; it only ever sees a flat field-key -> value map.
function resolveFieldValues(bindings, data) {
  const values = {};
  const checkboxMarks = {};

  // Direct 1:1 fields: any top-level scalar in `data` whose key matches a
  // field key is used as-is (covers the large majority of fields --
  // identity, address, etc. -- with no special casing needed).
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" || typeof value === "number") {
      values[key] = value;
    }
  }

  for (const sel of bindings.checkboxSelect || []) {
    const chosen = data[sel.dataKey];
    // Not yet answered (undefined, or the empty string a <select> with no
    // chosen option submits) is a normal, expected state for an
    // IN-PROGRESS draft -- directive section 6's live preview calls this
    // with exactly that kind of incomplete data, deliberately, on every
    // keystroke. Every existing caller already only ever reaches this
    // function with complete, validated (validateAnswers already ran) or
    // synthetic-complete (fixtures/sample-data.json) data, so this never
    // changes behavior for any of them -- it only stops a genuinely
    // unanswered question from crashing a feature that explicitly expects
    // to render partial data. A chosen value that IS present but matches
    // no declared option is still a real data-integrity bug and still
    // throws, same as before.
    if (chosen === undefined || chosen === null || chosen === "") continue;
    const fieldKey = sel.options[chosen];
    if (!fieldKey) {
      throw new Error(`checkboxSelect: data.${sel.dataKey} = ${JSON.stringify(chosen)} does not match any option in ${JSON.stringify(sel.options)}`);
    }
    checkboxMarks[fieldKey] = true;
  }

  for (const pair of bindings.wrappedPairs || []) {
    // Handled specially by the caller (needs word-wrap logic, not a plain
    // value assignment) -- recorded here so the caller knows which raw
    // text maps to which line-1/line-2 field pair.
    values.__wrappedPairs = values.__wrappedPairs || [];
    values.__wrappedPairs.push({ text: String(data[pair.dataKey] ?? ""), line1: pair.line1, line2: pair.line2 });
  }

  for (const cond of bindings.conditionalFallback || []) {
    const applies = Boolean(data[cond.gateDataKey]);
    for (const fieldKey of cond.fields) {
      values[fieldKey] = applies ? String(data[fieldKey] ?? cond.fallbackValue) : cond.fallbackValue;
    }
  }

  for (const grp of bindings.repeatableGroups || []) {
    const items = Array.isArray(data[grp.dataKey]) ? data[grp.dataKey] : [];
    if (items.length > grp.maxCount) {
      throw new Error(`repeatableGroup "${grp.dataKey}": ${items.length} entries supplied but the form only provides ${grp.maxCount} rows.`);
    }
    items.forEach((item, i) => {
      const n = i + 1;
      for (const subField of grp.subFields) {
        values[`${subField}_${n}`] = item[subField] ?? "";
      }
    });
  }

  return { values, checkboxMarks };
}

module.exports = { resolveFieldValues };
