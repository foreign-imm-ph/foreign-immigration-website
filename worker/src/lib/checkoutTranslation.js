// Automatic catalogue translation (navigation/communication directive,
// section 6), extended to prevent a manually corrected translation from
// silently going stale when its English source changes (translation
// accuracy refinement directive). The owner enters English-only catalogue
// content; this module fills in the other five languages using the
// existing Workers AI translation infrastructure (lib/translation.js) --
// no second provider, no second translation system, no new paid resource.
//
// Two different rows, two different rules, both keyed off the same
// auto_generated flag:
//  - auto_generated = 1 (machine-generated): regenerated automatically
//    when its English source changes, but ONLY the specific fields that
//    actually changed -- a field whose English text is untouched keeps
//    its existing translation verbatim, with no new Workers AI call.
//  - auto_generated = 0 (staff-authored/approved): NEVER regenerated
//    automatically, no matter what changed. Instead flagged
//    needs_review = 1 with the specific changed field names recorded, so
//    the Staff Portal catalogue editor can show the warning and offer
//    "Keep my translation" / "Update translation automatically" -- see
//    reconcileKeep / applyRegeneratedTranslation below, both called only
//    from an explicit staff action, never from this reconciliation pass.
import { translateFromEnglish } from "./translation.js";

const TARGET_LANGUAGES = ["zh-CN", "zh-Hant", "ko", "ja", "vi"];
const ALL_FIELDS = ["title", "shortDescription", "eligibilityText", "noticesText"];
const FIELD_COLUMN = {
  title: "title",
  shortDescription: "short_description",
  eligibilityText: "eligibility_text",
  noticesText: "notices_text",
};

// Cheap, deterministic, non-cryptographic hash (FNV-1a, 32-bit) used only
// for change detection on catalogue text -- not a security boundary, so a
// fast synchronous hash (no crypto.subtle round-trip) is the right tool.
function fnv1a(text) {
  const s = text || "";
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// Whole-row hash -- a fast single-column comparison that answers "is this
// row still exactly up to date" without parsing JSON, used as the first,
// cheap gate before any field-level work is attempted.
export function hashEnglishContent({ title, shortDescription, eligibilityText, noticesText }) {
  return fnv1a([title || "", shortDescription || "", eligibilityText || "", noticesText || ""].join("\u0001"));
}

// Per-field hashes of the current English row -- what a translation row's
// own field_hashes_json is compared against to find exactly which fields
// changed.
export function hashEnglishFields(enRow) {
  return {
    title: fnv1a(enRow.title),
    shortDescription: fnv1a(enRow.short_description),
    eligibilityText: fnv1a(enRow.eligibility_text),
    noticesText: fnv1a(enRow.notices_text),
  };
}

// The field keys present in currentFieldHashes but different (or absent)
// in storedHashesJson. A row with no stored field_hashes_json at all --
// every row written before this migration, under the previous
// whole-row-only tracking -- is treated as "every field is unverified",
// the conservative, never-silently-trust reading, not a guess at which
// field actually moved.
export function changedFields(storedHashesJson, currentFieldHashes) {
  const stored = storedHashesJson ? JSON.parse(storedHashesJson) : null;
  if (!stored) return [...ALL_FIELDS];
  return ALL_FIELDS.filter((f) => stored[f] !== currentFieldHashes[f]);
}

async function translateOneField(env, text, lang) {
  if (!text) return { status: "not_required", text: null };
  return translateFromEnglish(env, text, lang);
}

// Translates exactly the requested fields from the current English row;
// every other field is carried over verbatim from existingRow (no AI
// call). Returns ok = false if any REQUIRED field (title/shortDescription/
// eligibilityText -- noticesText is optional, like the manual form) that
// was actually translated failed, so the caller never writes a partial,
// fabricated mix of new and stale-but-silently-blanked text.
async function translateFields(env, enRow, lang, fieldsToTranslate, existingRow) {
  const out = {};
  let ok = true;
  for (const field of ALL_FIELDS) {
    if (!fieldsToTranslate.includes(field)) {
      out[field] = existingRow ? existingRow[FIELD_COLUMN[field]] : null;
      continue;
    }
    const enText = field === "title" ? enRow.title : field === "shortDescription" ? enRow.short_description : field === "eligibilityText" ? enRow.eligibility_text : enRow.notices_text;
    const result = await translateOneField(env, enText, lang);
    if (result.status !== "ready" && result.status !== "not_required") {
      if (field !== "noticesText") ok = false;
    }
    out[field] = result.text;
  }
  return { ok, ...out };
}

// Full regeneration of all four fields -- used for a brand-new row (there
// is nothing to selectively reuse yet) and for the explicit, staff-
// initiated "regenerate my manual translation" preview. Writes nothing;
// the caller decides when (or whether) to persist the result.
export async function generateTranslationPreview(env, enRow, lang) {
  return translateFields(env, enRow, lang, ALL_FIELDS, null);
}

async function writeAutoGeneratedRow(db, serviceId, lang, content, fieldHashes, wholeHash) {
  await db
    .prepare(
      `INSERT INTO checkout_service_i18n
         (service_id, lang, title, short_description, eligibility_text, notices_text,
          auto_generated, source_hash, translation_status, generated_at,
          field_hashes_json, needs_review, review_changed_fields)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'ready', datetime('now'), ?, 0, NULL)
       ON CONFLICT(service_id, lang) DO UPDATE SET
         title = excluded.title, short_description = excluded.short_description,
         eligibility_text = excluded.eligibility_text, notices_text = excluded.notices_text,
         auto_generated = 1, source_hash = excluded.source_hash, translation_status = 'ready',
         generated_at = excluded.generated_at, field_hashes_json = excluded.field_hashes_json,
         needs_review = 0, review_changed_fields = NULL`
    )
    .bind(serviceId, lang, content.title, content.shortDescription, content.eligibilityText, content.noticesText, wholeHash, JSON.stringify(fieldHashes))
    .run();
}

// Core reconciliation pass -- safe to call repeatedly (staff save, or a
// single service's first customer view; see checkoutPublic.js). A
// language that is already fully up to date, of EITHER kind, costs one
// cheap SELECT and no Workers AI call at all (the whole-row hash gate).
export async function ensureServiceTranslations(env, serviceId) {
  const db = env.DB;
  const enRow = await db.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'en'").bind(serviceId).first();
  if (!enRow) return; // Nothing to translate from yet -- English is required and saved first.

  const currentFieldHashes = hashEnglishFields(enRow);
  const currentWholeHash = hashEnglishContent({
    title: enRow.title,
    shortDescription: enRow.short_description,
    eligibilityText: enRow.eligibility_text,
    noticesText: enRow.notices_text,
  });

  for (const lang of TARGET_LANGUAGES) {
    const existing = await db.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = ?").bind(serviceId, lang).first();

    if (!existing) {
      const preview = await generateTranslationPreview(env, enRow, lang);
      if (preview.ok) {
        await writeAutoGeneratedRow(db, serviceId, lang, preview, currentFieldHashes, currentWholeHash);
      } else {
        console.error(`Catalogue auto-translation failed for service ${serviceId} (${lang})`);
      }
      continue;
    }

    if (existing.source_hash === currentWholeHash) continue; // Fully up to date already -- manual or auto, nothing to do.

    if (existing.auto_generated === 0) {
      // Manually authored/approved -- never touched automatically. Flag
      // for review with exactly which fields moved; content is untouched.
      const changed = changedFields(existing.field_hashes_json, currentFieldHashes);
      await db
        .prepare("UPDATE checkout_service_i18n SET needs_review = 1, review_changed_fields = ? WHERE service_id = ? AND lang = ?")
        .bind(changed.map((f) => FIELD_COLUMN[f]).join(","), serviceId, lang)
        .run();
      continue;
    }

    // Machine-generated and stale: regenerate only the fields that
    // actually changed; everything else carries over from the existing
    // row with no new AI call.
    const changed = changedFields(existing.field_hashes_json, currentFieldHashes);
    const fieldsToTranslate = changed.length ? changed : ALL_FIELDS;
    const result = await translateFields(env, enRow, lang, fieldsToTranslate, existing);
    if (result.ok) {
      await writeAutoGeneratedRow(db, serviceId, lang, result, currentFieldHashes, currentWholeHash);
    } else {
      await db.prepare("UPDATE checkout_service_i18n SET translation_status = 'failed' WHERE service_id = ? AND lang = ?").bind(serviceId, lang).run();
      console.error(`Catalogue auto-translation regeneration failed for service ${serviceId} (${lang})`);
    }
  }
}

// Staff action "Keep my translation": acknowledges that the existing
// manual translation remains appropriate for the updated English source.
// Reconciles field_hashes_json/source_hash against the CURRENT English
// content (so the warning does not reappear for the same already-
// reviewed change) and clears the review flag. Content is never touched.
export async function reconcileKeep(env, serviceId, lang) {
  const db = env.DB;
  const enRow = await db.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'en'").bind(serviceId).first();
  if (!enRow) return false;
  const fieldHashes = hashEnglishFields(enRow);
  const wholeHash = hashEnglishContent({
    title: enRow.title,
    shortDescription: enRow.short_description,
    eligibilityText: enRow.eligibility_text,
    noticesText: enRow.notices_text,
  });
  const result = await db
    .prepare(
      `UPDATE checkout_service_i18n
       SET needs_review = 0, review_changed_fields = NULL, field_hashes_json = ?, source_hash = ?
       WHERE service_id = ? AND lang = ? AND auto_generated = 0`
    )
    .bind(JSON.stringify(fieldHashes), wholeHash, serviceId, lang)
    .run();
  return result.meta.changes > 0;
}

// Staff action "Update translation automatically", step 2: applies a
// previously previewed regeneration (generateTranslationPreview's output,
// round-tripped through the confirmation form -- see staffCheckout.js) in
// place of the manual translation. Always a full, all-four-fields
// replacement -- the owner explicitly chose to discard the manual
// version, so there is nothing to selectively preserve.
export async function applyRegeneratedTranslation(env, serviceId, lang, content) {
  const db = env.DB;
  const enRow = await db.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'en'").bind(serviceId).first();
  if (!enRow) return;
  const fieldHashes = hashEnglishFields(enRow);
  const wholeHash = hashEnglishContent({
    title: enRow.title,
    shortDescription: enRow.short_description,
    eligibilityText: enRow.eligibility_text,
    noticesText: enRow.notices_text,
  });
  await writeAutoGeneratedRow(db, serviceId, lang, content, fieldHashes, wholeHash);
}
