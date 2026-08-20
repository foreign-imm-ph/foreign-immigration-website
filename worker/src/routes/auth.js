import { newId, newToken, sha256Hex } from "../lib/crypto.js";
import { getClientByEmail, logAudit } from "../lib/db.js";
import { checkRateLimit } from "../lib/abuse.js";
import { createSession, sessionCookieHeader, destroySession, getSessionClient } from "../lib/session.js";
import { json, isValidEmail } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";
import { sendMagicLink } from "../lib/email.js";

const MAGIC_LINK_TTL_MINUTES = 15;

// Always returns the same response whether or not the email matches a real
// client — so this endpoint can never be used to enumerate who is (or
// isn't) a client.
export async function handleRequestMagicLink(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();

  await checkRateLimit(env.DB, request, "magic_link", { maxEvents: 5, windowMinutes: 15 });

  if (isValidEmail(email)) {
    const client = await getClientByEmail(env.DB, email);
    if (client) {
      const rawToken = newToken();
      const tokenHash = await sha256Hex(rawToken);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000).toISOString();

      await env.DB.prepare(
        "INSERT INTO auth_tokens (id, client_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
      )
        .bind(newId(), client.id, tokenHash, expiresAt)
        .run();

      const url = `${env.PUBLIC_SITE_URL}/portal/verify/?token=${rawToken}`;
      try {
        await sendMagicLink(env, { to: email, url });
      } catch (err) {
        console.error("Magic link email failed:", err.message);
      }
    }
  }

  return json({ message: "If that email is registered, a sign-in link has been sent." });
}

export async function handleVerifyMagicLink(request, env) {
  const body = await request.json().catch(() => ({}));
  const rawToken = String(body.token || "");
  if (!rawToken) throw new HttpError(400, "Missing token");

  const tokenHash = await sha256Hex(rawToken);
  const authToken = await env.DB.prepare(
    "SELECT * FROM auth_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')"
  )
    .bind(tokenHash)
    .first();

  if (!authToken) {
    throw new HttpError(400, "This sign-in link is invalid or has expired. Please request a new one.");
  }

  // Single-use: mark consumed before issuing a session, so a replayed
  // request can never redeem the same token twice.
  await env.DB.prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?")
    .bind(authToken.id)
    .run();

  const { rawToken: sessionToken } = await createSession(env.DB, env, authToken.client_id);
  await logAudit(env.DB, { actorType: "client", actorIdOrEmail: authToken.client_id, action: "signed_in" });

  return json(
    { ok: true },
    { headers: { "Set-Cookie": sessionCookieHeader(env, sessionToken) } }
  );
}

export async function handleLogout(request, env) {
  await destroySession(request, env);
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookieHeader(env, "", { clear: true }) } });
}

export async function handleMe(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) return json({ authenticated: false }, { status: 401 });
  return json({
    authenticated: true,
    client: { id: client.id, fullName: client.full_name, email: client.email },
  });
}
