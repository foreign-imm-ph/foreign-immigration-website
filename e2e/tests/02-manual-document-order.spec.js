// Journey 2: a staff-processed ("manual") document order -- no automated
// questionnaire exists for this offering type, so once the guest's
// request exists it goes straight to delivery address, then review and a
// simulated payment-proof upload, exactly like Journey 1 past its
// questionnaire step.
const { test, expect } = require("@playwright/test");
const {
  ensureTestStaffAdmin,
  uniqueSuffix,
  signInStaff,
  createAndActivateOffering,
  beginGuestOrderAndSignIn,
  uploadSyntheticPaymentProof,
  d1Json,
} = require("../fixtures/testHelpers");

test.describe("Journey 2: manual document order", () => {
  test.beforeAll(() => {
    ensureTestStaffAdmin();
  });

  test("guest orders a staff-processed document with no automated questionnaire", async ({ page }) => {
    const slug = `e2e-manual-doc-${uniqueSuffix()}`;

    await signInStaff(page);
    const serviceId = await createAndActivateOffering(page, {
      offeringType: "document_manual",
      slug,
      biFormId: "e2e-manual-reference",
      serviceFeeAmount: "2800.00",
      title: "E2E Staff-Processed Document",
      supportsDelivery: true,
    });

    const { orderId } = await beginGuestOrderAndSignIn(page, {
      serviceId,
      fullName: "E2E Journey2 Tester",
      emailPrefix: "e2e-j2",
    });

    // No questionnaire -- straight to delivery address.
    await page.waitForSelector("#instant-services-delivery-form", { timeout: 15_000 });
    await page.fill("#recipientName", "E2E Test Recipient Two");
    await page.fill("#phone", "+63 900 000 0001");
    await page.fill("#country", "Philippines");
    await page.fill("#city", "Quezon City");
    await page.fill("#addressLine1", "456 Test Avenue");
    await page.click('#instant-services-delivery-form button[type="submit"]');

    await expect(page.locator("text=Request Submitted")).toBeVisible({ timeout: 15_000 });
    await page.click("#instant-services-confirm-pay");
    await expect(page.locator("#instant-services-qr-image")).toBeVisible({ timeout: 15_000 });

    await uploadSyntheticPaymentProof(page);
    await expect(page.locator("text=Your Payment Has Been Submitted for Verification")).toBeVisible({ timeout: 15_000 });

    const orderRows = d1Json(`SELECT status, bi_form_submission_id, application_id FROM checkout_orders WHERE id = '${orderId}'`);
    expect(orderRows[0].status).toBe("awaiting_verification");
    expect(orderRows[0].bi_form_submission_id).toBeFalsy(); // manual document: no automated form at all
    expect(orderRows[0].application_id).toBeTruthy();
  });
});
