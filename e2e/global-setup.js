// Runs once before the whole suite. Two things every journey below
// depends on, neither of which exists in a fresh local D1:
//  1. The dev-only staff bypass identity (worker/src/lib/staffAuth.js)
//     actually exists as a staff row -- there's no self-serve "create
//     staff" API, staff accounts are provisioned directly, same as in
//     any real deployment of this system.
//  2. QR Ph payment settings are configured for the Instant Services /
//     Order & Book Online checkout. Every customer order journey below
//     reaches a "confirm and pay" step that the Worker refuses with a
//     503 unless QR_PH.isConfigured() is true (worker/src/routes/
//     checkoutCustomer.js) -- there is no way to reach a payment screen
//     at all otherwise. The uploaded "QR image" here is a synthetic 1x1
//     PNG, never a real QR Ph code -- see e2e/README.md.
const { ensureTestStaffAdmin, WORKER_BASE } = require("./fixtures/testHelpers");

// A real, byte-valid 1x1 PNG (not a real QR Ph code) -- satisfies the
// same magic-byte sniffing (worker/src/lib/storage.js sniffContentType)
// a genuine upload would have to pass.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUAAScY42YAAAAASUVORK5CYII=";

async function configureQrPhPaymentSettings() {
  const settingsResp = await fetch(`${WORKER_BASE}/staff/instant-services/payment-settings/`);
  const html = await settingsResp.text();
  if (html.includes("Image configured") && html.includes("checked")) {
    // Already configured and enabled from a previous run against this
    // same local D1 -- nothing to do.
    return;
  }

  const pngBytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");
  const form = new FormData();
  form.set("merchantDisplayName", "FIS (E2E test fixture)");
  form.set("customerInstructions", "This is a synthetic QR Ph image configured by the automated test suite, not a real payment code.");
  form.set("enabled", "on");
  form.set("qrImage", new Blob([pngBytes], { type: "image/png" }), "e2e-qr-ph.png");

  const resp = await fetch(`${WORKER_BASE}/staff/instant-services/payment-settings`, {
    method: "POST",
    body: form,
    redirect: "manual",
  });
  if (resp.status !== 302 && resp.status !== 200) {
    throw new Error(`Failed to configure QR Ph payment settings for e2e tests: HTTP ${resp.status}`);
  }
}

module.exports = async function globalSetup() {
  ensureTestStaffAdmin();
  await configureQrPhPaymentSettings();
};
