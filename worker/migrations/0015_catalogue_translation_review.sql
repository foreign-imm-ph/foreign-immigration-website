-- Prevents a manually corrected catalogue translation from silently going
-- stale when its English source changes. Purely additive columns on the
-- existing checkout_service_i18n table (0010, extended by 0014) -- no
-- table dropped, renamed, or existing column altered; every pre-existing
-- row reads as needs_review = 0 (the correct, conservative default: a row
-- written before this migration existed is treated as already reconciled
-- with whatever English content it has, not retroactively flagged).
--
-- field_hashes_json: a JSON object of per-field hashes
--   ({"title":.., "shortDescription":.., "eligibilityText":.., "noticesText":..})
--   of the English content this row was generated from (auto_generated = 1)
--   or last reconciled against (auto_generated = 0, after the owner saved
--   it, or explicitly chose "Keep my translation"). Lets the reconciliation
--   logic (worker/src/lib/checkoutTranslation.js) identify exactly which
--   fields changed, not just "something changed somewhere" -- needed both
--   to regenerate only the affected machine-generated fields (minimizing
--   Workers AI calls) and to show the owner which fields moved.
-- needs_review: 0 normally. Set to 1 only for a MANUALLY authored row
--   (auto_generated = 0) whose English source has since changed -- never
--   set on an auto_generated row, which is simply regenerated instead.
--   The customer-facing read (lib/checkout.js getServiceI18n) treats a
--   needs_review row exactly like a missing one: falls back to English,
--   never serves a translation that might misstate updated requirements.
-- review_changed_fields: a comma-separated list of the specific English
--   field names (title, short_description, eligibility_text,
--   notices_text) that changed since this translation was last
--   reconciled -- shown directly in the Staff Portal catalogue editor.
ALTER TABLE checkout_service_i18n ADD COLUMN field_hashes_json TEXT NULL;
ALTER TABLE checkout_service_i18n ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE checkout_service_i18n ADD COLUMN review_changed_fields TEXT NULL;
