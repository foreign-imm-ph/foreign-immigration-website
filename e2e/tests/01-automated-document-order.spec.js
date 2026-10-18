// Journey 1: an automated document order, end to end -- guest checkout,
// the real BI Forms questionnaire (CCS-A-CDR-2016, an already-validated
// Forms Library config reused as-is, not invented for this test), review,
// and a simulated QR Ph payment-proof upload. No real payment, no real
// document is rendered against a real customer.
const { test, expect } = require("@playwright/test");
const {
  WORKER_BASE,
  ensureTestStaffAdmin,
  uniqueSuffix,
  signInStaff,
  createAndActivateOffering,
  beginGuestOrderAndSignIn,
  fillGenericQuestionnaireAndSubmit,
  selectProcessingTierIfPresent,
  uploadSyntheticPaymentProof,
  d1Json,
} = require("../fixtures/testHelpers");

test.describe("Journey 1: automated document order", () => {
  test.beforeAll(() => {
    ensureTestStaffAdmin();
  });

  test("guest orders an automated document, completes the questionnaire, and submits a payment proof", async ({ page }) => {
    const slug = `e2e-cdr-${uniqueSuffix()}`;

    await signInStaff(page);
    const serviceId = await createAndActivateOffering(page, {
      offeringType: "document_automated",
      slug,
      biFormId: "CCS-A-CDR-2016",
      serviceFeeAmount: "3500.00",
      title: "E2E Certificate of Derivative Residency",
      supportsDelivery: true,
    });

    const { orderId } = await beginGuestOrderAndSignIn(page, {
      serviceId,
      fullName: "E2E Journey1 Tester",
      emailPrefix: "e2e-j1",
    });

    // Questionnaire step (document_automated only)
    await expect(page.locator("text=Please complete the following questionnaire")).toBeVisible({ timeout: 15_000 });
    await fillGenericQuestionnaireAndSubmit(page);

    // Processing option step (document_automated uses processing tiers)
    await selectProcessingTierIfPresent(page);

    // Delivery address step (this offering supports delivery)
    await page.waitForSelector("#instant-services-delivery-form", { timeout: 15_000 });
    await page.fill("#recipientName", "E2E Test Recipient");
    await page.fill("#phone", "+63 900 000 0000");
    await page.fill("#country", "Philippines");
    await page.fill("#city", "Manila");
    await page.fill("#addressLine1", "123 Test Street");
    await page.click('#instant-services-delivery-form button[type="submit"]');

    // Review -> confirm and pay -> QR Ph payment screen
    await expect(page.locator("text=Request Submitted")).toBeVisible({ timeout: 15_000 });
    await page.click("#instant-services-confirm-pay");
    await expect(page.locator("#instant-services-qr-image")).toBeVisible({ timeout: 15_000 });

    // Submit a synthetic payment proof (never a real payment image)
    await uploadSyntheticPaymentProof(page);
    await expect(page.locator("text=Your Payment Has Been Submitted for Verification")).toBeVisible({ timeout: 15_000 });

    // Confirm server-side state matches: order awaiting verification, a
    // real BI Form submission exists and was actually completed (not
    // left as an empty draft).
    const orderRows = d1Json(`SELECT status, bi_form_submission_id FROM checkout_orders WHERE id = '${orderId}'`);
    expect(orderRows[0].status).toBe("awaiting_verification");
    expect(orderRows[0].bi_form_submission_id).toBeTruthy();

    const submissionRows = d1Json(`SELECT status FROM bi_form_submissions WHERE id = '${orderRows[0].bi_form_submission_id}'`);
    expect(["submitted", "under_review", "approved"]).toContain(submissionRows[0].status);
  });
});
