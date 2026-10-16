// Instant Services Orders: the Staff Portal section for everything Part
// VII §20 asks for -- reviewing orders, verifying/rejecting payment,
// managing delivery quotations/status, configuring QR Ph, and managing
// the catalogue. Deliberately one module (mirrors staffBiForms.js's
// pattern of a self-contained feature file wired into staff.js), rather
// than three separate ones, since orders/payments/delivery are all one
// reviewer's workflow on the same record.
import { staffPage, escapeHtml } from "../lib/staffHtml.js";
import { HttpError, streamObject, sniffContentType } from "../lib/storage.js";
import { logAudit } from "../lib/db.js";
import { newId } from "../lib/crypto.js";
import { centavosToPhpString, phpStringToCentavos } from "../lib/money.js";
import {
  getOrderById,
  listOrdersForStaff,
  getServiceById,
  getServiceI18n,
  getPriceComponents,
  getOrderHistory,
  transitionOrder,
  ORDER_STATUSES,
  DELIVERY_STATUSES,
  OFFERING_TYPES,
  OFFERING_STATUSES,
  recordDeliveryStatus,
  getCurrentDeliveryStatus,
  getDeliveryStatusHistory,
  getDeliveryQuotations,
  listAllServicesForStaff,
  createService,
  updateServiceMeta,
  setServiceActive,
  setOfferingStatus,
  upsertServiceI18n,
  replacePriceComponents,
  updatePriceComponentsWithHistory,
  getPriceHistory,
} from "../lib/checkout.js";
import { ensureServiceTranslations, generateTranslationPreview, reconcileKeep, applyRegeneratedTranslation } from "../lib/checkoutTranslation.js";
import { getSubmissionById } from "../lib/biForms.js";
import { getCurrentPaymentSettings, getPaymentSettingsHistory, recordPaymentSettingsChange } from "../lib/checkoutPaymentSettings.js";
import { getProvider } from "../lib/paymentGateway.js";
import { sendPaymentRequestNotification } from "../lib/email.js";

const CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];
const LANGUAGE_LABELS = { en: "English", "zh-CN": "Simplified Chinese", "zh-Hant": "Traditional Chinese", ko: "Korean", ja: "Japanese", vi: "Vietnamese" };

function notFound() {
  return new Response("Not found", { status: 404 });
}

// Returns a 403 Response if `staff` isn't an admin, or null otherwise --
// a Response, not a throw, matching staff.js's own deleteEnquiry
// convention for the same kind of role check.
function adminOnlyResponse(staff) {
  if (staff.role !== "admin") {
    return new Response("This action requires administrator authorization.", { status: 403 });
  }
  return null;
}

async function requireOrder(env, orderId) {
  const order = await getOrderById(env.DB, orderId);
  if (!order) throw new HttpError(404, "Not found");
  return order;
}

function redirectTo(request, path) {
  return Response.redirect(`${new URL(request.url).origin}${path}`, 303);
}

// ---------------------------------------------------------------------
// Orders list + detail
// ---------------------------------------------------------------------

export async function listOrders(env, staff, url) {
  const status = url.searchParams.get("status") || undefined;
  const orders = await listOrdersForStaff(env.DB, { status });
  const rows = orders
    .map(
      (o) => `<tr>
        <td><a class="ref" href="/staff/instant-services/orders/${o.id}">${escapeHtml(o.id.slice(0, 8))}</a></td>
        <td>${escapeHtml(o.client_full_name)}<br><span class="muted">${escapeHtml(o.client_email)}</span></td>
        <td><span class="status">${escapeHtml(o.status)}</span></td>
        <td class="muted">${escapeHtml(o.updated_at)}</td>
      </tr>`
    )
    .join("");
  return staffPage(
    "Instant Services Orders",
    `<h1>Instant Services Orders</h1>
     <div class="filter-bar">
       <a href="/staff/instant-services/orders/">All</a> |
       ${ORDER_STATUSES.map((s) => `<a href="/staff/instant-services/orders/?status=${s}"${status === s ? ' class="filter-active"' : ""}>${s}</a>`).join(" ")}
     </div>
     <div class="table-scroll"><table>
       <tr><th>Order</th><th>Client</th><th>Status</th><th>Updated</th></tr>
       ${rows || '<tr><td colspan="4" class="muted">No Instant Services orders yet.</td></tr>'}
     </table></div>`,
    staff.email
  );
}

export async function viewOrder(env, staff, orderId) {
  const order = await requireOrder(env, orderId);
  const service = await getServiceById(env.DB, order.service_id);
  const client = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(order.client_id).first();
  const submission = order.bi_form_submission_id ? await getSubmissionById(env.DB, order.bi_form_submission_id) : null;
  const deliveryAddress = await env.DB.prepare("SELECT * FROM checkout_delivery_addresses WHERE order_id = ?").bind(order.id).first();
  const { results: payments } = await env.DB.prepare("SELECT * FROM payment_requests WHERE checkout_order_id = ? ORDER BY created_at DESC").bind(order.id).all();
  const history = await getOrderHistory(env.DB, order.id);
  const deliveryStatus = await getCurrentDeliveryStatus(env.DB, order.id);
  const deliveryHistory = await getDeliveryStatusHistory(env.DB, order.id);
  const quotations = await getDeliveryQuotations(env.DB, order.id);

  const snapshot = order.price_snapshot_json ? JSON.parse(order.price_snapshot_json) : null;

  const paymentRows = payments
    .map((p) => {
      const actions = [];
      if (p.status === "submitted") {
        actions.push(`<form method="POST" action="/staff/instant-services/orders/${order.id}/payments/${p.id}/verify"><button type="submit">Verify &amp; mark paid</button></form>`);
        actions.push(`<form method="POST" action="/staff/instant-services/orders/${order.id}/payments/${p.id}/reject"><label for="reject-note-${p.id}">Reason</label><textarea name="note" id="reject-note-${p.id}" required></textarea><button class="danger" type="submit">Reject, request resubmission</button></form>`);
      }
      const proofLink = p.submitted_at ? `<a href="/staff/instant-services/orders/${order.id}/payments/${p.id}/proof">View proof</a>` : "";
      return `<div class="card">
        <p><strong>${escapeHtml(p.purpose === "checkout_delivery" ? "Delivery payment" : "Service payment")}</strong> — PHP ${Number(p.amount_php).toFixed(2)} — <span class="status">${escapeHtml(p.status)}</span></p>
        <p class="muted">${escapeHtml(p.description)}</p>
        <p>${proofLink}</p>
        ${actions.join("")}
      </div>`;
    })
    .join("") || '<p class="muted">No payment requests for this order yet.</p>';

  const priceHtml = snapshot
    ? `<table><tr><th>Item</th><th>Amount (PHP)</th></tr>${snapshot.components
        .map((c) => `<tr><td>${escapeHtml(c.label)}</td><td>${centavosToPhpString(c.amountPhpCentavos)}</td></tr>`)
        .join("")}<tr><td><strong>Total</strong></td><td><strong>${centavosToPhpString(snapshot.totalPhpCentavos)}</strong></td></tr></table>`
    : '<p class="muted">Price not yet confirmed by the customer.</p>';

  const deliveryHtml = service && service.supports_delivery
    ? `<div class="card">
        <h2>Delivery</h2>
        <p><strong>Current status:</strong> <span class="status">${escapeHtml(deliveryStatus ? deliveryStatus.status : "(not started)")}</span></p>
        ${
          deliveryAddress
            ? `<p>${escapeHtml(deliveryAddress.recipient_name)}, ${escapeHtml(deliveryAddress.phone)}<br>${escapeHtml(deliveryAddress.address_line1)}${deliveryAddress.address_line2 ? ", " + escapeHtml(deliveryAddress.address_line2) : ""}<br>${escapeHtml(deliveryAddress.city)}${deliveryAddress.region_state_province ? ", " + escapeHtml(deliveryAddress.region_state_province) : ""} ${escapeHtml(deliveryAddress.postal_code || "")}<br>${escapeHtml(deliveryAddress.country)}${deliveryAddress.is_international ? " (international)" : ""}</p>`
            : '<p class="muted">No delivery address provided yet.</p>'
        }
        <form method="POST" action="/staff/instant-services/orders/${order.id}/delivery-quotation">
          <label for="quoteAmount">Issue a delivery quotation (PHP)</label>
          <input type="text" name="amountPhp" id="quoteAmount" placeholder="e.g. 350.00" required>
          <label for="quoteNotes">Notes (shown internally only)</label>
          <textarea name="notes" id="quoteNotes"></textarea>
          <button type="submit">Issue quotation &amp; create payment request</button>
        </form>
        <form method="POST" action="/staff/instant-services/orders/${order.id}/delivery-status">
          <label for="deliveryStatus">Set delivery status</label>
          <select name="status" id="deliveryStatus">${DELIVERY_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join("")}</select>
          <label for="courier">Courier</label>
          <input type="text" name="courier" id="courier" placeholder="e.g. LBC, J&amp;T">
          <label for="trackingNumber">Tracking number</label>
          <input type="text" name="trackingNumber" id="trackingNumber">
          <label for="deliveryNote">Note</label>
          <textarea name="note" id="deliveryNote"></textarea>
          <button class="secondary" type="submit">Update delivery status</button>
        </form>
        <p class="muted">Quotations issued: ${quotations.map((q) => `PHP ${Number(q.amount_php_centavos / 100).toFixed(2)} (${escapeHtml(q.created_at)})`).join("; ") || "none"}</p>
        <p class="muted">History: ${deliveryHistory.map((h) => `${escapeHtml(h.changed_at)} — ${escapeHtml(h.status)}${h.note ? `: ${escapeHtml(h.note)}` : ""}`).join("<br>") || "none"}</p>
      </div>`
    : "";

  return staffPage(
    `Instant Services Order ${order.id.slice(0, 8)}`,
    `<h1>Instant Services Order</h1>
     <div class="card">
       <p><strong>${escapeHtml(client ? client.full_name : "")}</strong> &lt;${escapeHtml(client ? client.email : "")}&gt;</p>
       <p><strong>Service:</strong> ${escapeHtml(service ? service.service_slug : order.service_id)}</p>
       <p><strong>Status:</strong> <span class="status">${escapeHtml(order.status)}</span></p>
       ${order.application_id ? `<p><a href="/staff/applications/${order.application_id}">View application</a></p>` : ""}
       ${order.bi_form_submission_id ? `<p><a href="/staff/bi-forms/${order.bi_form_submission_id}">View questionnaire (${escapeHtml(submission ? submission.status : "")})</a></p>` : ""}
     </div>
     <div class="card"><h2>Price</h2>${priceHtml}</div>
     <div class="card"><h2>Payments</h2>${paymentRows}</div>
     ${deliveryHtml}
     <div class="card"><h2>Order history</h2>${history.map((h) => `<p class="muted">${escapeHtml(h.changed_at)} — <span class="status">${escapeHtml(h.status)}</span>${h.note ? `: ${escapeHtml(h.note)}` : ""}</p>`).join("") || '<p class="muted">No history.</p>'}</div>`,
    staff.email
  );
}

// ---------------------------------------------------------------------
// Payment verification -- the ONLY place a checkout-order payment can
// become 'paid', mirroring staff.js's existing markPaymentPaid for the
// same invariant on ordinary payment requests.
// ---------------------------------------------------------------------

export async function verifyOrderPayment(request, env, staff, orderId, paymentId) {
  const order = await requireOrder(env, orderId);
  const payment = await env.DB.prepare("SELECT * FROM payment_requests WHERE id = ? AND checkout_order_id = ?").bind(paymentId, orderId).first();
  if (!payment) return notFound();
  if (payment.status === "paid") return redirectTo(request, `/staff/instant-services/orders/${orderId}`);
  if (payment.status !== "submitted") {
    throw new HttpError(409, "This payment has no submitted proof to verify yet.");
  }

  await env.DB
    .prepare("UPDATE payment_requests SET status = 'paid', paid_at = datetime('now'), verified_by_staff_email = ? WHERE id = ?")
    .bind(staff.email, paymentId)
    .run();
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "verified_checkout_payment", targetTable: "payment_requests", targetId: paymentId });

  if (payment.purpose === "checkout_service" && order.status === "awaiting_verification") {
    await transitionOrder(env.DB, order, "paid", { staffEmail: staff.email });

    // Airport VIP Meet & Assist (and any future bookable service): a
    // verified payment is NEVER the same thing as a confirmed booking --
    // it only moves the booking from "awaiting payment verification" to
    // "payment verified, availability under review". Confirming
    // availability remains a separate, explicit staff action on the
    // Airport VIP booking page (staffAirportVip.js setBookingStatusHandler),
    // never automatic here.
    const service = await getServiceById(env.DB, order.service_id);
    if (service && service.offering_type === "bookable_service") {
      const { getBookingByOrderId, transitionBooking } = await import("../lib/airportVip.js");
      const booking = await getBookingByOrderId(env.DB, order.id);
      if (booking && booking.status === "awaiting_payment_verification") {
        await transitionBooking(env.DB, booking, "payment_verified", { staffEmail: staff.email, note: "Payment verified" });
      }
    }
  } else if (payment.purpose === "checkout_delivery") {
    await recordDeliveryStatus(env.DB, { orderId, status: "ready_for_shipment", staffEmail: staff.email, note: "Delivery payment verified" });
  }

  return redirectTo(request, `/staff/instant-services/orders/${orderId}`);
}

export async function rejectOrderPayment(request, env, staff, orderId, paymentId) {
  const order = await requireOrder(env, orderId);
  const payment = await env.DB.prepare("SELECT * FROM payment_requests WHERE id = ? AND checkout_order_id = ?").bind(paymentId, orderId).first();
  if (!payment) return notFound();

  const form = await request.formData();
  const note = String(form.get("note") || "").trim();
  if (!note) throw new HttpError(400, "A reason is required when rejecting a payment.");

  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "rejected_checkout_payment", targetTable: "payment_requests", targetId: paymentId, metadata: JSON.stringify({ note }) });

  if (payment.purpose === "checkout_service" && order.status === "awaiting_verification") {
    await transitionOrder(env.DB, order, "awaiting_payment", { staffEmail: staff.email, note });
  } else if (payment.purpose === "checkout_delivery") {
    await recordDeliveryStatus(env.DB, { orderId, status: "awaiting_delivery_payment", staffEmail: staff.email, note });
  }

  return redirectTo(request, `/staff/instant-services/orders/${orderId}`);
}

export async function viewOrderPaymentProof(env, staff, orderId, paymentId) {
  await requireOrder(env, orderId);
  const payment = await env.DB.prepare("SELECT id FROM payment_requests WHERE id = ? AND checkout_order_id = ?").bind(paymentId, orderId).first();
  if (!payment) return notFound();

  const latest = await env.DB.prepare("SELECT * FROM payment_proofs WHERE payment_request_id = ? ORDER BY uploaded_at DESC LIMIT 1").bind(paymentId).first();
  if (!latest) return notFound();

  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "viewed_checkout_payment_proof", targetTable: "payment_proofs", targetId: latest.id });
  return streamObject(env.CLIENT_FILES, latest.r2_key, latest.original_filename, latest.content_type);
}

// ---------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------

export async function setDeliveryStatus(request, env, staff, orderId) {
  await requireOrder(env, orderId);
  const form = await request.formData();
  const status = String(form.get("status") || "");
  if (!DELIVERY_STATUSES.includes(status)) throw new HttpError(400, "Unknown delivery status");

  await recordDeliveryStatus(env.DB, {
    orderId,
    status,
    note: String(form.get("note") || "").trim() || null,
    courier: String(form.get("courier") || "").trim() || null,
    trackingNumber: String(form.get("trackingNumber") || "").trim() || null,
    staffEmail: staff.email,
  });
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "updated_delivery_status", targetTable: "checkout_orders", targetId: orderId, metadata: JSON.stringify({ status }) });

  return redirectTo(request, `/staff/instant-services/orders/${orderId}`);
}

// Issuing a quotation creates the SEPARATE delivery payment request Part
// VI requires (never folded into the service fee) and immediately marks
// the order "awaiting_delivery_payment" -- the natural, single-action
// consequence of a staff member issuing a quotation at all, not a second
// manual step. Reuses the existing payment-request/proof infrastructure
// via `purpose = 'checkout_delivery'`, same as the service fee.
export async function createDeliveryQuotation(request, env, staff, orderId) {
  const order = await requireOrder(env, orderId);
  const form = await request.formData();
  const amountCentavos = phpStringToCentavos(form.get("amountPhp"));
  if (amountCentavos === null || amountCentavos <= 0) throw new HttpError(400, "A valid delivery amount is required");
  const notes = String(form.get("notes") || "").trim() || null;

  await env.DB
    .prepare("INSERT INTO checkout_delivery_quotations (id, order_id, amount_php_centavos, notes, created_by_staff_email) VALUES (?, ?, ?, ?, ?)")
    .bind(newId(), orderId, amountCentavos, notes, staff.email)
    .run();

  const paymentId = newId();
  await env.DB
    .prepare(
      `INSERT INTO payment_requests (id, application_id, amount_php, description, checkout_order_id, purpose)
       VALUES (?, ?, ?, ?, ?, 'checkout_delivery')`
    )
    .bind(paymentId, order.application_id, amountCentavos / 100, "Instant Services: delivery charge", orderId)
    .run();

  await recordDeliveryStatus(env.DB, { orderId, status: "awaiting_delivery_payment", staffEmail: staff.email, note: notes });
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "issued_delivery_quotation", targetTable: "checkout_delivery_quotations", targetId: orderId });

  try {
    const client = await env.DB.prepare("SELECT email FROM clients WHERE id = ?").bind(order.client_id).first();
    const application = await env.DB.prepare("SELECT reference FROM applications WHERE id = ?").bind(order.application_id).first();
    if (client && application) {
      await sendPaymentRequestNotification(env, { to: client.email, applicationReference: application.reference, amountPhp: amountCentavos / 100 });
    }
  } catch (err) {
    console.error("Delivery quotation notification email failed:", err.message);
  }

  return redirectTo(request, `/staff/instant-services/orders/${orderId}`);
}

// ---------------------------------------------------------------------
// QR Ph payment settings
// ---------------------------------------------------------------------

export async function viewPaymentSettings(env, staff) {
  const settings = await getCurrentPaymentSettings(env.DB);
  const history = await getPaymentSettingsHistory(env.DB, 50);
  const qrPh = getProvider("qr_ph");
  const isReady = qrPh.isConfigured(settings);

  const historyRows = history
    .map(
      (h) => `<tr>
        <td class="muted">${escapeHtml(h.changed_at)}</td>
        <td>${escapeHtml(h.changed_by_staff_email)}</td>
        <td>${h.enabled ? "Enabled" : "Disabled"}</td>
        <td class="muted">${h.qr_image_r2_key ? "Image configured" : "No image"}</td>
      </tr>`
    )
    .join("");

  return staffPage(
    "Instant Services Payment Settings",
    `<h1>Instant Services Payment Settings (QR Ph)</h1>
     <div class="card">
       <p><strong>Current status:</strong> ${isReady ? '<span class="status">Ready — shown to customers</span>' : '<span class="status">Not available to customers</span>'}</p>
       <p><strong>Merchant display name:</strong> ${escapeHtml(settings.merchant_display_name || "(not set)")}</p>
       <p><strong>Customer instructions:</strong> ${escapeHtml(settings.customer_instructions || "(not set)")}</p>
       ${settings.qr_image_r2_key ? `<p><img src="/staff/instant-services/payment-settings/qr-image" alt="Current QR Ph image" style="max-width:220px;border:1px solid #e2e2dc;border-radius:6px;"></p>` : '<p class="muted">No QR image uploaded yet.</p>'}
     </div>
     <div class="card">
       <h2>Update settings</h2>
       ${staff.role === "admin" ? `
       <form method="POST" action="/staff/instant-services/payment-settings" enctype="multipart/form-data">
         <label for="qrImage">Replace QR Ph image (PNG or JPEG)</label>
         <input type="file" name="qrImage" id="qrImage" accept="image/png,image/jpeg">
         <label for="merchantDisplayName">Merchant display name</label>
         <input type="text" name="merchantDisplayName" id="merchantDisplayName" value="${escapeHtml(settings.merchant_display_name || "")}">
         <label for="customerInstructions">Customer instructions</label>
         <textarea name="customerInstructions" id="customerInstructions">${escapeHtml(settings.customer_instructions || "")}</textarea>
         <label for="enabled"><input type="checkbox" name="enabled" id="enabled" style="width:auto;display:inline-block;" ${settings.enabled ? "checked" : ""}> Enabled — show QR Ph to customers once an image is configured</label>
         <button type="submit">Save payment settings</button>
       </form>` : '<p class="muted">Only an administrator can change payment settings.</p>'}
     </div>
     <div class="card">
       <h2>Audit trail</h2>
       <table><tr><th>Changed</th><th>By</th><th>Enabled</th><th>Image</th></tr>${historyRows || '<tr><td colspan="4" class="muted">No changes recorded yet.</td></tr>'}</table>
     </div>`,
    staff.email
  );
}

export async function updatePaymentSettings(request, env, staff) {
  const denied = adminOnlyResponse(staff);
  if (denied) return denied;
  const form = await request.formData();

  const changes = {
    merchantDisplayName: String(form.get("merchantDisplayName") || "").trim() || null,
    customerInstructions: String(form.get("customerInstructions") || "").trim() || null,
    enabled: form.get("enabled") === "on" || form.get("enabled") === "true",
  };

  const file = form.get("qrImage");
  if (file && typeof file.arrayBuffer === "function" && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) throw new HttpError(413, "QR image must be under 5MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffContentType(bytes);
    if (!contentType || !["image/png", "image/jpeg"].includes(contentType)) {
      throw new HttpError(415, "QR image must be a real PNG or JPEG file");
    }
    const key = `config/qr-ph-instant-services-${newId()}.${contentType === "image/png" ? "png" : "jpg"}`;
    await env.CLIENT_FILES.put(key, bytes, { httpMetadata: { contentType } });
    changes.qrImageR2Key = key;
  }

  const updated = await recordPaymentSettingsChange(env.DB, { changedByStaffEmail: staff.email, changes });
  await logAudit(env.DB, {
    actorType: "staff",
    actorIdOrEmail: staff.email,
    action: "updated_instant_services_payment_settings",
    targetTable: "checkout_payment_settings_log",
    metadata: JSON.stringify({ enabled: updated.enabled, hasImage: !!updated.qr_image_r2_key }),
  });

  return redirectTo(request, "/staff/instant-services/payment-settings/");
}

export async function viewPaymentSettingsQrImage(env, staff) {
  const settings = await getCurrentPaymentSettings(env.DB);
  if (!settings.qr_image_r2_key) return notFound();
  const response = await streamObject(env.CLIENT_FILES, settings.qr_image_r2_key, "qr-ph-instant-services.png", "image/png");
  if (!response) return notFound();
  return response;
}

// ---------------------------------------------------------------------
// Catalogue management
// ---------------------------------------------------------------------

export async function listCatalogue(env, staff) {
  const services = await listAllServicesForStaff(env.DB);
  const rows = await Promise.all(
    services.map(async (s) => {
      const i18n = await getServiceI18n(env.DB, s.id, "en");
      return `<tr>
        <td><a class="ref" href="/staff/instant-services/catalogue/${s.id}">${escapeHtml(i18n ? i18n.title : s.service_slug)}</a></td>
        <td class="muted">${escapeHtml(s.service_slug)}</td>
        <td class="muted">${escapeHtml(OFFERING_TYPE_LABELS[s.offering_type] || s.offering_type)}</td>
        <td class="muted">${escapeHtml(s.bi_form_id || "")}</td>
        <td><span class="status">${escapeHtml(s.offering_status)}</span></td>
      </tr>`;
    })
  );
  return staffPage(
    "Order & Book Online Catalogue",
    `<h1>Order &amp; Book Online Catalogue</h1>
     <p><a href="/staff/instant-services/catalogue/new">+ Add an offering</a></p>
     <div class="table-scroll"><table>
       <tr><th>Title</th><th>Slug</th><th>Type</th><th>BI Form</th><th>Status</th></tr>
       ${rows.join("") || '<tr><td colspan="5" class="muted">No catalogue offerings yet.</td></tr>'}
     </table></div>`,
    staff.email
  );
}

// Per-language status shown next to the (optional) override fields below
// -- so staff can see at a glance whether a language was filled in
// automatically, is still up to date, or needs attention, without that
// status ever being mandatory reading before saving.
function translationStatusBadge(row) {
  if (!row || !row.title) return '<span class="status">not yet generated</span>';
  if (row.auto_generated === 0 && row.needs_review) return '<span class="priority-badge priority-badge--urgent">review needed — English source changed</span>';
  if (row.auto_generated === 0) return '<span class="status">manually approved</span>';
  if (row.translation_status === "failed") return '<span class="priority-badge priority-badge--urgent">translation failed — showing last good version</span>';
  return '<span class="status">auto-translated</span>';
}

const REVIEW_FIELD_LABELS = {
  title: "Title",
  short_description: "Short description",
  eligibility_text: "Eligibility",
  notices_text: "Notices",
};

// The prominent warning panel for a manually authored translation whose
// English source has since changed -- shown instead of silently letting
// the (possibly now-inaccurate) manual text sit there unflagged. Lets
// staff compare the current English against what the translation still
// says, see exactly which fields moved, and choose one of the two
// required actions. Customers never see this row while it is flagged --
// lib/checkout.js getServiceI18n falls back to English in the meantime.
function reviewNeededPanel(serviceId, lang, row, enRow) {
  const changedCols = (row.review_changed_fields || "").split(",").filter(Boolean);
  const changedLabel = changedCols.map((c) => REVIEW_FIELD_LABELS[c] || c).join(", ") || "its English source";
  const compareRows = ["title", "short_description", "eligibility_text", "notices_text"]
    .map((col) => {
      const changed = changedCols.includes(col);
      return `<tr${changed ? ' style="background:#fbf1dc;"' : ""}>
        <td><strong>${escapeHtml(REVIEW_FIELD_LABELS[col])}</strong>${changed ? ' <span class="muted">(changed)</span>' : ""}</td>
        <td>${escapeHtml(enRow ? enRow[col] || "" : "")}</td>
        <td>${escapeHtml(row[col] || "")}</td>
      </tr>`;
    })
    .join("");

  return `<div class="card" style="border-color:#e8c876;background:#fffaf0;">
    <p><strong>Review needed — English source changed (${escapeHtml(changedLabel)}).</strong></p>
    <p class="muted">This ${escapeHtml(LANGUAGE_LABELS[lang])} translation was manually approved, but the English content it was approved against has since changed. Customers currently see the English version for this language until this is resolved -- the saved translation below is not shown to them.</p>
    <div class="table-scroll"><table><tr><th>Field</th><th>Current English</th><th>Saved ${escapeHtml(LANGUAGE_LABELS[lang])} translation</th></tr>${compareRows}</table></div>
    <form method="POST" action="/staff/instant-services/catalogue/${serviceId}/i18n/${lang}/keep" style="display:inline-block;margin-right:0.5rem;">
      <button type="submit" class="secondary">Keep my translation</button>
    </form>
    <form method="POST" action="/staff/instant-services/catalogue/${serviceId}/i18n/${lang}/regenerate-preview" style="display:inline-block;">
      <button type="submit">Update translation automatically</button>
    </form>
  </div>`;
}

function languageContentFields(i18nByLang, serviceId) {
  return CANONICAL_LANGUAGES
    .map((lang) => {
      const row = i18nByLang[lang] || {};
      return `${serviceId && lang !== "en" && row.needs_review ? reviewNeededPanel(serviceId, lang, row, i18nByLang.en) : ""}
      <fieldset style="border:1px solid #e2e2dc;border-radius:6px;padding:0.8rem 1rem;margin-bottom:0.8rem;">
        <legend>${escapeHtml(LANGUAGE_LABELS[lang])}${
          lang === "en"
            ? " (required — this is the source every other language is automatically translated from)"
            : ` (optional override — ${translationStatusBadge(row)})`
        }</legend>
        <label for="title-${lang}">Title</label>
        <input type="text" name="title_${lang}" id="title-${lang}" value="${escapeHtml(row.title || "")}" ${lang === "en" ? "required" : ""}>
        <label for="desc-${lang}">Short description</label>
        <textarea name="shortDescription_${lang}" id="desc-${lang}" ${lang === "en" ? "required" : ""}>${escapeHtml(row.short_description || "")}</textarea>
        <label for="elig-${lang}">Eligibility</label>
        <textarea name="eligibilityText_${lang}" id="elig-${lang}" ${lang === "en" ? "required" : ""}>${escapeHtml(row.eligibility_text || "")}</textarea>
        ${lang !== "en" ? `<p class="muted">Filled in automatically from the English content above. Type here only to permanently override the automatic translation for this language.</p>` : ""}
      </fieldset>`;
    })
    .join("");
}

function priceComponentFields(components) {
  const byType = {};
  for (const c of components) byType[c.component_type] = c;
  return `
    <p class="muted">These two amounts are added together into the ONE total a customer ever sees (no itemized breakdown is ever shown to a customer, per the Order &amp; Book Online pricing decision) -- they exist so FIS can internally track the government-fee and FIS-fee components separately.</p>
    <label for="serviceFeeLabel">FIS service fee — label</label>
    <input type="text" name="serviceFeeLabel" id="serviceFeeLabel" value="${escapeHtml(byType.service_fee ? byType.service_fee.label : "FIS Service Fee")}">
    <label for="serviceFeeAmount">FIS service fee — amount (PHP)</label>
    <input type="text" name="serviceFeeAmount" id="serviceFeeAmount" value="${byType.service_fee ? (byType.service_fee.amount_php_centavos / 100).toFixed(2) : ""}" placeholder="e.g. 5000.00" required>
    <label for="govFeeLabel">Government fee — label (optional)</label>
    <input type="text" name="govFeeLabel" id="govFeeLabel" value="${escapeHtml(byType.government_fee ? byType.government_fee.label : "Government Fee")}">
    <label for="govFeeAmount">Government fee — amount (PHP, optional)</label>
    <input type="text" name="govFeeAmount" id="govFeeAmount" value="${byType.government_fee ? (byType.government_fee.amount_php_centavos / 100).toFixed(2) : ""}">
    <label for="otherFeeLabel">Other charge — label (optional)</label>
    <input type="text" name="otherFeeLabel" id="otherFeeLabel" value="${escapeHtml(byType.other ? byType.other.label : "Other")}">
    <label for="otherFeeAmount">Other charge — amount (PHP, optional)</label>
    <input type="text" name="otherFeeAmount" id="otherFeeAmount" value="${byType.other ? (byType.other.amount_php_centavos / 100).toFixed(2) : ""}">
    <label for="priceChangeReason">Reason for this price (optional, kept in the price history)</label>
    <input type="text" name="priceChangeReason" id="priceChangeReason" placeholder="e.g. Initial approved price">`;
}

const OFFERING_TYPE_LABELS = {
  document_automated: "Automated document order (a tested Forms Library form is wired up)",
  document_manual: "Staff-processed document order (no automated form yet — staff files it by hand)",
  bookable_service: "Bookable service (e.g. Airport VIP Meet & Assist)",
  fixed_price_service: "Fixed-price professional service (no document deliverable, no booking date)",
};

function offeringTypeField(selected) {
  return `<label for="offeringType">Offering type</label>
    <select name="offeringType" id="offeringType">
      ${OFFERING_TYPES.map((t) => `<option value="${t}" ${t === selected ? "selected" : ""}>${escapeHtml(OFFERING_TYPE_LABELS[t])}</option>`).join("")}
    </select>`;
}

function priceHistoryTable(history) {
  if (!history.length) return '<p class="muted">No price changes recorded yet.</p>';
  return `<table><tr><th>Changed</th><th>By</th><th>Total (PHP)</th><th>Reason</th></tr>${history
    .map(
      (h) =>
        `<tr><td class="muted">${escapeHtml(h.changed_at)}</td><td>${escapeHtml(h.changed_by_staff_email)}</td><td>${centavosToPhpString(h.total_php_centavos)}</td><td class="muted">${escapeHtml(h.reason || "")}</td></tr>`
    )
    .join("")}</table>`;
}

export async function newServiceForm(env, staff) {
  return staffPage(
    "Add a Document Order or Bookable Service",
    `<h1>Add an Offering</h1>
     <form method="POST" action="/staff/instant-services/catalogue">
       ${offeringTypeField("document_automated")}
       <label for="serviceSlug">Service slug (matches the existing public service pages)</label>
       <input type="text" name="serviceSlug" id="serviceSlug" required>
       <label for="biFormId">BI Form ID</label>
       <input type="text" name="biFormId" id="biFormId">
       <p class="muted">Required, and must be a BI Form ID with an approved Forms Library configuration, only for "Automated document order." For a staff-processed order this is just a free-text reference code (optional). Not used for a bookable service.</p>
       <label for="serviceGroup">Service group (optional — groups related offerings/packages together, e.g. "airport-vip")</label>
       <input type="text" name="serviceGroup" id="serviceGroup">
       <label for="customerPriceLabel">Customer-facing price label (optional — defaults to "Document price" or "Service price")</label>
       <input type="text" name="customerPriceLabel" id="customerPriceLabel">
       <label for="displayOrder">Display order</label>
       <input type="text" name="displayOrder" id="displayOrder" value="0">
       <label for="supportsDelivery"><input type="checkbox" name="supportsDelivery" id="supportsDelivery" style="width:auto;display:inline-block;" checked> This offering involves physical document delivery</label>
       <h2>Price</h2>
       ${priceComponentFields([])}
       <h2>Customer-facing content</h2>
       ${languageContentFields({})}
       <p class="muted">New offerings are created in "draft" status. Move to "ready for review", then "active", only once the price, content, and (for an automated document) the BI Form mapping have been reviewed and approved. Activation is refused automatically if no approved price has been set.</p>
       <button type="submit">Create (draft)</button>
     </form>`,
    staff.email
  );
}

function parsePriceComponentsFromForm(form) {
  const components = [];
  const serviceFee = phpStringToCentavos(form.get("serviceFeeAmount"));
  if (serviceFee === null || serviceFee <= 0) throw new HttpError(400, "A valid FIS service fee amount is required");
  components.push({ type: "service_fee", label: String(form.get("serviceFeeLabel") || "FIS Service Fee").trim(), amountPhpCentavos: serviceFee });

  const govFeeRaw = form.get("govFeeAmount");
  if (govFeeRaw && String(govFeeRaw).trim()) {
    const govFee = phpStringToCentavos(govFeeRaw);
    if (govFee === null || govFee < 0) throw new HttpError(400, "Invalid government fee amount");
    if (govFee > 0) components.push({ type: "government_fee", label: String(form.get("govFeeLabel") || "Government Fee").trim(), amountPhpCentavos: govFee });
  }

  const otherFeeRaw = form.get("otherFeeAmount");
  if (otherFeeRaw && String(otherFeeRaw).trim()) {
    const otherFee = phpStringToCentavos(otherFeeRaw);
    if (otherFee === null || otherFee < 0) throw new HttpError(400, "Invalid other charge amount");
    if (otherFee > 0) components.push({ type: "other", label: String(form.get("otherFeeLabel") || "Other").trim(), amountPhpCentavos: otherFee });
  }

  return components;
}

function parsePriceChangeReason(form) {
  return String(form.get("priceChangeReason") || "").trim() || null;
}

async function saveLanguageContent(db, serviceId, form) {
  for (const lang of CANONICAL_LANGUAGES) {
    const title = String(form.get(`title_${lang}`) || "").trim();
    const shortDescription = String(form.get(`shortDescription_${lang}`) || "").trim();
    const eligibilityText = String(form.get(`eligibilityText_${lang}`) || "").trim();
    if (lang === "en" && (!title || !shortDescription || !eligibilityText)) {
      throw new HttpError(400, "English title, short description, and eligibility text are required.");
    }
    // A language with nothing typed in yet is simply skipped -- the
    // customer-facing catalogue read (lib/checkout.js getServiceI18n)
    // already falls back to English for any language with no row, so
    // this never produces a blank display, only an untranslated one.
    if (!title && !shortDescription && !eligibilityText) continue;
    await upsertServiceI18n(db, serviceId, lang, { title, shortDescription, eligibilityText, noticesText: null });
  }
}

export async function createServiceHandler(request, env, staff) {
  const denied = adminOnlyResponse(staff);
  if (denied) return denied;
  const form = await request.formData();
  const serviceSlug = String(form.get("serviceSlug") || "").trim();
  const biFormId = String(form.get("biFormId") || "").trim();
  const offeringType = String(form.get("offeringType") || "document_automated");
  if (!OFFERING_TYPES.includes(offeringType)) throw new HttpError(400, "Unknown offering type");
  if (!serviceSlug) throw new HttpError(400, "Service slug is required");
  if (offeringType !== "bookable_service" && !biFormId && offeringType === "document_automated") {
    throw new HttpError(400, "A BI Form ID is required for an automated document order");
  }

  const components = parsePriceComponentsFromForm(form);

  const service = await createService(env.DB, {
    serviceSlug,
    biFormId: biFormId || "",
    offeringType,
    serviceGroup: String(form.get("serviceGroup") || "").trim() || null,
    customerPriceLabel: String(form.get("customerPriceLabel") || "").trim() || null,
    supportsDelivery: form.get("supportsDelivery") === "on",
    displayOrder: Number(form.get("displayOrder")) || 0,
  });
  await updatePriceComponentsWithHistory(env.DB, service.id, components, staff.email, parsePriceChangeReason(form));
  await saveLanguageContent(env.DB, service.id, form);
  // Automatic catalogue translation: fills in the five non-English
  // languages from the English content just saved, so the owner never has
  // to type five separate translations. Bounded to this one offering, run
  // synchronously as part of this save (not on a customer page load) --
  // see worker/src/lib/checkoutTranslation.js for the caching/staleness
  // rules that make repeat saves cheap.
  await ensureServiceTranslations(env, service.id);
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "created_instant_services_catalogue_entry", targetTable: "checkout_services", targetId: service.id });

  return redirectTo(request, `/staff/instant-services/catalogue/${service.id}`);
}

export async function viewService(env, staff, serviceId) {
  const service = await getServiceById(env.DB, serviceId);
  if (!service) return notFound();
  const components = await getPriceComponents(env.DB, serviceId);
  const history = await getPriceHistory(env.DB, serviceId);
  const i18nByLang = {};
  for (const lang of CANONICAL_LANGUAGES) {
    const row = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = ?").bind(serviceId, lang).first();
    if (row) i18nByLang[lang] = row;
  }

  const statusButtons = OFFERING_STATUSES.map(
    (s) =>
      `<form method="POST" action="/staff/instant-services/catalogue/${serviceId}/status" style="display:inline-block;margin-right:0.4rem;">
         <input type="hidden" name="status" value="${s}">
         <button class="${s === service.offering_status ? "" : "secondary"}" type="submit" ${s === service.offering_status ? "disabled" : ""}>${s}</button>
       </form>`
  ).join("");

  return staffPage(
    `Catalogue: ${service.service_slug}`,
    `<h1>${escapeHtml(service.service_slug)}</h1>
     <div class="card">
       <p><strong>Offering type:</strong> ${escapeHtml(OFFERING_TYPE_LABELS[service.offering_type] || service.offering_type)}</p>
       <p><strong>Status:</strong> <span class="status">${escapeHtml(service.offering_status)}</span>${service.active ? ' <span class="status">(customer-visible)</span>' : ""}</p>
       <p><strong>Business approval:</strong> ${
         service.approved_at
           ? `Approved by ${escapeHtml(service.approved_by_staff_email)} on ${escapeHtml(service.approved_at)}`
           : '<span class="muted">Not yet approved -- cannot be activated until an administrator moves this to "approved".</span>'
       }</p>
       ${staff.role === "admin" ? statusButtons : '<p class="muted">Only an administrator can change offering status.</p>'}
     </div>
     <form method="POST" action="/staff/instant-services/catalogue/${serviceId}">
       ${offeringTypeField(service.offering_type)}
       <label for="serviceSlug">Service slug</label>
       <input type="text" name="serviceSlug" id="serviceSlug" value="${escapeHtml(service.service_slug)}" required>
       <label for="biFormId">BI Form ID</label>
       <input type="text" name="biFormId" id="biFormId" value="${escapeHtml(service.bi_form_id || "")}">
       <label for="serviceGroup">Service group (optional)</label>
       <input type="text" name="serviceGroup" id="serviceGroup" value="${escapeHtml(service.service_group || "")}">
       <label for="customerPriceLabel">Customer-facing price label (optional)</label>
       <input type="text" name="customerPriceLabel" id="customerPriceLabel" value="${escapeHtml(service.customer_price_label || "")}">
       <label for="displayOrder">Display order</label>
       <input type="text" name="displayOrder" id="displayOrder" value="${service.display_order}">
       <label for="supportsDelivery"><input type="checkbox" name="supportsDelivery" id="supportsDelivery" style="width:auto;display:inline-block;" ${service.supports_delivery ? "checked" : ""}> This offering involves physical document delivery</label>
       <h2>Price</h2>
       ${priceComponentFields(components)}
       <h2>Customer-facing content</h2>
       ${languageContentFields(i18nByLang, serviceId)}
       <button type="submit">Save changes</button>
     </form>
     <div class="card"><h2>Price history</h2>${priceHistoryTable(history)}</div>`,
    staff.email
  );
}

export async function updateServiceHandler(request, env, staff, serviceId) {
  const denied = adminOnlyResponse(staff);
  if (denied) return denied;
  const service = await getServiceById(env.DB, serviceId);
  if (!service) return notFound();

  const form = await request.formData();
  const serviceSlug = String(form.get("serviceSlug") || "").trim();
  const biFormId = String(form.get("biFormId") || "").trim();
  const offeringType = String(form.get("offeringType") || "document_automated");
  if (!OFFERING_TYPES.includes(offeringType)) throw new HttpError(400, "Unknown offering type");
  if (!serviceSlug) throw new HttpError(400, "Service slug is required");

  const components = parsePriceComponentsFromForm(form);

  await updateServiceMeta(env.DB, serviceId, {
    serviceSlug,
    biFormId: biFormId || "",
    offeringType,
    serviceGroup: String(form.get("serviceGroup") || "").trim() || null,
    customerPriceLabel: String(form.get("customerPriceLabel") || "").trim() || null,
    supportsDelivery: form.get("supportsDelivery") === "on",
    displayOrder: Number(form.get("displayOrder")) || 0,
  });
  await updatePriceComponentsWithHistory(env.DB, serviceId, components, staff.email, parsePriceChangeReason(form));
  await saveLanguageContent(env.DB, serviceId, form);
  await ensureServiceTranslations(env, serviceId);
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "updated_instant_services_catalogue_entry", targetTable: "checkout_services", targetId: serviceId });

  return redirectTo(request, `/staff/instant-services/catalogue/${serviceId}`);
}

// "Keep my translation": the owner reviewed the warning above and
// confirms the existing manual translation is still appropriate despite
// the English change. Content is never touched -- only the review flag
// and the reconciliation hashes.
export async function reconcileKeepHandler(request, env, staff, serviceId, lang) {
  const denied = adminOnlyResponse(staff);
  if (denied) return denied;
  const changed = await reconcileKeep(env, serviceId, lang);
  if (changed) {
    await logAudit(env.DB, {
      actorType: "staff",
      actorIdOrEmail: staff.email,
      action: "kept_catalogue_translation_after_review",
      targetTable: "checkout_service_i18n",
      targetId: `${serviceId}:${lang}`,
    });
  }
  return redirectTo(request, `/staff/instant-services/catalogue/${serviceId}`);
}

// "Update translation automatically", step 1: generates a fresh
// translation from the CURRENT English content and shows it for
// comparison against both the current English and the existing manual
// translation -- nothing is saved yet. The generated text travels to the
// confirmation step as hidden form fields rather than being persisted
// early, so an abandoned preview never leaves a half-applied row behind.
export async function regeneratePreviewHandler(request, env, staff, serviceId, lang) {
  const denied = adminOnlyResponse(staff);
  if (denied) return denied;
  const service = await getServiceById(env.DB, serviceId);
  if (!service) return notFound();
  const enRow = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'en'").bind(serviceId).first();
  if (!enRow) throw new HttpError(400, "English content must be saved before a translation can be generated");
  const existing = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = ?").bind(serviceId, lang).first();

  const preview = await generateTranslationPreview(env, enRow, lang);
  if (!preview.ok) {
    return staffPage(
      "Translation preview failed",
      `<div class="card"><p>Automatic translation into ${escapeHtml(LANGUAGE_LABELS[lang])} failed. The existing manual translation has not been changed.</p>
       <p><a class="btn-link" href="/staff/instant-services/catalogue/${serviceId}">Back to ${escapeHtml(service.service_slug)}</a></p></div>`,
      staff.email
    );
  }

  const fields = ["title", "shortDescription", "eligibilityText", "noticesText"];
  const hiddenInputs = fields.map((f) => `<input type="hidden" name="${f}" value="${escapeHtml(preview[f] || "")}">`).join("");
  const compareRows = [
    ["title", "Title"],
    ["short_description", "Short description"],
    ["eligibility_text", "Eligibility"],
    ["notices_text", "Notices"],
  ]
    .map(([col, label], i) => {
      const previewValue = preview[fields[i]] || "";
      return `<tr>
        <td><strong>${escapeHtml(label)}</strong></td>
        <td>${escapeHtml(enRow[col] || "")}</td>
        <td>${escapeHtml(existing ? existing[col] || "" : "")}</td>
        <td>${escapeHtml(previewValue)}</td>
      </tr>`;
    })
    .join("");

  return staffPage(
    `Preview translation: ${service.service_slug}`,
    `<h1>Preview automatically generated ${escapeHtml(LANGUAGE_LABELS[lang])} translation</h1>
     <div class="card">
       <p class="muted">Nothing has been saved yet. Review the generated translation below, then confirm to replace the current manual translation with it.</p>
       <div class="table-scroll"><table><tr><th>Field</th><th>Current English</th><th>Current (manual) translation</th><th>New preview</th></tr>${compareRows}</table></div>
       <form method="POST" action="/staff/instant-services/catalogue/${serviceId}/i18n/${lang}/regenerate-apply">
         ${hiddenInputs}
         <button type="submit">Replace with this translation</button>
       </form>
       <p><a class="btn-link" href="/staff/instant-services/catalogue/${serviceId}">Cancel, keep existing translation</a></p>
     </div>`,
    staff.email
  );
}

// "Update translation automatically", step 2: applies the previewed text
// (round-tripped from the form above, not re-generated) in place of the
// manual translation, and clears the review flag.
export async function regenerateApplyHandler(request, env, staff, serviceId, lang) {
  const denied = adminOnlyResponse(staff);
  if (denied) return denied;
  const form = await request.formData();
  const content = {
    title: String(form.get("title") || "").trim(),
    shortDescription: String(form.get("shortDescription") || "").trim(),
    eligibilityText: String(form.get("eligibilityText") || "").trim(),
    noticesText: String(form.get("noticesText") || "").trim() || null,
  };
  if (!content.title || !content.shortDescription || !content.eligibilityText) {
    throw new HttpError(400, "Incomplete previewed translation -- nothing was applied");
  }
  await applyRegeneratedTranslation(env, serviceId, lang, content);
  await logAudit(env.DB, {
    actorType: "staff",
    actorIdOrEmail: staff.email,
    action: "regenerated_catalogue_translation_after_review",
    targetTable: "checkout_service_i18n",
    targetId: `${serviceId}:${lang}`,
  });
  return redirectTo(request, `/staff/instant-services/catalogue/${serviceId}`);
}

// Legacy single-button toggle -- kept for any caller still posting to
// the old /active path, but the catalogue edit page itself now posts to
// /status (setOfferingStatusHandler below), which is the richer,
// price-gated entry point.
export async function toggleServiceActive(request, env, staff, serviceId) {
  const denied = adminOnlyResponse(staff);
  if (denied) return denied;
  const service = await getServiceById(env.DB, serviceId);
  if (!service) return notFound();

  await setOfferingStatus(env.DB, serviceId, service.active ? "draft" : "active", staff.email);
  await logAudit(env.DB, {
    actorType: "staff",
    actorIdOrEmail: staff.email,
    action: service.active ? "deactivated_instant_services_catalogue_entry" : "activated_instant_services_catalogue_entry",
    targetTable: "checkout_services",
    targetId: serviceId,
  });

  return redirectTo(request, `/staff/instant-services/catalogue/${serviceId}`);
}

export async function setOfferingStatusHandler(request, env, staff, serviceId) {
  const denied = adminOnlyResponse(staff);
  if (denied) return denied;
  const service = await getServiceById(env.DB, serviceId);
  if (!service) return notFound();

  const form = await request.formData();
  const status = String(form.get("status") || "");
  await setOfferingStatus(env.DB, serviceId, status, staff.email);
  await logAudit(env.DB, {
    actorType: "staff",
    actorIdOrEmail: staff.email,
    action: "changed_instant_services_offering_status",
    targetTable: "checkout_services",
    targetId: serviceId,
    metadata: JSON.stringify({ status }),
  });

  return redirectTo(request, `/staff/instant-services/catalogue/${serviceId}`);
}
