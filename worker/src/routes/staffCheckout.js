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
import { newId, newToken, sha256Hex } from "../lib/crypto.js";
import { centavosToPhpString, phpStringToCentavos } from "../lib/money.js";
import { sendInstantServicesVerification } from "../lib/email.js";
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
  usesProcessingTiers,
  PROCESSING_TIERS,
  TIER_LABELS,
  tierIsApproved,
  updateProcessingTiers,
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

export async function viewOrder(env, staff, orderId, url) {
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

  let priceHtml;
  if (!snapshot) {
    priceHtml = '<p class="muted">Price not yet confirmed by the customer.</p>';
  } else if (snapshot.processingTier) {
    // Tiered document order -- the frozen terms the customer actually
    // agreed to, exactly as confirmed, regardless of whatever the
    // catalogue's tier prices/lead-times have changed to since.
    priceHtml = `<p><strong>Selected processing option:</strong> ${escapeHtml(snapshot.tierLabel)}</p>
      <p><strong>Confirmed price:</strong> ${centavosToPhpString(snapshot.totalPhpCentavos)} PHP</p>
      <p><strong>Estimated processing time:</strong> ${escapeHtml(String(snapshot.minBusinessDays))}–${escapeHtml(String(snapshot.maxBusinessDays))} business days (excludes delivery time)</p>
      ${
        snapshot.delivery
          ? snapshot.delivery.isInternational
            ? '<p><strong>Delivery:</strong> International — delivery charges quoted separately, pending a staff quotation.</p>'
            : '<p><strong>Delivery:</strong> Free Regular Nationwide Delivery (Philippines).</p>'
          : ""
      }`;
  } else {
    priceHtml = `<table><tr><th>Item</th><th>Amount (PHP)</th></tr>${snapshot.components
      .map((c) => `<tr><td>${escapeHtml(c.label)}</td><td>${centavosToPhpString(c.amountPhpCentavos)}</td></tr>`)
      .join("")}<tr><td><strong>Total</strong></td><td><strong>${centavosToPhpString(snapshot.totalPhpCentavos)}</strong></td></tr></table>`;
  }

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

  // Lets staff manually re-trigger the client's verification email (the
  // one handleBeginCheckout already sends best-effort -- a delivery
  // failure there never blocks the order/client record from existing,
  // matching every other transactional email in this codebase, but also
  // never tells the customer anything went wrong). If a real email
  // genuinely cannot be sent (no RESEND_API_KEY configured at all --
  // every environment without a live Resend key, never production with
  // one), the freshly-issued verification link is shown here instead,
  // once, as a same-page redirect result -- never logged, never stored,
  // gated behind this already Access-protected staff page exactly like
  // every other customer detail on it (delivery address, payment proof).
  const resentLink = url ? url.searchParams.get("resent_link") : null;
  const resentOk = url ? url.searchParams.get("resent") === "1" : false;
  const resendHtml = `
    <form method="POST" action="/staff/instant-services/orders/${order.id}/resend-verification">
      <button type="submit" class="secondary">Resend verification email</button>
    </form>
    ${resentOk ? '<p class="muted">Verification email resent.</p>' : ""}
    ${
      resentLink
        ? `<p><strong>Email delivery is not configured in this environment.</strong> Use this link directly (valid 15 minutes, single-use):</p>
           <p><a href="${escapeHtml(resentLink)}">${escapeHtml(resentLink)}</a></p>`
        : ""
    }`;

  return staffPage(
    `Instant Services Order ${order.id.slice(0, 8)}`,
    `<h1>Instant Services Order</h1>
     <div class="card">
       <p><strong>${escapeHtml(client ? client.full_name : "")}</strong> &lt;${escapeHtml(client ? client.email : "")}&gt;</p>
       <p><strong>Service:</strong> ${escapeHtml(service ? service.service_slug : order.service_id)}</p>
       <p><strong>Status:</strong> <span class="status">${escapeHtml(order.status)}</span></p>
       ${order.application_id ? `<p><a href="/staff/applications/${order.application_id}">View application</a></p>` : ""}
       ${order.bi_form_submission_id ? `<p><a href="/staff/bi-forms/${order.bi_form_submission_id}">View questionnaire (${escapeHtml(submission ? submission.status : "")})</a></p>` : ""}
       ${resendHtml}
     </div>
     <div class="card"><h2>Price</h2>${priceHtml}</div>
     <div class="card"><h2>Payments</h2>${paymentRows}</div>
     ${deliveryHtml}
     <div class="card"><h2>Order history</h2>${history.map((h) => `<p class="muted">${escapeHtml(h.changed_at)} — <span class="status">${escapeHtml(h.status)}</span>${h.note ? `: ${escapeHtml(h.note)}` : ""}</p>`).join("") || '<p class="muted">No history.</p>'}</div>`,
    staff.email
  );
}

// Re-issues a fresh, single-use verification token for the order's
// client and attempts to email it, exactly as handleBeginCheckout
// (routes/checkoutPublic.js) does on the initial request -- the ORIGINAL
// token can never be recovered here (only its SHA-256 hash is ever
// stored, by design), so a genuine resend always means a new token, old
// one left to expire unused. On a real send failure (no RESEND_API_KEY
// configured -- the only way this ever fails, since Resend itself is
// never even called without one), redirects back to this same page with
// the fresh link as a one-time query parameter for viewOrder to render
// -- never written to the audit log or any persistent record.
export async function resendOrderVerification(request, env, staff, orderId) {
  const order = await requireOrder(env, orderId);
  const client = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(order.client_id).first();
  if (!client) throw new HttpError(404, "Not found");

  const rawToken = newToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO auth_tokens (id, client_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(newId(), client.id, tokenHash, expiresAt)
    .run();

  const verifyUrl = `${env.PUBLIC_SITE_URL}/instant-services/verify/?token=${rawToken}&order=${order.id}`;
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "resent_instant_services_verification", targetTable: "checkout_orders", targetId: order.id });

  try {
    await sendInstantServicesVerification(env, { to: client.email, url: verifyUrl, lang: client.preferred_communication_language || "en" });
    return redirectTo(request, `/staff/instant-services/orders/${orderId}?resent=1`);
  } catch (err) {
    console.error("Resend of Instant Services verification failed:", err.message);
    return redirectTo(request, `/staff/instant-services/orders/${orderId}?resent_link=${encodeURIComponent(verifyUrl)}`);
  }
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
    const client = await env.DB.prepare("SELECT email, preferred_communication_language FROM clients WHERE id = ?").bind(order.client_id).first();
    const application = await env.DB.prepare("SELECT reference FROM applications WHERE id = ?").bind(order.application_id).first();
    if (client && application) {
      await sendPaymentRequestNotification(env, { to: client.email, applicationReference: application.reference, amountPhp: amountCentavos / 100, lang: client.preferred_communication_language });
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

// Compact one-line pricing summary for the catalogue list -- shows both
// tiers for a document service (dash for an unapproved/disabled one, so
// "not yet priced" is never confused with "free"), or just notes that
// non-document offerings use the legacy single-price editor instead.
// `form` (optional) is the just-submitted, not-yet-saved FormData -- used
// only when re-rendering the editor after a validation failure, so the
// collapsed-section summary reflects what the owner actually typed
// rather than the still-unchanged stored values.
function pricingSummary(service, form = null) {
  if (!usesProcessingTiers(service.offering_type)) return '<span class="muted">(single price)</span>';
  return PROCESSING_TIERS.map((tier) => {
    const label = TIER_LABELS[tier].split(" ")[0]; // "Express" / "Regular"
    const enabled = form ? form.get(`${tier}Enabled`) === "on" : !!service[`${tier}_enabled`];
    if (!enabled) return `${label}: <span class="muted">disabled</span>`;
    if (form) {
      const priceRaw = String(form.get(`${tier}Price`) || "").trim();
      const minRaw = String(form.get(`${tier}MinDays`) || "").trim();
      const maxRaw = String(form.get(`${tier}MaxDays`) || "").trim();
      if (!priceRaw || !minRaw || !maxRaw) return `${label}: <span class="muted">not yet priced</span>`;
      const centavos = phpStringToCentavos(priceRaw);
      return centavos != null ? `${label}: ${centavosToPhpString(centavos)}` : `${label}: <span class="muted">invalid</span>`;
    }
    if (!tierIsApproved(service, tier)) return `${label}: <span class="muted">not yet priced</span>`;
    return `${label}: ${centavosToPhpString(service[`${tier}_price_php_centavos`])}`;
  }).join(" · ");
}

// Mirrors pricingSummary above for the legacy single-price (itemized
// components) model -- shown as the "E. Other Pricing Settings" section's
// collapsed-state badge for a non-document offering.
function componentsSummaryBadge(components, form = null) {
  let total;
  if (form) {
    total = ["serviceFeeAmount", "govFeeAmount", "otherFeeAmount"].reduce((sum, field) => {
      const raw = String(form.get(field) || "").trim();
      if (!raw) return sum;
      const centavos = phpStringToCentavos(raw);
      return sum + (centavos != null && centavos > 0 ? centavos : 0);
    }, 0);
  } else {
    total = components.reduce((sum, c) => sum + (c.amount_php_centavos || 0), 0);
  }
  return total > 0 ? centavosToPhpString(total) : '<span class="muted">not yet priced</span>';
}

// "F. Approval & Publication" section's collapsed-state badge -- the
// two states the directive specifically requires to stay visible without
// opening the section: not yet approved, and (once approved) the current
// publication status.
function approvalSectionBadge(service) {
  if (!service.approved_at) return '<span class="priority-badge priority-badge--priority">not yet approved</span>';
  return `<span class="status">${escapeHtml(service.offering_status)}</span>${service.active ? " customer-visible" : ""}`;
}

// "C. Translations & Manual Overrides" section's collapsed-state badge --
// surfaced at the PARENT level (not just inside each nested language
// subsection) so a review-needed or failed translation is never hidden
// inside an unmarked collapsed section, per the directive's explicit
// warning-visibility requirement.
function translationsSectionBadge(i18nByLang) {
  const flagged = CANONICAL_LANGUAGES.filter((lang) => lang !== "en").filter((lang) => {
    const row = i18nByLang[lang];
    if (!row) return false;
    return (row.auto_generated === 0 && row.needs_review) || row.translation_status === "failed";
  });
  if (!flagged.length) return "";
  return `<span class="priority-badge priority-badge--urgent">${flagged.length} translation${flagged.length > 1 ? "s" : ""} need${flagged.length > 1 ? "" : "s"} review</span>`;
}

// Native <details>/<summary> -- independently openable, keyboard-operable
// out of the box, and (the key property this whole refinement relies on)
// a closed section's form fields stay in the DOM and are still submitted
// with the rest of the form; collapsing one never clears or resets its
// values, and no client-side script is needed for any of that.
function collapsibleSection({ id, title, bodyHtml, open, badgeHtml = "", nested = false }) {
  return `<details class="staff-collapsible${nested ? " staff-collapsible--nested" : ""}" id="section-${id}" ${open ? "open" : ""}>
    <summary><span>${escapeHtml(title)}</span>${badgeHtml ? `<span class="staff-collapsible__meta">${badgeHtml}</span>` : ""}</summary>
    <div class="staff-collapsible__body">${bodyHtml}</div>
  </details>`;
}

export async function listCatalogue(env, staff) {
  const services = await listAllServicesForStaff(env.DB);
  const rows = await Promise.all(
    services.map(async (s) => {
      const i18n = await getServiceI18n(env.DB, s.id, "en");
      return `<tr>
        <td><a class="ref" href="/staff/instant-services/catalogue/${s.id}">${escapeHtml(i18n ? i18n.title : s.service_slug)}</a></td>
        <td class="muted">${escapeHtml(s.service_slug)}</td>
        <td class="muted">${escapeHtml(OFFERING_TYPE_LABELS[s.offering_type] || s.offering_type)}</td>
        <td>${pricingSummary(s)}</td>
        <td><span class="status">${escapeHtml(s.offering_status)}</span></td>
      </tr>`;
    })
  );
  return staffPage(
    "Order & Book Online Catalogue",
    `<h1>Order &amp; Book Online Catalogue</h1>
     <p><a href="/staff/instant-services/catalogue/new">+ Add an offering</a></p>
     <div class="table-scroll"><table>
       <tr><th>Title</th><th>Slug</th><th>Type</th><th>Pricing</th><th>Status</th></tr>
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

// "B. Customer-Facing Content (English)" -- English is always expanded
// (per the directive: the owner must not need to open any collapsed
// section for an ordinary English-only catalogue update) and is the
// authoritative source every other language is automatically translated
// from. `form` (optional) echoes back exactly what was just submitted,
// for the error-recovery re-render path -- see renderCreateServiceError/
// renderUpdateServiceError below.
function englishContentField(row, form = null) {
  row = row || {};
  const title = form ? String(form.get("title_en") || "") : row.title || "";
  const shortDescription = form ? String(form.get("shortDescription_en") || "") : row.short_description || "";
  const eligibilityText = form ? String(form.get("eligibilityText_en") || "") : row.eligibility_text || "";
  return `<label for="title-en">Title</label>
    <input type="text" name="title_en" id="title-en" value="${escapeHtml(title)}" required>
    <label for="desc-en">Short description</label>
    <textarea name="shortDescription_en" id="desc-en" required>${escapeHtml(shortDescription)}</textarea>
    <label for="elig-en">Eligibility</label>
    <textarea name="eligibilityText_en" id="elig-en" required>${escapeHtml(eligibilityText)}</textarea>`;
}

// "C. Translations & Manual Overrides" -- the five non-English languages,
// each its own nested collapsible subsection (collapsed by default; the
// parent section itself carries the aggregate review-needed/failed
// warning via translationsSectionBadge so a flagged translation is never
// hidden inside an unmarked collapsed section). Every existing field,
// generation-status badge, review-needed comparison panel, and Keep/
// Regenerate action is preserved unchanged -- only the markup nesting
// around them changed.
function nonEnglishContentFields(i18nByLang, serviceId, form = null) {
  return CANONICAL_LANGUAGES.filter((lang) => lang !== "en")
    .map((lang) => {
      const row = i18nByLang[lang] || {};
      const title = form ? String(form.get(`title_${lang}`) || "") : row.title || "";
      const shortDescription = form ? String(form.get(`shortDescription_${lang}`) || "") : row.short_description || "";
      const eligibilityText = form ? String(form.get(`eligibilityText_${lang}`) || "") : row.eligibility_text || "";
      const body = `${serviceId && row.needs_review ? reviewNeededPanel(serviceId, lang, row, i18nByLang.en) : ""}
        <label for="title-${lang}">Title</label>
        <input type="text" name="title_${lang}" id="title-${lang}" value="${escapeHtml(title)}">
        <label for="desc-${lang}">Short description</label>
        <textarea name="shortDescription_${lang}" id="desc-${lang}">${escapeHtml(shortDescription)}</textarea>
        <label for="elig-${lang}">Eligibility</label>
        <textarea name="eligibilityText_${lang}" id="elig-${lang}">${escapeHtml(eligibilityText)}</textarea>
        <p class="muted">Filled in automatically from the English content above. Type here only to permanently override the automatic translation for this language.</p>`;
      return collapsibleSection({ id: `lang-${lang}`, title: LANGUAGE_LABELS[lang], badgeHtml: translationStatusBadge(row), open: false, nested: true, bodyHtml: body });
    })
    .join("");
}

// "Processing Options & Pricing" -- the dual-tier editor for a document
// service (document_automated/document_manual). Express is always
// rendered first, Regular second, per the explicit display-order
// requirement; PROCESSING_TIERS' own order is relied on here. A blank
// price/lead-time field means "not yet configured" (NULL in the
// database) -- never prefilled with a guessed or zero value.
// `form` (optional) echoes back the just-submitted, not-yet-saved values
// instead of the stored service's -- used only by the error-recovery
// re-render path, same convention as pricingSummary/priceComponentFields.
function processingTierFields(service, form = null) {
  const migratedNotice = service.regular_price_migrated_from_legacy
    ? `<p class="priority-badge priority-badge--priority">This Regular Processing price was carried over from this service's previous single price. Please review and re-save to confirm it before activating.</p>`
    : "";
  const tierFieldset = (tier) => {
    const prefix = tier;
    const enabled = form ? form.get(`${prefix}Enabled`) === "on" : !!service[`${tier}_enabled`];
    const priceStr = form ? String(form.get(`${prefix}Price`) || "") : service[`${tier}_price_php_centavos`] != null ? (service[`${tier}_price_php_centavos`] / 100).toFixed(2) : "";
    const minStr = form ? String(form.get(`${prefix}MinDays`) || "") : service[`${tier}_min_business_days`] != null ? String(service[`${tier}_min_business_days`]) : "";
    const maxStr = form ? String(form.get(`${prefix}MaxDays`) || "") : service[`${tier}_max_business_days`] != null ? String(service[`${tier}_max_business_days`]) : "";
    return `<fieldset style="border:1px solid #e2e2dc;border-radius:6px;padding:0.8rem 1rem;margin-bottom:0.8rem;">
      <legend>${escapeHtml(TIER_LABELS[tier].toUpperCase())}</legend>
      <label for="${prefix}Enabled"><input type="checkbox" name="${prefix}Enabled" id="${prefix}Enabled" style="width:auto;display:inline-block;" ${enabled ? "checked" : ""}> Enabled</label>
      <label for="${prefix}Price">All-inclusive price (PHP)</label>
      <input type="text" name="${prefix}Price" id="${prefix}Price" value="${escapeHtml(priceStr)}" placeholder="e.g. 5000.00">
      <label for="${prefix}MinDays">Minimum processing time (business days)</label>
      <input type="text" name="${prefix}MinDays" id="${prefix}MinDays" value="${escapeHtml(minStr)}" placeholder="e.g. 2">
      <label for="${prefix}MaxDays">Maximum processing time (business days)</label>
      <input type="text" name="${prefix}MaxDays" id="${prefix}MaxDays" value="${escapeHtml(maxStr)}" placeholder="e.g. 3">
      ${tier === "regular" ? migratedNotice : ""}
    </fieldset>`;
  };
  return `<p class="muted">Leave a tier's price/lead-time blank until you're ready to approve it -- a blank field is never treated as a zero price. At least one enabled tier needs a complete price and lead-time range before this service can be activated.</p>
    ${tierFieldset("express")}
    ${tierFieldset("regular")}`;
}

// Parses + validates the Processing Options & Pricing form into the
// shape lib/checkout.js updateProcessingTiers expects. A blank price/
// lead-time input becomes null ("not yet configured"); anything else is
// parsed and validated (validateTierInput, called inside
// updateProcessingTiers) before it is ever persisted.
function parseProcessingTiersFromForm(form) {
  const parseTier = (tier) => {
    const priceRaw = String(form.get(`${tier}Price`) || "").trim();
    const minRaw = String(form.get(`${tier}MinDays`) || "").trim();
    const maxRaw = String(form.get(`${tier}MaxDays`) || "").trim();
    let priceCentavos = null;
    if (priceRaw) {
      priceCentavos = phpStringToCentavos(priceRaw);
      if (priceCentavos === null) throw new HttpError(400, `${TIER_LABELS[tier]}: invalid price amount.`);
    }
    const minDays = minRaw ? Number(minRaw) : null;
    const maxDays = maxRaw ? Number(maxRaw) : null;
    if (minRaw && !Number.isInteger(minDays)) throw new HttpError(400, `${TIER_LABELS[tier]}: minimum processing time must be a whole number.`);
    if (maxRaw && !Number.isInteger(maxDays)) throw new HttpError(400, `${TIER_LABELS[tier]}: maximum processing time must be a whole number.`);
    return { enabled: form.get(`${tier}Enabled`) === "on", priceCentavos, minDays, maxDays };
  };
  return { express: parseTier("express"), regular: parseTier("regular") };
}

// `form` (optional), same convention as processingTierFields above.
function priceComponentFields(components, form = null) {
  const byType = {};
  for (const c of components) byType[c.component_type] = c;
  const val = (type, field, dbDefault) => {
    if (form) return String(form.get(field) || "");
    return byType[type] ? (byType[type].amount_php_centavos / 100).toFixed(2) : dbDefault;
  };
  const labelVal = (type, field, dbDefault) => {
    if (form) return String(form.get(field) || dbDefault);
    return byType[type] ? byType[type].label : dbDefault;
  };
  return `
    <p class="muted">These two amounts are added together into the ONE total a customer ever sees (no itemized breakdown is ever shown to a customer, per the Order &amp; Book Online pricing decision) -- they exist so FIS can internally track the government-fee and FIS-fee components separately.</p>
    <label for="serviceFeeLabel">FIS service fee — label</label>
    <input type="text" name="serviceFeeLabel" id="serviceFeeLabel" value="${escapeHtml(labelVal("service_fee", "serviceFeeLabel", "FIS Service Fee"))}">
    <label for="serviceFeeAmount">FIS service fee — amount (PHP)</label>
    <input type="text" name="serviceFeeAmount" id="serviceFeeAmount" value="${escapeHtml(val("service_fee", "serviceFeeAmount", ""))}" placeholder="e.g. 5000.00">
    <label for="govFeeLabel">Government fee — label (optional)</label>
    <input type="text" name="govFeeLabel" id="govFeeLabel" value="${escapeHtml(labelVal("government_fee", "govFeeLabel", "Government Fee"))}">
    <label for="govFeeAmount">Government fee — amount (PHP, optional)</label>
    <input type="text" name="govFeeAmount" id="govFeeAmount" value="${escapeHtml(val("government_fee", "govFeeAmount", ""))}">
    <label for="otherFeeLabel">Other charge — label (optional)</label>
    <input type="text" name="otherFeeLabel" id="otherFeeLabel" value="${escapeHtml(labelVal("other", "otherFeeLabel", "Other"))}">
    <label for="otherFeeAmount">Other charge — amount (PHP, optional)</label>
    <input type="text" name="otherFeeAmount" id="otherFeeAmount" value="${escapeHtml(val("other", "otherFeeAmount", ""))}">
    <label for="priceChangeReason">Reason for this price (optional, kept in the price history)</label>
    <input type="text" name="priceChangeReason" id="priceChangeReason" value="${escapeHtml(form ? String(form.get("priceChangeReason") || "") : "")}" placeholder="e.g. Initial approved price">`;
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

// "D. Service Configuration" -- the fields that rarely change once an
// offering is set up, pulled into their own collapsed-by-default section.
// Exact same stored values/validation as before; only the grouping moved.
// `current` is a plain {offeringType, serviceSlug, biFormId, serviceGroup,
// customerPriceLabel, displayOrder, supportsDelivery} object; `form`
// (optional) overrides every field from the just-submitted values, same
// convention as the pricing field renderers above.
function serviceConfigFields(current, form = null) {
  const offeringType = form ? String(form.get("offeringType") || "document_automated") : current.offeringType;
  const serviceSlug = form ? String(form.get("serviceSlug") || "") : current.serviceSlug;
  const biFormId = form ? String(form.get("biFormId") || "") : current.biFormId;
  const serviceGroup = form ? String(form.get("serviceGroup") || "") : current.serviceGroup;
  const customerPriceLabel = form ? String(form.get("customerPriceLabel") || "") : current.customerPriceLabel;
  const displayOrder = form ? String(form.get("displayOrder") || "0") : current.displayOrder;
  const supportsDelivery = form ? form.get("supportsDelivery") === "on" : current.supportsDelivery;
  return `${offeringTypeField(offeringType)}
    <label for="serviceSlug">Service slug (matches the existing public service pages)</label>
    <input type="text" name="serviceSlug" id="serviceSlug" value="${escapeHtml(serviceSlug || "")}" required>
    <label for="biFormId">BI Form ID</label>
    <input type="text" name="biFormId" id="biFormId" value="${escapeHtml(biFormId || "")}">
    <p class="muted">Required, and must be a BI Form ID with an approved Forms Library configuration, only for "Automated document order." For a staff-processed order this is just a free-text reference code (optional). Not used for a bookable service.</p>
    <label for="serviceGroup">Service group (optional — groups related offerings/packages together, e.g. "airport-vip")</label>
    <input type="text" name="serviceGroup" id="serviceGroup" value="${escapeHtml(serviceGroup || "")}">
    <label for="customerPriceLabel">Customer-facing price label (optional — defaults to "Document price" or "Service price")</label>
    <input type="text" name="customerPriceLabel" id="customerPriceLabel" value="${escapeHtml(customerPriceLabel || "")}">
    <label for="displayOrder">Display order</label>
    <input type="text" name="displayOrder" id="displayOrder" value="${escapeHtml(String(displayOrder))}">
    <label for="supportsDelivery"><input type="checkbox" name="supportsDelivery" id="supportsDelivery" style="width:auto;display:inline-block;" ${supportsDelivery ? "checked" : ""}> This offering involves physical document delivery</label>`;
}

// Pure validation, no persistence -- pulled out of saveLanguageContent so
// the English-required check runs and can fail BEFORE any tier/price
// write happens, rather than (as before) after. This is the one
// behavioral tightening this refinement makes: it closes a pre-existing
// partial-write edge case (tier/price saved, then the save fails on a
// missing English field) without changing what is required or how it is
// validated -- saveLanguageContent still carries its own identical check
// as a second, harmless safety net.
function validateEnglishContent(form) {
  const title = String(form.get("title_en") || "").trim();
  const shortDescription = String(form.get("shortDescription_en") || "").trim();
  const eligibilityText = String(form.get("eligibilityText_en") || "").trim();
  if (!title || !shortDescription || !eligibilityText) {
    throw new HttpError(400, "English title, short description, and eligibility text are required.");
  }
}

// "F. Approval & Publication" -- unchanged status/approval controls and
// transition rules, just grouped into their own labelled section. The
// explicit note makes the save-vs-activate distinction the directive
// asks for: these buttons act immediately and independently of the
// "Save changes" button in the form below.
function approvalSectionBody(service, staff, serviceId) {
  const statusButtons = OFFERING_STATUSES.map(
    (s) =>
      `<form method="POST" action="/staff/instant-services/catalogue/${serviceId}/status" style="display:inline-block;margin-right:0.4rem;">
         <input type="hidden" name="status" value="${s}">
         <button class="${s === service.offering_status ? "" : "secondary"}" type="submit" ${s === service.offering_status ? "disabled" : ""}>${s}</button>
       </form>`
  ).join("");
  return `<p><strong>Offering type:</strong> ${escapeHtml(OFFERING_TYPE_LABELS[service.offering_type] || service.offering_type)}</p>
     <p><strong>Status:</strong> <span class="status">${escapeHtml(service.offering_status)}</span>${service.active ? ' <span class="status">(customer-visible)</span>' : ""}</p>
     <p><strong>Business approval:</strong> ${
       service.approved_at
         ? `Approved by ${escapeHtml(service.approved_by_staff_email)} on ${escapeHtml(service.approved_at)}`
         : '<span class="muted">Not yet approved -- cannot be activated until an administrator moves this to "approved".</span>'
     }</p>
     <p class="muted">These buttons change the publication status immediately and independently of the form below -- they do not save any field edits, and saving the form below never changes status or activates this offering.</p>
     ${staff.role === "admin" ? statusButtons : '<p class="muted">Only an administrator can change offering status.</p>'}`;
}

// The shared assembly of sections A/B/C/D/E inside the create/edit
// <form> -- used by newServiceForm, viewService, and both error-recovery
// renderers below, so there is exactly one place that lays these five
// sections out. `offeringType` decides which of A (tiers) / E (legacy
// components) is relevant and therefore open by default; `forceOpenSection`
// (one of "tiers" | "content-en" | "translations" | "config" | "components",
// or null) overrides that default for the one section a save just failed
// on, per the directive's "automatically expand the relevant section"
// requirement. `form` (optional, the just-submitted FormData) is threaded
// through to every field renderer so the whole form echoes back exactly
// what was typed, not the last-saved values.
function catalogueFormSections({ offeringType, configCurrent, tierService, components, i18nByLang, serviceId, form = null, forceOpenSection = null, isNewOffering = false }) {
  const tiered = usesProcessingTiers(offeringType);
  // On the "Add an Offering" page, the open/closed state below is computed
  // once at page load from a hardcoded default offeringType
  // (NEW_SERVICE_TIER_STUB) -- there is no client-side script that
  // re-opens the matching pricing section when a staff member later
  // changes the "Offering type" dropdown (this form is plain server-
  // rendered HTML, not reactive). Gating tiers/components/config on
  // `tiered` alone would silently hide whichever pricing section actually
  // matches the type the staff member picks. Since nothing is saved yet
  // for a brand-new offering, there is no cost to showing every relevant
  // section up front instead.
  const open = {
    tiers: forceOpenSection === "tiers" ? true : isNewOffering ? true : tiered,
    components: forceOpenSection === "components" ? true : isNewOffering ? true : !tiered,
    translations: forceOpenSection === "translations" ? true : false,
    config: forceOpenSection === "config" ? true : isNewOffering,
  };
  const NOT_APPLICABLE_TIERS = '<span class="muted">not applicable — see "Other Pricing Settings" below</span>';
  const NOT_APPLICABLE_COMPONENTS = '<span class="muted">not applicable — see "Processing Options &amp; Pricing" above</span>';
  return `
    ${collapsibleSection({
      id: "tiers",
      title: "A. Processing Options & Pricing",
      open: open.tiers,
      badgeHtml: tiered ? pricingSummary(tierService, form) : NOT_APPLICABLE_TIERS,
      bodyHtml: processingTierFields(tierService, form),
    })}
    ${collapsibleSection({
      id: "content-en",
      title: "B. Customer-Facing Content (English)",
      open: true,
      bodyHtml: englishContentField(i18nByLang.en, form),
    })}
    ${collapsibleSection({
      id: "translations",
      title: "C. Translations & Manual Overrides",
      open: open.translations,
      badgeHtml: translationsSectionBadge(i18nByLang),
      bodyHtml: nonEnglishContentFields(i18nByLang, serviceId, form),
    })}
    ${collapsibleSection({
      id: "config",
      title: "D. Service Configuration",
      open: open.config,
      bodyHtml: serviceConfigFields(configCurrent, form),
    })}
    ${collapsibleSection({
      id: "components",
      title: "E. Other Pricing Settings",
      open: open.components,
      badgeHtml: !tiered ? componentsSummaryBadge(components, form) : NOT_APPLICABLE_COMPONENTS,
      bodyHtml: priceComponentFields(components, form),
    })}`;
}

// New-offering stub: both tiers default enabled (migration 0016's own
// default), unpriced -- used both for the real blank form and as the
// "service-shaped" object pricingSummary/processingTierFields read from.
const NEW_SERVICE_TIER_STUB = { offering_type: "document_automated", express_enabled: 1, regular_enabled: 1, regular_price_migrated_from_legacy: 0 };

export async function newServiceForm(env, staff) {
  const offeringType = NEW_SERVICE_TIER_STUB.offering_type;
  const configCurrent = { offeringType, serviceSlug: "", biFormId: "", serviceGroup: "", customerPriceLabel: "", displayOrder: 0, supportsDelivery: true };
  return staffPage(
    "Add a Document Order or Bookable Service",
    `<h1>Add an Offering</h1>
     <form method="POST" action="/staff/instant-services/catalogue">
       ${catalogueFormSections({ offeringType, configCurrent, tierService: NEW_SERVICE_TIER_STUB, components: [], i18nByLang: {}, serviceId: null, isNewOffering: true })}
       <p class="muted">New offerings are created in "draft" status. Move to "ready for review", then "active", only once the price, content, and (for an automated document) the BI Form mapping have been reviewed and approved. Activation is refused automatically if no approved price has been set.</p>
       <button type="submit">Create (draft)</button>
     </form>`,
    staff.email
  );
}

// Error-recovery re-render for createServiceHandler below -- same page,
// same action URL, with every submitted value echoed back (including
// invalid ones, so the owner can see and fix exactly what they typed)
// and `forceOpenSection` expanding whichever section the failure came
// from, per the directive's requirement 4.8.
function renderCreateServiceError(staff, form, errorMessage, forceOpenSection) {
  const offeringType = String(form.get("offeringType") || "document_automated");
  const tierService = { offering_type: offeringType, regular_price_migrated_from_legacy: 0 };
  return staffPage(
    "Add a Document Order or Bookable Service",
    `<h1>Add an Offering</h1>
     <div class="card form-error-card"><p><strong>Could not save:</strong> ${escapeHtml(errorMessage)}</p></div>
     <form method="POST" action="/staff/instant-services/catalogue">
       ${catalogueFormSections({ offeringType, configCurrent: {}, tierService, components: [], i18nByLang: {}, serviceId: null, form, forceOpenSection })}
       <p class="muted">New offerings are created in "draft" status. Move to "ready for review", then "active", only once the price, content, and (for an automated document) the BI Form mapping have been reviewed and approved. Activation is refused automatically if no approved price has been set.</p>
       <button type="submit">Create (draft)</button>
     </form>`,
    staff.email,
    400
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

// Tags an HttpError with which section of the editor its field lives in,
// re-throws it, and lets everything else propagate unchanged -- used so
// the catch block in createServiceHandler/updateServiceHandler knows
// which collapsed section to force open on re-render (directive
// requirement 4.8), without changing what any validator checks or when
// it's allowed to fail.
function withSection(section, fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof HttpError && !err.section) err.section = section;
    throw err;
  }
}

export async function createServiceHandler(request, env, staff) {
  const denied = adminOnlyResponse(staff);
  if (denied) return denied;
  const form = await request.formData();
  const serviceSlug = String(form.get("serviceSlug") || "").trim();
  const biFormId = String(form.get("biFormId") || "").trim();
  const offeringType = String(form.get("offeringType") || "document_automated");

  try {
    withSection("config", () => {
      if (!OFFERING_TYPES.includes(offeringType)) throw new HttpError(400, "Unknown offering type");
      if (!serviceSlug) throw new HttpError(400, "Service slug is required");
      if (offeringType !== "bookable_service" && !biFormId && offeringType === "document_automated") {
        throw new HttpError(400, "A BI Form ID is required for an automated document order");
      }
    });
    withSection("content-en", () => validateEnglishContent(form));

    // Document services use the new dual-tier model exclusively; the
    // legacy itemized-components price remains the single source of truth
    // for every other offering type, completely unchanged.
    const tiers = usesProcessingTiers(offeringType) ? withSection("tiers", () => parseProcessingTiersFromForm(form)) : null;
    const components = tiers ? null : withSection("components", () => parsePriceComponentsFromForm(form));

    const service = await createService(env.DB, {
      serviceSlug,
      biFormId: biFormId || "",
      offeringType,
      serviceGroup: String(form.get("serviceGroup") || "").trim() || null,
      customerPriceLabel: String(form.get("customerPriceLabel") || "").trim() || null,
      supportsDelivery: form.get("supportsDelivery") === "on",
      displayOrder: Number(form.get("displayOrder")) || 0,
    });
    if (tiers) {
      await updateProcessingTiers(env.DB, service.id, tiers);
    } else {
      await updatePriceComponentsWithHistory(env.DB, service.id, components, staff.email, parsePriceChangeReason(form));
    }
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
  } catch (err) {
    if (err instanceof HttpError) {
      return renderCreateServiceError(staff, form, err.message, err.section || null);
    }
    throw err;
  }
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
  const configCurrent = {
    offeringType: service.offering_type,
    serviceSlug: service.service_slug,
    biFormId: service.bi_form_id || "",
    serviceGroup: service.service_group || "",
    customerPriceLabel: service.customer_price_label || "",
    displayOrder: service.display_order,
    supportsDelivery: !!service.supports_delivery,
  };

  return staffPage(
    `Catalogue: ${service.service_slug}`,
    `<h1>${escapeHtml(service.service_slug)}</h1>
     ${collapsibleSection({ id: "approval", title: "F. Approval & Publication", open: true, badgeHtml: approvalSectionBadge(service), bodyHtml: approvalSectionBody(service, staff, serviceId) })}
     <form method="POST" action="/staff/instant-services/catalogue/${serviceId}">
       ${catalogueFormSections({ offeringType: service.offering_type, configCurrent, tierService: service, components, i18nByLang, serviceId })}
       <button type="submit">Save changes</button>
     </form>
     ${collapsibleSection({ id: "price-history", title: "G. Price History", open: false, bodyHtml: priceHistoryTable(history) })}`,
    staff.email
  );
}

// Error-recovery re-render for updateServiceHandler below -- mirrors
// renderCreateServiceError, but re-reads the (unchanged, since nothing
// was persisted) stored service/translations/history so sections F and G
// still show real data, not an echo.
async function renderUpdateServiceError(env, staff, serviceId, form, errorMessage, forceOpenSection) {
  const service = await getServiceById(env.DB, serviceId);
  const components = await getPriceComponents(env.DB, serviceId);
  const history = await getPriceHistory(env.DB, serviceId);
  const i18nByLang = {};
  for (const lang of CANONICAL_LANGUAGES) {
    const row = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = ?").bind(serviceId, lang).first();
    if (row) i18nByLang[lang] = row;
  }
  const offeringType = String(form.get("offeringType") || service.offering_type);

  return staffPage(
    `Catalogue: ${service.service_slug}`,
    `<h1>${escapeHtml(service.service_slug)}</h1>
     <div class="card form-error-card"><p><strong>Could not save:</strong> ${escapeHtml(errorMessage)}</p></div>
     ${collapsibleSection({ id: "approval", title: "F. Approval & Publication", open: true, badgeHtml: approvalSectionBadge(service), bodyHtml: approvalSectionBody(service, staff, serviceId) })}
     <form method="POST" action="/staff/instant-services/catalogue/${serviceId}">
       ${catalogueFormSections({ offeringType, configCurrent: {}, tierService: service, components, i18nByLang, serviceId, form, forceOpenSection })}
       <button type="submit">Save changes</button>
     </form>
     ${collapsibleSection({ id: "price-history", title: "G. Price History", open: false, bodyHtml: priceHistoryTable(history) })}`,
    staff.email,
    400
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

  try {
    withSection("config", () => {
      if (!OFFERING_TYPES.includes(offeringType)) throw new HttpError(400, "Unknown offering type");
      if (!serviceSlug) throw new HttpError(400, "Service slug is required");
    });
    withSection("content-en", () => validateEnglishContent(form));

    const tiers = usesProcessingTiers(offeringType) ? withSection("tiers", () => parseProcessingTiersFromForm(form)) : null;
    const components = tiers ? null : withSection("components", () => parsePriceComponentsFromForm(form));

    await updateServiceMeta(env.DB, serviceId, {
      serviceSlug,
      biFormId: biFormId || "",
      offeringType,
      serviceGroup: String(form.get("serviceGroup") || "").trim() || null,
      customerPriceLabel: String(form.get("customerPriceLabel") || "").trim() || null,
      supportsDelivery: form.get("supportsDelivery") === "on",
      displayOrder: Number(form.get("displayOrder")) || 0,
    });
    if (tiers) {
      await updateProcessingTiers(env.DB, serviceId, tiers);
    } else {
      await updatePriceComponentsWithHistory(env.DB, serviceId, components, staff.email, parsePriceChangeReason(form));
    }
    await saveLanguageContent(env.DB, serviceId, form);
    await ensureServiceTranslations(env, serviceId);
    await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "updated_instant_services_catalogue_entry", targetTable: "checkout_services", targetId: serviceId });

    return redirectTo(request, `/staff/instant-services/catalogue/${serviceId}`);
  } catch (err) {
    if (err instanceof HttpError) {
      return await renderUpdateServiceError(env, staff, serviceId, form, err.message, err.section || null);
    }
    throw err;
  }
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
