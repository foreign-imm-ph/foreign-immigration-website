// Journey 11: directive section 9's secure document attachments on an
// order-specific Client Portal message. Drives the REAL Client Portal UI
// (src/assets/js/portal-app.js) against the actual customer-facing
// /api/applications/*/messages* routes -- nothing here is mocked. The
// worker-level ownership/access-control tests (cross-customer denial,
// staff-vs-client attachment rules) already live in
// worker/test/messageAttachments.test.js; this journey instead proves the
// actual browser round trip: attaching a real file through the file
// picker, seeing it rendered back as a working download link.
const { test, expect } = require("@playwright/test");
const { createTestClientWithApplication, signInClientInPortal, ensureTestStaffAdmin, ONE_PIXEL_PNG_BASE64 } = require("../fixtures/testHelpers");

test.describe("Journey 11: order messaging attachments", () => {
  test.beforeAll(() => {
    ensureTestStaffAdmin();
  });

  test("a customer can attach a file to a new message from within their order, and the resulting download link actually works", async ({ page }) => {
    const client = createTestClientWithApplication({ emailPrefix: "e2e-j11" });
    await signInClientInPortal(page, client.rawToken);

    await page.locator(".portal-application-item").first().click();
    await expect(page.locator(".portal-message-form")).toBeVisible({ timeout: 15_000 });

    await page.fill(".portal-message-form textarea", "Please see the attached document.");
    await page.setInputFiles(".portal-message-form .portal-message-attach", {
      name: "e2e-attachment.png",
      mimeType: "image/png",
      buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
    });
    await page.click(".portal-message-form button[type=submit]");

    const attachmentLink = page.locator(".portal-messages a", { hasText: "e2e-attachment.png" });
    await expect(attachmentLink).toBeVisible({ timeout: 15_000 });

    // Not just that a link is rendered -- that it actually streams the
    // real file back, through the real ownership-checked download route,
    // using this same authenticated browser session. Fetches from WITHIN
    // the page itself (not page.request, a separate API context) so the
    // session cookie is sent exactly as it would be for a real click.
    const href = await attachmentLink.getAttribute("href");
    const result = await page.evaluate(async (url) => {
      const resp = await fetch(url, { credentials: "include" });
      return { status: resp.status, contentType: resp.headers.get("content-type") };
    }, href);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("image/png");
  });
});
