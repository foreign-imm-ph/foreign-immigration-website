// Only standard Web Crypto primitives — no hand-rolled cryptography.

export function newId() {
  return crypto.randomUUID();
}

// URL-safe random token for magic links / session identifiers.
export function newToken(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return base64UrlEncode(arr);
}

export async function sha256Hex(input) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Non-sequential human-readable reference, e.g. FIS-2026-4Q8K2.
export function generateReference(year = new Date().getUTCFullYear()) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  const arr = crypto.getRandomValues(new Uint8Array(5));
  let suffix = "";
  for (const b of arr) suffix += alphabet[b % alphabet.length];
  return `FIS-${year}-${suffix}`;
}
