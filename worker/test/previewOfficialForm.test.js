import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { authedRequest, createTestCheckoutService } from "./helpers.js";

// "Preview Official BI Form" (directive section 5): the original blank
// government PDF, watermarked, shown BEFORE the customer starts the
// questionnaire -- a public, unauthenticated route, since this is the
// same blank form a prospective customer could find elsewhere, and
// requiring sign-in to see it first would defeat the point.
//
// Note on what ISN'T tested here: the actual pdf-lib watermarking step
// (buildWatermarkedFormPreview) cannot be exercised through worker.fetch()
// in this harness -- @cloudflare/vitest-plugin's simulated Workers isolate
// fails to resolve pdf-lib's CJS/ESM interop the same documented way
// biForms-staff.test.js's own top-of-file comment already records for
// approveBiForm's identical dynamic-import-of-pdf-lib code path (verified
// directly: even importing pdf-lib straight from this test file's own
// module scope throws the same "Cannot read properties of undefined
// (reading '__exportStar')" error). Every precondition/guard this route
// enforces BEFORE that point -- which is what actually matters for
// correctness and security -- is covered below.
describe("Public 'Preview Official BI Form' route", () => {
  it("404s for a service whose offering type doesn't use the BI Forms engine at all (e.g. a bookable service)", async () => {
    const service = await createTestCheckoutService({ offeringType: "bookable_service", supportsDelivery: 0 });
    const resp = await worker.fetch(authedRequest(`/api/instant-services/catalogue/${service.id}/preview-form`), env);
    expect(resp.status).toBe(404);
  });

  it("404s for a document service whose BI form is reproduction-restricted (2015-08-006), regardless of offering type", async () => {
    const service = await createTestCheckoutService({ offeringType: "document_manual", biFormId: "2015-08-006", supportsDelivery: 0 });
    const resp = await worker.fetch(authedRequest(`/api/instant-services/catalogue/${service.id}/preview-form`), env);
    expect(resp.status).toBe(404);
  });

  // Directive section 8.2: "Do not make the existence of an engine mapping
  // an unnecessary prerequisite for displaying a safe blank official-form
  // preview." 2014-01-011 is a real inventoried application form with a
  // catalogue association but NO coordinate-map.json/engine registration
  // (see docs/BI_FORMS_LIBRARY_RECONCILIATION.md) -- it must still be
  // treated as previewable (reaching the R2 lookup and failing with 501
  // for a missing object, never a 404 "not eligible").
  it("does NOT 404 for a real unmapped-but-previewable form -- reaches the R2 lookup (501, not 404) exactly like an engine-mapped one", async () => {
    const service = await createTestCheckoutService({ offeringType: "document_manual", biFormId: "2014-01-011", supportsDelivery: 0 });
    const resp = await worker.fetch(authedRequest(`/api/instant-services/catalogue/${service.id}/preview-form`), env);
    expect(resp.status).toBe(501);
  });

  it("404s for an inactive service -- discoverability is refused, same as the existing catalogue-detail route", async () => {
    const service = await createTestCheckoutService({ active: 0 });
    const resp = await worker.fetch(authedRequest(`/api/instant-services/catalogue/${service.id}/preview-form`), env);
    expect(resp.status).toBe(404);
  });

  it("404s for an unknown service id", async () => {
    const resp = await worker.fetch(authedRequest("/api/instant-services/catalogue/not-a-real-id/preview-form"), env);
    expect(resp.status).toBe(404);
  });

  it("returns 501 (not a crash, not a silent placeholder) when the engine-mapped form's original PDF isn't actually in R2 yet", async () => {
    const service = await createTestCheckoutService({ biFormId: "CCS-A-CDR-2016" }); // no env.BI_FORMS_LIBRARY.put() in this test
    const resp = await worker.fetch(authedRequest(`/api/instant-services/catalogue/${service.id}/preview-form`), env);
    expect(resp.status).toBe(501);
  });

  it("the public catalogue flags hasOfficialFormPreview for ANY previewable form, engine-mapped or not, and never for a restricted one", async () => {
    const mapped = await createTestCheckoutService({ serviceSlug: "mapped-form-service", biFormId: "CCS-A-CDR-2016" });
    const unmappedButPreviewable = await createTestCheckoutService({ serviceSlug: "unmapped-form-service", offeringType: "document_manual", biFormId: "2014-01-011", supportsDelivery: 0 });
    const restricted = await createTestCheckoutService({ serviceSlug: "restricted-form-service", offeringType: "document_manual", biFormId: "2015-08-006", supportsDelivery: 0 });

    const resp = await worker.fetch(authedRequest("/api/instant-services/catalogue"), env);
    const { services } = await resp.json();
    expect(services.find((s) => s.id === mapped.id).hasOfficialFormPreview).toBe(true);
    expect(services.find((s) => s.id === unmappedButPreviewable.id).hasOfficialFormPreview).toBe(true);
    expect(services.find((s) => s.id === restricted.id).hasOfficialFormPreview).toBe(false);
  });
});
