import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker from "../src/index.js";
import { createTestCheckoutService, createTestStaff, SITE_ORIGIN } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";

// Focused coverage for the "Collapsible Sections, Better Organization,
// Zero Functionality Removed" catalogue editor refinement. This checks
// the HTML the editor actually renders (section presence, default open/
// closed state, warning visibility, and value echo-back on a validation
// failure) -- it does not re-test any pricing/translation/approval LOGIC
// already covered by staffCheckout.test.js and processingTiers.test.js.

let keypair;
let restoreFetch;

beforeAll(async () => {
  keypair = await generateTestAccessKeypair();
  restoreFetch = mockAccessJwksEndpoint(env.CF_ACCESS_TEAM_DOMAIN, keypair.jwks);
});

afterAll(() => {
  restoreFetch();
});

async function staffRequest(path, staffRow, { method = "GET", body, headers = {} } = {}) {
  const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, {
    email: staffRow.email,
    aud: [env.CF_ACCESS_AUD],
    exp: Math.floor(Date.now() / 1000) + 300,
  });
  const init = { method, headers: { "Cf-Access-Jwt-Assertion": jwt, Origin: SITE_ORIGIN, ...headers } };
  if (body !== undefined) init.body = body;
  return worker.fetch(new Request(`${SITE_ORIGIN}${path}`, init), env);
}

function formBody(fields) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, v);
  return params;
}

// Pulls out the `open` state of a <details id="section-X"> block from raw
// HTML without a DOM parser -- good enough for this one narrow check.
function sectionOpenState(html, sectionId) {
  const match = html.match(new RegExp(`<details class="[^"]*" id="section-${sectionId}"([^>]*)>`));
  if (!match) return null;
  return /\bopen\b/.test(match[1]);
}

describe("Staff catalogue editor: collapsible sections (document offering)", () => {
  it("renders all seven lettered sections, with A/B open and C/D/E collapsed by default for a document service", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const service = await createTestCheckoutService(); // document_automated, the fixture default
    const resp = await staffRequest(`/staff/instant-services/catalogue/${service.id}`, staff);
    expect(resp.status).toBe(200);
    const html = await resp.text();

    for (const id of ["tiers", "content-en", "translations", "config", "components", "approval", "price-history"]) {
      expect(html).toContain(`id="section-${id}"`);
    }
    expect(sectionOpenState(html, "tiers")).toBe(true); // A: open for a document service
    expect(sectionOpenState(html, "content-en")).toBe(true); // B: always open
    expect(sectionOpenState(html, "translations")).toBe(false); // C: collapsed by default
    expect(sectionOpenState(html, "config")).toBe(false); // D: collapsed by default
    expect(sectionOpenState(html, "components")).toBe(false); // E: not applicable to a document service, collapsed
    expect(sectionOpenState(html, "approval")).toBe(true); // F: open (status must stay visible)
    expect(sectionOpenState(html, "price-history")).toBe(false); // G: collapsed by default

    // E's collapsed badge still says so plainly, rather than just vanishing.
    expect(html).toMatch(/id="section-components"[^]*?not applicable/);
  });

  it("opens E (and collapses A with an explanatory badge) by default for a non-document offering", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const service = await createTestCheckoutService({ offeringType: "fixed_price_service" });
    const resp = await staffRequest(`/staff/instant-services/catalogue/${service.id}`, staff);
    const html = await resp.text();
    expect(sectionOpenState(html, "tiers")).toBe(false);
    expect(sectionOpenState(html, "components")).toBe(true);
    expect(html).toMatch(/id="section-tiers"[^]*?not applicable/);
  });

  it("preserves every existing field -- processing tiers, legacy price components, service configuration, and English content -- regardless of which sections are collapsed", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const service = await createTestCheckoutService();
    const resp = await staffRequest(`/staff/instant-services/catalogue/${service.id}`, staff);
    const html = await resp.text();

    // A: both tiers' full field set.
    for (const name of ["expressEnabled", "expressPrice", "expressMinDays", "expressMaxDays", "regularEnabled", "regularPrice", "regularMinDays", "regularMaxDays"]) {
      expect(html).toContain(`name="${name}"`);
    }
    // E: the legacy itemized fields, still present even though collapsed for this offering type.
    for (const name of ["serviceFeeLabel", "serviceFeeAmount", "govFeeLabel", "govFeeAmount", "otherFeeLabel", "otherFeeAmount", "priceChangeReason"]) {
      expect(html).toContain(`name="${name}"`);
    }
    // D: service configuration fields.
    for (const name of ["offeringType", "serviceSlug", "biFormId", "serviceGroup", "customerPriceLabel", "displayOrder", "supportsDelivery"]) {
      expect(html).toContain(`name="${name}"`);
    }
    // B + C: English plus all five other languages.
    for (const name of ["title_en", "shortDescription_en", "eligibilityText_en", "title_zh-CN", "title_zh-Hant", "title_ko", "title_ja", "title_vi"]) {
      expect(html).toContain(`name="${name}"`);
    }
    // F + G: approval status buttons and the price-history section are both present.
    expect(html).toContain('action="/staff/instant-services/catalogue/' + service.id + '/status"');
    expect(html).toContain("G. Price History");
  });

  it("surfaces a translation-review warning on the collapsed parent section, not just inside the nested language subsection", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const service = await createTestCheckoutService();
    await env.DB.prepare(
      `INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, auto_generated, field_hashes_json, source_hash, needs_review)
       VALUES (?, 'zh-CN', 'manual title', 'manual desc', 'manual elig', 0, '{"title":"orig"}', 'orig', 1)`
    )
      .bind(service.id)
      .run();

    const resp = await staffRequest(`/staff/instant-services/catalogue/${service.id}`, staff);
    const html = await resp.text();
    expect(sectionOpenState(html, "translations")).toBe(false); // still collapsed by default
    // The warning badge is on section C's own <summary>, before its body starts.
    const sectionStart = html.indexOf('id="section-translations"');
    const bodyStart = html.indexOf('staff-collapsible__body', sectionStart);
    const summarySlice = html.slice(sectionStart, bodyStart);
    expect(summarySlice).toMatch(/need.*review/i);
  });
});

describe("Staff catalogue editor: validation failure re-render (requirement 4.8)", () => {
  it("an invalid Express/Regular tier value re-renders the SAME edit page, with that value echoed back and section A forced open", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const service = await createTestCheckoutService();
    const resp = await staffRequest(`/staff/instant-services/catalogue/${service.id}`, staff, {
      method: "POST",
      body: formBody({
        serviceSlug: service.service_slug,
        offeringType: "document_automated",
        biFormId: service.bi_form_id || "",
        displayOrder: "0",
        expressEnabled: "on",
        expressPrice: "not-a-number",
        expressMinDays: "2",
        expressMaxDays: "3",
        title_en: "Still Valid Title",
        shortDescription_en: "X",
        eligibilityText_en: "X",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(400);
    const html = await resp.text();
    expect(html).toContain("Could not save");
    expect(html).toContain("Express Processing");
    expect(sectionOpenState(html, "tiers")).toBe(true);
    // The invalid value the owner typed is echoed back exactly, not discarded.
    expect(html).toMatch(/name="expressPrice"[^>]*value="not-a-number"/);
    // Unrelated, untouched fields (here, the just-submitted English title) survive the round trip too.
    expect(html).toContain("Still Valid Title");

    // Nothing was actually persisted.
    const unchanged = await env.DB.prepare("SELECT express_price_php_centavos FROM checkout_services WHERE id = ?").bind(service.id).first();
    expect(unchanged.express_price_php_centavos).toBe(800000); // the fixture's original value
  });

  it("an invalid legacy price component on a non-document offering forces section E open instead of A", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const service = await createTestCheckoutService({ offeringType: "fixed_price_service" });
    const resp = await staffRequest(`/staff/instant-services/catalogue/${service.id}`, staff, {
      method: "POST",
      body: formBody({
        serviceSlug: service.service_slug,
        offeringType: "fixed_price_service",
        biFormId: "",
        displayOrder: "0",
        serviceFeeAmount: "-5.00",
        title_en: "X",
        shortDescription_en: "X",
        eligibilityText_en: "X",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(400);
    const html = await resp.text();
    expect(sectionOpenState(html, "components")).toBe(true);
    expect(sectionOpenState(html, "tiers")).toBe(false); // not forced open just because it exists
  });

  it("a missing required English field forces section B's content to be identifiable, and never silently drops the rest of the submitted form", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const service = await createTestCheckoutService();
    const resp = await staffRequest(`/staff/instant-services/catalogue/${service.id}`, staff, {
      method: "POST",
      body: formBody({
        serviceSlug: service.service_slug,
        offeringType: "document_automated",
        biFormId: service.bi_form_id || "",
        displayOrder: "0",
        expressEnabled: "on",
        expressPrice: "9000.00",
        expressMinDays: "1",
        expressMaxDays: "2",
        title_en: "",
        shortDescription_en: "X",
        eligibilityText_en: "X",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(400);
    const html = await resp.text();
    expect(html).toContain("English title, short description, and eligibility text are required");
    // The Express price the owner typed in the SAME submission survives the re-render untouched.
    expect(html).toMatch(/name="expressPrice"[^>]*value="9000\.00"/);
  });

  it("create-offering validation failures re-render the add-offering page the same way, never a bare error page", async () => {
    const staff = await createTestStaff({ role: "admin" });
    const resp = await staffRequest("/staff/instant-services/catalogue", staff, {
      method: "POST",
      body: formBody({
        serviceSlug: "collapsible-editor-regression",
        offeringType: "document_automated",
        biFormId: "NOT-A-REAL-FORM-ID",
        title_en: "X",
        shortDescription_en: "X",
        eligibilityText_en: "X",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(resp.status).toBe(400);
    const html = await resp.text();
    expect(html).toContain("Could not save");
    expect(html).toContain('id="section-tiers"');
    expect(html).toContain('name="serviceSlug" id="serviceSlug" value="collapsible-editor-regression"');
  });
});
