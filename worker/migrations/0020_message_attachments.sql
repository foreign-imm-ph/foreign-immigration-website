-- Directive section 9: secure document attachments on an order/application
-- message. Purely additive, same established pattern as 0009's own
-- documents.kind/bi_form_submission_id columns: reuses the existing
-- `documents` table (same R2-backed, ownership-checked storage every other
-- upload in this schema already goes through) rather than inventing a
-- second file-storage mechanism, with a new nullable FK linking a document
-- row to the communication_messages row it's attached to.
ALTER TABLE documents ADD COLUMN communication_message_id TEXT NULL REFERENCES communication_messages(id);
CREATE INDEX idx_documents_communication_message ON documents(communication_message_id);

-- `kind` (added in 0009) gains a new value here: 'message_attachment'
-- (alongside the existing 'client_upload' | 'staff_pdf' | 'customer_preview').
-- No CHECK constraint, consistent with every other enumerated column in
-- this schema (see 0004_enquiry_priority.sql / 0009's own note).
