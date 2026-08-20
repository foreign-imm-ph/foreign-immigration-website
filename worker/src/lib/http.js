import { HttpError } from "./storage.js";

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...securityHeaders(),
      ...(init.headers || {}),
    },
  });
}

export function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

export function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.PUBLIC_SITE_URL,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Filename",
  };
}

export async function withErrorHandling(handler) {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.message }, { status: err.status });
    }
    // Never leak internals or stack traces to the client; log without PII.
    console.error("Unhandled error:", err.message);
    return json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => !body[f] || String(body[f]).trim() === "");
  if (missing.length) {
    throw new HttpError(400, `Missing required field(s): ${missing.join(", ")}`);
  }
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}
