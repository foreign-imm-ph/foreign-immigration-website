import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { createTestClient, createTestCheckoutService, createTestStaff } from "./helpers.js";
import { findOrCreateDraftOrder } from "../src/lib/checkout.js";
import { HttpError } from "../src/lib/storage.js";
import {
  createBooking,
  updateBookingDetails,
  getBookingById,
  getBookingByOrderId,
  assertBookingTransitionAllowed,
  transitionBooking,
  getBookingHistory,
  recordPolicyAcceptance,
  getPolicyAcceptance,
  createRescheduleRequest,
  getRescheduleRequests,
  getRescheduleRequestById,
  decideRescheduleRequest,
  applyRescheduledFlight,
  createRefund,
  updateRefundStatus,
  getRefundsForBooking,
  listBookingsForStaff,
} from "../src/lib/airportVip.js";

async function makeBookingFixture(overrides = {}) {
  const client = await createTestClient();
  const service = await createTestCheckoutService({ offeringType: "bookable_service", serviceSlug: "airport-vip" });
  const order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
  const booking = await createBooking(env.DB, {
    checkoutOrderId: order.id,
    clientId: client.id,
    serviceId: service.id,
    booking: {
      direction: "arrival",
      passengerCount: 2,
      passengerNames: ["Juan Dela Cruz", "Maria Dela Cruz"],
      airport: "Ninoy Aquino International Airport",
      terminal: "3",
      airline: "Philippine Airlines",
      flightNumber: "PR102",
      scheduledLocalDate: "2026-12-01",
      scheduledLocalTime: "14:30",
      scheduledTimezone: "Asia/Manila",
      ...overrides,
    },
  });
  return { client, service, order, booking };
}

describe("airportVip: createBooking / updateBookingDetails", () => {
  it("creates a booking with a correctly derived UTC departure timestamp", async () => {
    const { booking } = await makeBookingFixture();
    expect(booking.status).toBe("submitted");
    expect(booking.scheduled_departure_utc).toBe("2026-12-01T06:30:00.000Z");
    expect(JSON.parse(booking.passenger_names_json)).toEqual(["Juan Dela Cruz", "Maria Dela Cruz"]);
  });

  it("is idempotent -- a second createBooking for the same order returns the original, not a duplicate", async () => {
    const { order, client, service, booking } = await makeBookingFixture();
    const second = await createBooking(env.DB, {
      checkoutOrderId: order.id,
      clientId: client.id,
      serviceId: service.id,
      booking: { direction: "departure", passengerCount: 1, passengerNames: ["Someone Else"], airport: "X", airline: "X", flightNumber: "X1", scheduledLocalDate: "2026-12-05", scheduledLocalTime: "10:00", scheduledTimezone: "Asia/Manila" },
    });
    expect(second.id).toBe(booking.id);
    expect(second.direction).toBe("arrival"); // unchanged -- the original, not the second call's input
  });

  it("updateBookingDetails overwrites the flight/passenger facts in place", async () => {
    const { booking } = await makeBookingFixture();
    const updated = await updateBookingDetails(env.DB, booking.id, {
      direction: "both",
      passengerCount: 1,
      passengerNames: ["Solo Traveler"],
      airport: "Mactan-Cebu International Airport",
      airline: "Cebu Pacific",
      flightNumber: "5J100",
      scheduledLocalDate: "2026-12-10",
      scheduledLocalTime: "08:00",
      scheduledTimezone: "Asia/Manila",
    });
    expect(updated.airline).toBe("Cebu Pacific");
    expect(updated.passenger_count).toBe(1);
    expect(JSON.parse(updated.passenger_names_json)).toEqual(["Solo Traveler"]);
  });

  it("getBookingByOrderId resolves the booking from its order", async () => {
    const { order, booking } = await makeBookingFixture();
    const found = await getBookingByOrderId(env.DB, order.id);
    expect(found.id).toBe(booking.id);
  });
});

describe("airportVip: booking status transitions", () => {
  it("allows the mandated forward path submitted -> awaiting_payment_verification -> payment_verified -> confirmed", () => {
    expect(() => assertBookingTransitionAllowed("submitted", "awaiting_payment_verification")).not.toThrow();
    expect(() => assertBookingTransitionAllowed("awaiting_payment_verification", "payment_verified")).not.toThrow();
    expect(() => assertBookingTransitionAllowed("payment_verified", "confirmed")).not.toThrow();
  });

  it("never allows skipping straight from submitted to confirmed -- availability must be reviewed first", () => {
    expect(() => assertBookingTransitionAllowed("submitted", "confirmed")).toThrow(HttpError);
  });

  it("refuses any transition out of a terminal status (completed, refunded)", () => {
    expect(() => assertBookingTransitionAllowed("completed", "confirmed")).toThrow(HttpError);
    expect(() => assertBookingTransitionAllowed("refunded", "confirmed")).toThrow(HttpError);
  });

  it("transitionBooking persists the new status and records it in history", async () => {
    const { booking } = await makeBookingFixture();
    const updated = await transitionBooking(env.DB, booking, "awaiting_payment_verification");
    expect(updated.status).toBe("awaiting_payment_verification");

    const history = await getBookingHistory(env.DB, booking.id);
    // "submitted" (recorded by createBooking itself) + the transition above.
    expect(history.map((h) => h.status)).toEqual(["submitted", "awaiting_payment_verification"]);
  });

  it("transitionBooking refuses a disallowed jump and leaves the booking unchanged", async () => {
    const { booking } = await makeBookingFixture();
    await expect(transitionBooking(env.DB, booking, "completed")).rejects.toThrow(HttpError);
    const unchanged = await getBookingById(env.DB, booking.id);
    expect(unchanged.status).toBe("submitted");
  });
});

describe("airportVip: policy acceptance", () => {
  it("records an acceptance tied to this booking's original scheduled departure", async () => {
    const { booking } = await makeBookingFixture();
    expect(await getPolicyAcceptance(env.DB, booking.id)).toBeNull();

    await recordPolicyAcceptance(env.DB, { bookingId: booking.id, originalScheduledDepartureUtc: booking.scheduled_departure_utc, userAgent: "vitest" });
    const acceptance = await getPolicyAcceptance(env.DB, booking.id);
    expect(acceptance.original_scheduled_departure_utc).toBe(booking.scheduled_departure_utc);
    expect(acceptance.policy_version).toBeTruthy();
  });
});

describe("airportVip: rescheduling requests", () => {
  it("freezes the 120-hour eligibility evaluation at request time, and surfaces it unchanged on later reads", async () => {
    const { booking } = await makeBookingFixture({ scheduledLocalDate: "2026-12-20", scheduledLocalTime: "12:00" });
    const departureUtc = "2026-12-20T04:00:00.000Z";
    const result = await createRescheduleRequest(env.DB, {
      bookingId: booking.id,
      originalScheduledDepartureUtc: departureUtc,
      proposedFlight: { airline: "PAL", flightNumber: "PR200", scheduledLocalDate: "2026-12-22", scheduledLocalTime: "09:00", scheduledTimezone: "Asia/Manila" },
      customerNote: "Flight moved by the airline",
    });
    expect(result.eligible).toBe(true); // far more than 120 hours before 2026-12-20

    const [stored] = await getRescheduleRequests(env.DB, booking.id);
    expect(stored.eligible_under_policy).toBe(1);
    expect(stored.proposedFlight.flightNumber).toBe("PR200");

    const byId = await getRescheduleRequestById(env.DB, result.id);
    expect(byId.booking_id).toBe(booking.id);
  });

  it("marks a last-minute request (under 120 hours) as not eligible, computed from the ORIGINAL departure", async () => {
    const { booking } = await makeBookingFixture();
    const soonDepartureUtc = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = await createRescheduleRequest(env.DB, {
      bookingId: booking.id,
      originalScheduledDepartureUtc: soonDepartureUtc,
      proposedFlight: { airline: "PAL", flightNumber: "PR201", scheduledLocalDate: "2026-12-25", scheduledLocalTime: "09:00", scheduledTimezone: "Asia/Manila" },
    });
    expect(result.eligible).toBe(false);
  });

  it("decideRescheduleRequest records the staff decision and rejects an unknown decision value", async () => {
    const { booking } = await makeBookingFixture();
    const staff = await createTestStaff();
    const { id: requestId } = await createRescheduleRequest(env.DB, {
      bookingId: booking.id,
      originalScheduledDepartureUtc: booking.scheduled_departure_utc,
      proposedFlight: { airline: "PAL", flightNumber: "PR202", scheduledLocalDate: "2027-01-01", scheduledLocalTime: "09:00", scheduledTimezone: "Asia/Manila" },
    });

    await expect(decideRescheduleRequest(env.DB, { requestId, decision: "maybe", staffEmail: staff.email })).rejects.toThrow(HttpError);

    const decided = await decideRescheduleRequest(env.DB, { requestId, decision: "approved", staffEmail: staff.email, staffNote: "Confirmed with the airport team" });
    expect(decided.staff_decision).toBe("approved");
    expect(decided.staff_decided_by).toBe(staff.email);
  });

  it("applyRescheduledFlight only changes the booking's CURRENT flight, never the request's own preserved original timestamp", async () => {
    const { booking } = await makeBookingFixture();
    const { id: requestId } = await createRescheduleRequest(env.DB, {
      bookingId: booking.id,
      originalScheduledDepartureUtc: booking.scheduled_departure_utc,
      proposedFlight: { airline: "Cebu Pacific", flightNumber: "5J999", scheduledLocalDate: "2027-02-01", scheduledLocalTime: "18:00", scheduledTimezone: "Asia/Manila" },
    });
    const request = await getRescheduleRequestById(env.DB, requestId);

    await applyRescheduledFlight(env.DB, booking.id, request.proposedFlight);

    const updatedBooking = await getBookingById(env.DB, booking.id);
    expect(updatedBooking.airline).toBe("Cebu Pacific");
    expect(updatedBooking.flight_number).toBe("5J999");

    const requestAfter = await getRescheduleRequestById(env.DB, requestId);
    expect(requestAfter.original_scheduled_departure_utc).toBe(booking.scheduled_departure_utc); // untouched
  });
});

describe("airportVip: refunds", () => {
  it("walks requested -> approved -> processing -> completed, and refuses an out-of-order jump", async () => {
    const { booking } = await makeBookingFixture();
    const staff = await createTestStaff();
    const refund = await createRefund(env.DB, { bookingId: booking.id, reason: "fis_unable_to_accommodate", requestedAmountPhpCentavos: 500000, staffEmail: staff.email });
    expect(refund.status).toBe("requested");

    await expect(updateRefundStatus(env.DB, refund.id, { status: "completed", staffEmail: staff.email })).rejects.toThrow(HttpError);

    const approved = await updateRefundStatus(env.DB, refund.id, { status: "approved", approvedAmountPhpCentavos: 500000, staffEmail: staff.email });
    expect(approved.status).toBe("approved");
    const processing = await updateRefundStatus(env.DB, refund.id, { status: "processing", method: "Bank transfer (simulated)", staffEmail: staff.email });
    expect(processing.status).toBe("processing");
    const completed = await updateRefundStatus(env.DB, refund.id, { status: "completed", transactionReference: "SIM-TEST-001", staffEmail: staff.email });
    expect(completed.status).toBe("completed");
    expect(completed.completed_at).toBeTruthy();

    const all = await getRefundsForBooking(env.DB, booking.id);
    expect(all).toHaveLength(1);
  });
});

describe("airportVip: listBookingsForStaff", () => {
  it("lists bookings joined with client identity, optionally filtered by status", async () => {
    const { booking: bookingA } = await makeBookingFixture();
    await transitionBooking(env.DB, bookingA, "awaiting_payment_verification");

    const all = await listBookingsForStaff(env.DB, {});
    expect(all.find((b) => b.id === bookingA.id)).toBeTruthy();

    const filtered = await listBookingsForStaff(env.DB, { status: "awaiting_payment_verification" });
    expect(filtered.every((b) => b.status === "awaiting_payment_verification")).toBe(true);
    expect(filtered.find((b) => b.id === bookingA.id)).toBeTruthy();
  });
});
