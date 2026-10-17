-- Links the existing draft 'svc-cgaf-immigrant-visa' catalogue entry
-- (inserted with the empty-string "no form yet" bi_form_id sentinel in
-- 0012_phase4_catalogue_expansion.sql) to BOC04.QF.001, now that the BI
-- Forms Library engine has a verified, visually-inspected mapping for it
-- (see bi-forms-library/configs/BOC04.QF.001/ and
-- docs/BI_FORMS_LIBRARY_RECONCILIATION.md). This is the Bureau of
-- Immigration's own "Consolidated General Application Form for Immigrant
-- Visa", exactly the form this catalogue entry's title already describes.
--
-- Purely additive and narrow: only bi_form_id changes. active and
-- offering_status are left completely untouched (still 0 / 'draft') --
-- linking the automation engine is a prerequisite for someone to later
-- decide to activate this offering, not an activation decision itself.
UPDATE checkout_services
SET bi_form_id = 'BOC04.QF.001'
WHERE id = 'svc-cgaf-immigrant-visa';
