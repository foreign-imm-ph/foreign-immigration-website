import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker from "../src/index.js";
import { requireStaff, getAccessIdentity } from "../src/lib/staffAuth.js";
import { createTestStaff } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";

// lib/staffAuth.js caches the fetched JWKS for 10 minutes, keyed globally
// (not per team domain) -- so every test in this file must share one
// keypair/JWKS rather than generating a fresh one per test, or only the
// first test's key would ever actually get verified against.
let keypair;
let restoreFetch;

beforeAll(async () => {
  keypair = await generateTestAccessKeypair();
  restoreFetch = mockAccessJwksEndpoint(env.CF_ACCESS_TEAM_DOMAIN, keypair.jwks);
});

afterAll(() => {
  restoreFetch();
});

function futureExp(seconds = 300) {
  return Math.floor(Date.now() / 1000) + seconds;
}

describe("staff authentication (Cloudflare Access JWT verification + allow-list)", () => {
  it("a request with no Access JWT header is never treated as staff", async () => {
    const identity = await getAccessIdentity(new Request("https://example.test/"), env);
    expect(identity).toBeNull();
    const staff = await requireStaff(new Request("https://example.test/"), env);
    expect(staff).toBeNull();
  });

  it("a correctly-signed, current, correct-audience token resolves the real staff email", async () => {
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, {
      email: "verified-staff@foreignimmigration.ph",
      aud: [env.CF_ACCESS_AUD],
      exp: futureExp(),
    });
    const req = new Request("https://example.test/", { headers: { "Cf-Access-Jwt-Assertion": jwt } });
    const identity = await getAccessIdentity(req, env);
    expect(identity).toBe("verified-staff@foreignimmigration.ph");
  });

  it("Access verification succeeding is not enough on its own -- the email must also be on our staff allow-list (defense in depth)", async () => {
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, {
      email: "not-in-our-staff-table@foreignimmigration.ph",
      aud: [env.CF_ACCESS_AUD],
      exp: futureExp(),
    });
    const req = new Request("https://example.test/", { headers: { "Cf-Access-Jwt-Assertion": jwt } });
    // Access itself would accept this identity -- our own check must not.
    const identity = await getAccessIdentity(req, env);
    expect(identity).toBe("not-in-our-staff-table@foreignimmigration.ph");
    const staff = await requireStaff(req, env);
    expect(staff).toBeNull();
  });

  it("an allow-listed but deactivated staff account is rejected", async () => {
    const email = "deactivated-staff@foreignimmigration.ph";
    const { newId } = await import("../src/lib/crypto.js");
    await env.DB.prepare("INSERT INTO staff (id, email, full_name, role, active) VALUES (?, ?, 'Deactivated', 'staff', 0)")
      .bind(newId(), email)
      .run();
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, { email, aud: [env.CF_ACCESS_AUD], exp: futureExp() });
    const req = new Request("https://example.test/", { headers: { "Cf-Access-Jwt-Assertion": jwt } });
    const staff = await requireStaff(req, env);
    expect(staff).toBeNull();
  });

  it("a valid, allow-listed, currently-active staff member is resolved", async () => {
    const staffRow = await createTestStaff({ email: "active-staff@foreignimmigration.ph" });
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, { email: staffRow.email, aud: [env.CF_ACCESS_AUD], exp: futureExp() });
    const req = new Request("https://example.test/", { headers: { "Cf-Access-Jwt-Assertion": jwt } });
    const resolved = await requireStaff(req, env);
    expect(resolved).not.toBeNull();
    expect(resolved.id).toBe(staffRow.id);
  });

  it("an expired token is rejected even with a valid signature and audience", async () => {
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, {
      email: "active-staff@foreignimmigration.ph",
      aud: [env.CF_ACCESS_AUD],
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const req = new Request("https://example.test/", { headers: { "Cf-Access-Jwt-Assertion": jwt } });
    expect(await getAccessIdentity(req, env)).toBeNull();
  });

  it("a token for the wrong Access application (audience) is rejected", async () => {
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, {
      email: "active-staff@foreignimmigration.ph",
      aud: ["some-completely-different-access-application-aud"],
      exp: futureExp(),
    });
    const req = new Request("https://example.test/", { headers: { "Cf-Access-Jwt-Assertion": jwt } });
    expect(await getAccessIdentity(req, env)).toBeNull();
  });

  it("a tampered signature is rejected", async () => {
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, {
      email: "active-staff@foreignimmigration.ph",
      aud: [env.CF_ACCESS_AUD],
      exp: futureExp(),
    });
    const [h, p, s] = jwt.split(".");
    const tamperedSig = s.slice(0, -4) + (s.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
    const req = new Request("https://example.test/", { headers: { "Cf-Access-Jwt-Assertion": `${h}.${p}.${tamperedSig}` } });
    expect(await getAccessIdentity(req, env)).toBeNull();
  });

  it("a malformed (non-JWT) header value is rejected without throwing", async () => {
    const req = new Request("https://example.test/", { headers: { "Cf-Access-Jwt-Assertion": "not.a.jwt.at.all.too-many-parts" } });
    expect(await getAccessIdentity(req, env)).toBeNull();
  });

  it("/staff/* refuses a request with no Access JWT at all", async () => {
    const resp = await worker.fetch(new Request("https://example.test/staff/"), env);
    expect(resp.status).toBe(401);
  });

  it("/staff/* refuses a request whose Access identity isn't on the staff allow-list", async () => {
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, {
      email: "random-person@example.test",
      aud: [env.CF_ACCESS_AUD],
      exp: futureExp(),
    });
    const resp = await worker.fetch(new Request("https://example.test/staff/", { headers: { "Cf-Access-Jwt-Assertion": jwt } }), env);
    expect(resp.status).toBe(401);
  });

  it("/staff/* accepts a valid, allow-listed staff member", async () => {
    const staffRow = await createTestStaff({ email: "portal-staff@foreignimmigration.ph" });
    const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, { email: staffRow.email, aud: [env.CF_ACCESS_AUD], exp: futureExp() });
    const resp = await worker.fetch(new Request("https://example.test/staff/", { headers: { "Cf-Access-Jwt-Assertion": jwt } }), env);
    expect(resp.status).toBe(200);
  });

  it("DEV_STAFF_BYPASS_EMAIL resolves an active allow-listed staff member with no Access JWT at all, but only when that var is actually set", async () => {
    const staffRow = await createTestStaff({ email: "dev-bypass-staff@foreignimmigration.ph" });
    const req = new Request("https://example.test/");

    // Without the var set, a request with no JWT is still rejected --
    // this dev-only path must never be reachable by accident.
    const resolvedWithoutVar = await requireStaff(req, env);
    expect(resolvedWithoutVar).toBeNull();

    const resolved = await requireStaff(req, { ...env, DEV_STAFF_BYPASS_EMAIL: staffRow.email });
    expect(resolved).not.toBeNull();
    expect(resolved.id).toBe(staffRow.id);
  });

  it("DEV_STAFF_BYPASS_EMAIL set to an unknown or deactivated email resolves to null, same as the real Access path", async () => {
    const req = new Request("https://example.test/");
    const resolved = await requireStaff(req, { ...env, DEV_STAFF_BYPASS_EMAIL: "nobody-here@foreignimmigration.ph" });
    expect(resolved).toBeNull();
  });
});
