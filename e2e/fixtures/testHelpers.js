// Shared setup helpers for the Phase 4 Playwright journeys. Everything
// here talks to the LOCAL D1 instance only (via `wrangler d1 execute
// --local`, exactly the pattern used for manual verification throughout
// this project) or to the locally-running Worker over plain HTTP --
// nothing here can reach a real Cloudflare resource.
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { expect } = require("@playwright/test");

const WORKER_DIR = path.join(__dirname, "..", "..", "worker");
const WORKER_BASE = `http://127.0.0.1:${process.env.E2E_WORKER_PORT || 8787}`;
const SITE_BASE = `http://127.0.0.1:${process.env.E2E_SITE_PORT || 8080}`;
// For any state-changing request made directly through page.request
// (not through a real page navigation) -- see beginGuestOrderAndSignIn.
const PUBLIC_ORIGIN_HEADERS = { Origin: SITE_BASE };

// The dev-only staff-auth bypass (worker/src/lib/staffAuth.js) is fixed to
// one email for the lifetime of a single `wrangler dev` process (it's read
// from .dev.vars at startup), so every journey that needs a staff session
// shares this one identity. worker/.dev.vars (gitignored) must set
// DEV_STAFF_BYPASS_EMAIL to this same address -- see e2e/README.md.
const TEST_STAFF_EMAIL = "dev-staff@local.test";

function d1Json(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "fis-backend", "--local", "--json", "--command", sql],
    { cwd: WORKER_DIR, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );
  const parsed = JSON.parse(out);
  return parsed[0].results;
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function uniqueSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// Idempotent: safe to call at the start of every spec file. Mirrors how
// staff accounts are actually provisioned in this system today -- there is
// no self-serve "create staff" API, only direct D1 administration.
function ensureTestStaffAdmin() {
  d1Json(
    `INSERT INTO staff (id, email, full_name, role, active) ` +
      `SELECT 'e2e-staff-fixture', '${TEST_STAFF_EMAIL}', 'E2E Test Staff', 'admin', 1 ` +
      `WHERE NOT EXISTS (SELECT 1 FROM staff WHERE email = '${TEST_STAFF_EMAIL}')`
  );
  return TEST_STAFF_EMAIL;
}

function newRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function sha256Hex(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Creates a brand-new client row directly (bypassing the magic-link email
// step, which this suite never sends -- see e2e/README.md) and returns a
// single-use raw auth token the test can redeem via /portal/verify/ or
// /instant-services/verify/.
function createTestClientWithToken({ emailPrefix = "e2e-client", fullName = "E2E Test Client" } = {}) {
  const email = `${emailPrefix}-${uniqueSuffix()}@fis-e2e.test`;
  const clientId = `e2e-client-${uniqueSuffix()}`;
  d1Json(
    `INSERT INTO clients (id, email, full_name) VALUES ('${clientId}', '${sqlEscape(email)}', '${sqlEscape(fullName)}')`
  );
  const rawToken = issueAuthTokenForClientId(clientId);
  return { id: clientId, email, fullName, rawToken };
}

function issueAuthTokenForClientId(clientId) {
  const rawToken = newRawToken();
  const tokenHash = sha256Hex(rawToken);
  const tokenId = `e2e-token-${uniqueSuffix()}`;
  d1Json(
    `INSERT INTO auth_tokens (id, client_id, token_hash, expires_at) ` +
      `VALUES ('${tokenId}', '${clientId}', '${tokenHash}', datetime('now', '+15 minutes'))`
  );
  return rawToken;
}

// Every page under test loads src/assets/js/portal-config.js, which hard-
// codes window.PORTAL_API_BASE to the PRODUCTION api.foreignimmigration.ph
// origin -- correct for the committed site, wrong for this local run.
//
// A network-level redirect of that origin to the local Worker (tried
// first) turned out to be unusable: the session cookie
// (worker/src/lib/session.js sessionCookieHeader) is set with an explicit
// `Domain=.<PUBLIC_SITE_URL's hostname>` attribute (127.0.0.1 for this
// local run) -- a real, deliberate security property (the cookie is
// scoped to this site, not wherever happened to answer), but it means a
// Set-Cookie response whose request the browser believes went to
// api.foreignimmigration.ph is silently dropped: that domain doesn't
// match 127.0.0.1, so the browser never stores it, and every call after
// verify comes back 401.
//
// So instead of changing where the browser THINKS it's talking to, this
// intercepts only the one script that decides that: portal-config.js
// itself, serving a version with PORTAL_API_BASE pointed at the local
// Worker's own http://127.0.0.1:<port> -- same hostname as
// PUBLIC_SITE_URL (127.0.0.1), so the cookie's Domain attribute matches
// and persists correctly, exactly as it would for the real site and its
// real api.foreignimmigration.ph subdomain. The committed file on disk is
// never touched.
async function routeApiToLocalWorker(page) {
  await page.route("**/assets/js/portal-config.js", async (route) => {
    const body =
      `window.PORTAL_API_BASE = "${WORKER_BASE}";\n` +
      `window.portalFetch = function portalFetch(path, options) {\n` +
      `  return fetch(window.PORTAL_API_BASE + path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...options });\n` +
      `};\n`;
    await route.fulfill({ contentType: "application/javascript", body });
  });
}

// `lang`, when given, simulates having picked that language on the
// PUBLIC site first (src/assets/js/language-gateway.js writes the same
// fisPreferredLocale localStorage key this reads) -- proving locale
// continuity into the portal, not just the portal's own language
// switcher in isolation.
async function signInClientInPortal(page, rawToken, { lang } = {}) {
  await routeApiToLocalWorker(page);
  if (lang) {
    await page.goto("/");
    await page.evaluate((l) => window.localStorage.setItem("fisPreferredLocale", l), lang);
  }
  await page.goto(`/portal/verify/?token=${encodeURIComponent(rawToken)}`);
  await page.waitForURL("**/portal/**", { timeout: 15_000 });
  await page.waitForSelector("#portal-app:not([hidden])", { timeout: 15_000 });
}

async function signInStaff(page) {
  await routeApiToLocalWorker(page);
}

function getClientIdByEmail(email) {
  const rows = d1Json(`SELECT id FROM clients WHERE email = '${sqlEscape(email)}'`);
  if (!rows.length) throw new Error(`No client found for email ${email}`);
  return rows[0].id;
}

// Drives the real guest-checkout "begin" step through the actual HTTP API
// (exercising the real validation/client-creation code, exactly as a
// customer's browser would), then signs the resulting client into that
// specific order WITHOUT depending on the verification email this suite
// never receives: it mints its own additional, single-use auth_tokens row
// for the same client and redeems that instead, through the same
// /instant-services/verify/ page and the same, unmodified
// /api/auth/verify endpoint a real email link would use.
async function beginGuestOrderAndSignIn(page, { serviceId, fullName, emailPrefix, lang = "en" }) {
  const email = `${emailPrefix}-${uniqueSuffix()}@fis-e2e.test`;
  const beginResp = await page.request.post(`${WORKER_BASE}/api/instant-services/begin`, {
    data: { fullName, email, serviceId },
    // page.request isn't tied to any rendered page, so it sends no
    // Origin header on its own -- a real customer's browser always would
    // (the public site's own origin), which this app's CSRF check
    // (worker/src/lib/session.js isSameSiteOrigin) requires. See
    // e2e/README.md.
    headers: PUBLIC_ORIGIN_HEADERS,
  });
  if (!beginResp.ok()) {
    throw new Error(`begin checkout failed: ${beginResp.status()} ${await beginResp.text()}`);
  }
  const { orderId } = await beginResp.json();

  const clientId = getClientIdByEmail(email);
  const rawToken = issueAuthTokenForClientId(clientId);

  await routeApiToLocalWorker(page);
  await page.goto(`/instant-services/verify/?token=${encodeURIComponent(rawToken)}&order=${encodeURIComponent(orderId)}&lang=${lang}`);
  await page.waitForURL(new RegExp(`instant-services/apply/\\?order=${orderId}`), { timeout: 15_000 });

  return { orderId, clientId, email, fullName };
}

// Drives the real Staff Portal "new offering" form end to end: create
// (draft) -> approve -> activate -- the same three steps Journey 7 proves
// work, reused here as plumbing for every other journey that needs a
// real, purchasable catalogue entry to order against. `page` must already
// be signed in as staff (see signInStaff) and navigable to WORKER_BASE.
async function createAndActivateOffering(page, {
  offeringType,
  slug,
  serviceFeeAmount,
  biFormId = "",
  serviceGroup = "",
  supportsDelivery = false,
  title = "E2E Test Offering",
  desc = "Created by the automated test suite.",
  elig = "Available to any client. Created by an automated test.",
}) {
  await page.goto(`${WORKER_BASE}/staff/instant-services/catalogue/new`);
  await page.selectOption("#offeringType", offeringType);
  await page.fill("#serviceSlug", slug);
  if (biFormId) await page.fill("#biFormId", biFormId);
  if (serviceGroup) await page.fill("#serviceGroup", serviceGroup);
  // document_automated/document_manual use the Processing Tiers pricing
  // model (worker/src/lib/checkout.js usesProcessingTiers), not the flat
  // "Other Pricing Settings" fee components -- a price set only on
  // #serviceFeeAmount for one of these types is never actually stored
  // anywhere the activation check (hasApprovedPrice) looks, so activation
  // below would otherwise be silently refused. Every other offering type
  // (bookable_service, fixed_price_service) genuinely does use the flat
  // fee field.
  if (offeringType === "document_automated" || offeringType === "document_manual") {
    await page.check("#regularEnabled");
    await page.fill("#regularPrice", serviceFeeAmount);
    await page.fill("#regularMinDays", "2");
    await page.fill("#regularMaxDays", "5");
  } else {
    await page.fill("#serviceFeeAmount", serviceFeeAmount);
  }
  await page.fill("#title-en", title);
  await page.fill("#desc-en", desc);
  await page.fill("#elig-en", elig);
  await page.fill("#priceChangeReason", "Initial price set by e2e test");
  if (!supportsDelivery) await page.uncheck("#supportsDelivery");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/staff\/instant-services\/catalogue\/[^/]+\/?$/);
  const serviceId = page.url().match(/catalogue\/([^/]+)\/?$/)[1];

  await page.locator('form[action$="/status"] button:has-text("approved")').click();
  await page.waitForLoadState();
  await page.locator('form[action$="/status"] button:has-text("active")').click();
  await page.waitForLoadState();

  return serviceId;
}

// Drives the real multi-step BI Forms wizard (window.PortalBiForms,
// reused unmodified from the Client Portal -- see
// src/assets/js/portal-bi-form.js) end to end with generic values and
// submits it, for ANY form's question set, without knowing its specific
// fields or step count: every question still renders with a
// `data-answer-key` (or, for a repeatable group, `data-sub-key`)
// attribute regardless of which BI Form config produced it, and the
// wizard exposes the SAME `.portal-wizard-continue`/`.portal-bi-form-
// submit` controls on every form. Chooses "I'll provide the details
// myself" on the initial choice panel when one is shown (a fresh draft
// always shows it) -- the assisted-intake path is exercised separately
// by its own dedicated spec, not by this generic helper.
async function fillGenericQuestionnaireAndSubmit(page) {
  await page.waitForSelector(".portal-bi-form-detail", { timeout: 15_000 });

  const selfBtn = page.locator(".portal-bi-form-choice-self");
  if (await selfBtn.count()) await selfBtn.click();

  for (let guard = 0; guard < 12; guard++) {
    const submitBtn = page.locator(".portal-bi-form-submit");
    if (await submitBtn.count()) {
      await submitBtn.click();
      return;
    }

    // yesno questions render as a pair of radios sharing one
    // data-answer-key -- resolved FIRST (always "Yes", the first of the
    // pair), since answering one can reveal an additional showIf-gated
    // field later in the same step that still needs filling below.
    const yesRadios = page.locator('.portal-wizard-step-form [data-answer-key][type="radio"][value="true"]:visible');
    const yesCount = await yesRadios.count();
    for (let i = 0; i < yesCount; i++) await yesRadios.nth(i).check();

    // Two passes: answering a yesno above can reveal a previously-hidden
    // conditional field that itself needs filling, and `:visible` is
    // re-evaluated fresh on each query, so a second pass picks up
    // anything the first pass's own radio clicks just revealed.
    for (let pass = 0; pass < 2; pass++) {
      const textLikeFields = page.locator('.portal-wizard-step-form [data-answer-key]:not([type="radio"]):visible');
      const textLikeCount = await textLikeFields.count();
      for (let i = 0; i < textLikeCount; i++) {
        const field = textLikeFields.nth(i);
        const tag = await field.evaluate((el) => el.tagName.toLowerCase());
        if (tag === "select") {
          const optionValues = await field.locator("option").evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
          if (optionValues.length) await field.selectOption(optionValues[0]);
        } else {
          const current = await field.inputValue();
          if (!current) await field.fill("Test Value");
        }
      }
    }

    const groupTextFields = page.locator(".portal-wizard-step-form [data-sub-key]:visible");
    const groupCount = await groupTextFields.count();
    for (let i = 0; i < groupCount; i++) await groupTextFields.nth(i).fill("Test Value");

    const continueBtn = page.locator(".portal-wizard-continue");
    if (!(await continueBtn.count())) break; // nothing left to advance -- shouldn't normally happen
    await continueBtn.click();
  }

  throw new Error("fillGenericQuestionnaireAndSubmit: never reached the Submit button (wizard loop exhausted)");
}

async function fillDeliveryAddressIfPresent(page) {
  const form = page.locator("#instant-services-delivery-form");
  try {
    await form.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    return false;
  }
  await page.fill("#recipientName", "E2E Test Recipient");
  await page.fill("#phone", "+63 900 000 0000");
  await page.fill("#country", "Philippines");
  await page.fill("#city", "Manila");
  await page.fill("#addressLine1", "123 Test Street");
  await page.click('#instant-services-delivery-form button[type="submit"]');
  return true;
}

// A tiered offering (document_automated/document_manual -- see
// lib/checkout.js usesProcessingTiers) shows a "Choose a Processing
// Option" step before delivery address/questionnaire; a non-tiered
// offering (bookable_service/fixed_price_service) never does. No-op if
// the step isn't present, same convention as fillDeliveryAddressIfPresent.
async function selectProcessingTierIfPresent(page, tier = "regular") {
  const form = page.locator("#instant-services-tier-form");
  try {
    await form.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    return false;
  }
  await page.check(`input[name="processingTier"][value="${tier}"]`);
  await page.click('#instant-services-tier-form button[type="submit"]');
  return true;
}

async function fillAirportVipBookingForm(page, { direction = "arrival", scheduledLocalDate, scheduledLocalTime = "14:00" } = {}) {
  await page.waitForSelector("#instant-services-booking-form", { timeout: 15_000 });
  await page.selectOption("#direction", direction);
  await page.fill("#airline", "E2E Airlines");
  await page.fill("#flightNumber", "EA123");
  await page.fill("#scheduledLocalDate", scheduledLocalDate);
  await page.fill("#scheduledLocalTime", scheduledLocalTime);
  await page.fill("#passengerCount", "1");
  await page.fill("#passengerNames", "E2E Test Passenger");
  await page.click('#instant-services-booking-form button[type="submit"]');
}

async function acceptAirportVipPolicyIfPresent(page) {
  const form = page.locator("#instant-services-policy-form");
  try {
    await form.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    return false;
  }
  await page.check("#policyAccept");
  await page.click('#instant-services-policy-form button[type="submit"]');
  return true;
}

// A real, byte-valid 1x1 PNG, used wherever a test needs to upload "a
// file" for payment-proof/document validation -- never a real document.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUAAScY42YAAAAASUVORK5CYII=";

// Directive section 6's live preview (worker/src/lib/biFormRaster.js)
// needs a pre-rendered background PNG in R2 at backgrounds/<biFormId>.png
// before it will render anything -- without one it degrades gracefully
// to "unavailable", by design. That real background is generated offline
// from the confidential original (never committed here, same
// FIS_BI_ORIGINALS_DIR policy as bi-forms-library/tests/run-all.js), but
// the compositor itself only ever stretches whatever PNG it's given to
// the computed canvas size (confirmed directly in worker/test/
// biFormRaster.test.js's own TINY_PNG_BASE64 fixture) -- so this synthetic
// one-pixel PNG (same fixture already used for payment-proof uploads
// above) is a perfectly valid, non-confidential stand-in for exercising
// the real end-to-end preview pipeline in a real browser.
function uploadSyntheticBiFormBackground(biFormId) {
  const tmpPath = path.join(os.tmpdir(), `e2e-bg-${biFormId.replace(/[^A-Za-z0-9.-]/g, "_")}-${uniqueSuffix()}.png`);
  fs.writeFileSync(tmpPath, Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"));
  try {
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", `fis-bi-forms-library/backgrounds/${biFormId}.png`, "--local", "--file", tmpPath, "--content-type", "image/png"],
      { cwd: WORKER_DIR, encoding: "utf8" }
    );
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

async function uploadSyntheticPaymentProof(page) {
  await page.waitForSelector("#instant-services-proof-upload", { timeout: 15_000 });
  await page.setInputFiles("#instant-services-proof-upload", {
    name: "e2e-payment-proof.png",
    mimeType: "image/png",
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
  });
}

// Books, pays, and gets a single Airport VIP booking all the way to
// "confirmed" -- the one status rescheduling and (per Journey 5)
// refunding are reachable from -- reusing the exact same real flow
// Journey 3 proves end to end, so every journey that needs a confirmed
// booking as a starting point shares one implementation of how to get
// there.
async function createConfirmedAirportVipBooking(page, serviceId, { emailPrefix, scheduledLocalDate, fullName = "E2E Test Client" }) {
  const { orderId, clientId } = await beginGuestOrderAndSignIn(page, {
    serviceId,
    fullName,
    emailPrefix,
  });
  await fillAirportVipBookingForm(page, { direction: "arrival", scheduledLocalDate });
  await acceptAirportVipPolicyIfPresent(page);
  await expect(page.locator("text=Booking Details Submitted")).toBeVisible({ timeout: 15_000 });
  await page.click("#instant-services-confirm-pay");
  await expect(page.locator("#instant-services-qr-image")).toBeVisible({ timeout: 15_000 });
  await uploadSyntheticPaymentProof(page);
  await expect(page.locator("text=Your Payment Has Been Submitted for Verification")).toBeVisible({ timeout: 15_000 });

  const bookingRows = d1Json(`SELECT id FROM airport_vip_bookings WHERE checkout_order_id = '${orderId}'`);
  const bookingId = bookingRows[0].id;

  await page.goto(`${WORKER_BASE}/staff/instant-services/orders/${orderId}`);
  await page.locator('form[action$="/verify"] button[type="submit"]').click();
  await page.goto(`${WORKER_BASE}/staff/airport-vip/bookings/${bookingId}`);
  await page.locator('form[action$="/status"] button:has-text("confirmed")').click();

  const confirmed = d1Json(`SELECT status FROM airport_vip_bookings WHERE id = '${bookingId}'`);
  expect(confirmed[0].status).toBe("confirmed");

  const orderRows = d1Json(`SELECT application_id FROM checkout_orders WHERE id = '${orderId}'`);
  return { bookingId, orderId, clientId, applicationId: orderRows[0].application_id };
}

// A direct, already-active checkout_services row (plus its required
// checkout_service_i18n and checkout_price_components rows), inserted the
// same way the Worker's OWN vitest fixture (worker/test/helpers.js
// createTestCheckoutService) does -- reused here because the Staff
// Portal's "Add an Offering" form (createAndActivateOffering above) is a
// real, separately-maintained UI surface this directive's own BI-forms-
// wizard verification has no need to drive through; a direct insert of
// "one already-approved, purchasable service" is the right amount of
// setup for a journey that is actually testing the CUSTOMER-facing
// questionnaire wizard, not catalogue administration.
function createActiveCheckoutServiceDirect({
  serviceSlug,
  biFormId = "CCS-A-CDR-2016",
  title = "E2E Wizard Test Service",
  supportsDelivery = false,
} = {}) {
  const id = `e2e-service-${uniqueSuffix()}`;
  d1Json(
    `INSERT INTO checkout_services
       (id, service_slug, bi_form_id, supports_delivery, display_order, active, offering_type,
        express_enabled, express_price_php_centavos, express_min_business_days, express_max_business_days,
        regular_enabled, regular_price_php_centavos, regular_min_business_days, regular_max_business_days)
     VALUES ('${id}', '${sqlEscape(serviceSlug)}', '${sqlEscape(biFormId)}', ${supportsDelivery ? 1 : 0}, 0, 1, 'document_automated',
             1, 800000, 2, 3, 1, 500000, 10, 15)`
  );
  d1Json(
    `INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text) ` +
      `VALUES ('${id}', 'en', '${sqlEscape(title)}', 'E2E test service description', 'Eligible for testing')`
  );
  d1Json(
    `INSERT INTO checkout_price_components (id, service_id, component_type, label, amount_php_centavos) ` +
      `VALUES ('e2e-price-${uniqueSuffix()}', '${id}', 'service_fee', 'FIS Service Fee', 500000)`
  );
  return id;
}

// A minimal client + application fixture, inserted directly (same
// established convention used for every synthetic fixture in this suite)
// -- Journey 6 is about the Client Portal's OWN i18n rendering, not the
// ordering flow (already covered end to end by Journeys 1-5), so a
// direct insert of "a client with one application in a known status" is
// the right amount of setup, not a shortcut around something that needs
// the real flow.
function createTestClientWithApplication({ emailPrefix = "e2e-portal", status = "under_review" } = {}) {
  const client = createTestClientWithToken({ emailPrefix });
  const applicationId = `e2e-app-${uniqueSuffix()}`;
  const reference = `E2E-${uniqueSuffix()}`;
  d1Json(
    `INSERT INTO applications (id, reference, client_id, service_slug, status) ` +
      `VALUES ('${applicationId}', '${reference}', '${client.id}', 'visa-applications', '${status}')`
  );
  return { ...client, applicationId, reference };
}

module.exports = {
  WORKER_BASE,
  SITE_BASE,
  PUBLIC_ORIGIN_HEADERS,
  TEST_STAFF_EMAIL,
  d1Json,
  sqlEscape,
  uniqueSuffix,
  ensureTestStaffAdmin,
  newRawToken,
  sha256Hex,
  createTestClientWithToken,
  issueAuthTokenForClientId,
  routeApiToLocalWorker,
  signInClientInPortal,
  signInStaff,
  getClientIdByEmail,
  beginGuestOrderAndSignIn,
  createAndActivateOffering,
  fillGenericQuestionnaireAndSubmit,
  fillDeliveryAddressIfPresent,
  selectProcessingTierIfPresent,
  fillAirportVipBookingForm,
  acceptAirportVipPolicyIfPresent,
  uploadSyntheticPaymentProof,
  uploadSyntheticBiFormBackground,
  ONE_PIXEL_PNG_BASE64,
  createConfirmedAirportVipBooking,
  createTestClientWithApplication,
  createActiveCheckoutServiceDirect,
};
