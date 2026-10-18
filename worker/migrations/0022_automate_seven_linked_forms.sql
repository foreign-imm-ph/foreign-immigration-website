-- FIS Final Automation Integration directive, item 1: FIS's stated
-- business preference is automation-first (with assisted completion
-- still available) for any form the shared engine can already render.
-- All 7 forms linked by 0021_link_unmapped_bi_forms.sql were audited
-- against the SAME safety bar the already-live document_automated form
-- (CCS-A-CDR-2016/svc-cdr) already meets, not a lighter one:
--
--   - Fully registered in worker/src/lib/biFormEngine.js's REGISTRY
--     (schema-validated at module load by validateForm -- any broken
--     config would already be failing every BI-form request, not just
--     these 7, so passing this bar is already continuously verified).
--   - Every field is customer-fillable text/select (no exotic field
--     type the existing wizard doesn't already handle for other live
--     forms).
--   - Every wet-ink signature requirement is marked
--     suppliedBy:"customer_wet_ink", visibleTo:["staff"] in the form's
--     own signatureBlock -- identical to CCS-A-CDR-2016's own
--     signatureBlock. The engine never attempts to automate a
--     signature for ANY form, so this directive's instruction to
--     "retain staff intervention for... signatures and
--     government-controlled steps" was already structurally
--     guaranteed before this migration and remains so after it.
--   - Any staff-only subsection (CCS-A-NTSP-2016, 2014-08-015 and
--     ADM05.QF.001 each have 2) uses the same biOnlySections
--     mechanism already live for CCS-A-CDR-2016 -- staff completes
--     these through the existing Staff Portal exception workflow
--     (staffBiForms.js), not a new one.
--   - Any supporting document a form's own off-form instructions call
--     for (e.g. CCS-A-NTSP-2016's and IRD04.QF.004's 2x2 photo) is
--     uploaded through the existing generic bi_form_submission
--     document-upload feature, not a new upload mechanism -- the
--     physical photo/signature itself is still provided in person,
--     exactly as each form's own offFormInstructions already states.
--
-- This migration therefore only flips offering_type; bi_form_id
-- (already set by 0021) and requires_staff_review (already 1 for all
-- 7) are unchanged. Nothing here changes what the Bureau of
-- Immigration requires, automates a signature, or implies formal
-- government submission happens automatically -- it only lets the
-- customer complete the SAME form online instead of staff re-typing
-- their answers from an enquiry, with staff still reviewing, handling
-- exceptions, and producing the final document exactly as the
-- existing document_automated flow for CCS-A-CDR-2016 already does.
--
-- Every row stays offering_status='draft', active=0, completely
-- unaffected -- lib/checkout.js's setOfferingStatus() still refuses
-- activation without an approved, non-zero price.
UPDATE checkout_services SET offering_type = 'document_automated', updated_at = datetime('now') WHERE id = 'svc-ntsp';
UPDATE checkout_services SET offering_type = 'document_automated', updated_at = datetime('now') WHERE id = 'svc-ext-reconsideration';
UPDATE checkout_services SET offering_type = 'document_automated', updated_at = datetime('now') WHERE id = 'svc-acr-icard-cert';
UPDATE checkout_services SET offering_type = 'document_automated', updated_at = datetime('now') WHERE id = 'svc-travel-pass';
UPDATE checkout_services SET offering_type = 'document_automated', updated_at = datetime('now') WHERE id = 'svc-ctc-records';
UPDATE checkout_services SET offering_type = 'document_automated', updated_at = datetime('now') WHERE id = 'svc-ecc-application';
UPDATE checkout_services SET offering_type = 'document_automated', updated_at = datetime('now') WHERE id = 'svc-cgaf-tvv-extension';

-- Staff-facing notices_text (checkoutTranslation.js/staffCheckout.js --
-- never shown to customers, see routes/staffCheckout.js) still said "No
-- automated form pipeline; staff prepare and file this manually" for
-- all 7 rows -- now false and actively misleading to staff using the
-- Staff Portal to decide how to handle an order. Updated to describe
-- the actual, new state accurately. English-only, matching how this
-- column has always been populated for every draft row in this family
-- (see 0012's own header comment on i18n scope) -- not customer-facing
-- copy, so no 6-language translation is required here.
UPDATE checkout_service_i18n SET notices_text = 'Draft catalogue entry. Automated questionnaire pipeline available (assisted completion offered); staff still reviews, handles exceptions, and finalizes the document before release.'
  WHERE lang = 'en' AND service_id IN ('svc-ntsp', 'svc-ext-reconsideration', 'svc-acr-icard-cert', 'svc-travel-pass', 'svc-ctc-records', 'svc-ecc-application', 'svc-cgaf-tvv-extension');
