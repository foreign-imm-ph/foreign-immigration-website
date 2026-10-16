import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { createSubmission } from "../src/lib/biForms.js";
import { findOrCreateDraftOrder, startOrderApplication } from "../src/lib/checkout.js";
import { createTestClient, createSessionCookieFor, createTestApplication, createTestStaff, createTestCheckoutService, authedRequest, SITE_ORIGIN } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";

// Directive: "Service-based naming is authoritative" -- a customer (and
// staff) must see the SERVICE name ("Request for Travel Records"), never
// the raw technical BI form identifier ("CCS-A-CDR-2016"), as the primary
// heading. The identifier is preserved as a secondary technical reference.

describe("BI form naming: service-based heading, not the raw technical ID", () => {
  it("a submission linked to an Instant Services order shows the catalogue service's own title as the primary name", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const service = await createTestCheckoutService({ title: "Request for Travel Records", biFormId: "CCS-A-CDR-2016" });
    const order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
    const { submissionId } = await startOrderApplication(env.DB, order, service);

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submissionId}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const { submission } = await resp.json();
    expect(submission.serviceName).toBe("Request for Travel Records"); // the catalogue's own title, never invented here
    expect(submission.technicalReference).toBe("CCS-A-CDR-2016"); // preserved as the secondary reference
  });

  it("a submission with no linked order (a BI form staff assigned directly) falls back to the official form's own title, never the bare code", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const submission = await createSubmission(env.DB, {
      applicationId: application.id,
      clientId: client.id,
      biFormId: "CCS-A-CDR-2016",
      assignedByStaffEmail: staff.email,
    });

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}`, { cookie }), env);
    expect(resp.status).toBe(200);
    const { submission: body } = await resp.json();
    expect(body.serviceName).toBe("Request for Certified True Copy of Derogatory Records"); // coordinate-map.json's own formTitle
    expect(body.serviceName).not.toBe("CCS-A-CDR-2016");
    expect(body.technicalReference).toBe("CCS-A-CDR-2016");
  });
});

describe("Staff Portal BI form detail: friendly name primary, technical ID preserved", () => {
  let keypair;
  async function staffRequest(path, staffRow) {
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, { email: staffRow.email, aud: [env.CF_ACCESS_AUD], exp: Math.floor(Date.now() / 1000) + 300 });
    return worker.fetch(new Request(`${SITE_ORIGIN}${path}`, { headers: { "Cf-Access-Jwt-Assertion": jwt, Origin: SITE_ORIGIN } }), env);
  }

  it("shows the service name as the heading and the BI form number as a secondary reference", async () => {
    keypair = await generateTestAccessKeypair();
    const restoreFetch = mockAccessJwksEndpoint(env.CF_ACCESS_TEAM_DOMAIN, keypair.jwks);
    try {
      const client = await createTestClient();
      const service = await createTestCheckoutService({ title: "Request for Travel Records", biFormId: "CCS-A-CDR-2016" });
      const order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId: service.id });
      const { submissionId } = await startOrderApplication(env.DB, order, service);
      const staff = await createTestStaff({ role: "admin" });

      const resp = await staffRequest(`/staff/bi-forms/${submissionId}`, staff);
      expect(resp.status).toBe(200);
      const html = await resp.text();
      expect(html).toContain("<h1>Request for Travel Records</h1>");
      expect(html).toContain("Bureau of Immigration Form No. CCS-A-CDR-2016");
    } finally {
      restoreFetch();
    }
  });
});
