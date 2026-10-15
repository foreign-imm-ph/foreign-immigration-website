// Airport VIP Meet & Assist -- the Staff Portal section for everything
// Part VII/§22 asks for on top of a booking: availability confirmation,
// rescheduling decisions, and refund administration. Payment itself is
// NOT handled here -- a booking's checkout_order_id is an ordinary
// Instant Services order, verified/rejected on the existing
// /staff/instant-services/orders/:id page (staffCheckout.js) exactly as
// a document order would be. This module only ever reacts to a booking
// whose payment has already been verified there (see
// listBookingsForStaff -- it lists by booking status, not payment status).
import { staffPage, escapeHtml } from "../lib/staffHtml.js";
import { HttpError } from "../lib/storage.js";
import { logAudit } from "../lib/db.js";
import { centavosToPhpString, phpStringToCentavos } from "../lib/money.js";
import { getOrderById } from "../lib/checkout.js";
import {
  BOOKING_STATUSES,
  getBookingById,
  transitionBooking,
  getBookingHistory,
  getPolicyAcceptance,
  getRescheduleRequests,
  getRescheduleRequestById,
  decideRescheduleRequest,
  applyRescheduledFlight,
  createRefund,
  updateRefundStatus,
  getRefundsForBooking,
  listBookingsForStaff,
} from "../lib/airportVip.js";

function notFound() {
  return new Response("Not found", { status: 404 });
}

function redirectTo(request, path) {
  return Response.redirect(`${new URL(request.url).origin}${path}`, 303);
}

async function requireBooking(env, bookingId) {
  const booking = await getBookingById(env.DB, bookingId);
  if (!booking) throw new HttpError(404, "Not found");
  return booking;
}

export async function listBookings(env, staff, url) {
  const status = url.searchParams.get("status") || undefined;
  const bookings = await listBookingsForStaff(env.DB, { status });
  const rows = bookings
    .map(
      (b) => `<tr>
        <td><a class="ref" href="/staff/airport-vip/bookings/${b.id}">${escapeHtml(b.id.slice(0, 8))}</a></td>
        <td>${escapeHtml(b.client_full_name)}<br><span class="muted">${escapeHtml(b.client_email)}</span></td>
        <td class="muted">${escapeHtml(b.airline)} ${escapeHtml(b.flight_number)}<br>${escapeHtml(b.scheduled_local_date)} ${escapeHtml(b.scheduled_local_time)}</td>
        <td><span class="status">${escapeHtml(b.status)}</span></td>
        <td class="muted">${escapeHtml(b.updated_at)}</td>
      </tr>`
    )
    .join("");
  return staffPage(
    "Airport VIP Bookings",
    `<h1>Airport VIP Meet &amp; Assist — Bookings</h1>
     <div class="filter-bar">
       <a href="/staff/airport-vip/bookings/">All</a> |
       ${BOOKING_STATUSES.map((s) => `<a href="/staff/airport-vip/bookings/?status=${s}"${status === s ? ' class="filter-active"' : ""}>${s}</a>`).join(" ")}
     </div>
     <table>
       <tr><th>Booking</th><th>Client</th><th>Flight</th><th>Status</th><th>Updated</th></tr>
       ${rows || '<tr><td colspan="5" class="muted">No Airport VIP bookings yet.</td></tr>'}
     </table>`,
    staff.email
  );
}

// Statuses a staff member may move a booking to directly from the detail
// page, excluding transitions that have their own dedicated workflow
// (payment verification happens on the linked order's own page;
// reschedule/refund have their own sections below).
const STAFF_SETTABLE_STATUSES = ["availability_under_review", "confirmed", "completed", "cancelled", "refund_pending"];

export async function viewBooking(env, staff, bookingId) {
  const booking = await requireBooking(env, bookingId);
  const order = await getOrderById(env.DB, booking.checkout_order_id);
  const client = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(booking.client_id).first();
  const acceptance = await getPolicyAcceptance(env.DB, booking.id);
  const history = await getBookingHistory(env.DB, booking.id);
  const rescheduleRequests = await getRescheduleRequests(env.DB, booking.id);
  const refunds = await getRefundsForBooking(env.DB, booking.id);
  const passengerNames = JSON.parse(booking.passenger_names_json);

  const allowedNext = STAFF_SETTABLE_STATUSES.filter((s) => s !== booking.status);
  const statusButtons = allowedNext
    .map(
      (s) => `<form method="POST" action="/staff/airport-vip/bookings/${booking.id}/status" style="display:inline-block;margin-right:0.4rem;">
         <input type="hidden" name="status" value="${s}">
         <label for="note-${s}" class="muted" style="display:none;"></label>
         <button class="secondary" type="submit">${escapeHtml(s)}</button>
       </form>`
    )
    .join("");

  const rescheduleRows = rescheduleRequests
    .map((r) => {
      const pf = r.proposedFlight;
      const decisionForm =
        r.staff_decision === "pending"
          ? `<form method="POST" action="/staff/airport-vip/bookings/${booking.id}/reschedule-requests/${r.id}/decide">
               <label for="decision-${r.id}">Decision</label>
               <select name="decision" id="decision-${r.id}">
                 <option value="approved">Approve (apply the new flight)</option>
                 <option value="exception_approved">Approve as an authorized exception (outside standard policy)</option>
                 <option value="rejected">Reject (original booking stands)</option>
               </select>
               <label for="staffNote-${r.id}">Note (optional)</label>
               <textarea name="staffNote" id="staffNote-${r.id}"></textarea>
               <button type="submit">Record decision</button>
             </form>`
          : `<p class="muted">Decided: ${escapeHtml(r.staff_decision)} by ${escapeHtml(r.staff_decided_by || "")} at ${escapeHtml(r.staff_decided_at || "")}${r.staff_note ? ` — ${escapeHtml(r.staff_note)}` : ""}</p>`;
      return `<div class="card">
        <p><strong>Requested:</strong> ${escapeHtml(r.requested_at_utc)} — <strong>Notice given:</strong> ${Number(r.notice_hours_computed).toFixed(1)} hours — <span class="status">${r.eligible_under_policy ? "Eligible for rescheduling, subject to availability" : "Not eligible under standard policy (less than 120 hours' notice)"}</span></p>
        <p><strong>Proposed flight:</strong> ${escapeHtml(pf.airline)} ${escapeHtml(pf.flightNumber)} — ${escapeHtml(pf.scheduledLocalDate)} ${escapeHtml(pf.scheduledLocalTime)} (${escapeHtml(pf.scheduledTimezone)})</p>
        ${r.customer_note ? `<p class="muted">Customer note: ${escapeHtml(r.customer_note)}</p>` : ""}
        ${decisionForm}
      </div>`;
    })
    .join("") || '<p class="muted">No rescheduling requests on this booking.</p>';

  const refundRows = refunds
    .map((r) => {
      const actions =
        r.status === "completed" || r.status === "declined"
          ? ""
          : `<form method="POST" action="/staff/airport-vip/bookings/${booking.id}/refunds/${r.id}/status">
               <label for="refundStatus-${r.id}">Move to</label>
               <select name="status" id="refundStatus-${r.id}">
                 ${["approved", "processing", "completed", "declined"].map((s) => `<option value="${s}">${s}</option>`).join("")}
               </select>
               <label for="approvedAmount-${r.id}">Approved amount (PHP, optional — defaults to requested amount)</label>
               <input type="text" name="approvedAmountPhp" id="approvedAmount-${r.id}" placeholder="${(r.requested_amount_php_centavos / 100).toFixed(2)}">
               <label for="method-${r.id}">Method (optional)</label>
               <input type="text" name="method" id="method-${r.id}" placeholder="e.g. Bank transfer (simulated)">
               <label for="txRef-${r.id}">Transaction reference (optional)</label>
               <input type="text" name="transactionReference" id="txRef-${r.id}">
               <label for="refundNotes-${r.id}">Notes (optional)</label>
               <textarea name="notes" id="refundNotes-${r.id}"></textarea>
               <p class="muted">This environment never processes a real refund transaction -- recording a status here is for workflow tracking and testing only.</p>
               <button type="submit">Update refund</button>
             </form>`;
      return `<div class="card">
        <p><strong>Reason:</strong> ${escapeHtml(r.reason)} — <strong>Requested:</strong> ${centavosToPhpString(r.requested_amount_php_centavos)} — <span class="status">${escapeHtml(r.status)}</span></p>
        ${r.approved_amount_php_centavos != null ? `<p>Approved: ${centavosToPhpString(r.approved_amount_php_centavos)}</p>` : ""}
        ${r.method ? `<p class="muted">${escapeHtml(r.method)}${r.transaction_reference ? ` — ${escapeHtml(r.transaction_reference)}` : ""}</p>` : ""}
        ${actions}
      </div>`;
    })
    .join("") || '<p class="muted">No refunds recorded for this booking.</p>';

  return staffPage(
    `Airport VIP Booking ${booking.id.slice(0, 8)}`,
    `<h1>Airport VIP Booking</h1>
     <div class="card">
       <p><strong>${escapeHtml(client ? client.full_name : "")}</strong> &lt;${escapeHtml(client ? client.email : "")}&gt;</p>
       <p><strong>Booking status:</strong> <span class="status">${escapeHtml(booking.status)}</span></p>
       ${order ? `<p><strong>Payment status (linked order):</strong> <span class="status">${escapeHtml(order.status)}</span> — <a href="/staff/instant-services/orders/${order.id}">View order &amp; verify payment</a></p>` : ""}
       <p><strong>Policy acceptance:</strong> ${acceptance ? `Accepted ${escapeHtml(acceptance.accepted_at)} (policy ${escapeHtml(acceptance.policy_version)})` : '<span class="muted">Not yet accepted</span>'}</p>
       ${statusButtons}
       <p class="muted">Availability must be explicitly confirmed here -- a booking is never shown to the customer as "Booking confirmed" merely because payment was verified.</p>
     </div>
     <div class="card">
       <h2>Flight &amp; passengers</h2>
       <p><strong>Direction:</strong> ${escapeHtml(booking.direction)}</p>
       <p><strong>Flight:</strong> ${escapeHtml(booking.airline)} ${escapeHtml(booking.flight_number)}${booking.flight_route ? ` (${escapeHtml(booking.flight_route)})` : ""}</p>
       <p><strong>Scheduled:</strong> ${escapeHtml(booking.scheduled_local_date)} ${escapeHtml(booking.scheduled_local_time)} (${escapeHtml(booking.scheduled_timezone)}) — UTC: ${escapeHtml(booking.scheduled_departure_utc)}</p>
       <p><strong>Airport:</strong> ${escapeHtml(booking.airport)}${booking.terminal ? `, Terminal ${escapeHtml(booking.terminal)}` : ""}</p>
       <p><strong>Passengers (${booking.passenger_count}):</strong> ${passengerNames.map(escapeHtml).join(", ")}</p>
       ${booking.special_requirements ? `<p><strong>Special requirements:</strong> ${escapeHtml(booking.special_requirements)}</p>` : ""}
       ${booking.notes ? `<p><strong>Notes:</strong> ${escapeHtml(booking.notes)}</p>` : ""}
     </div>
     <div class="card">
       <h2>Rescheduling requests</h2>
       ${rescheduleRows}
     </div>
     <div class="card">
       <h2>Refunds</h2>
       <form method="POST" action="/staff/airport-vip/bookings/${booking.id}/refunds">
         <label for="refundReason">Start a refund — reason</label>
         <select name="reason" id="refundReason">
           <option value="fis_unable_to_accommodate">FIS unable to accommodate (full refund)</option>
           <option value="staff_exception">Staff-authorized exception</option>
           <option value="other">Other</option>
         </select>
         <label for="refundAmount">Requested amount (PHP)</label>
         <input type="text" name="requestedAmountPhp" id="refundAmount" placeholder="e.g. ${order ? (order.price_snapshot_json ? (JSON.parse(order.price_snapshot_json).totalPhpCentavos / 100).toFixed(2) : "") : ""}">
         <button type="submit">Start refund</button>
       </form>
       ${refundRows}
     </div>
     <div class="card"><h2>Status history</h2>${history.map((h) => `<p class="muted">${escapeHtml(h.changed_at)} — <span class="status">${escapeHtml(h.status)}</span>${h.note ? `: ${escapeHtml(h.note)}` : ""}</p>`).join("") || '<p class="muted">No history.</p>'}</div>`,
    staff.email
  );
}

export async function setBookingStatusHandler(request, env, staff, bookingId) {
  const booking = await requireBooking(env, bookingId);
  const form = await request.formData();
  const status = String(form.get("status") || "");
  if (!STAFF_SETTABLE_STATUSES.includes(status)) throw new HttpError(400, "Unknown or non-staff-settable booking status");

  await transitionBooking(env.DB, booking, status, { staffEmail: staff.email, note: String(form.get("note") || "").trim() || null });
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "changed_airport_vip_booking_status", targetTable: "airport_vip_bookings", targetId: bookingId, metadata: JSON.stringify({ status }) });

  return redirectTo(request, `/staff/airport-vip/bookings/${bookingId}`);
}

// Decides a customer's reschedule request. Approving one is the ONLY
// place a booking's flight details change after creation (besides the
// customer's own pre-payment edits) -- always an explicit staff action,
// never automatic even when the request was eligible under the 120-hour
// rule, per the directive's "never silently modify confirmed bookings
// without staff review."
export async function decideRescheduleRequestHandler(request, env, staff, bookingId, requestId) {
  const booking = await requireBooking(env, bookingId);
  const reschedule = await getRescheduleRequestById(env.DB, requestId);
  if (!reschedule || reschedule.booking_id !== bookingId) return notFound();

  const form = await request.formData();
  const decision = String(form.get("decision") || "");
  const staffNote = String(form.get("staffNote") || "").trim() || null;

  await decideRescheduleRequest(env.DB, { requestId, decision, staffEmail: staff.email, staffNote });

  if (decision === "approved" || decision === "exception_approved") {
    await applyRescheduledFlight(env.DB, bookingId, reschedule.proposedFlight);
    await transitionBooking(env.DB, booking, "rescheduled", { staffEmail: staff.email, note: `Reschedule request ${requestId} approved${decision === "exception_approved" ? " as an authorized exception" : ""}` });
  } else if (decision === "rejected") {
    await transitionBooking(env.DB, booking, "confirmed", { staffEmail: staff.email, note: `Reschedule request ${requestId} rejected; original booking stands` });
  }

  await logAudit(env.DB, {
    actorType: "staff",
    actorIdOrEmail: staff.email,
    action: "decided_airport_vip_reschedule_request",
    targetTable: "airport_vip_reschedule_requests",
    targetId: requestId,
    metadata: JSON.stringify({ decision }),
  });

  return redirectTo(request, `/staff/airport-vip/bookings/${bookingId}`);
}

// Starts a refund workflow entry (§15). Never itself moves money -- this
// environment has no real payment-reversal integration, so every refund
// here is a tracked, simulated workflow record only, exactly as the
// directive requires ("do not issue or initiate real refunds... use
// simulated transactions for testing").
export async function createRefundHandler(request, env, staff, bookingId) {
  await requireBooking(env, bookingId);
  const form = await request.formData();
  const reason = String(form.get("reason") || "other");
  const amountCentavos = phpStringToCentavos(form.get("requestedAmountPhp"));
  if (amountCentavos === null || amountCentavos <= 0) throw new HttpError(400, "A valid refund amount is required");

  const refund = await createRefund(env.DB, { bookingId, reason, requestedAmountPhpCentavos: amountCentavos, staffEmail: staff.email });
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "started_airport_vip_refund", targetTable: "airport_vip_refunds", targetId: refund.id, metadata: JSON.stringify({ reason, amountCentavos }) });

  return redirectTo(request, `/staff/airport-vip/bookings/${bookingId}`);
}

export async function updateRefundStatusHandler(request, env, staff, bookingId, refundId) {
  await requireBooking(env, bookingId);
  const form = await request.formData();
  const status = String(form.get("status") || "");
  const approvedAmountRaw = form.get("approvedAmountPhp");
  const approvedAmountPhpCentavos = approvedAmountRaw && String(approvedAmountRaw).trim() ? phpStringToCentavos(approvedAmountRaw) : null;

  const refund = await updateRefundStatus(env.DB, refundId, {
    status,
    approvedAmountPhpCentavos,
    method: String(form.get("method") || "").trim() || null,
    transactionReference: String(form.get("transactionReference") || "").trim() || null,
    notes: String(form.get("notes") || "").trim() || null,
    staffEmail: staff.email,
  });

  if (status === "completed") {
    const booking = await requireBooking(env, bookingId);
    if (booking.status === "refund_pending") {
      await transitionBooking(env.DB, booking, "refunded", { staffEmail: staff.email, note: `Refund ${refundId} completed (simulated transaction)` });
    }
  }

  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "updated_airport_vip_refund_status", targetTable: "airport_vip_refunds", targetId: refund.id, metadata: JSON.stringify({ status }) });

  return redirectTo(request, `/staff/airport-vip/bookings/${bookingId}`);
}
