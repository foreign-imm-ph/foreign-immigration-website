import { newId, sha256Hex } from "./crypto.js";
import { HttpError } from "./storage.js";

// Layered, deliberately simple anti-abuse for public endpoints — no
// Turnstile dependency, so nothing here can become unreachable from
// mainland China. Each check is cheap and independent of the others.

export function checkHoneypot(body) {
  // The frontend renders a hidden field real users never fill in;
  // a non-empty value here is a strong bot signal.
  if (body.website) throw new HttpError(400, "Invalid submission");
}

export function checkFillTime(body, { minSeconds = 3 } = {}) {
  const startedAt = Number(body.formRenderedAt);
  if (!startedAt || Number.isNaN(startedAt)) throw new HttpError(400, "Invalid submission");
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  if (elapsedSeconds < minSeconds) throw new HttpError(429, "Please try again");
}

export async function checkRateLimit(db, request, bucket, { maxEvents = 5, windowMinutes = 15 } = {}) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256Hex(ip);

  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count } = await db
    .prepare(
      "SELECT COUNT(*) as count FROM rate_limit_events WHERE bucket = ? AND ip_hash = ? AND created_at > ?"
    )
    .bind(bucket, ipHash, windowStart)
    .first();

  if (count >= maxEvents) {
    throw new HttpError(429, "Too many requests — please try again later");
  }

  await db
    .prepare("INSERT INTO rate_limit_events (id, bucket, ip_hash) VALUES (?, ?, ?)")
    .bind(newId(), bucket, ipHash)
    .run();
}
