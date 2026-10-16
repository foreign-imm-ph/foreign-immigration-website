// Shared test helpers: seed D1 rows directly (bypassing email/magic-link
// for speed where the test isn't specifically about that flow) and build
// authenticated requests against the real Worker entry point.
import { env } from "cloudflare:workers";
import { createSession } from "../src/lib/session.js";
import { newId } from "../src/lib/crypto.js";

export const SITE_ORIGIN = "https://foreignimmigration.ph"; // matches wrangler.toml PUBLIC_SITE_URL

export async function createTestClient(overrides = {}) {
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO clients (id, full_name, email, phone, nationality) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, overrides.fullName || "Test Client", overrides.email || `${id}@example.test`, overrides.phone || null, overrides.nationality || "Testlandian")
    .run();
  return env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first();
}

export async function createSessionCookieFor(client) {
  const { rawToken } = await createSession(env.DB, env, client.id);
  return `fis_session=${rawToken}`;
}

export async function createTestApplication(client, overrides = {}) {
  const id = newId();
  const reference = `FIS-TEST-${id.slice(0, 8)}`;
  await env.DB.prepare(
    "INSERT INTO applications (id, reference, client_id, service_slug, status) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, reference, client.id, overrides.serviceSlug || "visa-applications", overrides.status || "enquiry_received")
    .run();
  return env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
}

export async function createTestStaff(overrides = {}) {
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO staff (id, email, full_name, role, active) VALUES (?, ?, ?, ?, 1)"
  )
    .bind(id, overrides.email || `staff-${id.slice(0, 8)}@foreignimmigration.ph`, overrides.fullName || "Test Staff", overrides.role || "staff")
    .run();
  return env.DB.prepare("SELECT * FROM staff WHERE id = ?").bind(id).first();
}

export async function createBiFormSubmission(client, application, staff, overrides = {}) {
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO bi_form_submissions (id, application_id, client_id, bi_form_id, status, customer_answers_json, staff_answers_json, assigned_by_staff_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      application ? application.id : null,
      client.id,
      overrides.biFormId || "CCS-A-CDR-2016",
      overrides.status || "draft",
      overrides.customerAnswersJson || null,
      overrides.staffAnswersJson || null,
      staff ? staff.email : null
    )
    .run();
  return env.DB.prepare("SELECT * FROM bi_form_submissions WHERE id = ?").bind(id).first();
}

// Seeds one checkout_services row plus its English i18n row and price
// components -- the minimum a catalogue/begin-checkout test needs. All
// synthetic/test-only values (never real prices), and active defaults to
// 1 here only because these are explicitly test fixtures in a local D1,
// never anything deployed -- production rows stay active=0 until staff
// approval, per the migration's fail-closed default.
// Dual processing tiers: a document_automated/document_manual fixture
// gets both tiers enabled and fully approved by default (Regular at the
// same 500000-centavo/₱5,000 amount the legacy service_fee default below
// already used, so any test asserting that specific total continues to
// pass unchanged; Express distinctly priced/faster, for tests that care
// about tier differences). Override via expressPriceCentavos/
// expressMinDays/expressMaxDays/regularPriceCentavos/etc., or pass
// expressEnabled: false / regularEnabled: false to test a disabled tier.
export async function createTestCheckoutService(overrides = {}) {
  const id = newId();
  const offeringType = overrides.offeringType || "document_automated";
  const usesTiers = offeringType === "document_automated" || offeringType === "document_manual";
  await env.DB.prepare(
    `INSERT INTO checkout_services
       (id, service_slug, bi_form_id, supports_delivery, display_order, active, offering_type,
        express_enabled, express_price_php_centavos, express_min_business_days, express_max_business_days,
        regular_enabled, regular_price_php_centavos, regular_min_business_days, regular_max_business_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      overrides.serviceSlug || "motions-blacklist",
      offeringType === "bookable_service" ? "" : overrides.biFormId || "CCS-A-CDR-2016",
      overrides.supportsDelivery === undefined ? 1 : overrides.supportsDelivery,
      overrides.displayOrder || 0,
      overrides.active === undefined ? 1 : overrides.active,
      offeringType,
      !usesTiers || overrides.expressEnabled === undefined ? 1 : overrides.expressEnabled ? 1 : 0,
      !usesTiers ? null : overrides.expressPriceCentavos === undefined ? 800000 : overrides.expressPriceCentavos,
      !usesTiers ? null : overrides.expressMinDays === undefined ? 2 : overrides.expressMinDays,
      !usesTiers ? null : overrides.expressMaxDays === undefined ? 3 : overrides.expressMaxDays,
      !usesTiers || overrides.regularEnabled === undefined ? 1 : overrides.regularEnabled ? 1 : 0,
      !usesTiers ? null : overrides.regularPriceCentavos === undefined ? 500000 : overrides.regularPriceCentavos,
      !usesTiers ? null : overrides.regularMinDays === undefined ? 10 : overrides.regularMinDays,
      !usesTiers ? null : overrides.regularMaxDays === undefined ? 15 : overrides.regularMaxDays
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text)
     VALUES (?, 'en', ?, ?, ?)`
  )
    .bind(id, overrides.title || "Test Service", overrides.shortDescription || "Test service description", overrides.eligibilityText || "Eligible for testing")
    .run();
  for (const component of overrides.priceComponents || [{ type: "service_fee", label: "FIS Service Fee", amountPhpCentavos: 500000 }]) {
    await env.DB.prepare(
      `INSERT INTO checkout_price_components (id, service_id, component_type, label, amount_php_centavos)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(newId(), id, component.type, component.label, component.amountPhpCentavos)
      .run();
  }
  return env.DB.prepare("SELECT * FROM checkout_services WHERE id = ?").bind(id).first();
}

// Test-only shortcut for the real customer action (handleSetProcessingTier,
// routes/checkoutCustomer.js) -- sets an order's selected processing tier
// directly via SQL so fixtures that don't need to exercise that endpoint's
// own HTTP validation can still reach confirm-and-pay for a tiered service,
// which now requires a tier to have been selected first.
export async function selectProcessingTier(order, tier) {
  await env.DB.prepare("UPDATE checkout_orders SET processing_tier = ? WHERE id = ?").bind(tier, order.id).run();
  return env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(order.id).first();
}

// Builds a Request with the headers every state-changing endpoint in this
// Worker requires in production (same-site Origin, for the CSRF check in
// lib/session.js isSameSiteOrigin) -- so a test deliberately checking CSRF
// rejection should build its own request without this helper instead.
export function authedRequest(path, { method = "GET", cookie, body, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      Origin: SITE_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`${SITE_ORIGIN}${path}`, init);
}
