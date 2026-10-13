import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { createTestClient, authedRequest, SITE_ORIGIN } from "./helpers.js";

describe("customer authentication (magic link + session)", () => {
  it("requesting a magic link for an unknown email returns the same generic message as a known one (no account enumeration)", async () => {
    const known = await createTestClient({ email: "known@example.test" });
    const reqKnown = authedRequest("/api/auth/magic-link", { method: "POST", body: { email: known.email } });
    const reqUnknown = authedRequest("/api/auth/magic-link", { method: "POST", body: { email: "nobody-here@example.test" } });

    const [respKnown, respUnknown] = await Promise.all([worker.fetch(reqKnown, env), worker.fetch(reqUnknown, env)]);
    expect(respKnown.status).toBe(200);
    expect(respUnknown.status).toBe(200);
    expect(await respKnown.clone().json()).toEqual(await respUnknown.clone().json());
  });

  it("verifying a bogus token is rejected", async () => {
    const req = authedRequest("/api/auth/verify", { method: "POST", body: { token: "not-a-real-token" } });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(400);
  });

  it("a full magic-link round trip issues a working session", async () => {
    const client = await createTestClient();

    // The route itself (handleRequestMagicLink) never returns the raw
    // token -- it only ever reaches the client via email, which this
    // local test environment doesn't send. So this test inserts an
    // auth_tokens row the same way that route does (same hash scheme),
    // which is the realistic way to get a verifiable raw token without
    // depending on email delivery, and still exercises the real
    // handleVerifyMagicLink route end to end.
    const { sha256Hex, newToken, newId } = await import("../src/lib/crypto.js");
    const rawToken = newToken();
    const tokenHash = await sha256Hex(rawToken);
    await env.DB.prepare(
      "INSERT INTO auth_tokens (id, client_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', '+15 minutes'))"
    )
      .bind(newId(), client.id, tokenHash)
      .run();

    const reqVerify = authedRequest("/api/auth/verify", { method: "POST", body: { token: rawToken } });
    const respVerify = await worker.fetch(reqVerify, env);
    expect(respVerify.status).toBe(200);
    const setCookie = respVerify.headers.get("Set-Cookie");
    expect(setCookie).toMatch(/^fis_session=/);
    const cookie = setCookie.split(";")[0];

    const reqMe = authedRequest("/api/auth/me", { cookie });
    const respMe = await worker.fetch(reqMe, env);
    expect(respMe.status).toBe(200);
    const meBody = await respMe.json();
    expect(meBody.authenticated).toBe(true);
    expect(meBody.client.id).toBe(client.id);

    // Single-use: the same raw token must not work a second time.
    const reqVerifyAgain = authedRequest("/api/auth/verify", { method: "POST", body: { token: rawToken } });
    const respVerifyAgain = await worker.fetch(reqVerifyAgain, env);
    expect(respVerifyAgain.status).toBe(400);
  });

  it("logging out clears the session so /api/auth/me is no longer authenticated", async () => {
    const client = await createTestClient();
    const { createSession, sessionCookieHeader } = await import("../src/lib/session.js");
    const { rawToken } = await createSession(env.DB, env, client.id);
    const cookie = `fis_session=${rawToken}`;

    const reqLogout = authedRequest("/api/auth/logout", { method: "POST", cookie });
    const respLogout = await worker.fetch(reqLogout, env);
    expect(respLogout.status).toBe(200);

    const reqMe = authedRequest("/api/auth/me", { cookie });
    const respMe = await worker.fetch(reqMe, env);
    expect(respMe.status).toBe(401);
  });

  it("an unauthenticated request to /api/auth/me is rejected, not defaulted to any identity", async () => {
    const req = new Request(`${SITE_ORIGIN}/api/auth/me`);
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(401);
  });
});
