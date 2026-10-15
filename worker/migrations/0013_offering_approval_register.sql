-- Phase 4, Stage C: a real product-approval register, not just a price
-- gate. Adds exactly two columns -- no new table, no redundant status
-- duplicating offering_status -- per the continuation directive's
-- explicit instruction to adapt the existing lifecycle rather than
-- invent parallel states.
--
-- approved_by_staff_email / approved_at are an append-only fact ("this
-- offering WAS approved by this admin, at this time") set the first time
-- offering_status moves to 'approved' and never cleared afterwards, even
-- if the offering is later paused or archived -- the audit trail the
-- directive asks for ("Record who approved an offering and when...
-- Preserve an audit trail") would otherwise be lost the moment a staff
-- member paused a once-approved product.
ALTER TABLE checkout_services ADD COLUMN approved_by_staff_email TEXT NULL;
ALTER TABLE checkout_services ADD COLUMN approved_at TEXT NULL;
