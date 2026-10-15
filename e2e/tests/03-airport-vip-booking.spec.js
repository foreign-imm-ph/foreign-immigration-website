// Journey 3: an Airport VIP Meet & Assist booking, end to end -- the
// booking form and policy acceptance, a simulated QR Ph payment, and the
// two SEPARATE staff actions this system deliberately never collapses
// into one: verifying the payment (-> "payment_verified") and then,
// afterwards, actually confirming availability (-> "confirmed"). No real
// payment is taken and no real flight booking is made with any airline.
const { test, expect } = require("@playwright/test");
const {
  WORKER_BASE,
  ensureTestStaffAdmin,
  uniqueSuffix,
  signInStaff,
  createAndActivateOffering,
  beginGuestOrderAndSignIn,
  fillAirportVipBookingForm,
  acceptAirportVipPolicyIfPresent,
  uploadSyntheticPaymentProof,
  d1Json,
} = require("../fixtures/testHelpers");

function futureDateString(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

test.describe("Journey 3: Airport VIP booking", () => {
  test.beforeAll(() => {
    ensureTestStaffAdmin();
  });

  test("guest books Airport VIP arrival assistance, pays, and staff verifies payment then confirms availability as two separate actions", async ({ page }) => {
    const slug = `e2e-vip-arrival-${uniqueSuffix()}`;

    await signInStaff(page);
    const serviceId = await createAndActivateOffering(page, {
      offeringType: "bookable_service",
      slug,
      serviceGroup: "airport-vip",
      serviceFeeAmount: "6500.00",
      title: "E2E Airport VIP Arrival Assistance",
      supportsDelivery: false,
    });

    const { orderId } = await beginGuestOrderAndSignIn(page, {
      serviceId,
      fullName: "E2E Journey3 Tester",
      emailPrefix: "e2e-j3",
    });

    await fillAirportVipBookingForm(page, { direction: "arrival", scheduledLocalDate: futureDateString(30) });
    const policyWasShown = await acceptAirportVipPolicyIfPresent(page);
    expect(policyWasShown).toBe(true);

    await expect(page.locator("text=Booking Details Submitted")).toBeVisible({ timeout: 15_000 });
    await page.click("#instant-services-confirm-pay");
    await expect(page.locator("#instant-services-qr-image")).toBeVisible({ timeout: 15_000 });

    await uploadSyntheticPaymentProof(page);
    await expect(page.locator("text=Your Payment Has Been Submitted for Verification")).toBeVisible({ timeout: 15_000 });

    const bookingRowsBefore = d1Json(`SELECT id, status FROM airport_vip_bookings WHERE checkout_order_id = '${orderId}'`);
    expect(bookingRowsBefore[0].status).toBe("awaiting_payment_verification");
    const bookingId = bookingRowsBefore[0].id;

    // --- Staff action 1: verify the payment only ---
    await page.goto(`${WORKER_BASE}/staff/instant-services/orders/${orderId}`);
    await page.locator('form[action$="/verify"] button[type="submit"]').click();

    const afterVerify = d1Json(`SELECT status FROM airport_vip_bookings WHERE id = '${bookingId}'`);
    expect(afterVerify[0].status).toBe("payment_verified"); // NOT "confirmed" yet
    const orderAfterVerify = d1Json(`SELECT status FROM checkout_orders WHERE id = '${orderId}'`);
    expect(orderAfterVerify[0].status).toBe("paid");

    // --- Staff action 2: a separate, explicit availability confirmation ---
    await page.goto(`${WORKER_BASE}/staff/airport-vip/bookings/${bookingId}`);
    await page.locator('form[action$="/status"] button:has-text("confirmed")').click();

    const afterConfirm = d1Json(`SELECT status FROM airport_vip_bookings WHERE id = '${bookingId}'`);
    expect(afterConfirm[0].status).toBe("confirmed");
  });
});
