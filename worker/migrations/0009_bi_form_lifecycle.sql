-- BI Forms Library Phase 2, Stage 1: separate BI-form lifecycle foundation.
-- Purely additive against the live production schema: no existing table,
-- column, or row is altered, dropped, or rewritten. NOT YET APPLIED TO
-- PRODUCTION -- drafted for review, per bi-forms-library/PHASE2_INTEGRATION_PLAN.md
-- and bi-forms-library/BI_FORM_LIFECYCLE.md (states/transitions/rationale).
--
-- Deliberately decoupled from `applications.status`/STATUS_OPTIONS:
-- completing, approving, or publishing a BI form never writes to
-- `applications.status` or `application_status_history`. The surrounding
-- immigration application progresses independently, exactly as it does
-- today, whether or not a BI form is involved. See BI_FORM_LIFECYCLE.md.

-- One row per BI-form instance assigned to a client. `application_id` is
-- nullable, matching the existing `conversations.application_id` pattern
-- (0005_communications.sql): staff normally link an existing application
-- at assignment time, but a future Instant Checkout path (intake_path
-- below) may need to create a submission before any application exists.
-- A client can have more than one bi_form_submissions row against the
-- same application (e.g. two different forms needed for one engagement)
-- -- this is why bi_form_id/application_id live here, not as a single
-- column on `applications`.
--
-- customer_answers_json and staff_answers_json are deliberately two
-- separate columns, not one merged object: the engine's fail-closed
-- field-permission rule (a field is only ever drawn if its roles.suppliedBy
-- is "customer" or "staff" -- see bi-forms-library/engine/lib/
-- field-permissions.js) is mirrored here at the storage level. A
-- customer-facing route can only ever write customer_answers_json; a
-- staff-facing route can only ever write staff_answers_json. The two are
-- merged only at generation time, in Worker code -- never by a single,
-- client-controlled write.
CREATE TABLE bi_form_submissions (
  id TEXT PRIMARY KEY,
  application_id TEXT NULL REFERENCES applications(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  bi_form_id TEXT NOT NULL,              -- e.g. 'CCS-A-CDR-2016' -- matches bi-forms-library/configs/<bi_form_id>/
  intake_path TEXT NOT NULL DEFAULT 'staff_assigned', -- 'staff_assigned' | 'instant_checkout' (future; no row uses this yet)
  status TEXT NOT NULL DEFAULT 'draft',  -- see BI_FORM_LIFECYCLE.md: draft | submitted | under_review | revision_requested | approved | published | cancelled
  preferred_language TEXT NULL,          -- one of the site's six canonical codes (worker/src/lib/translation.js CANONICAL_LANGUAGES); NULL until the customer picks one
  customer_answers_json TEXT NULL,       -- questionnaire answers the CUSTOMER supplied; only a customer-facing route may write this
  staff_answers_json TEXT NULL,          -- staff-controlled field values; only a staff-facing route may write this
  assigned_by_staff_email TEXT NULL,     -- NULL only for a future instant_checkout row with no staff assigner; required by application code whenever intake_path = 'staff_assigned'
  submitted_at TEXT NULL,
  review_started_at TEXT NULL,
  approved_at TEXT NULL,
  approved_by_staff_email TEXT NULL,
  published_at TEXT NULL,
  published_by_staff_email TEXT NULL,
  cancelled_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bi_form_submissions_client ON bi_form_submissions(client_id);
CREATE INDEX idx_bi_form_submissions_application ON bi_form_submissions(application_id);
CREATE INDEX idx_bi_form_submissions_status ON bi_form_submissions(bi_form_id, status);

-- Full chronological transition history, mirroring application_status_history
-- (0001_init.sql) -- the schema's established convention for an auditable
-- status trail alongside a single current-status column, rather than a
-- second, new mechanism.
CREATE TABLE bi_form_status_history (
  id TEXT PRIMARY KEY,
  bi_form_submission_id TEXT NOT NULL REFERENCES bi_form_submissions(id),
  status TEXT NOT NULL,
  note TEXT NULL,
  changed_by_staff_email TEXT NULL,      -- set for every staff-caused transition
  changed_by_client_id TEXT NULL,        -- set only for the two customer-caused transitions (-> submitted)
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bi_form_status_history_submission ON bi_form_status_history(bi_form_submission_id, changed_at);

-- Links a required-document request to the specific BI form that needs
-- it, so the engine's per-form config can auto-create the right
-- document_requests rows instead of staff typing each one in by hand.
-- Nullable: an ordinary, non-BI-form document request (as used today)
-- simply leaves this NULL and is completely unaffected.
ALTER TABLE document_requests ADD COLUMN bi_form_submission_id TEXT NULL REFERENCES bi_form_submissions(id);
CREATE INDEX idx_document_requests_bi_form_submission ON document_requests(bi_form_submission_id);

-- Distinguishes a generated BI-form PDF from an ordinary client upload, so
-- the download path (worker/src/routes/documents.js) can refuse to ever
-- serve a staff_pdf to a customer-authenticated request, regardless of
-- ownership -- an explicit, additive, defense-in-depth check (see
-- BI_FORM_LIFECYCLE.md, "What approved and published each gate"). DEFAULT
-- 'client_upload' keeps every existing row's meaning exactly as it already
-- is today -- no historical row changes behavior.
ALTER TABLE documents ADD COLUMN kind TEXT NOT NULL DEFAULT 'client_upload'; -- 'client_upload' | 'staff_pdf' | 'customer_preview'
ALTER TABLE documents ADD COLUMN bi_form_submission_id TEXT NULL REFERENCES bi_form_submissions(id);
CREATE INDEX idx_documents_bi_form_submission ON documents(bi_form_submission_id, kind);

-- No CHECK constraints on the enum-like columns above (status, intake_path,
-- kind), consistent with how every other enumerated column in this schema
-- has always been validated in Worker code rather than at the SQL level
-- (see 0004_enquiry_priority.sql).
