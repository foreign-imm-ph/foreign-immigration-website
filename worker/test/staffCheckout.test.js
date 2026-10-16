import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker from "../src/index.js";
import { createTestClient, createTestCheckoutService, createTestStaff, SITE_ORIGIN, selectProcessingTier } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";
import { findOrCreateDraftOrder, startOrderApplication, startBookingApplication, computeAndSnapshotPrice, transitionOrder, getServiceById, getPriceHistory, usesProcessingTiers } from "../src/lib/checkout.js";
import { newId } from "../src/lib/crypto.js";
import { createBooking, transitionBooking, getBookingByOrderId } from "../src/lib/airportVip.js";

let keypair;
let restoreFetch;

beforeAll(async () => {
  keypair = await generateTestAccessKeypair();
  restoreFetch = mockAccessJwksEndpoint(env.CF_ACCESS_TEAM_DOMAIN, keypair.jwks);
});

afterAll(() => {
  restoreFetch();
});

async function staffRequest(path, staffRow, { method = "GET", body, headers = {} } = {}) {
  const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, {
    email: staffRow.email,
    aud: [env.CF_ACCESS_AUD],
    exp: Math.floor(Date.now() / 1000) + 300,
  });
  const init = { method, headers: { "Cf-Access-Jwt-Assertion": jwt, Origin: SITE_ORIGIN, ...headers } };
  if (body !== undefined) init.body = body;
  return worker.fetch(new Request(`${SITE_ORIGIN}${path}`, init), env);
}

function formBody(fields) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, v);
  return params;
}

// Sets up a fully-paid-service order with a submitted-but-unverified
// payment, the same real path a customer would take (via the
// lib/checkout.js helpers directly, for speed) -- used by several tests
// below as a shared fixture builder.
async function createOrderAwaitingVerification(service) {
  const client = await createTestClient();
  let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
  const { applicationId } = await startOrderApplication(env.DB, order, service);
  order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
  if (usesProcessingTiers(service.offering_type)) {
    order = await selectProcessingTier(order, "regular");
  }
  const snapshot = await computeAndSnapshotPrice(env.DB, order);
  const paymentId = newId();
  await env.DB
    .prepare("INSERT INTO payment_requests (id, application_id, amount_php, description, checkout_order_id, purpose, status, submitted_at) VALUES (?, ?, ?, ?, ?, 'checkout_service', 'submitted', datetime('now'))")
    .bind(paymentId, applicationId, snapshot.totalPhpCentavos / 100, "Instant Services test", order.id)
    .run();
  await env.DB
    .prepare("INSERT INTO payment_proofs (id, payment_request_id, r2_key, original_filename, content_type, size_bytes) VALUES (?, ?, ?, 'proof.jpg', 'image/jpeg', 10)")
    .bind(newId(), paymentId, `config/test-proof-${paymentId}.jpg`)
    .run();
  const refreshedOrder = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
  await transitionOrder(env.DB, refreshedOrder, "awaiting_payment");
  await transitionOrder(env.DB, await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first(), "awaiting_verification");
  return { client, order: await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first(), paymentId };
}

describe("Staff Instant Services: orders", () => {
  it("lists orders and renders an individual order's detail page", async () => {
    const staff = await createTestStaff();
    const service = await createTestCheckoutService();
    const { order } = await createOrderAwaitingVerification(service);

    const listResp = await staffRequest("/staff/instant-services/orders/", staff);
    expect(listResp.status).toBe(200);
    expect(await listResp.text()).toContain(order.id.slice(0, 8));

    const detailResp = await staffRequest(`/staff/instant-services/orders/${order.id}`, staff);
    expect(detailResp.status).toBe(200);
    const html = await detailResp.text();
    expect(html).toContain("awaiting_verification");
  });

  it("404s an unknown order", async () => {
    const staff = await createTestStaff();
    const resp = await staffRequest("/staff/instant-services/orders/not-a-real-order", staff);
    expect(resp.status).toBe(404);
  });

  it("verifying a submitted payment marks it paid and advances the order to paid", async () => {
    const staff = await createTestStaff();
    const service = await createTestCheckoutService();
    const { order, paymentId } = await createOrderAwaitingVerification(service);

    const resp = await staffRequest(`/staff/instant-services/orders/${order.id}/payments/${paymentId}/verify`, staff, { method: "POST" });
    expect(resp.status).toBe(303);

    const payment = await env.DB.prepare("SELECT status, verified_by_staff_email FROM payment_requests WHERE id = ?").bind(paymentId).first();
    expect(payment.status).toBe("paid");
    expect(payment.verified_by_staff_email).toBe(staff.email);

    const updatedOrder = await env.DB.prepare("SELECT status FROM checkout_orders WHERE id = ?").bind(order.id).first();
    expect(updatedOrder.status).toBe("paid");
  });

  it("verifying payment for an Airport VIP booking advances the booking to payment_verified, never straight to confirmed", async () => {
    const staff = await createTestStaff();
    const service = await createTestCheckoutService({ offeringType: "bookable_service", supportsDelivery: 0 });
    const client = await createTestClient();
    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    await startBookingApplication(env.DB, order, service);
    const booking = await createBooking(env.DB, {
      checkoutOrderId: order.id,
      clientId: client.id,
      serviceId: service.id,
      booking: {
        direction: "arrival", passengerCount: 1, passengerNames: ["Test Passenger"],
        airport: "NAIA", airline: "PAL", flightNumber: "PR100",
        scheduledLocalDate: "2027-01-01", scheduledLocalTime: "10:00", scheduledTimezone: "Asia/Manila",
      },
    });
    await transitionBooking(env.DB, booking, "awaiting_payment_verification");

    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    const snapshot = await computeAndSnapshotPrice(env.DB, order);
    const paymentId = newId();
    await env.DB
      .prepare("INSERT INTO payment_requests (id, application_id, amount_php, description, checkout_order_id, purpose, status, submitted_at) VALUES (?, ?, ?, ?, ?, 'checkout_service', 'submitted', datetime('now'))")
      .bind(paymentId, order.application_id, snapshot.totalPhpCentavos / 100, "Airport VIP test", order.id)
      .run();
    await transitionOrder(env.DB, order, "awaiting_payment");
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await transitionOrder(env.DB, order, "awaiting_verification");

    const resp = await staffRequest(`/staff/instant-services/orders/${order.id}/payments/${paymentId}/verify`, staff, { method: "POST" });
    expect(resp.status).toBe(303);

    const updatedBooking = await getBookingByOrderId(env.DB, order.id);
    expect(updatedBooking.status).toBe("payment_verified");
    expect(updatedBooking.status).not.toBe("confirmed");
  });

  it("rejecting a submitted payment requires a note and sends the order back to awaiting_payment without marking the payment paid", async () => {
    const staff = await createTestStaff();
    const service = await createTestCheckoutService();
    const { order, paymentId } = await createOrderAwaitingVerification(service);

    const noNote = await staffRequest(`/staff/instant-services/orders/${order.id}/payments/${paymentId}/reject`, staff, {
      method: "POST",
      body: formBody({}),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(noNote.status).toBe(400);

    const resp = await staffRequest(`/staff/instant-services/orders/${order.id}/payments/${paymentId}/reject`, staff, {
      method: "POST",
      body: formBody({ note: "Receipt image is unreadable, please resubmit." }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(303);

    const updatedOrder = await env.DB.prepare("SELECT status FROM checkout_orders WHERE id = ?").bind(order.id).first();
    expect(updatedOrder.status).toBe("awaiting_payment");
    const payment = await env.DB.prepare("SELECT status FROM payment_requests WHERE id = ?").bind(paymentId).first();
    expect(payment.status).toBe("submitted"); // never silently marked paid by a rejection
  });

  it("issuing a delivery quotation creates a separate payment request and sets the order awaiting delivery payment", async () => {
    const staff = await createTestStaff();
    const service = await createTestCheckoutService({ supportsDelivery: 1 });
    const { order } = await createOrderAwaitingVerification(service);

    const resp = await staffRequest(`/staff/instant-services/orders/${order.id}/delivery-quotation`, staff, {
      method: "POST",
      body: formBody({ amountPhp: "350.00", notes: "Domestic courier" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(303);

    const deliveryPayment = await env.DB
      .prepare("SELECT * FROM payment_requests WHERE checkout_order_id = ? AND purpose = 'checkout_delivery'")
      .bind(order.id)
      .first();
    expect(deliveryPayment).toBeTruthy();
    expect(deliveryPayment.amount_php).toBe(350);

    const deliveryStatus = await env.DB
      .prepare("SELECT status FROM checkout_delivery_status_history WHERE order_id = ? ORDER BY changed_at DESC LIMIT 1")
      .bind(order.id)
      .first();
    expect(deliveryStatus.status).toBe("awaiting_delivery_payment");
  });

  it("staff can set a delivery status directly, including correcting to an exception", async () => {
    const staff = await createTestStaff();
    const service = await createTestCheckoutService({ supportsDelivery: 1 });
    const { order } = await createOrderAwaitingVerification(service);

    const resp = await staffRequest(`/staff/instant-services/orders/${order.id}/delivery-status`, staff, {
      method: "POST",
      body: formBody({ status: "delivery_exception", note: "Address undeliverable", courier: "LBC" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(303);

    const deliveryStatus = await env.DB
      .prepare("SELECT status, courier FROM checkout_delivery_status_history WHERE order_id = ? ORDER BY changed_at DESC LIMIT 1")
      .bind(order.id)
      .first();
    expect(deliveryStatus.status).toBe("delivery_exception");
    expect(deliveryStatus.courier).toBe("LBC");
  });

  it("entering a tracking number never auto-marks an order delivered -- staff must explicitly choose that status", async () => {
    const staff = await createTestStaff();
    const service = await createTestCheckoutService({ supportsDelivery: 1 });
    const { order } = await createOrderAwaitingVerification(service);

    const resp = await staffRequest(`/staff/instant-services/orders/${order.id}/delivery-status`, staff, {
      method: "POST",
      body: formBody({ status: "dispatched", trackingNumber: "LBC123456789", courier: "LBC" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(303);

    const deliveryStatus = await env.DB
      .prepare("SELECT status, tracking_number FROM checkout_delivery_status_history WHERE order_id = ? ORDER BY changed_at DESC LIMIT 1")
      .bind(order.id)
      .first();
    expect(deliveryStatus.tracking_number).toBe("LBC123456789");
    expect(deliveryStatus.status).toBe("dispatched"); // not auto-upgraded to "delivered" just because a tracking number was entered
  });

  it("rejects an unknown delivery status", async () => {
    const staff = await createTestStaff();
    const service = await createTestCheckoutService({ supportsDelivery: 1 });
    const { order } = await createOrderAwaitingVerification(service);

    const resp = await staffRequest(`/staff/instant-services/orders/${order.id}/delivery-status`, staff, {
      method: "POST",
      body: formBody({ status: "not_a_real_status" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(400);
  });
});

describe("Staff Instant Services: QR Ph payment settings (admin-gated)", () => {
  it("a non-admin cannot change payment settings", async () => {
    const staff = await createTestStaff({ role: "staff" });
    const resp = await staffRequest("/staff/instant-services/payment-settings", staff, {
      method: "POST",
      body: formBody({ merchantDisplayName: "Hacker Merchant", enabled: "on" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(403);
  });

  it("an admin can configure and enable QR Ph with a real image, and it's reflected in the audit trail", async () => {
    const staff = await createTestStaff({ role: "admin" });

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const formData = new FormData();
    formData.set("merchantDisplayName", "FIS Test Merchant");
    formData.set("customerInstructions", "Scan and pay the exact amount shown.");
    formData.set("enabled", "on");
    formData.set("qrImage", new File([pngBytes], "qr.png", { type: "image/png" }));

    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, { email: staff.email, aud: [env.CF_ACCESS_AUD], exp: Math.floor(Date.now() / 1000) + 300 });
    const resp = await worker.fetch(
      new Request(`${SITE_ORIGIN}/staff/instant-services/payment-settings`, {
        method: "POST",
        headers: { "Cf-Access-Jwt-Assertion": jwt, Origin: SITE_ORIGIN },
        body: formData,
      }),
      env
    );
    expect(resp.status).toBe(303);

    const { getCurrentPaymentSettings, getPaymentSettingsHistory } = await import("../src/lib/checkoutPaymentSettings.js");
    const settings = await getCurrentPaymentSettings(env.DB);
    expect(settings.enabled).toBe(1);
    expect(settings.qr_image_r2_key).toBeTruthy();
    expect(settings.merchant_display_name).toBe("FIS Test Merchant");

    const history = await getPaymentSettingsHistory(env.DB, 5);
    expect(history[0].changed_by_staff_email).toBe(staff.email);

    const imageResp = await staffRequest("/staff/instant-services/payment-settings/qr-image", staff);
    expect(imageResp.status).toBe(200);
  });

  it("rejects a file that isn't a real image despite its extension", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const formData = new FormData();
    formData.set("enabled", "on");
    formData.set("qrImage", new File([new TextEncoder().encode("not an image")], "qr.png", { type: "image/png" }));

    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, { email: staff.email, aud: [env.CF_ACCESS_AUD], exp: Math.floor(Date.now() / 1000) + 300 });
    const resp = await worker.fetch(
      new Request(`${SITE_ORIGIN}/staff/instant-services/payment-settings`, {
        method: "POST",
        headers: { "Cf-Access-Jwt-Assertion": jwt, Origin: SITE_ORIGIN },
        body: formData,
      }),
      env
    );
    expect(resp.status).toBe(415);
  });
});

describe("Staff Instant Services: catalogue management (admin-gated)", () => {
  it("a non-admin cannot create a catalogue entry", async () => {
    const staff = await createTestStaff({ role: "staff" });
    const resp = await staffRequest("/staff/instant-services/catalogue", staff, {
      method: "POST",
      body: formBody({ serviceSlug: "x", biFormId: "x", serviceFeeAmount: "100", title_en: "X", shortDescription_en: "X", eligibilityText_en: "X" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(403);
  });

  it("an admin can create a service (inactive by default), then activate it -- the legacy single-price model, unchanged, for a non-document offering", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const resp = await staffRequest("/staff/instant-services/catalogue", staff, {
      method: "POST",
      body: formBody({
        serviceSlug: "motions-blacklist",
        offeringType: "bookable_service",
        displayOrder: "1",
        serviceFeeAmount: "5000.00",
        title_en: "Certificate of Derogatory Record",
        shortDescription_en: "CDR clearance",
        eligibilityText_en: "Eligible for foreign nationals",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(303);
    const location = resp.headers.get("Location");
    const serviceId = location.split("/").pop();

    const service = await getServiceById(env.DB, serviceId);
    expect(service.active).toBe(0);
    expect(service.service_slug).toBe("motions-blacklist");

    const components = await env.DB.prepare("SELECT * FROM checkout_price_components WHERE service_id = ?").bind(serviceId).all();
    expect(components.results).toHaveLength(1);
    expect(components.results[0].amount_php_centavos).toBe(500000);

    // Activation now requires having passed through the business-approval
    // checkpoint first (Phase 4, Stage C) -- a priced-but-unapproved
    // offering still can't go live via the legacy toggle.
    const approveResp = await staffRequest(`/staff/instant-services/catalogue/${serviceId}/status`, staff, {
      method: "POST",
      body: formBody({ status: "approved" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(approveResp.status).toBe(303);
    const approved = await getServiceById(env.DB, serviceId);
    expect(approved.approved_by_staff_email).toBe(staff.email);
    expect(approved.approved_at).toBeTruthy();

    const activateResp = await staffRequest(`/staff/instant-services/catalogue/${serviceId}/active`, staff, { method: "POST" });
    expect(activateResp.status).toBe(303);
    const activated = await getServiceById(env.DB, serviceId);
    expect(activated.active).toBe(1);
  });

  it("refuses to activate an offering that has a price but was never approved", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const service = await createTestCheckoutService({ active: 0 });
    // This fixture already has a price component from createTestCheckoutService,
    // but has never been through the 'approved' status.

    const resp = await staffRequest(`/staff/instant-services/catalogue/${service.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "active" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(409);

    const unchanged = await getServiceById(env.DB, service.id);
    expect(unchanged.active).toBe(0);
    expect(unchanged.offering_status).not.toBe("active");
  });

  it("records an append-only price history entry -- with the staff actor and an optional reason -- on creation and every subsequent price edit, and never alters an order's already-snapshotted price retroactively", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const createResp = await staffRequest("/staff/instant-services/catalogue", staff, {
      method: "POST",
      body: formBody({
        serviceSlug: "price-history-regression",
        offeringType: "fixed_price_service",
        biFormId: "",
        serviceFeeAmount: "2000.00",
        title_en: "Price History Regression",
        shortDescription_en: "X",
        eligibilityText_en: "X",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(createResp.status).toBe(303);
    const serviceId = createResp.headers.get("Location").split("/").pop();

    const historyAfterCreate = await getPriceHistory(env.DB, serviceId);
    expect(historyAfterCreate).toHaveLength(1);
    expect(historyAfterCreate[0].total_php_centavos).toBe(200000);
    expect(historyAfterCreate[0].changed_by_staff_email).toBe(staff.email);

    // A customer orders at the original price; the order's snapshot is taken now.
    await staffRequest(`/staff/instant-services/catalogue/${serviceId}/status`, staff, {
      method: "POST",
      body: formBody({ status: "approved" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const activateResp = await staffRequest(`/staff/instant-services/catalogue/${serviceId}/status`, staff, {
      method: "POST",
      body: formBody({ status: "active" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(activateResp.status).toBe(303);
    const service = await getServiceById(env.DB, serviceId);
    expect(service.active).toBe(1);
    const client = await createTestClient();
    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    const snapshotBeforePriceChange = await computeAndSnapshotPrice(env.DB, order);
    expect(snapshotBeforePriceChange.totalPhpCentavos).toBe(200000);

    // Staff then raises the price, recording a reason.
    const editResp = await staffRequest(`/staff/instant-services/catalogue/${serviceId}`, staff, {
      method: "POST",
      body: formBody({
        serviceSlug: "price-history-regression",
        offeringType: "fixed_price_service",
        biFormId: "",
        serviceFeeAmount: "3500.00",
        priceChangeReason: "Cost of supporting documents increased",
        title_en: "Price History Regression",
        shortDescription_en: "X",
        eligibilityText_en: "X",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(editResp.status).toBe(303);

    const historyAfterEdit = await getPriceHistory(env.DB, serviceId);
    expect(historyAfterEdit).toHaveLength(2);
    expect(historyAfterEdit[0].total_php_centavos).toBe(350000); // most recent first
    expect(historyAfterEdit[0].reason).toBe("Cost of supporting documents increased");
    expect(historyAfterEdit[1].total_php_centavos).toBe(200000); // original entry preserved

    // The already-accepted order's snapshot must be untouched by the later price change.
    const orderAfterPriceChange = await env.DB.prepare("SELECT price_snapshot_json FROM checkout_orders WHERE id = ?").bind(order.id).first();
    expect(JSON.parse(orderAfterPriceChange.price_snapshot_json).totalPhpCentavos).toBe(200000);
  });

  it("rejects creating a service with no valid service fee amount", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const resp = await staffRequest("/staff/instant-services/catalogue", staff, {
      method: "POST",
      body: formBody({ serviceSlug: "x", biFormId: "x", title_en: "X", shortDescription_en: "X", eligibilityText_en: "X" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(400);
  });

  it("rejects an automated-document offering whose BI Form ID has no approved, tested Forms Library configuration (regression for the October 2026 review finding)", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const resp = await staffRequest("/staff/instant-services/catalogue", staff, {
      method: "POST",
      body: formBody({
        serviceSlug: "not-a-real-form",
        offeringType: "document_automated",
        biFormId: "NOT-A-REAL-FORM-ID",
        serviceFeeAmount: "5000.00",
        title_en: "X",
        shortDescription_en: "X",
        eligibilityText_en: "X",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(400);
    const body = await resp.text();
    expect(body).toMatch(/approved, tested Forms Library configuration/);
  });

  it("lets a bookable service (Airport VIP) or a staff-processed manual document be created with no BI Form ID at all, never forcing it to reference an unrelated Forms Library entry", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const bookable = await staffRequest("/staff/instant-services/catalogue", staff, {
      method: "POST",
      body: formBody({
        serviceSlug: "regression-bookable",
        offeringType: "bookable_service",
        biFormId: "",
        serviceFeeAmount: "9900.00",
        title_en: "Regression Bookable Service",
        shortDescription_en: "X",
        eligibilityText_en: "X",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(bookable.status).toBe(303);

    const manual = await staffRequest("/staff/instant-services/catalogue", staff, {
      method: "POST",
      body: formBody({
        serviceSlug: "regression-manual",
        offeringType: "document_manual",
        biFormId: "",
        serviceFeeAmount: "1500.00",
        title_en: "Regression Manual Document",
        shortDescription_en: "X",
        eligibilityText_en: "X",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(manual.status).toBe(303);
  });

  it("refuses to activate an approved offering with no approved price, even via the direct status-change endpoint", async () => {
    const staff = await createTestStaff({ role: "admin" });
    // bookable_service: the legacy single-price gate, specifically --
    // tier-based activation for a document offering is covered separately
    // in the "Processing tiers" describe block below.
    const service = await createTestCheckoutService({ active: 0, offeringType: "bookable_service" });
    await env.DB.prepare("DELETE FROM checkout_price_components WHERE service_id = ?").bind(service.id).run();

    // Approved (isolating this test to the price gate specifically, not
    // the separate approval gate).
    await staffRequest(`/staff/instant-services/catalogue/${service.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "approved" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const resp = await staffRequest(`/staff/instant-services/catalogue/${service.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "active" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(409);

    const unchanged = await getServiceById(env.DB, service.id);
    expect(unchanged.active).toBe(0);
    expect(unchanged.offering_status).not.toBe("active");
  });

  // Translation accuracy refinement: a manually corrected translation must
  // be flagged -- never silently overwritten or silently left stale --
  // once its English source changes, and the owner's "Keep" decision must
  // actually clear that flag. This drives the real HTTP save path twice
  // (no AI call needed for drift *detection*, only for generation, which
  // is not exercised here -- see checkoutTranslation.test.js for the
  // AI-independent reconciliation-logic coverage).
  it("flags a manually approved translation needs_review when its English source changes, shows the warning, and 'Keep my translation' clears it without altering content", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const service = await createTestCheckoutService({ title: "Original English Title" });

    // Manually approve a zh-CN translation (an "optional override" save).
    await env.DB.prepare(
      `INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, auto_generated, field_hashes_json, source_hash, needs_review)
       VALUES (?, 'zh-CN', '人工审核标题', '人工审核说明', '人工审核资格', 0,
         '{"title":"orig","shortDescription":"orig","eligibilityText":"orig","noticesText":"orig"}', 'orig-whole-hash', 0)`
    )
      .bind(service.id)
      .run();

    // Owner changes the English title through the real catalogue edit form.
    const updateResp = await staffRequest(`/staff/instant-services/catalogue/${service.id}`, staff, {
      method: "POST",
      body: formBody({
        serviceSlug: service.service_slug,
        offeringType: service.offering_type,
        biFormId: service.bi_form_id || "",
        displayOrder: "0",
        serviceFeeAmount: "1000.00",
        title_en: "Updated English Title",
        shortDescription_en: "Test service description",
        eligibilityText_en: "Eligible for testing",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(updateResp.status).toBe(303);

    const flagged = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).first();
    expect(flagged.needs_review).toBe(1);
    expect(flagged.review_changed_fields).toContain("title");
    // Content is completely untouched.
    expect(flagged.title).toBe("人工审核标题");

    // The warning is shown prominently in the catalogue editor.
    const editPage = await staffRequest(`/staff/instant-services/catalogue/${service.id}`, staff);
    const editHtml = await editPage.text();
    expect(editHtml).toContain("Review needed");
    expect(editHtml).toContain("人工审核标题");
    expect(editHtml).toContain("Updated English Title");

    // Owner chooses "Keep my translation".
    const keepResp = await staffRequest(`/staff/instant-services/catalogue/${service.id}/i18n/zh-CN/keep`, staff, { method: "POST" });
    expect(keepResp.status).toBe(303);

    const reconciled = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).first();
    expect(reconciled.needs_review).toBe(0);
    expect(reconciled.review_changed_fields).toBeNull();
    expect(reconciled.title).toBe("人工审核标题"); // still untouched
    expect(reconciled.auto_generated).toBe(0); // still manually controlled
  });

  it("a non-admin cannot keep or regenerate a flagged translation", async () => {
    const staff = await createTestStaff({ role: "staff" });
    const service = await createTestCheckoutService();
    const keepResp = await staffRequest(`/staff/instant-services/catalogue/${service.id}/i18n/zh-CN/keep`, staff, { method: "POST" });
    expect(keepResp.status).toBe(403);
    const previewResp = await staffRequest(`/staff/instant-services/catalogue/${service.id}/i18n/zh-CN/regenerate-preview`, staff, { method: "POST" });
    expect(previewResp.status).toBe(403);
  });
});
