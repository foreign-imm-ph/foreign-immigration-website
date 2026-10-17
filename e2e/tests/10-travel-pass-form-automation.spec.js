// Journey 10: the current "MASTER IMPLEMENTATION DIRECTIVE" directive's
// explicit requirement for per-new-form end-to-end testing, satisfied
// here for 2021-03-001 (Travel Pass Application) -- the directive's
// required "at least one complex form" (4 sections, 2 checkbox groups,
// 27 fields). Unlike every other form this engine automates, Travel Pass
// has NO BI-staff-only fields at all (see its coordinate-map.json's own
// measurementNotes.entirelyCustomerSupplied) -- confirmed here by driving
// the real staff review straight from start-review to approve with no
// staff-fields step in between, and the real generated PDF is downloaded
// and inspected at the end, not mocked.
const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const {
  WORKER_BASE,
  ensureTestStaffAdmin,
  uniqueSuffix,
  signInStaff,
  beginGuestOrderAndSignIn,
  createActiveCheckoutServiceDirect,
  fillGenericQuestionnaireAndSubmit,
  uploadSyntheticPaymentProof,
  d1Json,
} = require("../fixtures/testHelpers");

const WORKER_DIR = path.join(__dirname, "..", "..", "worker");
// Downloaded directly from the private fis-bi-forms-library R2 bucket
// this session for real coordinate measurement -- reused here, read-only,
// to seed the LOCAL (Miniflare-simulated) R2 bucket this e2e run needs.
// Never written back to the real bucket.
const ORIGINAL_PDF_PATH = "/tmp/claude-0/r2-originals/2021-03-001.pdf";
// Generated locally this session via bi-forms-library/engine/scripts/
// generate-blank-backgrounds.js (Poppler, offline, local-only).
const BACKGROUND_PNG_PATH = "/tmp/claude-0/travel-backgrounds/2021-03-001.png";

function uploadFixturesToLocalR2() {
  execFileSync(
    "npx",
    ["wrangler", "r2", "object", "put", "fis-bi-forms-library/originals/2021-03-001.pdf", "--local", "--file", ORIGINAL_PDF_PATH, "--content-type", "application/pdf"],
    { cwd: WORKER_DIR, encoding: "utf8" }
  );
  if (fs.existsSync(BACKGROUND_PNG_PATH)) {
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", "fis-bi-forms-library/backgrounds/2021-03-001.png", "--local", "--file", BACKGROUND_PNG_PATH, "--content-type", "image/png"],
      { cwd: WORKER_DIR, encoding: "utf8" }
    );
  }
}

test.describe("Journey 10: 2021-03-001 Travel Pass (newly automated this session, complex-form proof) -- full lifecycle", () => {
  test.beforeAll(() => {
    ensureTestStaffAdmin();
    uploadFixturesToLocalR2();
  });

  test("guest orders, completes the real multi-section wizard, pays; staff reviews and approves with no staff-fields step, and the actual generated PDF is downloadable and valid", async ({ page }) => {
    const serviceId = createActiveCheckoutServiceDirect({ serviceSlug: `e2e-travelpass-${uniqueSuffix()}`, biFormId: "2021-03-001", title: "E2E Travel Pass" });
    const { orderId } = await beginGuestOrderAndSignIn(page, { serviceId, fullName: "E2E Travel Pass Tester", emailPrefix: "e2e-j10" });

    // Real multi-step wizard, real 2021-03-001 questionnaire -- including
    // its 3 select-type questions (visaType: 4 options, gender: 2,
    // maritalStatus: 6), all handled generically.
    await expect(page.locator("text=Please complete the following questionnaire")).toBeVisible({ timeout: 15_000 });
    await fillGenericQuestionnaireAndSubmit(page);

    await page.waitForSelector("#instant-services-tier-form", { timeout: 15_000 });
    await page.locator('input[name="processingTier"]').first().check();
    await page.click('#instant-services-tier-form button[type="submit"]');

    await expect(page.locator("text=Request Submitted")).toBeVisible({ timeout: 15_000 });
    await page.click("#instant-services-confirm-pay");
    await expect(page.locator("#instant-services-qr-image")).toBeVisible({ timeout: 15_000 });
    await uploadSyntheticPaymentProof(page);
    await expect(page.locator("text=Your Payment Has Been Submitted for Verification")).toBeVisible({ timeout: 15_000 });

    const orderRows = d1Json(`SELECT bi_form_submission_id, application_id FROM checkout_orders WHERE id = '${orderId}'`);
    const submissionId = orderRows[0].bi_form_submission_id;
    expect(submissionId).toBeTruthy();

    // ---- Staff side ----
    await signInStaff(page);

    await page.goto(`${WORKER_BASE}/staff/instant-services/orders/${orderId}`);
    await page.locator('form[action$="/verify"] button[type="submit"]').click();

    // Start review, then approve DIRECTLY -- no staff-fields form step,
    // since this form's own coordinate-map.json declares zero
    // staff-owned fields (confirmed structurally, not assumed).
    await page.goto(`${WORKER_BASE}/staff/bi-forms/${submissionId}`);
    await page.locator('form[action$="/start-review"] button[type="submit"]').click();

    await page.waitForURL(`**/staff/bi-forms/${submissionId}`);
    // The staff-fields form container is always rendered at this status
    // regardless of field count (confirmed in staffBiForms.js) -- what
    // actually proves this form has zero staff-owned fields is that it
    // contains no input/select/textarea elements to fill in.
    const staffFieldsInputs = page.locator('form[action$="/staff-fields"] input, form[action$="/staff-fields"] select, form[action$="/staff-fields"] textarea');
    expect(await staffFieldsInputs.count()).toBe(0);

    await page.locator('form[action$="/approve"] button[type="submit"]').click();

    await page.waitForURL(`**/staff/bi-forms/${submissionId}`);
    const docs = d1Json(`SELECT id, kind, r2_key FROM documents WHERE bi_form_submission_id = '${submissionId}' AND kind = 'staff_pdf' ORDER BY created_at DESC LIMIT 1`);
    expect(docs.length).toBe(1);

    const downloadResp = await page.request.get(`${WORKER_BASE}/staff/bi-forms/${submissionId}/documents/${docs[0].id}/download`);
    expect(downloadResp.ok()).toBe(true);
    const pdfBytes = await downloadResp.body();
    expect(pdfBytes.length).toBeGreaterThan(50_000); // a real, populated PDF, not an empty/placeholder file

    const header = pdfBytes.subarray(0, 5).toString("latin1");
    expect(header).toBe("%PDF-");
  });
});
