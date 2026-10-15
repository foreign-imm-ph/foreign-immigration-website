// Airport VIP Meet & Assist -- the customer-facing booking routes that
// sit alongside routes/checkoutCustomer.js's document-order routes.
// A booking lives on top of an ordinary checkout_orders row (created the
// same way a document order is, via checkoutPublic.js's handleBeginCheckout
// against a bookable_service catalogue entry) -- these routes only add
// the booking-specific facts (flight/passengers), the policy acceptance,
// and rescheduling requests. Payment itself stays entirely in
// checkoutCustomer.js's handleConfirmAndPay; nothing here touches
// payment_requests or QR Ph directly.
import { getSessionClient } from "../lib/session.js";
import { json, requireFields } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";
import { requireOwnedOrder, getServiceById, startBookingApplication } from "../lib/checkout.js";
import {
  createBooking,
  updateBookingDetails,
  getBookingByOrderId,
  requireOwnedBooking,
  getBookingHistory,
  recordPolicyAcceptance,
  getPolicyAcceptance,
  createRescheduleRequest,
  getRescheduleRequests,
  transitionBooking,
} from "../lib/airportVip.js";
import { POLICY_VERSION } from "../lib/airportVipPolicy.js";

async function requireClient(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");
  return client;
}

const BOOKING_REQUIRED_FIELDS = [
  "direction",
  "passengerCount",
  "passengerNames",
  "airport",
  "airline",
  "flightNumber",
  "scheduledLocalDate",
  "scheduledLocalTime",
  "scheduledTimezone",
];

function shapeBookingForCustomer(booking) {
  if (!booking) return null;
  return {
    id: booking.id,
    status: booking.status,
    direction: booking.direction,
    passengerCount: booking.passenger_count,
    passengerNames: JSON.parse(booking.passenger_names_json),
    airport: booking.airport,
    terminal: booking.terminal,
    airline: booking.airline,
    flightNumber: booking.flight_number,
    flightRoute: booking.flight_route,
    scheduledLocalDate: booking.scheduled_local_date,
    scheduledLocalTime: booking.scheduled_local_time,
    scheduledTimezone: booking.scheduled_timezone,
    scheduledDepartureUtc: booking.scheduled_departure_utc,
    specialRequirements: booking.special_requirements,
    notes: booking.notes,
  };
}

// Creates the booking on first call, or corrects its details on any
// later call -- but only while the order is still "draft" (the same
// editable window handleSetDeliveryAddress uses for a document order's
// delivery address). Once confirm-and-pay has moved the order past
// draft, the booking's flight details become a staff-mediated change
// (rescheduling), never a silent customer overwrite.
export async function handleSaveBooking(request, env, orderId) {
  const client = await requireClient(request, env);
  const order = await requireOwnedOrder(env.DB, client, orderId);
  const service = await getServiceById(env.DB, order.service_id);
  if (!service || service.offering_type !== "bookable_service") {
    throw new HttpError(409, "This order is not a bookable service.");
  }
  if (order.status !== "draft") {
    throw new HttpError(409, `Booking details can no longer be changed here (order status: ${order.status}). Please contact FIS or request a reschedule instead.`);
  }

  const body = await request.json().catch(() => ({}));
  requireFields(body, BOOKING_REQUIRED_FIELDS);
  if (!Array.isArray(body.passengerNames) || body.passengerNames.length === 0) {
    throw new HttpError(400, "passengerNames must be a non-empty array");
  }

  const bookingInput = {
    direction: String(body.direction).trim(),
    passengerCount: Number(body.passengerCount),
    passengerNames: body.passengerNames.map((n) => String(n).trim()),
    airport: String(body.airport).trim(),
    terminal: body.terminal ? String(body.terminal).trim() : null,
    airline: String(body.airline).trim(),
    flightNumber: String(body.flightNumber).trim(),
    flightRoute: body.flightRoute ? String(body.flightRoute).trim() : null,
    scheduledLocalDate: String(body.scheduledLocalDate).trim(),
    scheduledLocalTime: String(body.scheduledLocalTime).trim(),
    scheduledTimezone: String(body.scheduledTimezone).trim(),
    specialRequirements: body.specialRequirements ? String(body.specialRequirements).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
  };

  // A booking has no questionnaire of its own, but still needs the same
  // `applications` row a document order gets (via startOrderApplication)
  // so payment_requests.application_id and the rest of the existing
  // application-scoped plumbing work unchanged -- see startBookingApplication.
  await startBookingApplication(env.DB, order, service);

  const existing = await getBookingByOrderId(env.DB, order.id);
  const booking = existing
    ? await updateBookingDetails(env.DB, existing.id, bookingInput)
    : await createBooking(env.DB, { checkoutOrderId: order.id, clientId: client.id, serviceId: service.id, booking: bookingInput });

  return json({ booking: shapeBookingForCustomer(booking) });
}

export async function handleGetBooking(request, env, orderId) {
  const client = await requireClient(request, env);
  const order = await requireOwnedOrder(env.DB, client, orderId);
  const booking = await getBookingByOrderId(env.DB, order.id);
  const acceptance = booking ? await getPolicyAcceptance(env.DB, booking.id) : null;
  return json({
    booking: shapeBookingForCustomer(booking),
    policyAccepted: !!acceptance,
    policyVersion: POLICY_VERSION,
  });
}

// Records the customer's explicit, auditable acceptance of the Booking
// Flexibility and Refund Policy -- required (and checked in
// checkoutCustomer.js's handleConfirmAndPay) before payment, never a
// pre-checked box and never inferred from merely visiting the page.
export async function handleAcceptPolicy(request, env, orderId) {
  const client = await requireClient(request, env);
  const order = await requireOwnedOrder(env.DB, client, orderId);
  const booking = await getBookingByOrderId(env.DB, order.id);
  if (!booking) throw new HttpError(409, "Please complete the booking details first.");
  if (booking.client_id !== client.id) throw new HttpError(404, "Not found");

  const body = await request.json().catch(() => ({}));
  if (body.accepted !== true) {
    throw new HttpError(400, "The booking policy must be explicitly accepted before proceeding.");
  }

  await recordPolicyAcceptance(env.DB, {
    bookingId: booking.id,
    originalScheduledDepartureUtc: booking.scheduled_departure_utc,
    userAgent: request.headers.get("User-Agent") || null,
  });

  return json({ ok: true, policyVersion: POLICY_VERSION });
}

export async function handleGetBookingHistory(request, env, bookingId) {
  const client = await requireClient(request, env);
  const booking = await requireOwnedBooking(env.DB, client, bookingId);
  const history = await getBookingHistory(env.DB, booking.id);
  return json({ history: history.map((h) => ({ status: h.status, note: h.note, changedAt: h.changed_at })) });
}

// Submits a flight-change request against an existing booking. The
// 120-hour eligibility wording this returns ("Eligible for rescheduling,
// subject to availability" vs. not eligible) is computed ONCE, from the
// booking's ORIGINAL scheduled departure and the moment this request
// arrives -- never a guarantee, and never silently re-evaluated later
// against a different "now". Approving it is always a separate staff
// action (routes/staffAirportVip.js), never automatic even when eligible.
export async function handleCreateRescheduleRequest(request, env, bookingId) {
  const client = await requireClient(request, env);
  const booking = await requireOwnedBooking(env.DB, client, bookingId);

  // Rescheduling only makes sense once FIS has actually confirmed the
  // booking (or already rescheduled it once) -- a booking still awaiting
  // payment/availability review has no confirmed slot to change yet. The
  // underlying transition table (lib/airportVip.js) enforces this too;
  // checking here first gives a clearer customer-facing message than its
  // generic "cannot move from X to Y" error would.
  if (!["confirmed", "rescheduled"].includes(booking.status)) {
    throw new HttpError(409, `This booking cannot be rescheduled from its current status (${booking.status}). Please contact FIS directly.`);
  }

  const body = await request.json().catch(() => ({}));
  requireFields(body, ["airline", "flightNumber", "scheduledLocalDate", "scheduledLocalTime", "scheduledTimezone"]);

  const proposedFlight = {
    airline: String(body.airline).trim(),
    flightNumber: String(body.flightNumber).trim(),
    flightRoute: body.flightRoute ? String(body.flightRoute).trim() : null,
    scheduledLocalDate: String(body.scheduledLocalDate).trim(),
    scheduledLocalTime: String(body.scheduledLocalTime).trim(),
    scheduledTimezone: String(body.scheduledTimezone).trim(),
  };

  const result = await createRescheduleRequest(env.DB, {
    bookingId: booking.id,
    originalScheduledDepartureUtc: booking.scheduled_departure_utc,
    proposedFlight,
    customerNote: body.customerNote ? String(body.customerNote).trim() : null,
  });
  await transitionBooking(env.DB, booking, "reschedule_requested");

  return json({
    id: result.id,
    eligible: result.eligible,
    outcome: result.outcome,
    noticeHours: result.noticeHours,
  });
}

export async function handleListRescheduleRequests(request, env, bookingId) {
  const client = await requireClient(request, env);
  const booking = await requireOwnedBooking(env.DB, client, bookingId);
  const requests = await getRescheduleRequests(env.DB, booking.id);
  return json({
    requests: requests.map((r) => ({
      id: r.id,
      requestedAtUtc: r.requested_at_utc,
      noticeHoursComputed: r.notice_hours_computed,
      eligibleUnderPolicy: !!r.eligible_under_policy,
      proposedFlight: r.proposedFlight,
      customerNote: r.customer_note,
      staffDecision: r.staff_decision,
      staffNote: r.staff_note,
      staffDecidedAt: r.staff_decided_at,
    })),
  });
}
