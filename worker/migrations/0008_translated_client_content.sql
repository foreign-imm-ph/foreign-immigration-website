-- Phase 3.1: closes the gap where staff-authored free text (a status
-- note, a document request title, a payment description) was rendered to
-- clients only in the English staff typed it in, regardless of the
-- client's preferred communication language. Purely additive — no
-- existing column is repurposed or dropped, and no historical row is
-- rewritten. Historical rows simply have NULL in every new column, which
-- the application code treats as "no translation applicable" (shown as
-- before, in English), never as a failure.

-- application_status_history already has `client_visible` (from 0001),
-- originally always 1 in practice. It is now also used as the publish
-- gate for a status update that included a note requiring translation: a
-- row is inserted the moment staff clicks "Translate & Preview" so the
-- draft can be shown back to staff for confirm/retry, but with
-- client_visible = 0 until staff explicitly confirms — so a translation
-- still in progress, or one that failed, is never returned by the
-- client-facing API (see worker/src/routes/applications.js), which
-- already filters on client_visible = 1.
ALTER TABLE application_status_history ADD COLUMN note_translated TEXT NULL;
ALTER TABLE application_status_history ADD COLUMN note_target_language TEXT NULL;
ALTER TABLE application_status_history ADD COLUMN note_translation_status TEXT NULL; -- not_required | pending | ready | failed

-- document_requests never had a visibility gate at all — every row was
-- always shown to the client. DEFAULT 1 keeps every historical row
-- exactly as visible as it already was; only a newly created row with a
-- non-English target language starts at 0 until staff confirms.
ALTER TABLE document_requests ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE document_requests ADD COLUMN label_translated TEXT NULL;
ALTER TABLE document_requests ADD COLUMN label_target_language TEXT NULL;
ALTER TABLE document_requests ADD COLUMN label_translation_status TEXT NULL; -- not_required | pending | ready | failed

-- Same pattern for payment_requests. Structured payment data (amount_php,
-- status, dates, verified_by_staff_email) is completely untouched by this
-- migration and by every Phase 3.1 code path — only `description` ever
-- goes through translation.
ALTER TABLE payment_requests ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE payment_requests ADD COLUMN description_translated TEXT NULL;
ALTER TABLE payment_requests ADD COLUMN description_target_language TEXT NULL;
ALTER TABLE payment_requests ADD COLUMN description_translation_status TEXT NULL; -- not_required | pending | ready | failed

-- Public enquiry contact capture (Phase 3.1 Section 22-24). `phone` (the
-- original free-form column) is completely untouched and keeps receiving
-- whatever the visitor types in the new "Phone number" field — these are
-- new, separate, additive facts alongside it, exactly like clients.phone
-- vs clients.mobile_e164 in Phase 3.
ALTER TABLE enquiries ADD COLUMN phone_country TEXT NULL; -- ISO 3166-1 alpha-2, context for normalization only
ALTER TABLE enquiries ADD COLUMN mobile_e164 TEXT NULL;
ALTER TABLE enquiries ADD COLUMN preferred_contact_method TEXT NULL; -- email | phone_call | portal
