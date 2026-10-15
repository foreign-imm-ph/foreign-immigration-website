import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker from "../src/index.js";
import { createTestClient, createTestCheckoutService, createTestStaff, SITE_ORIGIN } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";
import { findOrCreateDraftOrder, startBookingApplication } from "../src/lib/checkout.js";
import { createBooking, transitionBooking, createRescheduleRequest } from "../src/lib/airportVip.js";

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

async function createTestBooking(overrides = {}) {
  const client = await createTestClient();
  const service = await createTestCheckoutService({ offeringType: "bookable_service", supportsDelivery: 0 });
  const order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
  await startBookingApplication(env.DB, order, service);
  const booking = await createBooking(env.DB, {
    checkoutOrderId: order.id,
    clientId: client.id,
    serviceId: service.id,
    booking: {
      direction: "arrival",
      passengerCount: 1,
      passengerNames: ["Juan Dela Cruz"],
      airport: "Ninoy Aquino International Airport",
      airline: "Philippine Airlines",
      flightNumber: "PR102",
      scheduledLocalDate: "2027-03-01",
      scheduledLocalTime: "14:30",
      scheduledTimezone: "Asia/Manila",
      ...overrides,
    },
  });
  return { client, service, order, booking };
}

describe("Staff Airport VIP: bookings list + detail", () => {
  it("lists bookings and renders a booking's detail page", async () => {
    const staff = await createTestStaff();
    const { booking, client } = await createTestBooking();

    const listResp = await staffRequest("/staff/airport-vip/bookings/", staff);
    expect(listResp.status).toBe(200);
    expect(await listResp.text()).toContain(booking.id.slice(0, 8));

    const detailResp = await staffRequest(`/staff/airport-vip/bookings/${booking.id}`, staff);
    expect(detailResp.status).toBe(200);
    const html = await detailResp.text();
    expect(html).toContain("PR102");
    expect(html).toContain(client.email);
  });

  it("404s an unknown booking", async () => {
    const staff = await createTestStaff();
    const resp = await staffRequest("/staff/airport-vip/bookings/not-a-real-booking", staff);
    expect(resp.status).toBe(404);
  });
});

describe("Staff Airport VIP: availability confirmation", () => {
  it("never shows the booking as confirmed until staff explicitly sets it, and refuses an out-of-order jump", async () => {
    const staff = await createTestStaff();
    const { booking } = await createTestBooking();
    expect(booking.status).toBe("submitted");

    // submitted -> confirmed is not an allowed transition (payment must
    // be verified and availability reviewed first) -- the state machine
    // itself is the safeguard behind "never show confirmed prematurely".
    const badJump = await staffRequest(`/staff/airport-vip/bookings/${booking.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "confirmed" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(badJump.status).toBe(409);

    await transitionBooking(env.DB, booking, "awaiting_payment_verification");
    await transitionBooking(env.DB, await env.DB.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first(), "payment_verified");

    const confirmResp = await staffRequest(`/staff/airport-vip/bookings/${booking.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "confirmed" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(confirmResp.status).toBe(303);

    const updated = await env.DB.prepare("SELECT status FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    expect(updated.status).toBe("confirmed");
  });
});

describe("Staff Airport VIP: reschedule decisions", () => {
  async function confirmedBookingWithRequest() {
    const { booking } = await createTestBooking({ scheduledLocalDate: "2027-05-01", scheduledLocalTime: "10:00" });
    await transitionBooking(env.DB, booking, "awaiting_payment_verification");
    const afterPayment = await env.DB.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    await transitionBooking(env.DB, afterPayment, "payment_verified");
    const afterVerify = await env.DB.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    const confirmed = await transitionBooking(env.DB, afterVerify, "confirmed");

    const { id: requestId } = await createRescheduleRequest(env.DB, {
      bookingId: confirmed.id,
      originalScheduledDepartureUtc: confirmed.scheduled_departure_utc,
      proposedFlight: { airline: "Cebu Pacific", flightNumber: "5J321", scheduledLocalDate: "2027-05-10", scheduledLocalTime: "09:00", scheduledTimezone: "Asia/Manila" },
      customerNote: "Airline rebooked us",
    });
    await transitionBooking(env.DB, confirmed, "reschedule_requested");
    return { booking: confirmed, requestId };
  }

  it("approving a reschedule request applies the new flight and moves the booking to 'rescheduled'", async () => {
    const staff = await createTestStaff();
    const { booking, requestId } = await confirmedBookingWithRequest();

    const resp = await staffRequest(`/staff/airport-vip/bookings/${booking.id}/reschedule-requests/${requestId}/decide`, staff, {
      method: "POST",
      body: formBody({ decision: "approved", staffNote: "Confirmed with ground team" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(303);

    const updatedBooking = await env.DB.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    expect(updatedBooking.status).toBe("rescheduled");
    expect(updatedBooking.flight_number).toBe("5J321");
    expect(updatedBooking.airline).toBe("Cebu Pacific");

    const request = await env.DB.prepare("SELECT * FROM airport_vip_reschedule_requests WHERE id = ?").bind(requestId).first();
    expect(request.staff_decision).toBe("approved");
    expect(request.staff_decided_by).toBe(staff.email);
  });

  // Regression: a rescheduled booking is still a live, paid booking, so
  // "FIS unable to accommodate -> full refund" must reach it exactly like
  // any other confirmed booking. ALLOWED_BOOKING_TRANSITIONS left
  // "rescheduled" without a path to "refund_pending" -- caught via live
  // Journey E (refund) testing, which hit a 409 trying this exact move.
  it("a rescheduled booking can still be moved to refund_pending and refunded (FIS unable to accommodate after a reschedule)", async () => {
    const staff = await createTestStaff();
    const { booking, requestId } = await confirmedBookingWithRequest();

    const decideResp = await staffRequest(`/staff/airport-vip/bookings/${booking.id}/reschedule-requests/${requestId}/decide`, staff, {
      method: "POST",
      body: formBody({ decision: "approved" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(decideResp.status).toBe(303);
    const rescheduled = await env.DB.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    expect(rescheduled.status).toBe("rescheduled");

    const statusResp = await staffRequest(`/staff/airport-vip/bookings/${booking.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "refund_pending" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(statusResp.status).toBe(303);

    const refundResp = await staffRequest(`/staff/airport-vip/bookings/${booking.id}/refunds`, staff, {
      method: "POST",
      body: formBody({ reason: "fis_unable_to_accommodate", requestedAmountPhp: "5000.00" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(refundResp.status).toBe(303);

    const refund = await env.DB.prepare("SELECT * FROM airport_vip_refunds WHERE booking_id = ?").bind(booking.id).first();
    await staffRequest(`/staff/airport-vip/bookings/${booking.id}/refunds/${refund.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "approved", approvedAmountPhp: "5000.00" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    await staffRequest(`/staff/airport-vip/bookings/${booking.id}/refunds/${refund.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "processing" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    await staffRequest(`/staff/airport-vip/bookings/${booking.id}/refunds/${refund.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "completed" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const finalBooking = await env.DB.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    expect(finalBooking.status).toBe("refunded");
  });

  it("rejecting a reschedule request leaves the original flight untouched and returns the booking to 'confirmed'", async () => {
    const staff = await createTestStaff();
    const { booking, requestId } = await confirmedBookingWithRequest();
    const originalFlightNumber = booking.flight_number;

    const resp = await staffRequest(`/staff/airport-vip/bookings/${booking.id}/reschedule-requests/${requestId}/decide`, staff, {
      method: "POST",
      body: formBody({ decision: "rejected", staffNote: "Outside the rebooking window" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(303);

    const updatedBooking = await env.DB.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    expect(updatedBooking.status).toBe("confirmed");
    expect(updatedBooking.flight_number).toBe(originalFlightNumber);
  });
});

describe("Staff Airport VIP: refunds", () => {
  it("starts a refund, walks it to completed, and only then marks the booking refunded -- always a simulated transaction, never a real one", async () => {
    const staff = await createTestStaff();
    const { booking } = await createTestBooking();
    await transitionBooking(env.DB, booking, "awaiting_payment_verification");
    const afterPayment = await env.DB.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    await transitionBooking(env.DB, afterPayment, "payment_verified");
    const verified = await env.DB.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    await transitionBooking(env.DB, verified, "refund_pending", { staffEmail: staff.email, note: "FIS unable to accommodate" });

    const startResp = await staffRequest(`/staff/airport-vip/bookings/${booking.id}/refunds`, staff, {
      method: "POST",
      body: formBody({ reason: "fis_unable_to_accommodate", requestedAmountPhp: "5000.00" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(startResp.status).toBe(303);

    const refund = await env.DB.prepare("SELECT * FROM airport_vip_refunds WHERE booking_id = ?").bind(booking.id).first();
    expect(refund.status).toBe("requested");
    expect(refund.requested_amount_php_centavos).toBe(500000);

    await staffRequest(`/staff/airport-vip/bookings/${booking.id}/refunds/${refund.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "approved", approvedAmountPhp: "5000.00" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    await staffRequest(`/staff/airport-vip/bookings/${booking.id}/refunds/${refund.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "processing", method: "Bank transfer (simulated)" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const completeResp = await staffRequest(`/staff/airport-vip/bookings/${booking.id}/refunds/${refund.id}/status`, staff, {
      method: "POST",
      body: formBody({ status: "completed", transactionReference: "SIM-STAFF-TEST-001" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(completeResp.status).toBe(303);

    const completedRefund = await env.DB.prepare("SELECT * FROM airport_vip_refunds WHERE id = ?").bind(refund.id).first();
    expect(completedRefund.status).toBe("completed");
    expect(completedRefund.transaction_reference).toBe("SIM-STAFF-TEST-001");

    const finalBooking = await env.DB.prepare("SELECT status FROM airport_vip_bookings WHERE id = ?").bind(booking.id).first();
    expect(finalBooking.status).toBe("refunded");
  });
});
