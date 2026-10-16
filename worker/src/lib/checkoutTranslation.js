// Automatic catalogue translation (navigation/communication directive,
// section 6). The owner enters English-only catalogue content; this module
// fills in the other five languages using the existing Workers AI
// translation infrastructure (lib/translation.js) -- no second provider,
// no new paid resource.
//
// Core rule: an auto_generated row is regenerated only when the English
// source it was built from has actually changed (source_hash mismatch) or
// the row is missing outright. A manually authored/approved row
// (auto_generated = 0) is never touched by this module, at any language --
// "preserve existing manually approved translations" is enforced here by
// simply never selecting such a row as a target in the first place.
import { translateFromEnglish } from "./translation.js";

const TARGET_LANGUAGES = ["zh-CN", "zh-Hant", "ko", "ja", "vi"];

// Cheap, deterministic, non-cryptographic hash (FNV-1a, 32-bit) used only
// for change detection on catalogue text -- not a security boundary, so a
// fast synchronous hash (no crypto.subtle round-trip) is the right tool.
export function hashEnglishContent({ title, shortDescription, eligibilityText, noticesText }) {
  const s = [title || "", shortDescription || "", eligibilityText || "", noticesText || ""].join("\u0001");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

async function translateField(env, text, lang) {
  if (!text) return { status: "not_required", text: null };
  return translateFromEnglish(env, text, lang);
}

async function generateOneLanguage(db, env, serviceId, lang, enRow, currentHash) {
  const [title, shortDescription, eligibilityText, noticesText] = await Promise.all([
    translateField(env, enRow.title, lang),
    translateField(env, enRow.short_description, lang),
    translateField(env, enRow.eligibility_text, lang),
    translateField(env, enRow.notices_text, lang),
  ]);

  const required = [title, shortDescription, eligibilityText];
  const ok = required.every((r) => r.status === "ready") && (noticesText.status === "ready" || noticesText.status === "not_required");

  if (!ok) {
    // Never overwrite existing, possibly still-good content with a failed
    // attempt's nulls. If nothing exists yet for this language, there is
    // nothing safe to write at all -- the customer-facing read already
    // falls back to English in that case (getServiceI18n), and the next
    // trigger (another save, or the next customer view) will retry.
    await db
      .prepare("UPDATE checkout_service_i18n SET translation_status = 'failed' WHERE service_id = ? AND lang = ?")
      .bind(serviceId, lang)
      .run();
    console.error(`Catalogue auto-translation failed for service ${serviceId} (${lang})`);
    return;
  }

  await db
    .prepare(
      `INSERT INTO checkout_service_i18n
         (service_id, lang, title, short_description, eligibility_text, notices_text, auto_generated, source_hash, translation_status, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'ready', datetime('now'))
       ON CONFLICT(service_id, lang) DO UPDATE SET
         title = excluded.title, short_description = excluded.short_description,
         eligibility_text = excluded.eligibility_text, notices_text = excluded.notices_text,
         auto_generated = 1, source_hash = excluded.source_hash,
         translation_status = 'ready', generated_at = excluded.generated_at`
    )
    .bind(serviceId, lang, title.text, shortDescription.text, eligibilityText.text, noticesText.text, currentHash)
    .run();
}

// Generates (or regenerates, or leaves alone) every one of the five
// non-English translations for one service, from its current English
// content. Safe to call repeatedly -- a language that is already
// up to date and ready, or manually authored, costs one cheap SELECT and
// no Workers AI call at all.
export async function ensureServiceTranslations(env, serviceId) {
  const db = env.DB;
  const enRow = await db.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'en'").bind(serviceId).first();
  if (!enRow) return; // Nothing to translate from yet -- English is required and saved first.

  const currentHash = hashEnglishContent({
    title: enRow.title,
    shortDescription: enRow.short_description,
    eligibilityText: enRow.eligibility_text,
    noticesText: enRow.notices_text,
  });

  for (const lang of TARGET_LANGUAGES) {
    const existing = await db.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = ?").bind(serviceId, lang).first();
    if (existing && existing.auto_generated === 0) continue; // Manually approved -- never auto-overwritten.
    if (existing && existing.translation_status === "ready" && existing.source_hash === currentHash) continue; // Already up to date.
    await generateOneLanguage(db, env, serviceId, lang, enRow, currentHash);
  }
}
