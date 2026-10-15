// Journey 5: "FIS is unable to accommodate a booking" -> full refund.
// Walks a confirmed Airport VIP booking through the real staff refund
// workflow (requested -> approved -> processing -> completed), entirely
// through the Staff Portal UI, and confirms the booking only reaches
// "refunded" once the refund record itself reaches "completed" -- never
// a real payment-reversal call (worker/src/routes/staffAirportVip.js
// says so explicitly; this is a simulated workflow record only).
const { test, expect } = require("@playwright/test");
const {
  WORKER_BASE,
  ensureTestStaffAdmin,
  uniqueSuffix,
  signInStaff,
  createAndActivateOffering,
  createConfirmedAirportVipBooking,
  d1Json,
} = require("../fixtures/testHelpers");

function futureDateString(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.describe("Journey 5: FIS unable to accommodate -> full refund", () => {
  test.beforeAll(() => {
    ensureTestStaffAdmin();
  });

  test("staff starts a refund for 'FIS unable to accommodate', walks it to completed, and only then is the booking marked refunded", async ({ page }) => {
    await signInStaff(page);
    const serviceId = await createAndActivateOffering(page, {
      offeringType: "bookable_service",
      slug: `e2e-vip-refund-${uniqueSuffix()}`,
      serviceGroup: "airport-vip",
      serviceFeeAmount: "7000.00",
      title: "E2E Airport VIP Refund Fixture",
      supportsDelivery: false,
    });

    const { bookingId } = await createConfirmedAirportVipBooking(page, serviceId, {
      emailPrefix: "e2e-j5",
      fullName: "E2E Journey5 Tester",
      scheduledLocalDate: futureDateString(15),
    });

    // --- Staff moves the booking to refund_pending (FIS cannot accommodate it) ---
    await page.goto(`${WORKER_BASE}/staff/airport-vip/bookings/${bookingId}`);
    await page.locator('form[action$="/status"] button:has-text("refund_pending")').click();
    expect(d1Json(`SELECT status FROM airport_vip_bookings WHERE id = '${bookingId}'`)[0].status).toBe("refund_pending");

    // --- Staff starts the refund record itself, with the directive's own
    // named reason ---
    await page.goto(`${WORKER_BASE}/staff/airport-vip/bookings/${bookingId}`);
    await page.selectOption("#refundReason", "fis_unable_to_accommodate");
    await page.fill("#refundAmount", "7000.00");
    await page.click('form[action$="/refunds"] button:has-text("Start refund")');

    const refundRowsAfterStart = d1Json(
      `SELECT id, status, reason, requested_amount_php_centavos FROM airport_vip_refunds WHERE booking_id = '${bookingId}'`
    );
    expect(refundRowsAfterStart).toHaveLength(1);
    expect(refundRowsAfterStart[0].status).toBe("requested");
    expect(refundRowsAfterStart[0].reason).toBe("fis_unable_to_accommodate");
    expect(refundRowsAfterStart[0].requested_amount_php_centavos).toBe(700000); // full refund, PHP 7000.00
    const refundId = refundRowsAfterStart[0].id;

    // --- The booking must not jump to "refunded" merely because a refund
    // record now exists ---
    expect(d1Json(`SELECT status FROM airport_vip_bookings WHERE id = '${bookingId}'`)[0].status).toBe("refund_pending");

    // --- Walk the refund through its own real workflow, one staff action
    // at a time: requested -> approved -> processing -> completed ---
    await page.goto(`${WORKER_BASE}/staff/airport-vip/bookings/${bookingId}`);
    await page.selectOption(`#refundStatus-${refundId}`, "approved");
    await page.fill(`#method-${refundId}`, "Bank transfer (simulated)");
    await page.click(`form[action$="/refunds/${refundId}/status"] button:has-text("Update refund")`);
    expect(d1Json(`SELECT status FROM airport_vip_refunds WHERE id = '${refundId}'`)[0].status).toBe("approved");
    expect(d1Json(`SELECT status FROM airport_vip_bookings WHERE id = '${bookingId}'`)[0].status).toBe("refund_pending"); // still not refunded

    await page.goto(`${WORKER_BASE}/staff/airport-vip/bookings/${bookingId}`);
    await page.selectOption(`#refundStatus-${refundId}`, "processing");
    await page.click(`form[action$="/refunds/${refundId}/status"] button:has-text("Update refund")`);
    expect(d1Json(`SELECT status FROM airport_vip_refunds WHERE id = '${refundId}'`)[0].status).toBe("processing");
    expect(d1Json(`SELECT status FROM airport_vip_bookings WHERE id = '${bookingId}'`)[0].status).toBe("refund_pending"); // still not refunded

    // --- This is a simulated workflow record, never a real transaction:
    // the staff page itself says so (the notice only shows next to an
    // ACTIVE refund's own update form, which disappears once a refund
    // reaches "completed" -- so this is checked now, not after). ---
    await expect(page.locator("text=This environment never processes a real refund transaction")).toBeVisible();

    await page.goto(`${WORKER_BASE}/staff/airport-vip/bookings/${bookingId}`);
    await page.selectOption(`#refundStatus-${refundId}`, "completed");
    await page.fill(`#txRef-${refundId}`, "E2E-SIMULATED-TX-REF");
    await page.click(`form[action$="/refunds/${refundId}/status"] button:has-text("Update refund")`);

    // --- Only now: refund completed AND booking refunded ---
    expect(d1Json(`SELECT status FROM airport_vip_refunds WHERE id = '${refundId}'`)[0].status).toBe("completed");
    expect(d1Json(`SELECT status FROM airport_vip_bookings WHERE id = '${bookingId}'`)[0].status).toBe("refunded");
  });
});
