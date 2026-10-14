-- Instant Services: purely additive D1 schema. No existing table, column,
-- or row is altered, dropped, or rewritten (the two ALTER TABLEs at the
-- bottom only ADD COLUMN, following the established convention from
-- 0002/0003/0004/0005/0007/0008/0009). NOT YET APPLIED TO PRODUCTION.
--
-- No CHECK constraints on enum-like columns (status, purpose, lang, etc.),
-- consistent with every other enumerated column in this schema -- validated
-- in Worker code, not at the SQL level (see 0004_enquiry_priority.sql).

-- ---------------------------------------------------------------------
-- Catalogue: which services are purchasable, their prices, and their
-- six-language customer-facing content. Nothing here is a static per-
-- form config file like bi-forms-library/configs/<formId>/ -- it is
-- deliberately backend-managed (staff-editable through the new Staff
-- Portal section), per the explicit requirement for a scalable catalogue
-- rather than hand-coded pages. `active` defaults to 0: a catalogue row
-- existing is not the same thing as a service being approved for
-- customers -- see checkout_payment_settings_log below for the same
-- fail-closed posture applied to QR Ph.
-- ---------------------------------------------------------------------
CREATE TABLE checkout_services (
  id TEXT PRIMARY KEY,
  service_slug TEXT NOT NULL,            -- existing public SERVICE_SLUGS value this falls under (worker/src/routes/enquiries.js)
  bi_form_id TEXT NOT NULL,              -- Forms Library registry id, e.g. 'CCS-A-CDR-2016' -- matches bi-forms-library/configs/<bi_form_id>/
  requires_staff_review INTEGER NOT NULL DEFAULT 1, -- always 1 today; every order still goes through the existing staff BI-form review/approve/publish lifecycle unchanged
  supports_delivery INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,     -- disabled until explicitly approved for customers -- see the Stage 6 report's activation boundary
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_checkout_services_slug ON checkout_services(service_slug);

-- One row per (service, language). English is required for every
-- service (enforced in application code, mirroring questionnaire.json's
-- own "must offer at least en" rule) -- the other five are added as
-- translations are reviewed, so a service is never silently shown with
-- English text to a customer who picked another language once content
-- genuinely exists for it.
CREATE TABLE checkout_service_i18n (
  service_id TEXT NOT NULL REFERENCES checkout_services(id),
  lang TEXT NOT NULL,                    -- en | zh-CN | zh-Hant | ko | ja | vi
  title TEXT NOT NULL,
  short_description TEXT NOT NULL,
  eligibility_text TEXT NOT NULL,
  notices_text TEXT NULL,                -- exclusions / important notices, optional
  PRIMARY KEY (service_id, lang)
);

-- Itemized fee components (service fee, government fee, other), never a
-- single opaque total -- the customer-facing price breakdown (Part IV,
-- "Provide an itemized breakdown before the customer submits payment")
-- is built directly from this table, not computed by guessing a split.
-- Amounts are integer centavos throughout this schema (1 PHP = 100),
-- never a floating-point peso amount, to avoid rounding drift in money
-- math -- see worker/src/lib/money.js.
CREATE TABLE checkout_price_components (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES checkout_services(id),
  component_type TEXT NOT NULL,          -- 'service_fee' | 'government_fee' | 'other'
  label TEXT NOT NULL,                   -- short display label, e.g. "FIS Service Fee"
  amount_php_centavos INTEGER NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_checkout_price_components_service ON checkout_price_components(service_id);

-- ---------------------------------------------------------------------
-- Orders: the one row tying a guest/customer, a catalogue entry, and
-- (once started) the existing applications/bi_form_submissions rows
-- together. application_id/bi_form_submission_id are NULL until the
-- customer actually starts the application step (after email
-- verification) -- at which point an applications row is created FIRST,
-- which is what lets later document uploads satisfy the existing
-- documents.application_id NOT NULL constraint by construction, with no
-- schema change needed there.
-- ---------------------------------------------------------------------
CREATE TABLE checkout_orders (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  application_id TEXT NULL REFERENCES applications(id),
  bi_form_submission_id TEXT NULL REFERENCES bi_form_submissions(id),
  service_id TEXT NOT NULL REFERENCES checkout_services(id),
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | awaiting_payment | awaiting_verification | paid | cancelled | expired
  price_snapshot_json TEXT NULL,         -- set once, server-side, at the review-confirm step; immutable afterwards -- see worker/src/lib/checkout.js computeAndSnapshotPrice()
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NULL                   -- a draft order may expire; not auto-enforced by a scheduled job in this phase, only checked at read time
);

CREATE INDEX idx_checkout_orders_client ON checkout_orders(client_id);
CREATE INDEX idx_checkout_orders_service ON checkout_orders(service_id);
CREATE INDEX idx_checkout_orders_application ON checkout_orders(application_id);

-- Full chronological order-status trail, mirroring application_status_history
-- and bi_form_status_history -- this schema's established convention for
-- an auditable history alongside a single current-status column.
CREATE TABLE checkout_order_status_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES checkout_orders(id),
  status TEXT NOT NULL,
  note TEXT NULL,
  changed_by_staff_email TEXT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_checkout_order_status_history_order ON checkout_order_status_history(order_id, changed_at);

-- ---------------------------------------------------------------------
-- Delivery: address, staff-issued quotation (a SEPARATE charge from the
-- service fee, per Part VI), and an append-only status/tracking trail.
-- The latest row in checkout_delivery_status_history for a given order
-- IS its current delivery status -- the same "history table is the
-- source of truth, not a second redundant status column" pattern this
-- migration already uses for orders, and bi_form_status_history already
-- established.
-- ---------------------------------------------------------------------
CREATE TABLE checkout_delivery_addresses (
  order_id TEXT PRIMARY KEY REFERENCES checkout_orders(id),
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT NOT NULL,
  is_international INTEGER NOT NULL DEFAULT 0,
  region_state_province TEXT NULL,
  city TEXT NOT NULL,
  postal_code TEXT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE checkout_delivery_quotations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES checkout_orders(id),
  amount_php_centavos INTEGER NOT NULL,
  notes TEXT NULL,
  created_by_staff_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_checkout_delivery_quotations_order ON checkout_delivery_quotations(order_id, created_at);

-- status: awaiting_document_completion | ready_for_dispatch |
-- delivery_quotation_issued | awaiting_delivery_payment |
-- delivery_payment_verification | ready_for_shipment | dispatched |
-- delivered | delivery_exception
CREATE TABLE checkout_delivery_status_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES checkout_orders(id),
  status TEXT NOT NULL,
  note TEXT NULL,
  courier TEXT NULL,
  tracking_number TEXT NULL,
  changed_by_staff_email TEXT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_checkout_delivery_status_history_order ON checkout_delivery_status_history(order_id, changed_at);

-- ---------------------------------------------------------------------
-- Payments: reuse the EXISTING payment_requests/payment_proofs tables
-- (0001_init.sql) rather than a parallel structure -- they already have
-- the right shape (amount, description, status, a verifying staff
-- email, reserved gateway columns) and the Client Portal's existing
-- Payments tab already knows how to render them. Two additive columns
-- link a payment_requests row back to the order it belongs to and
-- distinguish WHICH charge it is for, since one order can have two
-- separate payment_requests over its lifetime (the service fee, then
-- later a separate delivery fee, per Part VI -- "Delivery charges are
-- not included in the service fee").
-- ---------------------------------------------------------------------
ALTER TABLE payment_requests ADD COLUMN checkout_order_id TEXT NULL REFERENCES checkout_orders(id);
ALTER TABLE payment_requests ADD COLUMN purpose TEXT NOT NULL DEFAULT 'manual'; -- 'manual' (every existing/staff-created row, unaffected) | 'checkout_service' | 'checkout_delivery'
CREATE INDEX idx_payment_requests_checkout_order ON payment_requests(checkout_order_id);

-- ---------------------------------------------------------------------
-- QR Ph configuration: append-only log, same pattern as the status-
-- history tables above -- the LATEST row by changed_at IS the current
-- configuration, and the whole table IS the audit trail Part V.12
-- requires ("View an audit trail of configuration changes"), with no
-- second, separate audit mechanism needed. An empty table (no rows at
-- all) means QR Ph has never been configured -- the customer payment
-- page must treat that identically to `enabled = 0`: unavailable, never
-- a placeholder/decorative QR code (Part V.12's explicit requirement).
-- ---------------------------------------------------------------------
CREATE TABLE checkout_payment_settings_log (
  id TEXT PRIMARY KEY,
  qr_image_r2_key TEXT NULL,             -- R2 key in the existing CLIENT_FILES bucket, e.g. 'config/qr-ph-instant-services.png'; NULL until an image is uploaded
  merchant_display_name TEXT NULL,
  customer_instructions TEXT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  changed_by_staff_email TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_checkout_payment_settings_log_changed_at ON checkout_payment_settings_log(changed_at);
