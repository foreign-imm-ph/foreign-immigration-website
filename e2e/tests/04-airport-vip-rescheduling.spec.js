// Journey 4: Airport VIP rescheduling, exercised through the REAL Client
// Portal reschedule form against a REAL confirmed booking -- never a
// guarantee, always "eligible for rescheduling, subject to availability"
// or not, computed server-side from the booking's original scheduled
// departure. Three notice-period cases:
//   - well before the 120-hour cutoff (comfortably eligible)
//   - well after the 120-hour cutoff (comfortably not eligible)
//   - right at the cutoff itself
//
// The third case needs precision no live, wall-clock-driven browser test
// can guarantee to the millisecond, so it sets the confirmed booking's
// scheduled_departure_utc directly in D1 (same synthetic-fixture
// convention used throughout this suite) to a value a few seconds either
// side of exactly 120 hours from the moment of the request, immediately
// before firing it. The EXACT mathematical boundary (helpers.js
// noticeHours' >= comparison) is already exhaustively unit-tested,
// deterministically, with no wall-clock dependency, in
// worker/test/airportVipPolicy.test.js -- this journey's job is proving
// the real booking -> Client Portal -> API path honors that boundary
// end to end, not re-proving the arithmetic itself.
const { test, expect } = require("@playwright/test");
const {
  ensureTestStaffAdmin,
  uniqueSuffix,
  signInStaff,
  createAndActivateOffering,
  createConfirmedAirportVipBooking,
  signInClientInPortal,
  issueAuthTokenForClientId,
  d1Json,
  sqlEscape,
} = require("../fixtures/testHelpers");

function futureDateString(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const createConfirmedBooking = (page, serviceId, opts) =>
  createConfirmedAirportVipBooking(page, serviceId, { ...opts, fullName: "E2E Journey4 Tester" });

// Drives the real Client Portal reschedule form (portal-app.js
// .portal-reschedule-form) against the booking shown on the given
// application's detail view, and returns the status message it renders.
async function requestRescheduleViaPortal(page, clientId, applicationId) {
  const rawToken = issueAuthTokenForClientId(clientId);
  await signInClientInPortal(page, rawToken);
  // Each test client has exactly one application (created fresh by
  // createConfirmedBooking just above), so the first list item is always
  // the right one -- there is no per-item application id in the DOM to
  // select on more specifically.
  void applicationId;
  await page.locator(".portal-application-item").first().click();
  await page.waitForSelector("#portal-airport-vip-section .portal-reschedule-form", { timeout: 15_000 });
  await page.fill("#reschedAirline", "E2E Rescheduled Airlines");
  await page.fill("#reschedFlightNumber", "ER999");
  await page.fill("#reschedDate", futureDateString(200));
  await page.fill("#reschedTime", "09:00");
  await page.click(".portal-reschedule-form button[type=submit]");
  const status = page.locator("#portal-airport-vip-section .portal-reschedule-form .form-status");
  // "Submitting..." is the button's own transient state -- wait past it
  // for one of the two real outcomes the backend can actually return.
  await expect(status).toContainText(/Eligible for rescheduling|does not qualify for rescheduling/, { timeout: 15_000 });
  return status.innerText();
}

test.describe("Journey 4: Airport VIP rescheduling", () => {
  let serviceId;

  test.beforeAll(async ({ browser }) => {
    ensureTestStaffAdmin();
    const page = await browser.newPage();
    await signInStaff(page);
    serviceId = await createAndActivateOffering(page, {
      offeringType: "bookable_service",
      slug: `e2e-vip-reschedule-${uniqueSuffix()}`,
      serviceGroup: "airport-vip",
      serviceFeeAmount: "6500.00",
      title: "E2E Airport VIP Rescheduling Fixture",
      supportsDelivery: false,
    });
    await page.close();
  });

  test("well before the 120-hour cutoff: eligible for rescheduling", async ({ page }) => {
    const { clientId, applicationId } = await createConfirmedBooking(page, serviceId, {
      emailPrefix: "e2e-j4-eligible",
      scheduledLocalDate: futureDateString(10), // ~240h out -- comfortably eligible
    });
    const message = await requestRescheduleViaPortal(page, clientId, applicationId);
    expect(message).toContain("Eligible for rescheduling, subject to availability");
  });

  test("well after the 120-hour cutoff: not eligible for rescheduling", async ({ page }) => {
    const { clientId, applicationId } = await createConfirmedBooking(page, serviceId, {
      emailPrefix: "e2e-j4-ineligible",
      scheduledLocalDate: futureDateString(2), // ~48h out -- comfortably not eligible
    });
    const message = await requestRescheduleViaPortal(page, clientId, applicationId);
    expect(message).toContain("does not qualify for rescheduling");
    expect(message).not.toContain("Eligible for rescheduling");
  });

  test("right at the 120-hour cutoff: the inclusive boundary is honored by the real request path", async ({ page }) => {
    const { bookingId, clientId, applicationId } = await createConfirmedBooking(page, serviceId, {
      emailPrefix: "e2e-j4-boundary",
      scheduledLocalDate: futureDateString(10), // confirmed first; departure is overridden precisely next
    });

    // Just-over-120-hours case: eligible (the >= boundary). The buffer is
    // 2 minutes, not a few seconds -- filling in the reschedule form
    // itself takes real wall-clock time between setting this timestamp
    // and the request actually firing, and 2 minutes is still
    // "effectively at" a 120-HOUR cutoff (0.03% of it) while safely
    // surviving that delay.
    const justOverUtc = new Date(Date.now() + 120 * 3600 * 1000 + 120_000).toISOString();
    d1Json(`UPDATE airport_vip_bookings SET scheduled_departure_utc = '${sqlEscape(justOverUtc)}' WHERE id = '${bookingId}'`);
    const eligibleMessage = await requestRescheduleViaPortal(page, clientId, applicationId);
    expect(eligibleMessage).toContain("Eligible for rescheduling, subject to availability");

    // The booking is now "reschedule_requested" (not reschedulable again
    // until staff decides), so a second real booking is needed for the
    // just-under case rather than reusing this one.
    const { bookingId: bookingId2, clientId: clientId2, applicationId: applicationId2 } = await createConfirmedBooking(page, serviceId, {
      emailPrefix: "e2e-j4-boundary2",
      scheduledLocalDate: futureDateString(10),
    });
    const justUnderUtc = new Date(Date.now() + 120 * 3600 * 1000 - 120_000).toISOString();
    d1Json(`UPDATE airport_vip_bookings SET scheduled_departure_utc = '${sqlEscape(justUnderUtc)}' WHERE id = '${bookingId2}'`);
    const ineligibleMessage = await requestRescheduleViaPortal(page, clientId2, applicationId2);
    expect(ineligibleMessage).toContain("does not qualify for rescheduling");
  });
});
