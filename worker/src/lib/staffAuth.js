// Verifies a Cloudflare Access JWT (the Cf-Access-Jwt-Assertion header Access
// injects once a staff member has signed in). No custom staff auth is built —
// Access does the identity work; this just checks Access's own signature so
// the Worker can trust the staff email it reports.
//
// Requires two non-secret vars (see wrangler.toml): CF_ACCESS_TEAM_DOMAIN and
// CF_ACCESS_AUD, both from the Access application's Overview page.

let cachedJwks = null;
let cachedJwksAt = 0;
const JWKS_CACHE_MS = 10 * 60 * 1000;

async function getJwks(teamDomain) {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksAt < JWKS_CACHE_MS) return cachedJwks;
  const resp = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!resp.ok) throw new Error("Could not fetch Access JWKS");
  cachedJwks = await resp.json();
  cachedJwksAt = now;
  return cachedJwks;
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson(str) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(str)));
}

// Returns the verified staff email, or null if the request isn't a valid,
// current Access-authenticated request.
export async function getAccessIdentity(request, env) {
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) return null;
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;

  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = base64UrlDecodeJson(headerB64);
    payload = base64UrlDecodeJson(payloadB64);
  } catch {
    return null;
  }

  if (payload.aud && !payload.aud.includes(env.CF_ACCESS_AUD)) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;

  const jwks = await getJwks(env.CF_ACCESS_TEAM_DOMAIN);
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signedData);
  if (!valid) return null;

  return payload.email || null;
}

// Cross-checks the Access-verified email against our own staff allow-list —
// defense in depth, per the plan's two-independent-checks approach.
export async function requireStaff(request, env) {
  const email = await getAccessIdentity(request, env);
  if (!email) return null;
  const staff = await env.DB.prepare("SELECT * FROM staff WHERE email = ? AND active = 1")
    .bind(email.toLowerCase())
    .first();
  return staff || null;
}
