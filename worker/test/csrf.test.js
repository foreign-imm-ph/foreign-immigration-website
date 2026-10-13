import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { createTestClient, createSessionCookieFor } from "./helpers.js";

describe("CSRF protection (same-site Origin check on state-changing requests)", () => {
  it("a POST from a foreign Origin is rejected, even with a valid session cookie", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const req = new Request("https://foreignimmigration.ph/api/profile", {
      method: "PATCH",
      headers: { Origin: "https://attacker.example", Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "Hijacked Name" }),
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(403);
  });

  it("a POST with no Origin or Referer at all is rejected", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const req = new Request("https://foreignimmigration.ph/api/profile", {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "No Origin At All" }),
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(403);
  });

  it("a POST from the real site Origin is allowed through to the handler", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const req = new Request("https://foreignimmigration.ph/api/profile", {
      method: "PATCH",
      headers: { Origin: "https://foreignimmigration.ph", Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "Legitimate Update" }),
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(200);
  });

  it("GET requests are never subject to the Origin check (read-only, no state change)", async () => {
    const req = new Request("https://foreignimmigration.ph/api/auth/me", { headers: { Origin: "https://attacker.example" } });
    const resp = await worker.fetch(req, env);
    // Rejected for lacking a session, not for the foreign Origin -- 401, not 403.
    expect(resp.status).toBe(401);
  });
});
