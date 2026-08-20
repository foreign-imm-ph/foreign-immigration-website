-- Enquiry archiving: lets staff keep the Active enquiries list usable as
-- volume grows, without destroying or altering any existing enquiry data or
-- its business status. Purely additive against the live production schema —
-- no existing column, table, or row is modified, dropped, or recreated.

ALTER TABLE enquiries ADD COLUMN archived_at TEXT NULL;
-- NULL = active (the default for every existing row and every new one),
-- a timestamp = archived. Restoring is just setting this back to NULL.

CREATE INDEX idx_enquiries_archived_at ON enquiries(archived_at);
