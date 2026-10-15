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
  publicPriceSnapshot,
  transitionOrder,
  getOrderHistory,
} from "../lib/checkout.js";
import { getSubmissionById } from "../lib/biForms.js";
import { getCurrentPaymentSettings } from "../lib/checkoutPaymentSettings.js";
import { getProvider } from "../lib/paymentGateway.js";
import { centavosToPhp } from "../lib/money.js";
import { getLocalizedBookingStatusLabel, getLocalizedRefundStatusLabel } from "../lib/clientLocaleStrings.js";

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
  const application = order.application_id
    ? await env.DB.prepare("SELECT reference FROM applications WHERE id = ?").bind(order.application_id).first()
    : null;
  const deliveryAddress = await env.DB.prepare("SELECT * FROM checkout_delivery_addresses WHERE order_id = ?").bind(order.id).first();
  const paymentRow = await env.DB
    .prepare("SELECT id, application_id, amount_php, purpose, status, created_at, submitted_at, paid_at FROM payment_requests WHERE checkout_order_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(order.id)
    .first();

  // The payment screen needs the staff-configured merchant name/
  // instructions on every load (a page refresh, a re-visit from the
  // confirmation email), not only right after confirm-and-pay -- so this
  // is attached here, from the CURRENT settings, rather than snapshotted
  // once onto the payment_requests row itself.
  let payment = null;
  if (paymentRow) {
    const settings = await getCurrentPaymentSettings(env.DB);
    payment = {
      id: paymentRow.id,
      applicationId: paymentRow.application_id,
      amountPhp: paymentRow.amount_php,
      purpose: paymentRow.purpose,
      status: paymentRow.status,
      submittedAt: paymentRow.submitted_at,
      paidAt: paymentRow.paid_at,
      merchantDisplayName: settings.merchant_display_name,
      instructions: settings.customer_instructions,
    };
  }

  return json({
    order: {
      id: order.id,
      // Customer-facing displays must show this human-readable reference
      // (e.g. "FIS-2026-KB7T8"), never the internal order UUID -- order.id
      // remains here only as a fallback for the rare order with no linked
      // application yet (shouldn't normally be reachable by a customer).
      reference: application ? application.reference : order.id,
      status: order.status,
      applicationId: order.application_id,
      submissionId: order.bi_form_submission_id,
      priceSnapshot: order.price_snapshot_json ? publicPriceSnapshot(JSON.parse(order.price_snapshot_json)) : null,
      createdAt: order.created_at,
    },
    service: shaped,
    submissionStatus: submission ? submission.status : null,
    deliveryAddress: deliveryAddress || null,
    payment,
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

  if (service.offering_type === "bookable_service") {
    // A bookable service has no questionnaire -- its gate is a booking
    // (flight/passenger details) plus an explicit policy acceptance,
    // both required before payment, mirroring the document flow's own
    // "questionnaire submitted" + "delivery address present" gates.
    const { getBookingByOrderId, getPolicyAcceptance } = await import("../lib/airportVip.js");
    const booking = await getBookingByOrderId(env.DB, order.id);
    if (!booking) throw new HttpError(409, "Please complete the booking details before proceeding to payment.");
    const acceptance = await getPolicyAcceptance(env.DB, booking.id);
    if (!acceptance) throw new HttpError(409, "Please accept the booking policy before proceeding to payment.");
  } else if (service.offering_type === "document_manual") {
    // A staff-processed document has no automated questionnaire to
    // submit -- its only gate before payment is the application having
    // actually been started (see startOrderApplication).
    if (!order.application_id) throw new HttpError(409, "Please start your request before proceeding to payment.");
  } else {
    if (!order.bi_form_submission_id) throw new HttpError(409, "Please complete the questionnaire before proceeding to payment.");
    const submission = await getSubmissionById(env.DB, order.bi_form_submission_id);
    if (!submission || submission.status === "draft") {
      throw new HttpError(409, "Please submit the questionnaire before proceeding to payment.");
    }
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

  if (service.offering_type === "bookable_service") {
    const { getBookingByOrderId, transitionBooking } = await import("../lib/airportVip.js");
    const booking = await getBookingByOrderId(env.DB, order.id);
    if (booking && booking.status === "submitted") {
      await transitionBooking(env.DB, booking, "awaiting_payment_verification");
    }
  }

  return json({
    priceSnapshot: publicPriceSnapshot(snapshot),
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

// Customer-facing receipt/transaction record (Part VII §17 of the Order
// & Book Online directive). Deliberately reuses everything that already
// exists rather than building a second reporting surface: the order's
// own immutable price_snapshot_json (via publicPriceSnapshot -- NEVER
// the itemized components), the application's reference, the existing
// payment_requests rows (service fee + delivery, kept separate), and --
// for Airport VIP -- the booking and any refund record. The one new
// thing this function does is translate a raw payment/refund status
// into receipt-safe wording: an unverified payment is never described
// as paid, and a requested-but-incomplete refund is never described as
// completed.
function receiptPaymentStatus(payment) {
  if (!payment) return "No payment submitted yet";
  if (payment.status === "paid") return "Payment verified";
  if (payment.status === "submitted") return "Payment submitted, awaiting verification";
  return "Payment pending";
}

export async function handleGetOrderReceipt(request, env, orderId) {
  const client = await requireClient(request, env);
  const order = await requireOwnedOrder(env.DB, client, orderId);
  const service = await getServiceById(env.DB, order.service_id);
  const shaped = service ? await shapeServiceForCustomer(env.DB, service, client.preferred_communication_language || "en") : null;

  const application = order.application_id
    ? await env.DB.prepare("SELECT reference FROM applications WHERE id = ?").bind(order.application_id).first()
    : null;

  const servicePayment = await env.DB
    .prepare("SELECT status, amount_php, submitted_at, paid_at FROM payment_requests WHERE checkout_order_id = ? AND purpose = 'checkout_service' ORDER BY created_at DESC LIMIT 1")
    .bind(order.id)
    .first();
  const deliveryPayment = await env.DB
    .prepare("SELECT status, amount_php, submitted_at, paid_at FROM payment_requests WHERE checkout_order_id = ? AND purpose = 'checkout_delivery' ORDER BY created_at DESC LIMIT 1")
    .bind(order.id)
    .first();

  let booking = null;
  if (service && service.offering_type === "bookable_service") {
    const { getBookingByOrderId, getRefundsForBooking } = await import("../lib/airportVip.js");
    const bookingRow = await getBookingByOrderId(env.DB, order.id);
    if (bookingRow) {
      const refunds = await getRefundsForBooking(env.DB, bookingRow.id);
      const latestRefund = refunds[0] || null;
      const lang = client.preferred_communication_language || "en";
      booking = {
        direction: bookingRow.direction,
        airline: bookingRow.airline,
        flightNumber: bookingRow.flight_number,
        scheduledLocalDate: bookingRow.scheduled_local_date,
        scheduledLocalTime: bookingRow.scheduled_local_time,
        status: bookingRow.status,
        statusLabel: getLocalizedBookingStatusLabel(bookingRow.status, lang),
        refundStatus: latestRefund ? latestRefund.status : null,
        refundStatusLabel: latestRefund ? getLocalizedRefundStatusLabel(latestRefund.status, lang) : null,
        refundAmountPhpCentavos: latestRefund && latestRefund.approved_amount_php_centavos != null ? latestRefund.approved_amount_php_centavos : null,
      };
    }
  }

  return json({
    orderId: order.id,
    reference: application ? application.reference : order.id,
    createdAt: order.created_at,
    customerName: client.full_name,
    service: shaped ? { title: shaped.title, priceLabel: shaped.priceLabel, offeringType: shaped.offeringType } : null,
    priceSnapshot: order.price_snapshot_json ? publicPriceSnapshot(JSON.parse(order.price_snapshot_json)) : null,
    payment: {
      statusText: receiptPaymentStatus(servicePayment),
      amountPhp: servicePayment ? servicePayment.amount_php : null,
      paidAt: servicePayment ? servicePayment.paid_at : null,
    },
    delivery: deliveryPayment
      ? { statusText: receiptPaymentStatus(deliveryPayment), amountPhp: deliveryPayment.amount_php, paidAt: deliveryPayment.paid_at }
      : null,
    booking,
  });
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
