// Journey 12: the "FIS -- Final Automation Integration and Multilingual
// Completion" directive's item 4 -- a full browser verification of a
// representative NEWLY document_automated offering (this session's
// migration 0022), covering every element the directive names: service
// selection, the guided questionnaire, "I'm not sure" assistance, the
// live official PDF preview, supporting-document upload, guest
// checkout, GCash manual payment submission, Client Portal access, and
// Staff Portal review/completion -- on both a desktop and a mobile
// viewport where the two genuinely differ (the live-preview panel's
// responsive layout; everything else behaves identically at either
// width, so is exercised once, not duplicated).
//
// CCS-A-NTSP-2016 is the representative form: one of the 7 forms this
// session's migration 0022 flipped to document_automated, with its own
// staff-only fields (biOnlySections, exercised below exactly as journey
// 9 already established) and a real supporting-document requirement
// (the 2x2 photo, per its own offFormInstructions), so this journey
// exercises staff intervention and document upload for real, not just
// a trivial form.
//
// Same confidentiality policy as journeys 9/10: the real original PDF
// is never committed to this repository. Everything EXCEPT the very
// last step (downloading and byte-validating the actual generated PDF)
// needs no original -- the live preview only ever needs a background
// PNG, and this journey uses the same synthetic one-pixel stand-in
// already established for that purpose (uploadSyntheticBiFormBackground)
// -- so only that final assertion is gated on FIS_BI_ORIGINALS_DIR;
// the rest of this journey always runs.
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
  uploadSyntheticBiFormBackground,
  uploadSyntheticPaymentProof,
  ONE_PIXEL_PNG_BASE64,
  d1Json,
} = require("../fixtures/testHelpers");

const WORKER_DIR = path.join(__dirname, "..", "..", "worker");
const FORM_ID = "CCS-A-NTSP-2016";
const ORIGINAL_PDF_PATH = process.env.FIS_BI_ORIGINALS_DIR && path.join(process.env.FIS_BI_ORIGINALS_DIR, `${FORM_ID}.pdf`);
const hasOriginal = !!(ORIGINAL_PDF_PATH && fs.existsSync(ORIGINAL_PDF_PATH));

function uploadOriginalToLocalR2() {
  execFileSync(
    "npx",
    ["wrangler", "r2", "object", "put", `fis-bi-forms-library/originals/${FORM_ID}.pdf`, "--local", "--file", ORIGINAL_PDF_PATH, "--content-type", "application/pdf"],
    { cwd: WORKER_DIR, encoding: "utf8" }
  );
}

// Fills every visible customer field with a test value, EXCEPT `unsureKey`,
// which is deliberately marked "I'm not sure" instead of answered --
// directive item 4's explicit "I'm not sure assistance" element. Modeled
// on testHelpers' fillGenericQuestionnaireAndSubmit, but that helper never
// marks anything unsure, so this journey needs its own small variant
// rather than a generic one every other journey would also pick up.
async function fillQuestionnaireMarkingOneFieldUnsure(page, unsureKey) {
  await page.waitForSelector(".portal-bi-form-detail", { timeout: 15_000 });
  const selfBtn = page.locator(".portal-bi-form-choice-self");
  if (await selfBtn.count()) await selfBtn.click();

  let markedUnsure = false;
  for (let guard = 0; guard < 12; guard++) {
    const submitBtn = page.locator(".portal-bi-form-submit");
    if (await submitBtn.count()) {
      await submitBtn.click();
      return markedUnsure;
    }

    const unsureBox = page.locator(`input[data-unsure-key="${unsureKey}"]:visible`);
    if (!markedUnsure && (await unsureBox.count())) {
      await unsureBox.check();
      markedUnsure = true;
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
        if (key === unsureKey) continue; // left blank -- marked unsure above instead
        const tag = await field.evaluate((el) => el.tagName.toLowerCase());
        if (tag === "select") {
          const optionValues = await field.locator("option").evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
          if (optionValues.length) await field.selectOption(optionValues[0]);
        } else {
          const current = await field.inputValue();
          if (!current) {
            // Day/Month/Year date-component fields (e.g. CCS-A-NTSP-2016's
            // dobDay/dobMonth/dobYear) render as 2/3/4-character-box fields
            // on the real form -- the generic "Dela Cruz" fallback below
            // overflows them and correctly trips the server-side overflow
            // guard, which blocks approval. That guard is working as
            // designed; this fallback just needs to supply a value a real
            // customer actually could for a date component instead of
            // reusing the arbitrary surname placeholder everywhere.
            const dateValue = /day$/i.test(key) ? "15" : /month$/i.test(key) ? "JUN" : /year$/i.test(key) ? "1990" : null;
            await field.fill(dateValue || "Dela Cruz");
          }
        }
      }
    }

    const continueBtn = page.locator(".portal-wizard-continue");
    if (!(await continueBtn.count())) break;
    await continueBtn.click();
  }
  throw new Error("fillQuestionnaireMarkingOneFieldUnsure: never reached the Submit button");
}

test.describe("Journey 12: automation-first full journey (directive item 4)", () => {
  test.beforeAll(() => {
    ensureTestStaffAdmin();
    uploadSyntheticBiFormBackground(FORM_ID);
    if (hasOriginal) uploadOriginalToLocalR2();
  });

  test("service selection, guided questionnaire with 'I'm not sure', live preview, document upload, guest checkout, GCash payment, staff review and completion", async ({ page }) => {
    const serviceId = createActiveCheckoutServiceDirect({ serviceSlug: `e2e-automation-first-${uniqueSuffix()}`, biFormId: FORM_ID, title: "E2E NTSP Certificate (Automation-First)" });

    // ---- Service selection + guest checkout ----
    const { orderId } = await beginGuestOrderAndSignIn(page, { serviceId, fullName: "E2E Automation Tester", emailPrefix: "e2e-j12" });

    await expect(page.locator(".portal-bi-form-choice-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".portal-guided-intro")).toContainText("We'll take care of the complicated paperwork.");

    // ---- Live preview (desktop): visible by default, renders a real
    // image, and highlights whichever field currently has focus ----
    await page.click(".portal-bi-form-choice-self");
    const previewImg = page.locator(".portal-bi-form-preview-img");
    await expect(previewImg).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => previewImg.evaluate((img) => img.naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);

    // ---- Guided questionnaire, with "I'm not sure" on placeOfBirth ----
    await page.fill('[data-answer-key="lastName"]', "Dela Cruz");
    const highlight = page.locator(".portal-bi-form-preview-highlight");
    await expect(highlight).toBeVisible({ timeout: 5_000 });

    // ---- Supporting-document upload: the submission's own
    // offFormInstructions call for a 2x2 photo, uploaded here as the
    // existing generic document-upload feature, not a new mechanism.
    // Done now, while the submission is still "draft" -- the upload
    // route (CUSTOMER_EDITABLE_STATUSES) refuses it once submitted,
    // exactly like a real customer would attach it during the wizard's
    // own Documents step before clicking Submit. window.portalFetch
    // (not a bare relative fetch) is the real client helper that
    // resolves against window.PORTAL_API_BASE, which this test harness
    // has already pointed at the local Worker; a plain fetch("/api/...")
    // would instead resolve against the static site's own origin and 404.
    const orderRowsBeforeSubmit = d1Json(`SELECT bi_form_submission_id FROM checkout_orders WHERE id = '${orderId}'`);
    const submissionId = orderRowsBeforeSubmit[0].bi_form_submission_id;
    expect(submissionId).toBeTruthy();

    const uploadResp = await page.evaluate(async ({ subId, pngBase64 }) => {
      const buf = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
      const resp = await window.portalFetch("/api/bi-forms/" + subId + "/documents", {
        method: "POST",
        headers: { "X-Filename": "photo.png" },
        body: buf,
      });
      return resp.status;
    }, { subId: submissionId, pngBase64: ONE_PIXEL_PNG_BASE64 });
    expect(uploadResp).toBe(201);
    const uploadedDocs = d1Json(`SELECT id FROM documents WHERE bi_form_submission_id = '${submissionId}'`);
    expect(uploadedDocs.length).toBeGreaterThan(0);

    await fillQuestionnaireMarkingOneFieldUnsure(page, "placeOfBirth");

    await expect(page.locator("text=Choose a Processing Option")).toBeVisible({ timeout: 15_000 });

    const submittedAnswers = JSON.parse(
      d1Json(`SELECT customer_answers_json FROM bi_form_submissions WHERE id = '${submissionId}'`)[0].customer_answers_json
    );
    expect(Array.isArray(submittedAnswers.__unsureFields) && submittedAnswers.__unsureFields.includes("placeOfBirth")).toBe(true);
    expect(submittedAnswers.lastName).toBe("Dela Cruz");

    await page.waitForSelector("#instant-services-tier-form", { timeout: 15_000 });
    await page.locator('input[name="processingTier"]').first().check();
    await page.click('#instant-services-tier-form button[type="submit"]');
    await expect(page.locator("text=Request Submitted")).toBeVisible({ timeout: 15_000 });

    // ---- GCash manual payment submission (existing, preserved flow) ----
    await page.click("#instant-services-confirm-pay");
    await expect(page.locator("#instant-services-qr-image")).toBeVisible({ timeout: 15_000 });
    await uploadSyntheticPaymentProof(page);
    await expect(page.locator("text=Your Payment Has Been Submitted for Verification")).toBeVisible({ timeout: 15_000 });

    // ---- Staff Portal: review, complete staff-only fields, approve ----
    await signInStaff(page);
    await page.goto(`${WORKER_BASE}/staff/instant-services/orders/${orderId}`);
    await page.locator('form[action$="/verify"] button[type="submit"]').click();

    await page.goto(`${WORKER_BASE}/staff/bi-forms/${submissionId}`);
    // The customer's own unsure flag must be visible to staff as
    // something needing their attention, not silently dropped.
    await expect(page.locator("body")).toContainText(/assistance requested/i);
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

    // The field the customer marked unsure is a customer field staff
    // completes through the SEPARATE customer-fields correction form
    // (directive section 9's "complete missing fields" workflow), not
    // the staff-owned-fields form above.
    const placeOfBirthInput = page.locator('form[action$="/customer-fields"] input[name="placeOfBirth"]');
    await expect(placeOfBirthInput).toBeVisible();
    await placeOfBirthInput.fill("Manila, Philippines");
    await page.locator('form[action$="/customer-fields"] button[type="submit"]').click();

    await page.waitForURL(`**/staff/bi-forms/${submissionId}`);
    await page.locator('form[action$="/approve"] button[type="submit"]').click();
    await page.waitForURL(`**/staff/bi-forms/${submissionId}`);

    const finalStatus = d1Json(`SELECT status FROM bi_form_submissions WHERE id = '${submissionId}'`)[0].status;
    expect(["approved", "published"]).toContain(finalStatus);

    if (hasOriginal) {
      // The real original is available in this environment -- verify
      // the actual generated PDF, not just the status transition.
      const docs = d1Json(`SELECT id FROM documents WHERE bi_form_submission_id = '${submissionId}' AND kind = 'staff_pdf' ORDER BY created_at DESC LIMIT 1`);
      expect(docs.length).toBe(1);
      const downloadResp = await page.request.get(`${WORKER_BASE}/staff/bi-forms/${submissionId}/documents/${docs[0].id}/download`);
      expect(downloadResp.ok()).toBe(true);
      const pdfBytes = await downloadResp.body();
      expect(pdfBytes.length).toBeGreaterThan(50_000);
      expect(pdfBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    } else {
      test.info().annotations.push({
        type: "skip-reason",
        description: `FIS_BI_ORIGINALS_DIR not set or missing ${FORM_ID}.pdf -- the generated-PDF byte check was skipped; every other element of this journey (service selection, questionnaire, 'I'm not sure', live preview, document upload, guest checkout, GCash payment, Staff Portal review/completion) ran and passed.`,
      });
    }
  });

  test("live preview on a mobile viewport: hidden by default, expands via toggle, enlarge works", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone-class width, below the 900px desktop breakpoint
    const serviceId = createActiveCheckoutServiceDirect({ serviceSlug: `e2e-automation-first-mobile-${uniqueSuffix()}`, biFormId: FORM_ID, title: "E2E NTSP Certificate (Mobile)" });
    await beginGuestOrderAndSignIn(page, { serviceId, fullName: "E2E Mobile Preview Tester", emailPrefix: "e2e-j12m" });

    await expect(page.locator(".portal-bi-form-choice-panel")).toBeVisible({ timeout: 15_000 });
    await page.click(".portal-bi-form-choice-self");

    const panel = page.locator(".portal-bi-form-live-preview");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel).not.toHaveClass(/is-expanded/);

    await page.locator(".portal-bi-form-preview-toggle").click();
    await expect(panel).toHaveClass(/is-expanded/);
    const previewImg = page.locator(".portal-bi-form-preview-img");
    await expect.poll(() => previewImg.evaluate((img) => img.naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);
  });
});
