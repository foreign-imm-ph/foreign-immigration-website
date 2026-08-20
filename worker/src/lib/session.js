import { newId, newToken, sha256Hex } from "./crypto.js";

const SESSION_COOKIE = "fis_session";
const SESSION_TTL_DAYS = 30;

function cookieDomain(env) {
  try {
    return new URL(env.PUBLIC_SITE_URL).hostname;
  } catch {
    return null;
  }
}

export async function createSession(db, env, clientId) {
  const rawToken = newToken();
  const tokenHash = await sha256Hex(rawToken);
  const id = newId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000).toISOString();
  await db
    .prepare("INSERT INTO sessions (id, client_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, clientId, tokenHash, expiresAt)
    .run();
  return { rawToken, expiresAt };
}

export function sessionCookieHeader(env, rawToken, { clear = false } = {}) {
  const domain = cookieDomain(env);
  const domainAttr = domain ? `Domain=.${domain.replace(/^www\./, "")}; ` : "";
  const maxAge = clear ? 0 : SESSION_TTL_DAYS * 86400;
  const value = clear ? "" : rawToken;
  return `${SESSION_COOKIE}=${value}; ${domainAttr}Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

// Resolves the authenticated client for a request, or null.
// This is the ONLY place session cookies are read and checked — every
// route that needs the caller's identity goes through this function.
export async function getSessionClient(request, env) {
  const raw = readCookie(request, "fis_session");
  if (!raw) return null;

  const tokenHash = await sha256Hex(raw);
  const session = await env.DB.prepare(
    "SELECT * FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')"
  )
    .bind(tokenHash)
    .first();
  if (!session) return null;

  const client = await env.DB.prepare("SELECT * FROM clients WHERE id = ?")
    .bind(session.client_id)
    .first();
  if (!client) return null;

  // Best-effort activity timestamp; failure here must never block the request.
  env.DB.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?")
    .bind(session.id)
    .run()
    .catch(() => {});

  return client;
}

export async function destroySession(request, env) {
  const raw = readCookie(request, "fis_session");
  if (!raw) return;
  const tokenHash = await sha256Hex(raw);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

// CSRF: state-changing requests must originate from our own site. Cheap,
// no extra library — checked against Origin (falling back to Referer).
export function isSameSiteOrigin(request, env) {
  const origin = request.headers.get("Origin") || request.headers.get("Referer");
  if (!origin) return false;
  try {
    const originHost = new URL(origin).hostname;
    const siteHost = new URL(env.PUBLIC_SITE_URL).hostname;
    return originHost === siteHost || originHost.endsWith(`.${siteHost}`);
  } catch {
    return false;
  }
}
