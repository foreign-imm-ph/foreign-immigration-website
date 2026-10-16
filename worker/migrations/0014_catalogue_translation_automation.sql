-- Automatic catalogue translation: purely additive columns on the existing
-- checkout_service_i18n table (0010_instant_services.sql). No table is
-- dropped, renamed, or has a column removed; existing rows are unaffected
-- (the new columns' defaults make every pre-existing row read as
-- "manually authored, up to date", which is the correct, conservative
-- interpretation -- see worker/src/lib/checkoutTranslation.js).
--
-- auto_generated: 0 = staff-authored/approved content that the automatic
--   translator must never overwrite (always 0 for the English row itself,
--   since it is the source, never a translation). 1 = machine-generated;
--   eligible to be regenerated when the English source changes.
-- source_hash: a hash of the English row's content at the moment this
--   translation was generated FROM it. Compared against the EN row's
--   current hash to detect "the English source changed since this
--   translation was made" without storing the hash on the English row
--   itself (recomputed on read instead -- see hashEnglishContent()).
--   NULL for the English row and for any manually authored row.
-- translation_status: ready | failed. Lets staff see "a translation
--   attempt failed and this language is showing stale/English content"
--   without losing the last-known-good row it failed to replace.
-- generated_at: when this row was last machine-generated (NULL for
--   manually authored content).
ALTER TABLE checkout_service_i18n ADD COLUMN auto_generated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE checkout_service_i18n ADD COLUMN source_hash TEXT NULL;
ALTER TABLE checkout_service_i18n ADD COLUMN translation_status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE checkout_service_i18n ADD COLUMN generated_at TEXT NULL;
