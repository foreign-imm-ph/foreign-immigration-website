-- Phase 4, Stage B: expand the real, committed catalogue beyond the two
-- demo rows the dev-only seed provides. Every offering here comes from
-- docs/OFFERING_INVENTORY.md's Phase 4 discovery audit (Sections A-F) --
-- no price, requirement or eligibility claim is invented here that isn't
-- already evidenced there.
--
-- Every row is inserted as offering_status='draft', active=0, with NO
-- price components. This is deliberate and load-bearing, not an
-- oversight: lib/checkout.js's setOfferingStatus() refuses to move a
-- service to 'active' without an approved, non-zero price (see
-- hasApprovedPrice()), so these rows are structurally incapable of
-- becoming customer-purchasable until a real FIS staff member sets a
-- real price AND explicitly activates them through the Staff Portal.
-- Nothing here is reachable by a customer the moment this migration
-- applies.
--
-- bi_form_id uses the empty-string "no form" sentinel (never NULL --
-- see lib/checkout.js's own comment on this convention) for the three
-- new fixed_price_service candidates and the three Airport VIP package
-- rows, exactly as document_manual/bookable_service rows already do.
--
-- English-only i18n content for now, reusing wording already evidenced
-- in the committed service pages / OFFERING_INVENTORY.md -- not invented
-- here. Five-language translation of 17 new catalogue entries is a
-- substantial, separate undertaking from Phase 4's Client Portal
-- localization focus (Stage D) and is flagged as a remaining task in
-- the Phase 4 report, not rushed here.

-- ---------------------------------------------------------------------
-- A. Automated document orders (Type 1 / document_automated)
-- ---------------------------------------------------------------------

INSERT INTO checkout_services (id, service_slug, bi_form_id, offering_type, requires_staff_review, supports_delivery, display_order, active, offering_status)
VALUES
  ('svc-cdr', 'motions-blacklist', 'CCS-A-CDR-2016', 'document_automated', 1, 1, 10, 0, 'draft'),
  -- 2014-13-002 and 2014-13-006: category genuinely ambiguous per
  -- SERVICE_MAPPING.md and OFFERING_INVENTORY.md Section A. Placed on
  -- the single highest-confidence candidate category from that section's
  -- own list so the row exists and is manageable; notices_text states
  -- the mapping is provisional pending a business decision, and nothing
  -- about this provisional category placement is a customer-facing claim
  -- (the row is draft/active=0).
  ('svc-bi-clearance', 'exit-clearance', '2014-13-002', 'document_automated', 1, 0, 11, 0, 'draft'),
  ('svc-travel-records', 'document-verification', '2014-13-006', 'document_automated', 1, 0, 12, 0, 'draft');

INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, notices_text) VALUES
  ('svc-cdr', 'en', 'Certificate of Derogatory Record (CDR)',
   'An official Bureau of Immigration clearance confirming whether any derogatory record exists against you.',
   'For foreign nationals who need to confirm or address a blacklist, watchlist, or derogatory record with the Bureau of Immigration.',
   'Draft catalogue entry pending final price approval. Category mapping confirmed (high confidence).'),
  ('svc-bi-clearance', 'en', 'BI Clearance Certificate',
   'A general Bureau of Immigration clearance certificate.',
   'For foreign nationals who need a general Bureau of Immigration clearance certificate.',
   'Draft catalogue entry pending final price approval. Category placement (exit-clearance) is PROVISIONAL -- motions-blacklist and extensions-compliance are also plausible per SERVICE_MAPPING.md; needs a business decision.'),
  ('svc-travel-records', 'en', 'Request for Travel Records',
   'Official Bureau of Immigration travel records for a foreign national.',
   'For foreign nationals who need an official record of their Philippine travel/immigration history.',
   'Draft catalogue entry pending final price approval. Category placement (document-verification) is PROVISIONAL -- legal-support and exit-clearance are also plausible per SERVICE_MAPPING.md; needs a business decision.');

-- ---------------------------------------------------------------------
-- B. Manually fulfilled document orders (Type 2 / document_manual)
-- Per OFFERING_INVENTORY.md Section B -- reproduction permitted, no
-- duplicate/hold flag, no notarization complication, no automated
-- pipeline built yet.
-- ---------------------------------------------------------------------

INSERT INTO checkout_services (id, service_slug, bi_form_id, offering_type, requires_staff_review, supports_delivery, display_order, active, offering_status)
VALUES
  ('svc-ext-reconsideration', 'extensions-compliance', '', 'document_manual', 1, 1, 20, 0, 'draft'),
  ('svc-acr-icard-cert', 'acr-icard', '', 'document_manual', 1, 1, 21, 0, 'draft'),
  ('svc-travel-pass', 'exit-clearance', '', 'document_manual', 1, 0, 22, 0, 'draft'),
  ('svc-ctc-records', 'document-verification', '', 'document_manual', 1, 1, 23, 0, 'draft'),
  ('svc-ecc-application', 'exit-clearance', '', 'document_manual', 1, 0, 24, 0, 'draft'),
  ('svc-cgaf-immigrant-visa', 'visa-applications', '', 'document_manual', 1, 1, 25, 0, 'draft'),
  ('svc-ntsp', 'motions-blacklist', '', 'document_manual', 1, 1, 26, 0, 'draft'),
  ('svc-cpa-request', 'visa-applications', '', 'document_manual', 1, 1, 27, 0, 'draft'),
  ('svc-cgaf-student-visa', 'visa-applications', '', 'document_manual', 1, 1, 28, 0, 'draft'),
  ('svc-cgaf-tvv-extension', 'extensions-compliance', '', 'document_manual', 1, 1, 29, 0, 'draft');

INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, notices_text) VALUES
  ('svc-ext-reconsideration', 'en', 'Request for Reconsideration on the Updating and Extension of Authorized Stay',
   'Staff-processed filing to reconsider an updating/extension decision on your authorized stay.',
   'For foreign nationals who need to request reconsideration of an authorized-stay extension decision.',
   'Draft catalogue entry. No automated form pipeline; staff prepare and file this manually after payment and intake.'),
  ('svc-acr-icard-cert', 'en', 'ACR I-Card Certification',
   'Staff-processed assistance with ACR I-Card registration, renewal or replacement certification.',
   'For foreign nationals who need to register, renew or replace an Alien Certificate of Registration I-Card.',
   'Draft catalogue entry. No automated form pipeline; staff prepare and file this manually after payment and intake.'),
  ('svc-travel-pass', 'en', 'Travel Pass Application',
   'Staff-processed Travel Pass application for permitted travel.',
   'For foreign nationals who require a Travel Pass for permitted departure/travel circumstances.',
   'Draft catalogue entry. No automated form pipeline; staff prepare and file this manually after payment and intake.'),
  ('svc-ctc-records', 'en', 'Certified True Copy (CTC) of Records',
   'Staff-processed request for a certified true copy of Bureau of Immigration records.',
   'For foreign nationals who need a certified true copy of an existing Bureau of Immigration record.',
   'Draft catalogue entry. No automated form pipeline; staff prepare and file this manually after payment and intake.'),
  ('svc-ecc-application', 'en', 'Emigration Clearance Certificate (ECC) Application',
   'Staff-processed Emigration Clearance Certificate application.',
   'For foreign nationals who require an Emigration Clearance Certificate before departure.',
   'Draft catalogue entry. No automated form pipeline; staff prepare and file this manually after payment and intake.'),
  ('svc-cgaf-immigrant-visa', 'en', 'Consolidated General Application Form -- Immigrant Visa',
   'Staff-processed immigrant visa application filing.',
   'For foreign nationals applying for an immigrant visa pathway.',
   'Draft catalogue entry. No automated form pipeline; staff prepare and file this manually after payment and intake.'),
  ('svc-ntsp', 'en', 'Certificate of Not the Same Person (NTSP)',
   'Staff-processed application confirming you are not the same person as a flagged record.',
   'For foreign nationals who need to establish they are not the same person as an existing blacklist/watchlist record.',
   'Draft catalogue entry. No automated form pipeline; staff prepare and file this manually after payment and intake.'),
  ('svc-cpa-request', 'en', 'Certification of Pending Application',
   'Staff-processed request for certification that an application is pending.',
   'For foreign nationals who need official certification that an immigration application is currently pending.',
   'Draft catalogue entry. No automated form pipeline; staff prepare and file this manually after payment and intake.'),
  ('svc-cgaf-student-visa', 'en', 'Consolidated General Application Form -- Student Visa / Special Study Permit',
   'Staff-processed student visa or special study permit application filing.',
   'For foreign nationals applying for a student visa or special study permit.',
   'Draft catalogue entry. No automated form pipeline; staff prepare and file this manually after payment and intake.'),
  ('svc-cgaf-tvv-extension', 'en', 'CGAF for Extension of Stay of Temporary Visitor''s Visa',
   'Staff-processed Temporary Visitor''s Visa extension filing.',
   'For foreign nationals needing to extend a Temporary Visitor''s Visa.',
   'Draft catalogue entry. No automated form pipeline; staff prepare and file this manually after payment and intake.');

-- ---------------------------------------------------------------------
-- C. Airport VIP packages (Type 3 / bookable_service)
-- Per OFFERING_INVENTORY.md Section D -- committed as real draft rows
-- (the arrival/departure/round-trip packages previously only existed as
-- ephemeral local test fixtures, never migrated data).
-- ---------------------------------------------------------------------

INSERT INTO checkout_services (id, service_slug, bi_form_id, offering_type, requires_staff_review, supports_delivery, display_order, active, offering_status, service_group)
VALUES
  ('svc-airport-vip-arrival', 'airport-vip', '', 'bookable_service', 0, 0, 30, 0, 'draft', 'airport-vip'),
  ('svc-airport-vip-departure', 'airport-vip', '', 'bookable_service', 0, 0, 31, 0, 'draft', 'airport-vip'),
  ('svc-airport-vip-roundtrip', 'airport-vip', '', 'bookable_service', 0, 0, 32, 0, 'draft', 'airport-vip');

INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, notices_text) VALUES
  ('svc-airport-vip-arrival', 'en', 'Airport VIP Meet & Assist -- Arrival',
   'Priority meet-and-assist support through Ninoy Aquino International Airport on arrival.',
   'Available for arriving passengers at NAIA.',
   'Draft catalogue entry pending package pricing approval.'),
  ('svc-airport-vip-departure', 'en', 'Airport VIP Meet & Assist -- Departure',
   'Priority meet-and-assist support through Ninoy Aquino International Airport on departure.',
   'Available for departing passengers at NAIA.',
   'Draft catalogue entry pending package pricing approval.'),
  ('svc-airport-vip-roundtrip', 'en', 'Airport VIP Meet & Assist -- Arrival & Departure (Round Trip)',
   'Priority meet-and-assist support through Ninoy Aquino International Airport on both arrival and departure.',
   'Available for passengers travelling through NAIA in both directions.',
   'Draft catalogue entry pending package pricing approval.');

-- ---------------------------------------------------------------------
-- D. New candidate offerings (Type C / fixed_price_service) -- per
-- OFFERING_INVENTORY.md Section F. Explicitly flagged there as
-- "additional candidate offerings requiring business confirmation", not
-- confirmed existing FIS products -- draft/inactive accordingly.
-- ---------------------------------------------------------------------

INSERT INTO checkout_services (id, service_slug, bi_form_id, offering_type, requires_staff_review, supports_delivery, display_order, active, offering_status)
VALUES
  ('svc-status-review', 'status-review', '', 'fixed_price_service', 1, 0, 40, 0, 'draft'),
  ('svc-lost-passport-record-update', 'lost-passport', '', 'document_manual', 1, 0, 41, 0, 'draft'),
  ('svc-property-transfer-doc-review', 'property-transfer', '', 'fixed_price_service', 1, 0, 42, 0, 'draft');

INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, notices_text) VALUES
  ('svc-status-review', 'en', 'Immigration Status Review',
   'A confidential review of your available immigration information, with a plain-language explanation of your apparent position and recommended next step.',
   'For foreign nationals uncertain of their current Philippine immigration status.',
   'CANDIDATE OFFERING -- not a confirmed FIS product as of this draft. Requires business confirmation of scope, price and exact deliverable before any activation. See docs/OFFERING_INVENTORY.md Section F.'),
  ('svc-lost-passport-record-update', 'en', 'Philippine Immigration Record Update (Replacement Passport)',
   'Staff-processed update of your Philippine immigration record once your replacement passport or travel document has been issued.',
   'For foreign nationals who have already obtained a replacement passport/travel document and need their Philippine immigration record updated to match.',
   'CANDIDATE OFFERING -- not a confirmed FIS product as of this draft. Scoped only to the Philippine-side record update (after embassy/consular replacement is already issued). Requires business confirmation of scope, price and exact deliverable before any activation. See docs/OFFERING_INVENTORY.md Section F.'),
  ('svc-property-transfer-doc-review', 'en', 'Property Transaction Document Review & Readiness Check',
   'A review of the property and transaction documents you already have, identifying outstanding requirements before processing begins.',
   'For individuals with a Philippine property transaction who want their documentation reviewed before formal processing begins.',
   'CANDIDATE OFFERING -- not a confirmed FIS product as of this draft. Requires business confirmation of scope, price and exact deliverable before any activation. See docs/OFFERING_INVENTORY.md Section F.');
