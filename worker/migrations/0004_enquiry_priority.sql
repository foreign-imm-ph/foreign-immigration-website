-- Enquiry priority classification (standard | priority | urgent). Purely
-- additive against the live production schema — no existing column, table,
-- or row is modified, dropped, or recreated. NOT YET APPLIED TO PRODUCTION.
--
-- No CHECK constraint is added here, consistent with how `status` and
-- `service_slug` are already validated: this schema has never used SQL-level
-- CHECK constraints for enumerated values (see 0001_init.sql), relying
-- instead on server-side validation in worker/src/routes/enquiries.js. This
-- migration follows that existing convention rather than introducing a new
-- validation mechanism.

ALTER TABLE enquiries ADD COLUMN priority TEXT NOT NULL DEFAULT 'standard';
-- Every existing row becomes 'standard' automatically via the column
-- default. Allowed application-level values: 'standard' | 'priority' | 'urgent'.

CREATE INDEX idx_enquiries_priority ON enquiries(priority);
-- Supports the staff Active-enquiries list sorting urgent/priority first,
-- and the optional priority filter.
