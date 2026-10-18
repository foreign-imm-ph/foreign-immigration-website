-- Directive section 4: reconcile BI forms that the engine can now render
-- (see docs/BI_FORMS_LIBRARY_RECONCILIATION.md) against the draft
-- catalogue rows 0012_phase4_catalogue_expansion.sql already created with
-- the '' "no form yet" sentinel. Each of the 7 forms below has an
-- unambiguous 1:1 title match against an EXISTING draft row -- same
-- subject matter, same document, confirmed by direct comparison of the
-- form's own formTitle (bi-forms-library/configs/<id>/coordinate-map.json)
-- against that row's checkout_service_i18n.title. No new offering is
-- created here, per explicit instruction: this migration only sets
-- bi_form_id on rows that already existed.
--
-- offering_type is deliberately left at 'document_manual' for all seven --
-- linking a form only makes the (already-existing, offering_type-agnostic)
-- official blank-form preview available, per
-- checkoutPublic.js/usesProcessingTiers and biFormEngine.js's
-- PREVIEWABLE_FORM_IDS (all 7 of these ids are already listed there).
-- It does NOT switch these services onto the automated questionnaire
-- pipeline -- lib/checkout.js's startOrderApplication() gates that
-- strictly on offering_type === 'document_automated', so staff continue
-- to prepare and file these manually exactly as before. Whether to
-- promote any of these to offering_type='document_automated' (enabling
-- the customer self-service wizard) is a separate fulfillment-model
-- decision for FIS to make per form, not inferred here.
--
-- Every row stays offering_status='draft', active=0, completely
-- unaffected by this migration -- lib/checkout.js's setOfferingStatus()
-- still refuses activation without an approved, non-zero price.
--
-- The 8th previously-unlinked form, CGAF-002-Rev3, is NOT included here.
-- Unlike the 7 below, no existing draft row describes its subject matter:
-- the one row with matching text (svc-cgaf-work-visa) was already linked
-- to a DIFFERENT form, BOC04.QF.002, by 0019_boc04_qf_002_mapping.sql --
-- and docs/BI_FORMS_LIBRARY_RECONCILIATION.md section D.1 records FIS's
-- own explicit instruction that the two forms are genuinely distinct,
-- both still in independent use at different BI counters, and must never
-- be substituted for one another. CGAF-002-Rev3 therefore has no row to
-- link to; giving it one would mean creating a new offering, which is
-- exactly what this pass was told not to do. See the launch-readiness
-- report's owner-approval list for the ready-to-apply follow-up
-- migration once FIS confirms it as a real, separately sellable product.
UPDATE checkout_services SET bi_form_id = 'CCS-A-NTSP-2016', updated_at = datetime('now') WHERE id = 'svc-ntsp';
UPDATE checkout_services SET bi_form_id = '2014-01-011', updated_at = datetime('now') WHERE id = 'svc-ext-reconsideration';
UPDATE checkout_services SET bi_form_id = '2014-08-015', updated_at = datetime('now') WHERE id = 'svc-acr-icard-cert';
UPDATE checkout_services SET bi_form_id = '2021-03-001', updated_at = datetime('now') WHERE id = 'svc-travel-pass';
UPDATE checkout_services SET bi_form_id = 'ADM05.QF.001', updated_at = datetime('now') WHERE id = 'svc-ctc-records';
UPDATE checkout_services SET bi_form_id = 'ARD04.QF.003', updated_at = datetime('now') WHERE id = 'svc-ecc-application';
UPDATE checkout_services SET bi_form_id = 'IRD04.QF.004', updated_at = datetime('now') WHERE id = 'svc-cgaf-tvv-extension';
