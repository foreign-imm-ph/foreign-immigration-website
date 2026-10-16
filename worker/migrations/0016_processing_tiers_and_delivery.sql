-- Dual processing tiers (Express/Regular) for document services. Purely
-- additive -- see 0010/0011/0012/0013 for the established convention. The
-- new columns exist on every checkout_services row but are only ever read
-- for offering_type IN ('document_automated', 'document_manual') --
-- bookable_service (Airport VIP) and fixed_price_service keep using
-- checkout_price_components exactly as before; nothing about that path
-- changes here.
--
-- NULL price/lead-time columns mean "not yet configured by the owner" --
-- never confused with an explicit zero price, which is a real (if
-- unusual) approved amount. Both tiers default enabled = 1 on every row,
-- including pre-existing non-document offerings, per the explicit
-- "Express enabled by default... Regular enabled by default" business
-- rule -- harmless for a non-document row, since this flag is simply
-- never read for those offering types.
ALTER TABLE checkout_services ADD COLUMN express_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE checkout_services ADD COLUMN express_price_php_centavos INTEGER NULL;
ALTER TABLE checkout_services ADD COLUMN express_min_business_days INTEGER NULL;
ALTER TABLE checkout_services ADD COLUMN express_max_business_days INTEGER NULL;
ALTER TABLE checkout_services ADD COLUMN regular_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE checkout_services ADD COLUMN regular_price_php_centavos INTEGER NULL;
ALTER TABLE checkout_services ADD COLUMN regular_min_business_days INTEGER NULL;
ALTER TABLE checkout_services ADD COLUMN regular_max_business_days INTEGER NULL;

-- Provenance flag, set only by the backfill UPDATE below, never by
-- application code -- lets the Staff Portal editor show "this Regular
-- price was carried over from this service's previous single price;
-- please confirm it's still correct" for exactly the rows this migration
-- actually touched, and nowhere else. Cleared the next time staff save
-- the tier form (worker/src/lib/checkout.js updateProcessingTiers) --
-- saving the form IS the confirmation, the same pattern the translation
-- review flag already uses (lib/checkoutTranslation.js).
ALTER TABLE checkout_services ADD COLUMN regular_price_migrated_from_legacy INTEGER NOT NULL DEFAULT 0;

-- Safe, provenance-preserving carry-over: a document-type offering that
-- already had an itemized price (checkout_price_components summing to a
-- positive amount -- true of none of the 19 real offerings today, since
-- every one remains an unpriced draft, but this is a general data-
-- integrity rule, not a one-off fix for current data) gets that total
-- copied into REGULAR Processing only. Express is never auto-populated --
-- a customer must not be charged a legacy single price as though it were
-- a reviewed Express rate. offering_status/active/approved_at are
-- untouched here: the existing approval gate (setOfferingStatus) already
-- requires a fresh explicit approval before any priced row can become
-- active, so this backfill cannot itself make anything purchasable, and
-- the new activation gate below additionally requires the tier itself to
-- have a valid lead-time range, which this backfill deliberately does
-- NOT invent.
UPDATE checkout_services
SET regular_price_php_centavos = (
      SELECT SUM(amount_php_centavos) FROM checkout_price_components WHERE service_id = checkout_services.id
    ),
    regular_price_migrated_from_legacy = 1
WHERE offering_type IN ('document_automated', 'document_manual')
  AND EXISTS (SELECT 1 FROM checkout_price_components WHERE service_id = checkout_services.id)
  AND (SELECT SUM(amount_php_centavos) FROM checkout_price_components WHERE service_id = checkout_services.id) > 0;

-- Durable per-order record of which tier the customer actively selected,
-- set once (before the order is confirmed/paid) and immutable afterwards
-- in practice (application code never updates it past that point -- see
-- handleSetProcessingTier's editable-window check). The frozen PRICE and
-- lead-time terms the customer actually agreed to live in the existing
-- price_snapshot_json (set once, at confirm-and-pay, already immutable);
-- this column is what lets the Staff Portal order list/detail query and
-- display the selected tier directly, without parsing JSON. NULL for
-- every order whose service does not use processing tiers.
ALTER TABLE checkout_orders ADD COLUMN processing_tier TEXT NULL;
