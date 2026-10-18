// Journey 13: "FIS Smart Application System" directive, Priority 1's
// non-negotiable requirement -- "Never silently truncate... customer
// information. If a field cannot accommodate valid input, provide a
// clear, recoverable exception for staff resolution rather than
// generating an apparently complete but inaccurate document."
//
// Verified defect (this session): worker/src/routes/staffBiForms.js's
// approveBiForm() discarded buildStaffDocument()'s own overflowReport
// entirely -- a character-box field longer than its box count was
// silently truncated on the real, released document with zero signal to
// staff. Fixed by blocking approval (422) whenever any field overflows,
// before anything is written to R2/D1. This journey proves the fix end
// to end against the REAL, authorized CGAF-003-Rev 2 original PDF (the
// directive's named priority regression case for the shared engine),
// using actual FIS_BI_ORIGINALS_DIR access rather than a synthetic
// stand-in -- the first time this specific form's real generated PDF
// has been byte-verified in this project's test history.
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
  uploadSyntheticPaymentProof,
  d1Json,
} = require("../fixtures/testHelpers");

const WORKER_DIR = path.join(__dirname, "..", "..", "worker");
const FORM_ID = "CGAF-003-Rev 2";
const ORIGINAL_PDF_PATH = process.env.FIS_BI_ORIGINALS_DIR && path.join(process.env.FIS_BI_ORIGINALS_DIR, `${FORM_ID}.pdf`);
const hasOriginal = !!(ORIGINAL_PDF_PATH && fs.existsSync(ORIGINAL_PDF_PATH));

const BACKGROUND_PNG_PATH = process.env.FIS_BI_BACKGROUNDS_DIR && path.join(process.env.FIS_BI_BACKGROUNDS_DIR, `${FORM_ID}.png`);

function uploadOriginalToLocalR2() {
  execFileSync(
    "npx",
    ["wrangler", "r2", "object", "put", `fis-bi-forms-library/originals/${FORM_ID}.pdf`, "--local", "--file", ORIGINAL_PDF_PATH, "--content-type", "application/pdf"],
    { cwd: WORKER_DIR, encoding: "utf8" }
  );
  // The real, pre-rendered background (generated offline from this same
  // real original via generate-blank-backgrounds.js) -- approveBiForm's
  // customer-preview composition step needs this to exist in R2 before
  // it will produce anything; without it, approval correctly fails with
  // a clear, non-silent exception, but that is NOT the behavior this
  // journey is testing.
  if (BACKGROUND_PNG_PATH && fs.existsSync(BACKGROUND_PNG_PATH)) {
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", `fis-bi-forms-library/backgrounds/${FORM_ID}.png`, "--local", "--file", BACKGROUND_PNG_PATH, "--content-type", "image/png"],
      { cwd: WORKER_DIR, encoding: "utf8" }
    );
  }
}

// Fills every visible customer field with a short placeholder, EXCEPT
// `overflowKey`, which is deliberately set to a value longer than that
// field's own character-box count -- this form's resPhHouseUnit has 20
// boxes; 67 characters guarantees overflow regardless of exact geometry.
async function fillQuestionnaireWithOneOverlongField(page, overflowKey, overlongValue) {
  await page.waitForSelector(".portal-bi-form-detail", { timeout: 15_000 });
  const selfBtn = page.locator(".portal-bi-form-choice-self");
  if (await selfBtn.count()) await selfBtn.click();

  for (let guard = 0; guard < 12; guard++) {
    const submitBtn = page.locator(".portal-bi-form-submit");
    if (await submitBtn.count()) {
      await submitBtn.click();
      return;
    }
    const yesRadios = page.locator('.portal-wizard-step-form [data-answer-key][type="radio"][value="true"]:visible');
    const yesCount = await yesRadios.count();
    for (let i = 0; i < yesCount; i++) await yesRadios.nth(i).check();

    for (let pass = 0; pass < 2; pass++) {
      const textLikeFields = page.locator('.portal-wizard-step-form [data-answer-key]:not([type="radio"]):visible');
      const textLikeCount = await textLikeFields.count();
      for (let i = 0; i < textLikeCount; i++) {
        const field = textLikeFields.nth(i);
        const key = await field.getAttribute("data-answer-key");
        const tag = await field.evaluate((el) => el.tagName.toLowerCase());
        if (tag === "select") {
          const current = await field.inputValue();
          if (!current) {
            const values = await field.locator("option").evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
            if (values.length) await field.selectOption(values[0]);
          }
        } else {
          const current = await field.inputValue();
          if (!current) await field.fill(key === overflowKey ? overlongValue : "X");
        }
      }
    }

    const continueBtn = page.locator(".portal-wizard-continue");
    if (!(await continueBtn.count())) break;
    await continueBtn.click();
  }
  throw new Error("fillQuestionnaireWithOneOverlongField: never reached the Submit button");
}

test.describe("Journey 13: overflow guard (directive Priority 1) + CGAF-003-Rev 2 real-PDF regression", () => {
  test.skip(!hasOriginal, `FIS_BI_ORIGINALS_DIR not set or missing "${FORM_ID}.pdf" -- this journey requires the real, authorized original.`);

  test.beforeAll(() => {
    ensureTestStaffAdmin();
    uploadOriginalToLocalR2();
  });

  test("an answer too long for its character boxes blocks approval with a clear, recoverable exception, and the real generated PDF is byte-verified once corrected", async ({ page }) => {
    test.setTimeout(120_000); // real 2-page pdf-lib + resvg-wasm compositing against the actual original is slower than this suite's default 60s
    const serviceId = createActiveCheckoutServiceDirect({ serviceSlug: `e2e-cgaf003-${uniqueSuffix()}`, biFormId: FORM_ID, title: "E2E CGAF-003-Rev 2" });
    const { orderId } = await beginGuestOrderAndSignIn(page, { serviceId, fullName: "E2E Overflow Tester", emailPrefix: "e2e-j13" });

    await expect(page.locator(".portal-bi-form-choice-panel")).toBeVisible({ timeout: 15_000 });
    await page.click(".portal-bi-form-choice-self");

    const overlongValue = "UNIT 4502 TOWER B THE GRAND RESIDENCES CONDOMINIUM COMPLEX BUILDING"; // 67 chars; resPhHouseUnit has 20 boxes
    await fillQuestionnaireWithOneOverlongField(page, "resPhHouseUnit", overlongValue);

    await expect(page.locator("text=Choose a Processing Option")).toBeVisible({ timeout: 15_000 });
    const orderRows = d1Json(`SELECT bi_form_submission_id FROM checkout_orders WHERE id = '${orderId}'`);
    const submissionId = orderRows[0].bi_form_submission_id;

    await page.waitForSelector("#instant-services-tier-form", { timeout: 15_000 });
    await page.locator('input[name="processingTier"]').first().check();
    await page.click('#instant-services-tier-form button[type="submit"]');
    await expect(page.locator("text=Request Submitted")).toBeVisible({ timeout: 15_000 });
    await page.click("#instant-services-confirm-pay");
    await expect(page.locator("#instant-services-qr-image")).toBeVisible({ timeout: 15_000 });
    await uploadSyntheticPaymentProof(page);
    await expect(page.locator("text=Your Payment Has Been Submitted for Verification")).toBeVisible({ timeout: 15_000 });

    // ---- Staff side ----
    await signInStaff(page);
    await page.goto(`${WORKER_BASE}/staff/instant-services/orders/${orderId}`);
    await page.locator('form[action$="/verify"] button[type="submit"]').click();

    await page.goto(`${WORKER_BASE}/staff/bi-forms/${submissionId}`);
    await page.locator('form[action$="/start-review"] button[type="submit"]').click();
    await page.waitForURL(`**/staff/bi-forms/${submissionId}`);

    // The form's one staff-only field.
    const appNumInput = page.locator('form[action$="/staff-fields"] input[name="applicationNumber"]');
    if (await appNumInput.count()) await appNumInput.fill("N/A");
    const staffFieldsSubmit = page.locator('form[action$="/staff-fields"] button[type="submit"]');
    if (await staffFieldsSubmit.count()) {
      await staffFieldsSubmit.click();
      await page.waitForURL(`**/staff/bi-forms/${submissionId}`);
    }

    // ---- The fix under test: approving with the overlong field present
    // must be refused, not silently generate a truncated document.
    // Clicked as a real staff user would (a plain HTML form submit, same
    // session cookies the browser already holds), not a separate API
    // request context -- this project's own convention (see journey 11's
    // comment) is that a separate request context does not reliably
    // replay the session the same way a real click does. ----
    const [approveResp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/staff/bi-forms/${submissionId}/approve`)),
      page.locator('form[action$="/approve"] button[type="submit"]').click(),
    ]);
    expect(approveResp.status()).toBe(422);
    const errorText = await page.locator("body").innerText();
    expect(errorText).toContain("too long to fit");
    expect(errorText).toContain("House/Unit No.");

    // No document was written for this blocked attempt.
    const docsAfterBlock = d1Json(`SELECT id FROM documents WHERE bi_form_submission_id = '${submissionId}' AND kind = 'staff_pdf'`);
    expect(docsAfterBlock.length).toBe(0);

    // ---- Recoverable: staff corrects the offending answer via the
    // EXISTING customer-fields correction form, then retries. ----
    await page.goto(`${WORKER_BASE}/staff/bi-forms/${submissionId}`);
    const correctionInput = page.locator('form[action$="/customer-fields"] input[name="resPhHouseUnit"]');
    await expect(correctionInput).toBeVisible();
    await correctionInput.fill("UNIT 4502B TOWER B");
    await page.locator('form[action$="/customer-fields"] button[type="submit"]').click();
    await page.waitForURL(`**/staff/bi-forms/${submissionId}`);

    await page.locator('form[action$="/approve"] button[type="submit"]').click();
    await page.waitForURL(`**/staff/bi-forms/${submissionId}`);

    const finalStatus = d1Json(`SELECT status FROM bi_form_submissions WHERE id = '${submissionId}'`)[0].status;
    expect(["approved", "published"]).toContain(finalStatus);

    // ---- Real-PDF verification (Priority 2): the actual generated
    // document, from the real original, downloaded and byte-checked --
    // not a skipped test, not a configuration-only check. ----
    const docs = d1Json(`SELECT id FROM documents WHERE bi_form_submission_id = '${submissionId}' AND kind = 'staff_pdf' ORDER BY created_at DESC LIMIT 1`);
    expect(docs.length).toBe(1);
    const downloadResp = await page.request.get(`${WORKER_BASE}/staff/bi-forms/${submissionId}/documents/${docs[0].id}/download`);
    expect(downloadResp.ok()).toBe(true);
    const pdfBytes = await downloadResp.body();
    expect(pdfBytes.length).toBeGreaterThan(50_000);
    expect(pdfBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
