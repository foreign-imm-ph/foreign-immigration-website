// Journey 9: directive section 15's explicit requirement -- an actual
// end-to-end demonstration for at least one NEWLY automated form, beyond
// the 3 that already existed (CCS-A-CDR-2016, 2014-13-002, 2014-13-006).
// CCS-A-NTSP-2016 ("Application for Certificate of Not the Same Person")
// was coordinate-mapped this session from the REAL original PDF
// (downloaded from the private fis-bi-forms-library R2 bucket). This
// journey drives the full customer -> staff -> generated-PDF lifecycle
// against a live local Worker + D1 + local R2, using the real original
// PDF (uploaded here to LOCAL R2 only, via `wrangler r2 object put
// --local` -- never --remote, never touching the real bucket), and
// downloads and inspects the actual generated PDF bytes at the end --
// not a mock, not a unit test of the engine in isolation.
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
const FORM_ID = "CCS-A-NTSP-2016";
// Same policy and env var as bi-forms-library/tests/run-all.js: real BI
// originals are confidential and are never committed to this repository,
// so this journey needs FIS_BI_ORIGINALS_DIR pointed at a local directory
// containing <FORM_ID>.pdf (and skips, rather than fails, otherwise).
const ORIGINAL_PDF_PATH = process.env.FIS_BI_ORIGINALS_DIR && path.join(process.env.FIS_BI_ORIGINALS_DIR, `${FORM_ID}.pdf`);
const hasOriginal = !!(ORIGINAL_PDF_PATH && fs.existsSync(ORIGINAL_PDF_PATH));
// Optional: a blank background PNG generated from the same original via
// bi-forms-library/engine/scripts/generate-blank-backgrounds.js (Poppler,
// offline, local-only). Needed for approveBiForm's customer-preview
// compositing step (svg-compose.js) -- without it, approval still
// generates the real staff PDF but then fails trying to build the
// customer-facing filled preview. Re-generate with:
//   FIS_BI_ORIGINALS_DIR=<dir containing FORM_ID.pdf> \
//     node bi-forms-library/engine/scripts/generate-blank-backgrounds.js <outDir>
const BACKGROUND_PNG_PATH = process.env.FIS_BI_BACKGROUNDS_DIR && path.join(process.env.FIS_BI_BACKGROUNDS_DIR, `${FORM_ID}.png`);

function uploadFixturesToLocalR2() {
  execFileSync(
    "npx",
    ["wrangler", "r2", "object", "put", "fis-bi-forms-library/originals/CCS-A-NTSP-2016.pdf", "--local", "--file", ORIGINAL_PDF_PATH, "--content-type", "application/pdf"],
    { cwd: WORKER_DIR, encoding: "utf8" }
  );
  if (BACKGROUND_PNG_PATH && fs.existsSync(BACKGROUND_PNG_PATH)) {
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", "fis-bi-forms-library/backgrounds/CCS-A-NTSP-2016.png", "--local", "--file", BACKGROUND_PNG_PATH, "--content-type", "image/png"],
      { cwd: WORKER_DIR, encoding: "utf8" }
    );
  }
}

test.describe("Journey 9: CCS-A-NTSP-2016 (newly automated this session) -- full lifecycle", () => {
  test.skip(!hasOriginal, `FIS_BI_ORIGINALS_DIR not set or missing ${FORM_ID}.pdf -- original BI templates are confidential and are not committed to this repository`);

  test.beforeAll(() => {
    ensureTestStaffAdmin();
    uploadFixturesToLocalR2();
  });

  test("guest orders, completes the real wizard, pays; staff reviews, completes staff fields, approves, and the actual generated PDF is downloadable and valid", async ({ page }) => {
    const serviceId = createActiveCheckoutServiceDirect({ serviceSlug: `e2e-ntsp-${uniqueSuffix()}`, biFormId: "CCS-A-NTSP-2016", title: "E2E NTSP Certificate" });
    const { orderId } = await beginGuestOrderAndSignIn(page, { serviceId, fullName: "E2E NTSP Tester", emailPrefix: "e2e-j9" });

    // Real multi-step wizard, real CCS-A-NTSP-2016 questionnaire.
    await expect(page.locator("text=Please complete the following questionnaire")).toBeVisible({ timeout: 15_000 });
    await fillGenericQuestionnaireAndSubmit(page);

    // No delivery step for this fixture (supportsDelivery defaults false
    // in createActiveCheckoutServiceDirect) -- straight to tier -> review.
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

    // Verify the payment (same action every other journey's staff side uses).
    await page.goto(`${WORKER_BASE}/staff/instant-services/orders/${orderId}`);
    await page.locator('form[action$="/verify"] button[type="submit"]').click();

    // Start review, supply the required STAFF-owned fields this form's
    // real coordinate map defines (landline/mobile -- both genuinely
    // staff-only per the form's own roles), then approve/generate.
    await page.goto(`${WORKER_BASE}/staff/bi-forms/${submissionId}`);
    await page.locator('form[action$="/start-review"] button[type="submit"]').click();

    await page.waitForURL(`**/staff/bi-forms/${submissionId}`);
    const landlineInput = page.locator('form[action$="/staff-fields"] input[name="landline"]');
    if (await landlineInput.count()) await landlineInput.fill("N/A");
    const mobileInput = page.locator('form[action$="/staff-fields"] input[name="mobile"]');
    if (await mobileInput.count()) await mobileInput.fill("09171234567");
    const purposeInput = page.locator('form[action$="/staff-fields"] input[name="purposeLine1"]');
    if (await purposeInput.count()) await purposeInput.fill("To support a pending request for correction of records.");
    await page.locator('form[action$="/staff-fields"] button[type="submit"]').click();

    await page.waitForURL(`**/staff/bi-forms/${submissionId}`);
    await page.locator('form[action$="/approve"] button[type="submit"]').click();

    // The actual generated PDF must now exist as a real document row --
    // download it and verify it is a real, valid, non-trivial PDF, not a
    // placeholder or an error page.
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
