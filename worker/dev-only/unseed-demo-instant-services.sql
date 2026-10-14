-- Removes everything seed-demo-instant-services.sql creates, plus any
-- orders/clients/applications generated while exercising them locally.
-- Local-only; never run with --remote.
--
-- Apply with:
--   npx wrangler d1 execute fis-backend --local --file=dev-only/unseed-demo-instant-services.sql

DELETE FROM payment_proofs WHERE payment_request_id IN (
  SELECT id FROM payment_requests WHERE checkout_order_id IN (
    SELECT id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service')
  )
);
DELETE FROM payment_requests WHERE checkout_order_id IN (
  SELECT id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service')
);
DELETE FROM checkout_delivery_status_history WHERE order_id IN (
  SELECT id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service')
);
DELETE FROM checkout_delivery_quotations WHERE order_id IN (
  SELECT id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service')
);
DELETE FROM checkout_delivery_addresses WHERE order_id IN (
  SELECT id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service')
);
DELETE FROM checkout_order_status_history WHERE order_id IN (
  SELECT id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service')
);

DELETE FROM documents WHERE application_id IN (
  SELECT application_id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service') AND application_id IS NOT NULL
);
DELETE FROM bi_form_status_history WHERE bi_form_submission_id IN (
  SELECT bi_form_submission_id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service') AND bi_form_submission_id IS NOT NULL
);
DELETE FROM bi_form_submissions WHERE id IN (
  SELECT bi_form_submission_id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service') AND bi_form_submission_id IS NOT NULL
);
DELETE FROM application_status_history WHERE application_id IN (
  SELECT application_id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service') AND application_id IS NOT NULL
);
DELETE FROM applications WHERE id IN (
  SELECT application_id FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service') AND application_id IS NOT NULL
);

DELETE FROM checkout_orders WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service');
DELETE FROM checkout_price_components WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service');
DELETE FROM checkout_service_i18n WHERE service_id IN ('demo-cdr-service', 'demo-biclearance-service');
DELETE FROM checkout_services WHERE id IN ('demo-cdr-service', 'demo-biclearance-service');

DELETE FROM checkout_payment_settings_log WHERE changed_by_staff_email = 'demo-admin@fis-instant-services.local';
DELETE FROM staff WHERE id = 'demo-admin-staff';
