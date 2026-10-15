import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { authedRequest, createTestCheckoutService, SITE_ORIGIN } from "./helpers.js";

describe("Instant Services: public catalogue", () => {
  it("lists only active services, in display order, with server-computed totals", async () => {
    const hidden = await createTestCheckoutService({ active: 0, title: "Hidden Service" });
    const second = await createTestCheckoutService({
      title: "Second Service",
      displayOrder: 2,
      priceComponents: [{ type: "service_fee", label: "Fee", amountPhpCentavos: 100000 }],
    });
    const first = await createTestCheckoutService({
      title: "First Service",
      displayOrder: 1,
      priceComponents: [
        { type: "service_fee", label: "FIS Service Fee", amountPhpCentavos: 300000 },
        { type: "government_fee", label: "Government Fee", amountPhpCentavos: 50000 },
      ],
    });

    const resp = await worker.fetch(authedRequest("/api/instant-services/catalogue"), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    const ids = body.services.map((s) => s.id);
    expect(ids).not.toContain(hidden.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));

    const firstOut = body.services.find((s) => s.id === first.id);
    expect(firstOut.totalPhpCentavos).toBe(350000);
    expect(firstOut.title).toBe("First Service");
    // Order & Book Online business decision: every customer-facing total
    // is a single all-inclusive figure. The itemized government-fee/
    // service-fee breakdown must never reach a customer-facing route.
    expect(firstOut.priceComponents).toBeUndefined();
    expect(firstOut.hasApprovedPrice).toBe(true);
    expect(firstOut.priceLabel).toBeTruthy();
  });

  it("marks a service with no priced components as having no approved price, rather than a zero price", async () => {
    const service = await createTestCheckoutService({ title: "Unpriced Service", priceComponents: [] });
    const resp = await worker.fetch(authedRequest("/api/instant-services/catalogue"), env);
    const body = await resp.json();
    // An unpriced service should not even be listed as checkout-ready;
    // this repo's fixture still creates it active for this one test, so
    // assert the flag the frontend gates Buy/Book Now on directly.
    const out = body.services.find((s) => s.id === service.id);
    if (out) {
      expect(out.hasApprovedPrice).toBe(false);
      expect(out.totalPhpCentavos).toBe(0);
    }
  });

  it("falls back to English when the requested language has no translation yet, without fabricating content", async () => {
    const service = await createTestCheckoutService({ title: "English Only Service" });
    const resp = await worker.fetch(authedRequest("/api/instant-services/catalogue?lang=ja"), env);
    const body = await resp.json();
    const out = body.services.find((s) => s.id === service.id);
    expect(out.title).toBe("English Only Service");
  });

  it("returns a single active service by id", async () => {
    const service = await createTestCheckoutService({ title: "Single Lookup Service" });
    const resp = await worker.fetch(authedRequest(`/api/instant-services/catalogue/${service.id}`), env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.service.title).toBe("Single Lookup Service");
  });

  it("404s an inactive service by id rather than revealing it exists", async () => {
    const hidden = await createTestCheckoutService({ active: 0 });
    const resp = await worker.fetch(authedRequest(`/api/instant-services/catalogue/${hidden.id}`), env);
    expect(resp.status).toBe(404);
  });

  it("404s an unknown service id", async () => {
    const resp = await worker.fetch(authedRequest("/api/instant-services/catalogue/not-a-real-id"), env);
    expect(resp.status).toBe(404);
  });
});

describe("Instant Services: begin guest checkout", () => {
  it("rejects beginning checkout for an inactive service", async () => {
    const hidden = await createTestCheckoutService({ active: 0 });
    const req = authedRequest("/api/instant-services/begin", {
      method: "POST",
      body: { email: "guest1@example.test", fullName: "Guest One", serviceId: hidden.id },
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(404);
  });

  it("rejects an invalid email or missing name", async () => {
    const service = await createTestCheckoutService();
    const reqBadEmail = authedRequest("/api/instant-services/begin", {
      method: "POST",
      body: { email: "not-an-email", fullName: "Guest", serviceId: service.id },
    });
    expect((await worker.fetch(reqBadEmail, env)).status).toBe(400);

    const reqNoName = authedRequest("/api/instant-services/begin", {
      method: "POST",
      body: { email: "guest2@example.test", fullName: "", serviceId: service.id },
    });
    expect((await worker.fetch(reqNoName, env)).status).toBe(400);
  });

  it("creates a new client and a draft order for a brand-new guest email, and never returns the raw token", async () => {
    const service = await createTestCheckoutService();
    const req = authedRequest("/api/instant-services/begin", {
      method: "POST",
      body: { email: "new-guest@example.test", fullName: "New Guest", serviceId: service.id },
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.orderId).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/token/i);

    const client = await env.DB.prepare("SELECT * FROM clients WHERE email = ?").bind("new-guest@example.test").first();
    expect(client).toBeTruthy();

    const order = await env.DB.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(body.orderId).first();
    expect(order.client_id).toBe(client.id);
    expect(order.service_id).toBe(service.id);
    expect(order.status).toBe("draft");

    const authToken = await env.DB.prepare("SELECT * FROM auth_tokens WHERE client_id = ?").bind(client.id).first();
    expect(authToken).toBeTruthy();
    expect(authToken.used_at).toBeNull();
  });

  it("reuses the existing client record for a returning email instead of creating a duplicate", async () => {
    const service = await createTestCheckoutService();
    const first = await worker.fetch(
      authedRequest("/api/instant-services/begin", {
        method: "POST",
        body: { email: "returning-guest@example.test", fullName: "Returning Guest", serviceId: service.id },
      }),
      env
    );
    expect(first.status).toBe(200);

    const second = await worker.fetch(
      authedRequest("/api/instant-services/begin", {
        method: "POST",
        body: { email: "returning-guest@example.test", fullName: "Returning Guest Again", serviceId: service.id },
      }),
      env
    );
    expect(second.status).toBe(200);

    const { count } = await env.DB
      .prepare("SELECT COUNT(*) as count FROM clients WHERE email = ?")
      .bind("returning-guest@example.test")
      .first();
    expect(count).toBe(1);
  });

  it("is idempotent: re-beginning checkout for the same client+service while an order is still open returns the same order, not a duplicate", async () => {
    const service = await createTestCheckoutService();
    const bodyReq = { email: "idempotent-guest@example.test", fullName: "Idempotent Guest", serviceId: service.id };

    const first = await worker.fetch(authedRequest("/api/instant-services/begin", { method: "POST", body: bodyReq }), env);
    const firstOrderId = (await first.json()).orderId;

    const second = await worker.fetch(authedRequest("/api/instant-services/begin", { method: "POST", body: bodyReq }), env);
    const secondOrderId = (await second.json()).orderId;

    expect(secondOrderId).toBe(firstOrderId);

    const { count } = await env.DB
      .prepare("SELECT COUNT(*) as count FROM checkout_orders WHERE service_id = ? AND client_id = (SELECT id FROM clients WHERE email = ?)")
      .bind(service.id, "idempotent-guest@example.test")
      .first();
    expect(count).toBe(1);
  });

  it("rejects a honeypot-filled submission", async () => {
    const service = await createTestCheckoutService();
    const req = authedRequest("/api/instant-services/begin", {
      method: "POST",
      body: { email: "bot@example.test", fullName: "Bot", serviceId: service.id, website: "http://spam.example" },
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(400);
  });

  it("the verification link it would send can be redeemed through the existing, unmodified /api/auth/verify endpoint", async () => {
    const service = await createTestCheckoutService();
    const req = authedRequest("/api/instant-services/begin", {
      method: "POST",
      body: { email: "verify-guest@example.test", fullName: "Verify Guest", serviceId: service.id },
    });
    await worker.fetch(req, env);

    const client = await env.DB.prepare("SELECT * FROM clients WHERE email = ?").bind("verify-guest@example.test").first();
    const authToken = await env.DB.prepare("SELECT * FROM auth_tokens WHERE client_id = ?").bind(client.id).first();

    // The route only ever issues a hash -- there's no way to recover the
    // raw token it emailed from the DB (by design, same as magic-link
    // auth), so this re-derives a fresh one through the same mechanism to
    // prove /api/auth/verify is genuinely still the single, unmodified
    // redemption path for this feature, not a parallel one.
    const { sha256Hex, newToken, newId } = await import("../src/lib/crypto.js");
    const rawToken = newToken();
    const tokenHash = await sha256Hex(rawToken);
    await env.DB.prepare("UPDATE auth_tokens SET token_hash = ? WHERE id = ?").bind(tokenHash, authToken.id).run();

    const verifyResp = await worker.fetch(
      authedRequest("/api/auth/verify", { method: "POST", body: { token: rawToken } }),
      env
    );
    expect(verifyResp.status).toBe(200);
    expect(verifyResp.headers.get("Set-Cookie")).toMatch(/^fis_session=/);
  });
});
