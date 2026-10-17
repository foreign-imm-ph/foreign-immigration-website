// Journey 8: the "FINAL BI FORMS AUTOMATION & PREMIUM CUSTOMER EXPERIENCE"
// directive's sections 6 and 7 -- a genuine multi-step wizard (not a flat
// form with headings) and a genuinely SEPARATE, shorter assisted-intake
// that the customer reviews and deliberately confirms before anything is
// submitted (not an instant mass-mark-unsure-and-submit). Both scenarios
// drive the REAL Client Portal UI (src/assets/js/portal-bi-form.js)
// against the REAL CCS-A-CDR-2016 Forms Library config, through the
// actual customer-facing /api/bi-forms/* routes -- nothing here is
// mocked. Uses a direct checkout_services insert (see
// createActiveCheckoutServiceDirect) rather than driving the separately-
// maintained Staff Portal "Add an Offering" form, which is not what this
// journey is testing.
const { test, expect } = require("@playwright/test");
const {
  WORKER_BASE,
  ensureTestStaffAdmin,
  uniqueSuffix,
  signInStaff,
  beginGuestOrderAndSignIn,
  createActiveCheckoutServiceDirect,
  d1Json,
} = require("../fixtures/testHelpers");

test.describe("Journey 8: BI-form wizard + assisted-completion intake", () => {
  test.beforeAll(() => {
    ensureTestStaffAdmin();
  });

  test("self-service: real step-by-step navigation, blocks on a missing required field, Edit returns to Step 1 without losing data, submits", async ({ page }) => {
    const serviceId = createActiveCheckoutServiceDirect({ serviceSlug: `e2e-wizard-self-${uniqueSuffix()}`, biFormId: "CCS-A-CDR-2016" });
    const { orderId } = await beginGuestOrderAndSignIn(page, { serviceId, fullName: "E2E Wizard Tester", emailPrefix: "e2e-j8a" });

    await expect(page.locator(".portal-bi-form-choice-panel")).toBeVisible({ timeout: 15_000 });
    await page.click(".portal-bi-form-choice-self");

    // Step 1: a real progress indicator, not just a heading.
    await expect(page.locator(".portal-bi-form-detail .portal-wizard-steps")).toBeVisible();
    await expect(page.locator(".portal-bi-form-detail .portal-wizard-step--current .portal-wizard-step__label")).toHaveText("Applicant Information");
    await expect(page.locator(".portal-wizard-step-form [data-answer-key]").first()).toBeVisible();

    const textFields = page.locator('.portal-wizard-step-form [data-answer-key]:not([type="radio"])');
    const fieldCount = await textFields.count();
    for (let i = 0; i < fieldCount; i++) {
      const field = textFields.nth(i);
      const key = await field.getAttribute("data-answer-key");
      if (key === "passportNumber") continue; // deliberately left blank -- it's required
      const tag = await field.evaluate((el) => el.tagName.toLowerCase());
      if (tag === "select") {
        const values = await field.locator("option").evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
        await field.selectOption(values[0]);
      } else {
        await field.fill("Dela Cruz");
      }
    }

    // Real per-step validation: Continue must refuse to advance while a
    // required field (passportNumber) is still blank and not marked
    // "I'm not sure".
    await page.click(".portal-wizard-continue");
    await expect(page.locator(".portal-bi-form-status")).toContainText("required fields", { timeout: 5_000 });
    await expect(page.locator(".portal-bi-form-detail .portal-wizard-step--current .portal-wizard-step__label")).toHaveText("Applicant Information");

    await page.fill('[data-answer-key="passportNumber"]', "P1234567");
    await page.click(".portal-wizard-continue");

    // CCS-A-CDR-2016 has no service-specific questions, so Step 2 is
    // skipped entirely -- straight to Documents.
    await expect(page.locator(".portal-bi-form-detail .portal-wizard-step--current .portal-wizard-step__label")).toHaveText("Supporting Documents");
    await page.click(".portal-wizard-continue");

    // Step 4: Review -- a genuinely separate, later screen (not more of
    // the same flat form), showing what was actually entered.
    await expect(page.locator(".portal-bi-form-detail .portal-wizard-step--current .portal-wizard-step__label")).toHaveText("Review");
    await expect(page.locator(".portal-review-list")).toContainText("Dela Cruz");
    await expect(page.locator(".portal-review-list")).toContainText("P1234567");

    // Edit jumps back to Step 1 WITHOUT losing the already-entered data.
    await page.click('.portal-review-edit[data-goto-step="0"]');
    await expect(page.locator(".portal-bi-form-detail .portal-wizard-step--current .portal-wizard-step__label")).toHaveText("Applicant Information");
    await expect(page.locator('[data-answer-key="lastName"]')).toHaveValue("Dela Cruz");
    await expect(page.locator('[data-answer-key="passportNumber"]')).toHaveValue("P1234567");

    await page.click(".portal-wizard-continue"); // -> documents
    await page.click(".portal-wizard-continue"); // -> review
    await page.click(".portal-bi-form-submit");

    // instant-services-apply.js polls the order every 2.5s and moves on
    // to the next step (processing-tier selection) as soon as the
    // submission leaves "draft" -- a real connected journey, not a dead
    // end -- so the submission's OWN confirmation message is transient.
    // The authoritative check is the submission's actual server-side
    // status below, not a UI string that may already have been replaced.
    await expect(page.locator("text=Choose a Processing Option")).toBeVisible({ timeout: 15_000 });

    const orderRows = d1Json(`SELECT bi_form_submission_id FROM checkout_orders WHERE id = '${orderId}'`);
    const submission = d1Json(`SELECT status, customer_answers_json FROM bi_form_submissions WHERE id = '${orderRows[0].bi_form_submission_id}'`);
    expect(submission[0].status).toBe("submitted");
    const answers = JSON.parse(submission[0].customer_answers_json);
    expect(answers.lastName).toBe("Dela Cruz");
    expect(answers.passportNumber).toBe("P1234567");
  });

  test("assisted: a genuinely shorter intake, never auto-submitted, reviewed and deliberately confirmed, visible to staff as needing assistance", async ({ page }) => {
    const serviceId = createActiveCheckoutServiceDirect({ serviceSlug: `e2e-wizard-assist-${uniqueSuffix()}`, biFormId: "CCS-A-CDR-2016" });
    const { orderId } = await beginGuestOrderAndSignIn(page, { serviceId, fullName: "E2E Assisted Tester", emailPrefix: "e2e-j8b" });

    await expect(page.locator(".portal-bi-form-choice-panel")).toBeVisible({ timeout: 15_000 });
    await page.click(".portal-bi-form-choice-assist");

    // A real, separate SHORTER intake -- not the full 15-field Step 1.
    // gender/placeOfBirth/address1/barangay/provinceZip are part of the
    // full applicant-info step but deliberately excluded from this
    // shortened intake.
    await expect(page.locator("text=Quick Start")).toBeVisible();
    const intakeFieldCount = await page.locator("[data-answer-key]").count();
    expect(intakeFieldCount).toBeLessThan(10);
    await expect(page.locator('[data-answer-key="address1"]')).toHaveCount(0);
    await expect(page.locator('[data-answer-key="gender"]')).toHaveCount(0);

    await page.fill('[data-answer-key="lastName"]', "Santos");
    await page.fill('[data-answer-key="firstName"]', "Maria");
    await page.fill('[data-answer-key="__assistContactNumber"]', "+63 900 111 2222");
    // citizenship and passportNumber deliberately left blank here.

    // Picking "let FIS help me" must NOT have submitted anything yet.
    const beforeConfirm = d1Json(`SELECT bi_form_submission_id FROM checkout_orders WHERE id = '${orderId}'`);
    const statusBeforeConfirm = d1Json(`SELECT status FROM bi_form_submissions WHERE id = '${beforeConfirm[0].bi_form_submission_id}'`);
    expect(statusBeforeConfirm[0].status).toBe("draft");

    await page.click(".portal-wizard-continue");

    // A real review step the customer must deliberately confirm -- not
    // an instant submission.
    await expect(page.locator("h3", { hasText: "Review Before Submitting" })).toBeVisible();
    await expect(page.locator(".portal-review-list")).toContainText("Santos");
    await expect(page.locator("text=+63 900 111 2222")).toBeVisible();
    const stillDraft = d1Json(`SELECT status FROM bi_form_submissions WHERE id = '${beforeConfirm[0].bi_form_submission_id}'`);
    expect(stillDraft[0].status).toBe("draft");

    await page.click(".portal-assist-confirm-submit");
    await expect(page.locator("text=marked the unanswered questions")).toBeVisible({ timeout: 15_000 });

    const submissionId = beforeConfirm[0].bi_form_submission_id;
    const after = d1Json(`SELECT status, customer_answers_json FROM bi_form_submissions WHERE id = '${submissionId}'`);
    expect(after[0].status).toBe("submitted");
    const answers = JSON.parse(after[0].customer_answers_json);
    expect(answers.lastName).toBe("Santos");
    expect(answers.__assistContactNumber).toBe("+63 900 111 2222");
    expect(answers.__unsureFields).toContain("citizenship");
    expect(answers.__unsureFields).toContain("passportNumber");

    // Staff Portal: the assisted-completion flag is visible, not silently
    // dropped (directive section 7's staff-visibility requirement).
    await signInStaff(page);
    await page.goto(`${WORKER_BASE}/staff/bi-forms/${submissionId}`);
    await expect(page.locator(".priority-badge--urgent")).toContainText("Assistance Requested");
  });
});
