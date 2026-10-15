import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { authedRequest, createTestClient, createSessionCookieFor, createTestCheckoutService, createTestStaff } from "./helpers.js";
import { findOrCreateDraftOrder } from "../src/lib/checkout.js";
import { recordPaymentSettingsChange } from "../src/lib/checkoutPaymentSettings.js";

async function createVipOrderFor(client, service) {
  return findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
}

function sampleBookingBody(overrides = {}) {
  return {
    direction: "arrival",
    passengerCount: 1,
    passengerNames: ["Juan Dela Cruz"],
    airport: "Ninoy Aquino International Airport",
    terminal: "3",
    airline: "Philippine Airlines",
    flightNumber: "PR102",
    scheduledLocalDate: "2026-12-01",
    scheduledLocalTime: "14:30",
    scheduledTimezone: "Asia/Manila",
    ...overrides,
  };
}

describe("Airport VIP: customer booking routes", () => {
  it("rejects every booking route without a session", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ offeringType: "bookable_service" });
    const order = await createVipOrderFor(client, service);

    const resp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/booking`), env);
    expect(resp.status).toBe(401);
  });

  it("saves booking details, then lets the same customer correct them before payment", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ offeringType: "bookable_service" });
    const order = await createVipOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    const first = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/booking`, { method: "POST", cookie, body: sampleBookingBody() }),
      env
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.booking.airline).toBe("Philippine Airlines");
    expect(firstBody.booking.status).toBe("submitted");

    const corrected = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/booking`, { method: "POST", cookie, body: sampleBookingBody({ flightNumber: "PR999" }) }),
      env
    );
    const correctedBody = await corrected.json();
    expect(correctedBody.booking.id).toBe(firstBody.booking.id); // same row, not a duplicate
    expect(correctedBody.booking.flightNumber).toBe("PR999");

    const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM airport_vip_bookings WHERE checkout_order_id = ?").bind(order.id).first();
    expect(count).toBe(1);
  });

  it("refuses a booking save against a document-order (non-bookable) service", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ offeringType: "document_automated" });
    const order = await createVipOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    const resp = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/booking`, { method: "POST", cookie, body: sampleBookingBody() }),
      env
    );
    expect(resp.status).toBe(409);
  });

  it("requires policy acceptance to be explicit (true), never inferred or pre-checked", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ offeringType: "bookable_service" });
    const order = await createVipOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/booking`, { method: "POST", cookie, body: sampleBookingBody() }), env);

    const missing = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/booking/accept-policy`, { method: "POST", cookie, body: {} }),
      env
    );
    expect(missing.status).toBe(400);

    const accepted = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/booking/accept-policy`, { method: "POST", cookie, body: { accepted: true } }),
      env
    );
    expect(accepted.status).toBe(200);

    const getResp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/booking`, { cookie }), env);
    const getBody = await getResp.json();
    expect(getBody.policyAccepted).toBe(true);
  });

  it("confirm-and-pay refuses a bookable-service order until both booking details AND policy acceptance exist", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ offeringType: "bookable_service", supportsDelivery: 0 });
    const order = await createVipOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    await recordPaymentSettingsChange(env.DB, {
      changedByStaffEmail: staff.email,
      changes: { qrImageR2Key: "config/test-qr-ph.png", merchantDisplayName: "FIS Test Merchant", customerInstructions: "Scan and pay.", enabled: true },
    });
    await env.CLIENT_FILES.put("config/test-qr-ph.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    const beforeBooking = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/confirm-and-pay`, { method: "POST", cookie }), env);
    expect(beforeBooking.status).toBe(409);

    await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/booking`, { method: "POST", cookie, body: sampleBookingBody() }), env);

    const beforePolicy = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/confirm-and-pay`, { method: "POST", cookie }), env);
    expect(beforePolicy.status).toBe(409);

    await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/booking/accept-policy`, { method: "POST", cookie, body: { accepted: true } }),
      env
    );

    const confirmResp = await worker.fetch(authedRequest(`/api/instant-services/orders/${order.id}/confirm-and-pay`, { method: "POST", cookie }), env);
    expect(confirmResp.status).toBe(200);

    const orderRow = await env.DB.prepare("SELECT status FROM checkout_orders WHERE id = ?").bind(order.id).first();
    expect(orderRow.status).toBe("awaiting_payment");

    // The linked booking advances alongside the order, mirroring the
    // document-order flow's own order-status transition at this step.
    const bookingRow = await env.DB.prepare("SELECT status FROM airport_vip_bookings WHERE checkout_order_id = ?").bind(order.id).first();
    expect(bookingRow.status).toBe("awaiting_payment_verification");
  });

  it("refuses a reschedule request before the booking has ever been confirmed by staff", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ offeringType: "bookable_service" });
    const order = await createVipOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    const saveResp = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/booking`, { method: "POST", cookie, body: sampleBookingBody() }),
      env
    );
    const { booking } = await saveResp.json();

    const resp = await worker.fetch(
      authedRequest(`/api/instant-services/bookings/${booking.id}/reschedule-requests`, {
        method: "POST",
        cookie,
        body: { airline: "PAL", flightNumber: "PR999", scheduledLocalDate: "2026-12-10", scheduledLocalTime: "09:00", scheduledTimezone: "Asia/Manila" },
      }),
      env
    );
    expect(resp.status).toBe(409);
  });

  it("accepts a reschedule request once the booking is confirmed, returning the eligibility wording, never a guarantee", async () => {
    const client = await createTestClient();
    const service = await createTestCheckoutService({ offeringType: "bookable_service" });
    const order = await createVipOrderFor(client, service);
    const cookie = await createSessionCookieFor(client);

    const saveResp = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/booking`, {
        method: "POST",
        cookie,
        body: sampleBookingBody({ scheduledLocalDate: "2027-06-15", scheduledLocalTime: "12:00" }),
      }),
      env
    );
    const { booking } = await saveResp.json();

    // Jump the booking straight to "confirmed" for this test -- the real
    // path (payment verification + staff availability confirmation) is
    // covered by the staffAirportVip workflow, not this customer-route test.
    await env.DB.prepare("UPDATE airport_vip_bookings SET status = 'confirmed' WHERE id = ?").bind(booking.id).run();

    const resp = await worker.fetch(
      authedRequest(`/api/instant-services/bookings/${booking.id}/reschedule-requests`, {
        method: "POST",
        cookie,
        body: { airline: "PAL", flightNumber: "PR555", scheduledLocalDate: "2027-06-20", scheduledLocalTime: "09:00", scheduledTimezone: "Asia/Manila" },
      }),
      env
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.eligible).toBe(true);
    expect(body.outcome).toBe("eligible_subject_to_availability");

    const bookingRow = await env.DB.prepare("SELECT status FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    expect(bookingRow.status).toBe("reschedule_requested");
  });

  it("refuses to expose another client's booking through the booking-scoped routes", async () => {
    const owner = await createTestClient();
    const intruder = await createTestClient();
    const service = await createTestCheckoutService({ offeringType: "bookable_service" });
    const order = await createVipOrderFor(owner, service);
    const ownerCookie = await createSessionCookieFor(owner);
    const intruderCookie = await createSessionCookieFor(intruder);

    const saveResp = await worker.fetch(
      authedRequest(`/api/instant-services/orders/${order.id}/booking`, { method: "POST", cookie: ownerCookie, body: sampleBookingBody() }),
      env
    );
    const { booking } = await saveResp.json();

    const resp = await worker.fetch(authedRequest(`/api/instant-services/bookings/${booking.id}/history`, { cookie: intruderCookie }), env);
    expect(resp.status).toBe(404);
  });
});
