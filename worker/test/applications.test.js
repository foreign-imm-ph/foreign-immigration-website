import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { authedRequest, createTestClient, createSessionCookieFor, createTestApplication, createTestCheckoutService, selectProcessingTier } from "./helpers.js";
import { findOrCreateDraftOrder, startOrderApplication, startBookingApplication, transitionOrder, computeAndSnapshotPrice } from "../src/lib/checkout.js";
import { createBooking, transitionBooking } from "../src/lib/airportVip.js";

// Regression coverage for the October review's Finding F1: an
// application's own status (the enquiry/document-processing pipeline)
// must never be the only status the Client Portal shows for a checkout
// order or an Airport VIP booking -- each is tracked and returned
// separately, so a verified payment or a confirmed booking is never
// hidden behind a stale "Enquiry Received".
describe("Client Portal: application status is never conflated with payment/booking status (F1)", () => {
  it("a plain enquiry application (no linked checkout order) reports null for both", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const cookie = await createSessionCookieFor(client);

    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.checkoutOrder).toBeNull();
    expect(body.bookingStatus).toBeNull();
  });

  it("a paid document order shows checkoutOrder.status as 'paid' even while the application's own status is still enquiry_received", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService();
    const cookie = await createSessionCookieFor(client);

    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    const { applicationId } = await startOrderApplication(env.DB, order, service);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    order = await selectProcessingTier(order, "regular");
    await computeAndSnapshotPrice(env.DB, order);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await transitionOrder(env.DB, order, "awaiting_payment");
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await transitionOrder(env.DB, order, "awaiting_verification");
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await transitionOrder(env.DB, order, "paid");

    const resp = await worker.fetch(authedRequest(`/api/applications/${applicationId}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    // The exact defect: application.status alone must never be trusted
    // as "the" status once a checkout order exists.
    expect(body.application.status).toBe("enquiry_received");
    expect(body.checkoutOrder.status).toBe("paid");
    expect(body.checkoutOrder.statusLabel).toMatch(/verified/i);
    expect(body.checkoutOrder.priceSnapshot).toBeTruthy();
    expect(body.checkoutOrder.priceSnapshot.components).toBeUndefined(); // never a fee breakdown
    expect(body.bookingStatus).toBeNull(); // not an Airport VIP order
  });

  it("an Airport VIP booking's status is reported separately from both the application and the order", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ offeringType: "bookable_service", supportsDelivery: 0 });
    const cookie = await createSessionCookieFor(client);

    let order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    const applicationId = await startBookingApplication(env.DB, order, service);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    const booking = await createBooking(env.DB, {
      checkoutOrderId: order.id,
      clientId: client.id,
      serviceId: service.id,
      booking: {
        direction: "arrival", passengerCount: 1, passengerNames: ["Test Passenger"],
        airport: "NAIA", airline: "PAL", flightNumber: "PR100",
        scheduledLocalDate: "2027-02-01", scheduledLocalTime: "08:00", scheduledTimezone: "Asia/Manila",
      },
    });
    await computeAndSnapshotPrice(env.DB, order);
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await transitionOrder(env.DB, order, "awaiting_payment");
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await transitionOrder(env.DB, order, "awaiting_verification");
    order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
    await transitionOrder(env.DB, order, "paid");
    await transitionBooking(env.DB, booking, "awaiting_payment_verification");
    const afterPayment = await env.DB.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    await transitionBooking(env.DB, afterPayment, "payment_verified");

    const resp = await worker.fetch(authedRequest(`/api/applications/${applicationId}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.checkoutOrder.status).toBe("paid");
    expect(body.bookingStatus.status).toBe("payment_verified");
    expect(body.bookingStatus.statusLabel).toMatch(/under review/i);
    // Never the same string -- the whole point is these are distinct dimensions.
    expect(body.bookingStatus.statusLabel).not.toBe(body.checkoutOrder.statusLabel);
  });

  it("refuses to show another client's application (ownership still enforced for the new fields too)", async () => {
    const owner = await createTestClient();
    const intruder = await createTestClient();
    const application = await createTestApplication(owner);
    const cookie = await createSessionCookieFor(intruder);

    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}`, { cookie }), env);
    expect(resp.status).toBe(404);
  });
});
