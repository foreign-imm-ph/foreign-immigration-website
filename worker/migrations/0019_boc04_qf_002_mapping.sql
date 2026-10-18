-- Adds a new draft catalogue entry for BOC04.QF.002 ("Consolidated
-- General Application Form for Non-Immigrant Visa, Special Work Permit
-- and Provisional Work Permit") and links it directly, now that the BI
-- Forms Library engine has a verified, visually-inspected mapping for it
-- (see bi-forms-library/configs/BOC04.QF.002/ and
-- docs/BI_FORMS_LIBRARY_RECONCILIATION.md).
--
-- Unlike BOC04.QF.001 (svc-cgaf-immigrant-visa) and CGAF-003-Rev 2
-- (svc-cgaf-student-visa), no existing draft catalogue row from
-- 0012_phase4_catalogue_expansion.sql's "no form yet" batch already
-- describes this specific subject matter (an employer-sponsored
-- non-immigrant/work-visa application, distinct from the immigrant-visa
-- and student-visa rows already claimed) -- so this migration both
-- inserts the row and links it in one step, following the exact same
-- offering_type/requires_staff_review/supports_delivery/display_order
-- conventions as its 0012 siblings.
--
-- Same policy as every other row in this family: offering_status='draft'
-- and active=0. lib/checkout.js's setOfferingStatus() refuses to move a
-- service to 'active' without an approved, non-zero price, so this row
-- is structurally incapable of becoming customer-purchasable until a
-- real FIS staff member sets a real price AND explicitly activates it
-- through the Staff Portal. Nothing here is reachable by a customer the
-- moment this migration applies.
INSERT INTO checkout_services (id, service_slug, bi_form_id, offering_type, requires_staff_review, supports_delivery, display_order, active, offering_status)
VALUES
  ('svc-cgaf-work-visa', 'visa-applications', 'BOC04.QF.002', 'document_manual', 1, 1, 32, 0, 'draft');

INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, notices_text) VALUES
  ('svc-cgaf-work-visa', 'en', 'Consolidated General Application Form -- Non-Immigrant Visa, Special Work Permit and Provisional Work Permit',
   'Staff-processed filing of the Bureau of Immigration''s consolidated application for a non-immigrant visa, special work permit, or provisional work permit, typically for an employer-sponsored work visa (e.g. 9(g) Pre-Arranged Employment Visa).',
   'For foreign nationals applying for, converting to, or extending a non-immigrant visa or work permit on an employer/petitioner''s behalf, or their authorized representative.',
   'Draft catalogue entry. No automated form pipeline yet; staff prepare and file this manually after payment and intake.');
