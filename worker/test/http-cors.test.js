// Regression coverage for a real bug caught during Phase 2 Stage 5.4's
// browser testing of the new BI-form questionnaire flow: an ERROR
// response (4xx/5xx) from the Worker previously reached the browser with
// no Access-Control-Allow-Origin header at all, since index.js only
// attached CORS headers on the success path, not inside
// withErrorHandling's catch block. A browser reports a missing CORS
// header as an opaque "CORS policy"/"Failed to fetch" error rather than
// exposing the real status/body to the calling page's JS -- so every
// cross-origin error response site-wide (not just this new feature) was
// silently unusable from the browser before this fix. See index.js's own
// comment for the full story.
import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { createSubmission, transitionStatus } from "../src/lib/biForms.js";
import { createTestClient, createSessionCookieFor, createTestStaff, authedRequest, SITE_ORIGIN } from "./helpers.js";

describe("CORS headers are present on error responses, not only success responses", () => {
  it("a 422 (validation error) response still carries Access-Control-Allow-Origin", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    const submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(422);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(SITE_ORIGIN);
  });

  it("a 404 response still carries Access-Control-Allow-Origin", async () => {
    const resp = await worker.fetch(authedRequest("/api/bi-forms/does-not-exist", {}), env);
    expect(resp.status).toBe(401); // not signed in -- still an error path, still needs the header
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(SITE_ORIGIN);
  });

  it("a 409 (invalid lifecycle transition) response still carries Access-Control-Allow-Origin", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const staff = await createTestStaff();
    let submission = await createSubmission(env.DB, { applicationId: null, clientId: client.id, biFormId: "CCS-A-CDR-2016", assignedByStaffEmail: staff.email });
    submission = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });

    const resp = await worker.fetch(authedRequest(`/api/bi-forms/${submission.id}/submit`, { method: "POST", cookie }), env);
    expect(resp.status).toBe(409);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(SITE_ORIGIN);
  });

  it("a 403 rejected-origin response still carries Access-Control-Allow-Origin (so the browser can at least see it was rejected)", async () => {
    const resp = await worker.fetch(
      new Request(`${SITE_ORIGIN}/api/bi-forms/x/submit`, { method: "POST", headers: { Origin: "https://evil.example" } }),
      env
    );
    expect(resp.status).toBe(403);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe(SITE_ORIGIN);
  });

  it("every response still carries the baseline security headers regardless of success/error", async () => {
    const resp = await worker.fetch(authedRequest("/api/bi-forms/does-not-exist", {}), env);
    expect(resp.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(resp.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
