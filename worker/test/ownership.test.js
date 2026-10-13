import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { createTestClient, createSessionCookieFor, createTestApplication, authedRequest } from "./helpers.js";

// The single invariant worker/src/routes/applications.js exists to enforce:
// every query touching an application is scoped to the SESSION's client_id,
// never a client-supplied value. These tests attack that invariant directly
// -- a regression here is a real cross-customer data leak, not a cosmetic bug.
describe("application ownership", () => {
  it("a client can list and read their own application", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);

    const respList = await worker.fetch(authedRequest("/api/applications", { cookie }), env);
    expect(respList.status).toBe(200);
    const { applications } = await respList.json();
    expect(applications.map((a) => a.id)).toContain(application.id);

    const respGet = await worker.fetch(authedRequest(`/api/applications/${application.id}`, { cookie }), env);
    expect(respGet.status).toBe(200);
    const body = await respGet.json();
    expect(body.application.id).toBe(application.id);
  });

  it("client B cannot read client A's application by ID, even knowing the real ID", async () => {
    const clientA = await createTestClient();
    const applicationA = await createTestApplication(clientA);
    const clientB = await createTestClient();
    const cookieB = await createSessionCookieFor(clientB);

    const resp = await worker.fetch(authedRequest(`/api/applications/${applicationA.id}`, { cookie: cookieB }), env);
    expect(resp.status).toBe(404); // not 403 -- existence is not confirmed either
  });

  it("client B's own application list never includes client A's applications", async () => {
    const clientA = await createTestClient();
    await createTestApplication(clientA);
    const clientB = await createTestClient();
    const cookieB = await createSessionCookieFor(clientB);
    await createTestApplication(clientB);

    const resp = await worker.fetch(authedRequest("/api/applications", { cookie: cookieB }), env);
    const { applications } = await resp.json();
    for (const app of applications) {
      const row = await env.DB.prepare("SELECT client_id FROM applications WHERE id = ?").bind(app.id).first();
      expect(row.client_id).toBe(clientB.id);
    }
  });

  it("a made-up application ID that matches no row at all returns 404, not a crash", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const resp = await worker.fetch(authedRequest("/api/applications/does-not-exist-at-all", { cookie }), env);
    expect(resp.status).toBe(404);
  });

  it("an unauthenticated request to a real application ID is rejected before any ownership check runs", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}`), env); // no cookie
    expect(resp.status).toBe(401);
  });
});
