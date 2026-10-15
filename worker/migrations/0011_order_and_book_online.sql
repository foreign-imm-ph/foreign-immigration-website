-- Order & Book Online: purely additive, following the same convention as
-- every migration since 0002. No existing table, column or row is
-- altered, dropped, or rewritten.
--
-- Three additive groups:
--   1. checkout_services gains an offering-type/offering-status model and
--      a `service_group` column (so e.g. three Airport VIP packages can
--      display together), without touching the existing `active` column
--      any existing query already filters on.
--   2. checkout_price_history: an append-only archive of every price
--      change, so staff can see what a service used to cost, who changed
--      it, when, and why -- independent of checkout_orders.price_snapshot_json,
--      which remains the one place an individual CUSTOMER's accepted price
--      is frozen forever.
--   3. airport_vip_* : booking, status history, policy acceptance,
--      rescheduling requests, and refunds for the new bookable-service
--      offering type. A booking's payment still flows through the
--      EXISTING checkout_orders/payment_requests/QR-Ph machinery via
--      checkout_order_id -- this is deliberately not a second payment
--      system.

-- ---------------------------------------------------------------------
-- 1. Offering type/status + grouping
-- ---------------------------------------------------------------------

-- offering_type: 'document_automated' (a real Forms Library questionnaire/
-- coordinate-map exists) | 'document_manual' (staff prepares and files the
-- paperwork by hand) | 'bookable_service' (Airport VIP and similar).
-- Existing rows (the two Instant Checkout demo services) default to
-- 'document_automated', which is factually what they already are.
ALTER TABLE checkout_services ADD COLUMN offering_type TEXT NOT NULL DEFAULT 'document_automated';

-- offering_status is the new source of truth for the catalogue lifecycle
-- ('draft' | 'ready_for_review' | 'active' | 'paused' | 'archived').
-- The existing `active` INTEGER column is kept and still updated in
-- lockstep by application code (setServiceActive / setOfferingStatus)
-- every time offering_status changes, so every existing
-- "WHERE active = 1" query across the codebase keeps working unchanged --
-- offering_status is additive information layered on top, not a
-- replacement requiring every read site to be rewritten.
ALTER TABLE checkout_services ADD COLUMN offering_status TEXT NOT NULL DEFAULT 'draft';

-- Groups related catalogue rows for display -- e.g. the three Airport VIP
-- packages (Arrival Only / Departure Only / Round Trip) share one
-- service_group so the customer-facing catalogue can present them as
-- package choices under one offering rather than three unrelated cards.
-- NULL for a standalone offering (every existing/legacy row).
ALTER TABLE checkout_services ADD COLUMN service_group TEXT NULL;

-- Customer-facing generic price label, e.g. "Document price" or
-- "Service price" -- NULL uses a sensible default chosen from
-- offering_type at render time, so no existing row needs updating.
ALTER TABLE checkout_services ADD COLUMN customer_price_label TEXT NULL;

CREATE INDEX idx_checkout_services_offering_status ON checkout_services(offering_status);
CREATE INDEX idx_checkout_services_service_group ON checkout_services(service_group);

-- Every existing row is already "document_automated" / already reflects
-- its own `active` flag in the new offering_status column, so the two
-- stay consistent from the moment this migration lands, with no backfill
-- step that could silently activate or deactivate anything.
UPDATE checkout_services SET offering_status = CASE WHEN active = 1 THEN 'active' ELSE 'draft' END;

-- ---------------------------------------------------------------------
-- 2. Price history -- append-only, mirrors every other *_history table
-- in this schema. One row per SAVED price change (not per read), storing
-- the full itemized breakdown that was in effect from that point, the
-- staff member who changed it, and an optional reason.
-- ---------------------------------------------------------------------
CREATE TABLE checkout_price_history (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES checkout_services(id),
  components_json TEXT NOT NULL,        -- same shape as a price snapshot's "components" array
  total_php_centavos INTEGER NOT NULL,
  changed_by_staff_email TEXT NOT NULL,
  reason TEXT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_checkout_price_history_service ON checkout_price_history(service_id, changed_at);

-- ---------------------------------------------------------------------
-- 3. Airport VIP Meet & Assist -- bookable-service support
-- ---------------------------------------------------------------------

-- status: submitted | awaiting_payment_verification | payment_verified |
-- availability_under_review | confirmed | reschedule_requested |
-- rescheduled | completed | cancelled | refund_pending | refunded
CREATE TABLE airport_vip_bookings (
  id TEXT PRIMARY KEY,
  checkout_order_id TEXT NOT NULL REFERENCES checkout_orders(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  service_id TEXT NOT NULL REFERENCES checkout_services(id),  -- which package (Arrival/Departure/Round Trip)
  direction TEXT NOT NULL,              -- 'arrival' | 'departure' | 'both'
  passenger_count INTEGER NOT NULL DEFAULT 1,
  passenger_names_json TEXT NOT NULL,   -- JSON array of strings
  airport TEXT NOT NULL,
  terminal TEXT NULL,
  airline TEXT NOT NULL,
  flight_number TEXT NOT NULL,
  flight_route TEXT NULL,
  -- The originally scheduled flight departure, in UTC -- the single
  -- timestamp the 120-hour rescheduling rule is always computed against
  -- (worker/src/lib/airportVipPolicy.js), per the directive's own
  -- "original scheduled departure minus 120 hours" wording. Never
  -- recomputed or overwritten after a reschedule -- see
  -- airport_vip_reschedule_requests.original_scheduled_departure_utc,
  -- which copies it forward immutably for that request's own audit trail.
  scheduled_departure_utc TEXT NOT NULL,
  scheduled_local_date TEXT NOT NULL,    -- as entered by the customer, display only
  scheduled_local_time TEXT NOT NULL,    -- as entered by the customer, display only
  scheduled_timezone TEXT NOT NULL,      -- IANA zone used to derive scheduled_departure_utc, preserved for audit/display
  special_requirements TEXT NULL,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_airport_vip_bookings_order ON airport_vip_bookings(checkout_order_id);
CREATE INDEX idx_airport_vip_bookings_client ON airport_vip_bookings(client_id);
CREATE INDEX idx_airport_vip_bookings_status ON airport_vip_bookings(status);

CREATE TABLE airport_vip_booking_status_history (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES airport_vip_bookings(id),
  status TEXT NOT NULL,
  note TEXT NULL,
  changed_by_staff_email TEXT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_airport_vip_booking_status_history_booking ON airport_vip_booking_status_history(booking_id, changed_at);

-- One row per explicit customer acceptance of the booking policy, at the
-- exact moment of payment submission -- an auditable record distinct
-- from "the website had a terms link somewhere". policy_version lets a
-- future policy wording change be distinguished from what THIS customer
-- actually agreed to.
CREATE TABLE airport_vip_policy_acceptances (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES airport_vip_bookings(id),
  policy_version TEXT NOT NULL,
  original_scheduled_departure_utc TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_agent TEXT NULL
);

CREATE INDEX idx_airport_vip_policy_acceptances_booking ON airport_vip_policy_acceptances(booking_id);

-- eligible_under_policy is computed ONCE, at request time, from the
-- 120-hour rule (worker/src/lib/airportVipPolicy.js) and never silently
-- recalculated later -- what the customer was told at submission time is
-- what staff sees when they review it, even if they review it days later.
CREATE TABLE airport_vip_reschedule_requests (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES airport_vip_bookings(id),
  original_scheduled_departure_utc TEXT NOT NULL,
  requested_at_utc TEXT NOT NULL DEFAULT (datetime('now')),
  notice_hours_computed REAL NOT NULL,
  eligible_under_policy INTEGER NOT NULL,
  proposed_flight_json TEXT NOT NULL,
  customer_note TEXT NULL,
  staff_decision TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | exception_approved
  staff_decided_by TEXT NULL,
  staff_decided_at TEXT NULL,
  staff_note TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_airport_vip_reschedule_requests_booking ON airport_vip_reschedule_requests(booking_id, created_at);

CREATE TABLE airport_vip_refunds (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES airport_vip_bookings(id),
  reason TEXT NOT NULL,
  requested_amount_php_centavos INTEGER NOT NULL,
  approved_amount_php_centavos INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'requested',  -- requested | approved | processing | completed | declined
  method TEXT NULL,
  transaction_reference TEXT NULL,
  notes TEXT NULL,
  created_by_staff_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT NULL
);

CREATE INDEX idx_airport_vip_refunds_booking ON airport_vip_refunds(booking_id);
