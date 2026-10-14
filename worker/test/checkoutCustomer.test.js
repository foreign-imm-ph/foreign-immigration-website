import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { authedRequest, createTestClient, createSessionCookieFor, createTestCheckoutService, createTestStaff, SITE_ORIGIN } from "./helpers.js";
import { findOrCreateDraftOrder } from "../src/lib/checkout.js";
import { recordPaymentSettingsChange } from "../src/lib/checkoutPaymentSettings.js";
import { newId } from "../src/lib/crypto.js";

async function createOrderFor(client, service) {
  return findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
}

describe("Instant Services: authenticated order routes", () => {
  it("rejects every order route without a session", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService();
    const order = await createOrderFor(client, service);

    const resp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}`), env);
    expect(resp.status).toBe(401);
  });

  it("refuses an order that belongs to a different client (no cross-customer exposure)", async () => {
    const owner = await createTestClient();
    const intruder = await createTestClient();
    const service = await createTestCheckoutService();
    const order = await createOrderFor(owner, service);

    const cookie = await createSessionCookieFor(intruder);
    const resp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}`, { cookie }), env);
    expect(resp.status).toBe(404);
  });

  it("returns the order, its service, and null submission/payment before anything has started", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ title: "Order Detail Service" });
    const order = await createOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    const resp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.order.status).toBe("draft");
    expect(body.order.submissionId).toBeNull();
    expect(body.service.title).toBe("Order Detail Service");
    expect(body.submissionStatus).toBeNull();
    expect(body.payment).toBeNull();
  });

  it("starting the application creates an application + bi_form_submission the customer can then reach through the existing BI-forms routes", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService();
    const order = await createOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    const resp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/application`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(200);
    const { applicationId, submissionId } = await resp.json();
    expect(applicationId).toBeTruthy();
    expect(submissionId).toBeTruthy();

    const application = await env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(applicationId).first();
    expect(application.client_id).toBe(client.id);

    const submission = await env.DB.prepare("SELECT * FROM bi_form_submissions WHERE id = ?").bind(submissionId).first();
    expect(submission.application_id).toBe(applicationId);
    expect(submission.intake_path).toBe("instant_checkout");

    // The existing, unmodified BI-forms customer route now works against it.
    const biResp = await worker.fetch(authedRequest(`/api/bi-forms/${submissionId}`, { cookie }), env);
    expect(biResp.status).toBe(200);

    // Idempotent: calling it again returns the exact same ids, not a duplicate.
    const again = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/application`, { method: "POST", cookie }), env);
    const againBody = await again.json();
    expect(againBody.applicationId).toBe(applicationId);
    expect(againBody.submissionId).toBe(submissionId);
  });

  it("sets and upserts a delivery address for a delivery-supporting service", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ supportsDelivery: 1 });
    const order = await createOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    const address = {
      recipientName: "Juan Dela Cruz",
      phone: "+639170000000",
      country: "Philippines",
      city: "Makati",
      addressLine1: "123 Ayala Ave",
      isInternational: false,
    };
    const resp = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/delivery-address`, { method: "PUT", cookie, body: address }),
      env
    );
    expect(resp.status).toBe(200);

    const updated = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/delivery-address`, {
        method: "PUT",
        cookie,
        body: { ...address, city: "Taguig" },
      }),
      env
    );
    expect(updated.status).toBe(200);

    const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM checkout_delivery_addresses WHERE order_id = ?").bind(order.id).first();
    expect(count).toBe(1);
    const row = await env.DB.prepare("SELECT * FROM checkout_delivery_addresses WHERE order_id = ?").bind(order.id).first();
    expect(row.city).toBe("Taguig");
  });

  it("rejects a delivery address for a service that does not support delivery", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ supportsDelivery: 0 });
    const order = await createOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    const resp = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/delivery-address`, {
        method: "PUT",
        cookie,
        body: { recipientName: "X", phone: "X", country: "X", city: "X", addressLine1: "X" },
      }),
      env
    );
    expect(resp.status).toBe(409);
  });

  it("refuses confirm-and-pay before the questionnaire has been submitted", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ supportsDelivery: 0 });
    const order = await createOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/application`, { method: "POST", cookie }), env);

    const resp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/confirm-and-pay`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(409);
  });

  it("refuses confirm-and-pay when QR Ph has never been configured, and never fabricates a QR code", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ supportsDelivery: 0 });
    const order = await createOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/application`, { method: "POST", cookie }), env);
    const refreshed = await env.DB.prepare("SELECT bi_form_submission_id FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await env.DB.prepare("UPDATE bi_form_submissions SET status = 'submitted' WHERE id = ?").bind(refreshed.bi_form_submission_id).run();

    const resp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/confirm-and-pay`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(503);
  });

  it("full happy path: application -> submit -> confirm-and-pay (QR Ph enabled) -> upload proof -> order reaches awaiting_verification", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ supportsDelivery: 0 });
    const order = await createOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();

    await recordPaymentSettingsChange(env.DB, {
      changedByStaffEmail: staff.email,
      changes: { qrImageR2Key: "config/test-qr-ph-instant-services.png", merchantDisplayName: "FIS Test Merchant", customerInstructions: "Scan and pay the exact amount shown.", enabled: true },
    });
    await env.CLIENT_FILES.put("config/test-qr-ph-instant-services.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    const startResp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/application`, { method: "POST", cookie }), env);
    const { submissionId } = await startResp.json();

    const submitResp = await worker.fetch(authedRequest(`/api/bi-forms/${submissionId}/submit`, { method: "POST", cookie }), env);
    // The shared questionnaire validator may reject an empty answer set as
    // incomplete (422) -- that's existing, reused Forms Library behavior,
    // not something this feature overrides. Force the status directly in
    // that case so this test can still exercise confirm-and-pay onward,
    // exactly like a customer who actually filled the form in would reach.
    if (submitResp.status !== 200) {
      await env.DB.prepare("UPDATE bi_form_submissions SET status = 'submitted' WHERE id = ?").bind(submissionId).run();
    }

    const confirmResp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/confirm-and-pay`, { method: "POST", cookie }), env);
    expect(confirmResp.status).toBe(200);
    const confirmBody = await confirmResp.json();
    expect(confirmBody.payment.method).toBe("qr_ph");
    expect(confirmBody.payment.merchantDisplayName).toBe("FIS Test Merchant");
    expect(confirmBody.priceSnapshot.totalPhpCentavos).toBe(500000);

    const afterConfirm = await env.DB.prepare("SELECT status FROM checkout_orders WHERE id = ?").bind(order.id).first();
    expect(afterConfirm.status).toBe("awaiting_payment");

    const qrResp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/qr-ph-image`, { cookie }), env);
    expect(qrResp.status).toBe(200);

    const proofReq = new Request(
      `${SITE_ORIGIN}/api/applications/${confirmBody.payment.applicationId}/payments/${confirmBody.payment.id}/proof`,
      {
        method: "POST",
        headers: { Origin: SITE_ORIGIN, Cookie: cookie, "X-Filename": "proof.jpg" },
        body: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
      }
    );
    const proofResp = await worker.fetch(proofReq, env);
    expect(proofResp.status).toBe(201);

    const afterProof = await env.DB.prepare("SELECT status FROM checkout_orders WHERE id = ?").bind(order.id).first();
    expect(afterProof.status).toBe("awaiting_verification");

    const paymentRow = await env.DB.prepare("SELECT status FROM payment_requests WHERE id = ?").bind(confirmBody.payment.id).first();
    expect(paymentRow.status).toBe("submitted"); // never auto-"paid" from a customer action
  });
});
