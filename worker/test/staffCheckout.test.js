import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker from "../src/index.js";
import { createTestClient, createTestCheckoutService, createTestStaff, SITE_ORIGIN } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";
import { findOrCreateDraftOrder, startOrderApplication, computeAndSnapshotPrice, transitionOrder, getServiceById } from "../src/lib/checkout.js";
import { newId } from "../src/lib/crypto.js";

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

  it("an admin can create a service (inactive by default), then activate it", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const resp = await staffRequest("/staff/instant-services/catalogue", staff, {
      method: "POST",
      body: formBody({
        serviceSlug: "motions-blacklist",
        biFormId: "CCS-A-CDR-2016",
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

    const activateResp = await staffRequest(`/staff/instant-services/catalogue/${serviceId}/active`, staff, { method: "POST" });
    expect(activateResp.status).toBe(303);
    const activated = await getServiceById(env.DB, serviceId);
    expect(activated.active).toBe(1);
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
});
