// Airport VIP Meet & Assist -- booking CRUD, status history, policy
// acceptance, rescheduling, and refunds. Payment itself is NOT
// duplicated here: a booking's checkout_order_id points at an ordinary
// checkout_orders row, so QR Ph, payment-proof upload, and staff
// verification are all the existing, unmodified Instant Checkout
// machinery (lib/checkout.js, routes/checkoutCustomer.js,
// routes/staffCheckout.js) -- this file only ever ADDS the booking-
// specific facts (flight, passengers, policy, rescheduling, refunds) on
// top of that one order.
import { newId } from "./crypto.js";
import { HttpError } from "./storage.js";
import { localDateTimeToUtc, evaluateRescheduleRequest, POLICY_VERSION } from "./airportVipPolicy.js";

export const BOOKING_STATUSES = [
  "submitted",
  "awaiting_payment_verification",
  "payment_verified",
  "availability_under_review",
  "confirmed",
  "reschedule_requested",
  "rescheduled",
  "completed",
  "cancelled",
  "refund_pending",
  "refunded",
];

const ALLOWED_BOOKING_TRANSITIONS = {
  submitted: ["awaiting_payment_verification", "cancelled"],
  awaiting_payment_verification: ["payment_verified", "submitted", "cancelled"],
  payment_verified: ["availability_under_review", "confirmed", "cancelled", "refund_pending"],
  availability_under_review: ["confirmed", "cancelled", "refund_pending"],
  confirmed: ["reschedule_requested", "completed", "cancelled", "refund_pending"],
  reschedule_requested: ["rescheduled", "confirmed", "cancelled"],
  // A rescheduled booking is still a live, paid booking -- FIS being
  // unable to accommodate it applies exactly as it does to a booking
  // that was never rescheduled (the policy draws no such distinction),
  // so refund_pending must be reachable from here too. Missing until a
  // live Journey E (refund) test tried it and got a 409.
  rescheduled: ["confirmed", "reschedule_requested", "completed", "cancelled", "refund_pending"],
  completed: [],
  cancelled: ["refund_pending"],
  refund_pending: ["refunded"],
  refunded: [],
};

export function assertBookingTransitionAllowed(fromStatus, toStatus) {
  const allowed = ALLOWED_BOOKING_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new HttpError(409, `Cannot move this booking from "${fromStatus}" to "${toStatus}".`);
  }
}

export async function recordBookingStatus(db, { bookingId, status, note = null, staffEmail = null }) {
  await db.prepare("UPDATE airport_vip_bookings SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, bookingId).run();
  await db
    .prepare(
      "INSERT INTO airport_vip_booking_status_history (id, booking_id, status, note, changed_by_staff_email) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(newId(), bookingId, status, note, staffEmail)
    .run();
}

export async function transitionBooking(db, booking, toStatus, opts = {}) {
  assertBookingTransitionAllowed(booking.status, toStatus);
  await recordBookingStatus(db, { bookingId: booking.id, status: toStatus, note: opts.note, staffEmail: opts.staffEmail });
  return getBookingById(db, booking.id);
}

export async function getBookingById(db, bookingId) {
  return db.prepare("SELECT * FROM airport_vip_bookings WHERE id = ?").bind(bookingId).first();
}

export async function getBookingByOrderId(db, orderId) {
  return db.prepare("SELECT * FROM airport_vip_bookings WHERE checkout_order_id = ?").bind(orderId).first();
}

export async function requireOwnedBooking(db, client, bookingId) {
  const booking = await db.prepare("SELECT * FROM airport_vip_bookings WHERE id = ? AND client_id = ?").bind(bookingId, client.id).first();
  if (!booking) throw new HttpError(404, "Not found");
  return booking;
}

export async function getBookingHistory(db, bookingId) {
  const { results } = await db
    .prepare("SELECT * FROM airport_vip_booking_status_history WHERE booking_id = ? ORDER BY changed_at ASC")
    .bind(bookingId)
    .all();
  return results;
}

// Creates the booking row for an order that has already been created
// against a bookable_service catalogue entry (checkout.findOrCreateDraftOrder,
// same as a document order). One booking per order -- idempotent the
// same way: a second call for an order that already has a booking
// returns the existing one rather than creating a duplicate.
export async function createBooking(db, { checkoutOrderId, clientId, serviceId, booking }) {
  const existing = await getBookingByOrderId(db, checkoutOrderId);
  if (existing) return existing;

  const scheduledDepartureUtc = localDateTimeToUtc(booking.scheduledLocalDate, booking.scheduledLocalTime, booking.scheduledTimezone);
  const id = newId();
  await db
    .prepare(
      `INSERT INTO airport_vip_bookings
        (id, checkout_order_id, client_id, service_id, direction, passenger_count, passenger_names_json,
         airport, terminal, airline, flight_number, flight_route,
         scheduled_departure_utc, scheduled_local_date, scheduled_local_time, scheduled_timezone,
         special_requirements, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      checkoutOrderId,
      clientId,
      serviceId,
      booking.direction,
      booking.passengerCount,
      JSON.stringify(booking.passengerNames),
      booking.airport,
      booking.terminal || null,
      booking.airline,
      booking.flightNumber,
      booking.flightRoute || null,
      scheduledDepartureUtc,
      booking.scheduledLocalDate,
      booking.scheduledLocalTime,
      booking.scheduledTimezone,
      booking.specialRequirements || null,
      booking.notes || null
    )
    .run();

  await recordBookingStatus(db, { bookingId: id, status: "submitted" });
  return getBookingById(db, id);
}

// Lets the customer correct booking details (a typo'd flight number, an
// added passenger) any time before payment is confirmed-and-paid -- the
// same "editable while draft" window handleSetDeliveryAddress already
// uses for a document order's delivery address. Unlike createBooking,
// this always overwrites; callers are responsible for only allowing it
// while the underlying order is still "draft" (checked in the route).
export async function updateBookingDetails(db, bookingId, booking) {
  const scheduledDepartureUtc = localDateTimeToUtc(booking.scheduledLocalDate, booking.scheduledLocalTime, booking.scheduledTimezone);
  await db
    .prepare(
      `UPDATE airport_vip_bookings
       SET direction = ?, passenger_count = ?, passenger_names_json = ?,
           airport = ?, terminal = ?, airline = ?, flight_number = ?, flight_route = ?,
           scheduled_departure_utc = ?, scheduled_local_date = ?, scheduled_local_time = ?, scheduled_timezone = ?,
           special_requirements = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(
      booking.direction,
      booking.passengerCount,
      JSON.stringify(booking.passengerNames),
      booking.airport,
      booking.terminal || null,
      booking.airline,
      booking.flightNumber,
      booking.flightRoute || null,
      scheduledDepartureUtc,
      booking.scheduledLocalDate,
      booking.scheduledLocalTime,
      booking.scheduledTimezone,
      booking.specialRequirements || null,
      booking.notes || null,
      bookingId
    )
    .run();
  return getBookingById(db, bookingId);
}

// Auditable record of the customer's explicit acceptance of the booking
// policy -- a separate row, not a boolean flag, so the EXACT terms in
// force (policy_version) and the original flight timestamp they applied
// to are preserved even if the policy wording or the booking's flight
// details change later.
export async function recordPolicyAcceptance(db, { bookingId, originalScheduledDepartureUtc, userAgent }) {
  await db
    .prepare(
      `INSERT INTO airport_vip_policy_acceptances (id, booking_id, policy_version, original_scheduled_departure_utc, user_agent)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(newId(), bookingId, POLICY_VERSION, originalScheduledDepartureUtc, userAgent || null)
    .run();
}

export async function getPolicyAcceptance(db, bookingId) {
  return db
    .prepare("SELECT * FROM airport_vip_policy_acceptances WHERE booking_id = ? ORDER BY accepted_at DESC LIMIT 1")
    .bind(bookingId)
    .first();
}

// Evaluates the 120-hour rule ONCE, at request time, and freezes the
// result (eligible/noticeHours) into the row -- staff reviewing this
// later sees exactly what the customer was told when they submitted it,
// never a value silently recomputed against "now".
export async function createRescheduleRequest(db, { bookingId, originalScheduledDepartureUtc, proposedFlight, customerNote }) {
  const requestedAtUtc = new Date().toISOString();
  const evaluation = evaluateRescheduleRequest(originalScheduledDepartureUtc, requestedAtUtc);

  const id = newId();
  await db
    .prepare(
      `INSERT INTO airport_vip_reschedule_requests
        (id, booking_id, original_scheduled_departure_utc, requested_at_utc, notice_hours_computed, eligible_under_policy, proposed_flight_json, customer_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      bookingId,
      originalScheduledDepartureUtc,
      requestedAtUtc,
      evaluation.noticeHours,
      evaluation.eligible ? 1 : 0,
      JSON.stringify(proposedFlight),
      customerNote || null
    )
    .run();

  return { id, ...evaluation };
}

export async function getRescheduleRequestById(db, requestId) {
  const row = await db.prepare("SELECT * FROM airport_vip_reschedule_requests WHERE id = ?").bind(requestId).first();
  return row ? { ...row, proposedFlight: JSON.parse(row.proposed_flight_json) } : null;
}

export async function getRescheduleRequests(db, bookingId) {
  const { results } = await db
    .prepare("SELECT * FROM airport_vip_reschedule_requests WHERE booking_id = ? ORDER BY created_at DESC")
    .bind(bookingId)
    .all();
  return results.map((r) => ({ ...r, proposedFlight: JSON.parse(r.proposed_flight_json) }));
}

export async function decideRescheduleRequest(db, { requestId, decision, staffEmail, staffNote }) {
  if (!["approved", "rejected", "exception_approved"].includes(decision)) {
    throw new HttpError(400, "Unknown reschedule decision");
  }
  await db
    .prepare(
      `UPDATE airport_vip_reschedule_requests
       SET staff_decision = ?, staff_decided_by = ?, staff_decided_at = datetime('now'), staff_note = ?
       WHERE id = ?`
    )
    .bind(decision, staffEmail, staffNote || null, requestId)
    .run();
  return db.prepare("SELECT * FROM airport_vip_reschedule_requests WHERE id = ?").bind(requestId).first();
}

// If a reschedule is actually approved, the booking's own flight fields
// are updated to the new flight -- but ONLY here, as an explicit staff-
// confirmed action, never automatically when the request is merely
// submitted. The original timestamp already preserved on the request row
// is untouched; this only changes what the booking's "current" flight is.
export async function applyRescheduledFlight(db, bookingId, proposedFlight) {
  const scheduledDepartureUtc = localDateTimeToUtc(proposedFlight.scheduledLocalDate, proposedFlight.scheduledLocalTime, proposedFlight.scheduledTimezone);
  await db
    .prepare(
      `UPDATE airport_vip_bookings
       SET airline = ?, flight_number = ?, flight_route = ?,
           scheduled_departure_utc = ?, scheduled_local_date = ?, scheduled_local_time = ?, scheduled_timezone = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(
      proposedFlight.airline,
      proposedFlight.flightNumber,
      proposedFlight.flightRoute || null,
      scheduledDepartureUtc,
      proposedFlight.scheduledLocalDate,
      proposedFlight.scheduledLocalTime,
      proposedFlight.scheduledTimezone,
      bookingId
    )
    .run();
}

// ---------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------
export async function createRefund(db, { bookingId, reason, requestedAmountPhpCentavos, staffEmail }) {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO airport_vip_refunds (id, booking_id, reason, requested_amount_php_centavos, created_by_staff_email)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, bookingId, reason, requestedAmountPhpCentavos, staffEmail)
    .run();
  return db.prepare("SELECT * FROM airport_vip_refunds WHERE id = ?").bind(id).first();
}

const ALLOWED_REFUND_TRANSITIONS = {
  requested: ["approved", "declined"],
  approved: ["processing", "declined"],
  processing: ["completed"],
  completed: [],
  declined: [],
};

export async function updateRefundStatus(db, refundId, { status, approvedAmountPhpCentavos, method, transactionReference, notes, staffEmail }) {
  const refund = await db.prepare("SELECT * FROM airport_vip_refunds WHERE id = ?").bind(refundId).first();
  if (!refund) throw new HttpError(404, "Not found");
  const allowed = ALLOWED_REFUND_TRANSITIONS[refund.status] || [];
  if (!allowed.includes(status)) throw new HttpError(409, `Cannot move this refund from "${refund.status}" to "${status}".`);

  await db
    .prepare(
      `UPDATE airport_vip_refunds
       SET status = ?, approved_amount_php_centavos = COALESCE(?, approved_amount_php_centavos),
           method = COALESCE(?, method), transaction_reference = COALESCE(?, transaction_reference),
           notes = COALESCE(?, notes), updated_at = datetime('now'),
           completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
       WHERE id = ?`
    )
    .bind(status, approvedAmountPhpCentavos ?? null, method || null, transactionReference || null, notes || null, status, refundId)
    .run();
  return db.prepare("SELECT * FROM airport_vip_refunds WHERE id = ?").bind(refundId).first();
}

export async function getRefundsForBooking(db, bookingId) {
  const { results } = await db.prepare("SELECT * FROM airport_vip_refunds WHERE booking_id = ? ORDER BY created_at DESC").bind(bookingId).all();
  return results;
}

export async function listBookingsForStaff(db, { status } = {}) {
  const query = status
    ? db.prepare(
        `SELECT b.*, c.full_name AS client_full_name, c.email AS client_email
         FROM airport_vip_bookings b JOIN clients c ON c.id = b.client_id
         WHERE b.status = ? ORDER BY b.updated_at DESC`
      ).bind(status)
    : db.prepare(
        `SELECT b.*, c.full_name AS client_full_name, c.email AS client_email
         FROM airport_vip_bookings b JOIN clients c ON c.id = b.client_id
         ORDER BY b.updated_at DESC LIMIT 200`
      );
  const { results } = await query.all();
  return results;
}
