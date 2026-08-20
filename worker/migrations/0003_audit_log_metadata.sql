-- Minimal non-PII audit snapshot for permanent enquiry deletion. Migration
-- 0002 is already live in production, so this is additive on top of it, not
-- a rewrite. No existing table, row, or column is touched.

ALTER TABLE audit_log ADD COLUMN metadata TEXT NULL;
-- NULL for every existing row and every action that doesn't need it.
-- Only permanently_deleted_enquiry populates this, and only with
-- reference/service_slug/created_at — never full_name, email, phone,
-- nationality, location, language, or description.
