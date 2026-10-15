import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { authedRequest, createTestClient, createSessionCookieFor, createTestCheckoutService } from "./helpers.js";
import { findOrCreateDraftOrder, startOrderApplication, computeAndSnapshotPrice, transitionOrder } from "../src/lib/checkout.js";
import { newId } from "../src/lib/crypto.js";

// Part VII §17: a customer-facing transaction record that NEVER shows a
// fee breakdown, NEVER describes an unverified payment as paid, and
// correctly distinguishes a submitted-for-verification payment from a
// verified one.
describe("Customer receipts", () => {
  it("refuses a receipt request without a session", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService();
    const order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });

    const resp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/receipt`), env);
    expect(resp.status).toBe(401);
  });

  it("refuses to show another client's receipt", async () => {
    const owner = await createTestClient();
    const intruder = await createTestClient();
    const service = await createTestCheckoutService();
    const order = await findOrCreateDraftOrder(env.DB, { clientId: owner.id, serviceId: service.id });
    const cookie = await createSessionCookieFor(intruder);

    const resp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/receipt`, { cookie }), env);
    expect(resp.status).toBe(404);
  });

  it("never shows an itemized fee breakdown, and shows 'submitted, awaiting verification' before staff marks it paid", async () => {
    const client = await createTestClient({ fullName: "Receipt Test Client" });
    const service = await createTestCheckoutService({ supportsDelivery: 0, title: "Receipt Test Document" });
    const cookie = await createSessionCookieFor(client);

    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    await startOrderApplication(env.DB, order, service);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await computeAndSnapshotPrice(env.DB, order);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await transitionOrder(env.DB, order, "awaiting_payment");
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();

    const paymentId = newId();
    await env.DB
      .prepare("INSERT INTO payment_requests (id, application_id, amount_php, description, checkout_order_id, purpose, status, submitted_at) VALUES (?, ?, ?, ?, ?, 'checkout_service', 'submitted', datetime('now'))")
      .bind(paymentId, order.application_id, 5000, "Receipt test", order.id)
      .run();

    const resp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/receipt`, { cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.customerName).toBe("Receipt Test Client");
    expect(body.service.title).toBe("Receipt Test Document");
    expect(body.priceSnapshot.totalPhpCentavos).toBe(500000);
    expect(body.priceSnapshot.components).toBeUndefined();
    expect(body.payment.statusText).toBe("Payment submitted, awaiting verification");
    expect(body.payment.statusText).not.toMatch(/^Payment verified$/);
    expect(body.delivery).toBeNull();
    expect(body.booking).toBeNull();

    await env.DB.prepare("UPDATE payment_requests SET status = 'paid', paid_at = datetime('now') WHERE id = ?").bind(paymentId).run();
    const afterPaid = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/receipt`, { cookie }), env);
    const afterPaidBody = await afterPaid.json();
    expect(afterPaidBody.payment.statusText).toBe("Payment verified");
  });
});
