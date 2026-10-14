// Instant Services: the authenticated, order-scoped surface a customer
// uses after email verification -- review, start the questionnaire
// (reusing the EXISTING BI-forms customer routes unchanged, see below),
// set a delivery address, and move to payment. Deliberately thin: the
// questionnaire itself (/api/bi-forms/:submissionId/...) and the payment-
// proof upload (/api/applications/:id/payments/:paymentId/proof) are the
// Forms Library's and the existing payments flow's own routes, reused
// as-is once startOrderApplication has created the application +
// submission rows they expect -- nothing here duplicates either.
import { getSessionClient } from "../lib/session.js";
import { json, requireFields } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";
import { newId } from "../lib/crypto.js";
import {
  requireOwnedOrder,
  getServiceById,
  shapeServiceForCustomer,
  startOrderApplication,
  computeAndSnapshotPrice,
  transitionOrder,
  getOrderHistory,
} from "../lib/checkout.js";
import { getSubmissionById } from "../lib/biForms.js";
import { getCurrentPaymentSettings } from "../lib/checkoutPaymentSettings.js";
import { getProvider } from "../lib/paymentGateway.js";
import { centavosToPhp } from "../lib/money.js";

async function requireClient(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");
  return client;
}

// A delivery address may still be set or corrected any time before the
// order is paid; once payment is verified, correcting it is a staff
// action (Part VI's delivery workflow is staff-driven from that point),
// not left open to the customer indefinitely.
const DELIVERY_EDITABLE_STATUSES = new Set(["draft", "awaiting_payment"]);

export async function handleGetOrder(request, env, orderId) {
  const client = await requireClient(request, env);
  const order = await requireOwnedOrder(env.DB, client, orderId);
  const service = await getServiceById(env.DB, order.service_id);
  const shaped = service ? await shapeServiceForCustomer(env.DB, service, client.preferred_communication_language || "en") : null;

  const submission = order.bi_form_submission_id ? await getSubmissionById(env.DB, order.bi_form_submission_id) : null;
  const deliveryAddress = await env.DB.prepare("SELECT * FROM checkout_delivery_addresses WHERE order_id = ?").bind(order.id).first();
  const payment = await env.DB
    .prepare("SELECT id, amount_php, status, created_at, submitted_at, paid_at FROM payment_requests WHERE checkout_order_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(order.id)
    .first();

  return json({
    order: {
      id: order.id,
      status: order.status,
      applicationId: order.application_id,
      submissionId: order.bi_form_submission_id,
      priceSnapshot: order.price_snapshot_json ? JSON.parse(order.price_snapshot_json) : null,
      createdAt: order.created_at,
    },
    service: shaped,
    submissionStatus: submission ? submission.status : null,
    deliveryAddress: deliveryAddress || null,
    payment: payment || null,
  });
}

// Starts (or resumes) the actual application + questionnaire. Idempotent
// -- see startOrderApplication itself. From here on, the customer uses
// the existing /api/bi-forms/:submissionId/* routes directly.
export async function handleStartApplication(request, env, orderId) {
  const client = await requireClient(request, env);
  const order = await requireOwnedOrder(env.DB, client, orderId);
  const service = await getServiceById(env.DB, order.service_id);
  if (!service || !service.active) throw new HttpError(409, "This service is no longer available.");

  const { applicationId, submissionId } = await startOrderApplication(env.DB, order, service);
  return json({ applicationId, submissionId });
}

export async function handleSetDeliveryAddress(request, env, orderId) {
  const client = await requireClient(request, env);
  const order = await requireOwnedOrder(env.DB, client, orderId);
  const service = await getServiceById(env.DB, order.service_id);
  if (!service || !service.supports_delivery) throw new HttpError(409, "This service does not use physical delivery.");
  if (!DELIVERY_EDITABLE_STATUSES.has(order.status)) {
    throw new HttpError(409, `Delivery address can no longer be changed here (order status: ${order.status}). Please contact FIS to update it.`);
  }

  const body = await request.json().catch(() => ({}));
  requireFields(body, ["recipientName", "phone", "country", "city", "addressLine1"]);

  await env.DB.prepare(
    `INSERT INTO checkout_delivery_addresses
      (order_id, recipient_name, phone, country, is_international, region_state_province, city, postal_code, address_line1, address_line2)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(order_id) DO UPDATE SET
       recipient_name = excluded.recipient_name,
       phone = excluded.phone,
       country = excluded.country,
       is_international = excluded.is_international,
       region_state_province = excluded.region_state_province,
       city = excluded.city,
       postal_code = excluded.postal_code,
       address_line1 = excluded.address_line1,
       address_line2 = excluded.address_line2,
       updated_at = datetime('now')`
  )
    .bind(
      order.id,
      String(body.recipientName).trim(),
      String(body.phone).trim(),
      String(body.country).trim(),
      body.isInternational ? 1 : 0,
      body.regionStateProvince ? String(body.regionStateProvince).trim() : null,
      String(body.city).trim(),
      body.postalCode ? String(body.postalCode).trim() : null,
      String(body.addressLine1).trim(),
      body.addressLine2 ? String(body.addressLine2).trim() : null
    )
    .run();

  return json({ ok: true });
}

// The review-confirm step (Part III step 9/10): snapshots the
// server-authoritative price (immutable from here on), requires the
// questionnaire to have actually been submitted and -- for a
// delivery-supporting service -- a delivery address to exist, then
// issues the one payment method currently real: QR Ph, and only if an
// administrator has genuinely configured and enabled it. Never
// fabricates a QR code or price; refuses outright if QR Ph isn't ready.
export async function handleConfirmAndPay(request, env, orderId) {
  const client = await requireClient(request, env);
  const order = await requireOwnedOrder(env.DB, client, orderId);
  if (order.status !== "draft") {
    throw new HttpError(409, `This order is already past the review step (status: ${order.status}).`);
  }

  const service = await getServiceById(env.DB, order.service_id);
  if (!service || !service.active) throw new HttpError(409, "This service is no longer available.");

  if (!order.bi_form_submission_id) throw new HttpError(409, "Please complete the questionnaire before proceeding to payment.");
  const submission = await getSubmissionById(env.DB, order.bi_form_submission_id);
  if (!submission || submission.status === "draft") {
    throw new HttpError(409, "Please submit the questionnaire before proceeding to payment.");
  }

  if (service.supports_delivery) {
    const address = await env.DB.prepare("SELECT 1 FROM checkout_delivery_addresses WHERE order_id = ?").bind(order.id).first();
    if (!address) throw new HttpError(409, "Please provide a delivery address before proceeding to payment.");
  }

  const settings = await getCurrentPaymentSettings(env.DB);
  const qrPh = getProvider("qr_ph");
  if (!qrPh.isConfigured(settings)) {
    throw new HttpError(503, "Online payment is not currently available. Please contact FIS directly to complete this request.");
  }

  const snapshot = await computeAndSnapshotPrice(env.DB, order);
  const intent = await qrPh.createIntent(order, snapshot, settings);

  const paymentId = newId();
  await env.DB.prepare(
    `INSERT INTO payment_requests (id, application_id, amount_php, description, checkout_order_id, purpose)
     VALUES (?, ?, ?, ?, ?, 'checkout_service')`
  )
    .bind(paymentId, order.application_id, centavosToPhp(snapshot.totalPhpCentavos), `Instant Services: ${service.service_slug}`, order.id)
    .run();

  await transitionOrder(env.DB, order, "awaiting_payment");

  return json({
    priceSnapshot: snapshot,
    payment: {
      id: paymentId,
      applicationId: order.application_id,
      amountPhp: centavosToPhp(snapshot.totalPhpCentavos),
      method: intent.method,
      merchantDisplayName: intent.merchantDisplayName,
      instructions: intent.instructions,
    },
  });
}

export async function handleGetOrderHistory(request, env, orderId) {
  const client = await requireClient(request, env);
  const order = await requireOwnedOrder(env.DB, client, orderId);
  const history = await getOrderHistory(env.DB, order.id);
  return json({ history: history.map((h) => ({ status: h.status, note: h.note, changedAt: h.changed_at })) });
}

// Streams the currently-configured QR Ph image. Reuses CLIENT_FILES (the
// same bucket the rest of the app uses) and the existing streamObject
// helper, but -- unlike the legacy hardcoded-key handleGetQrPhImage in
// routes/payments.js -- reads the key from checkout_payment_settings_log,
// so it reflects whatever an administrator actually uploaded for Instant
// Services, and refuses outright (never a placeholder) if disabled or
// never configured.
export async function handleGetQrPhImage(request, env, orderId) {
  const client = await requireClient(request, env);
  await requireOwnedOrder(env.DB, client, orderId);

  const settings = await getCurrentPaymentSettings(env.DB);
  const qrPh = getProvider("qr_ph");
  if (!qrPh.isConfigured(settings)) throw new HttpError(404, "Not found");

  const { streamObject } = await import("../lib/storage.js");
  const response = await streamObject(env.CLIENT_FILES, settings.qr_image_r2_key, "qr-ph-instant-services.png", "image/png");
  if (!response) throw new HttpError(404, "Not found");
  return response;
}
