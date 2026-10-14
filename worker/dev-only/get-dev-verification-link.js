#!/usr/bin/env node
// DEV-ONLY helper: real transactional email never sends from a local
// `wrangler dev` session (there's no real Resend key here), so there is no
// other way to get the verification link a customer would normally receive
// by email. This script finds the most recent, still-unused auth_tokens row
// for the given email (created by either /api/instant-services/begin or
// /portal/login/'s magic-link request), re-issues a fresh raw token for it
// (the real one is only ever stored as a hash, by design -- see
// worker/src/lib/session.js -- so it can't be recovered, only replaced),
// and prints the exact URL to open.
//
// This reads/writes the LOCAL D1 database only (via `wrangler d1 execute
// --local`), through the same hashing scheme the Worker itself uses
// (SHA-256 of the raw token). It has no effect on, and cannot reach, any
// remote/production database -- wrangler requires an explicit --remote
// flag for that, which this script never passes.
//
// Usage:
//   node dev-only/get-dev-verification-link.js guest@example.test
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const email = process.argv[2];
if (!email) {
  console.error("Usage: node dev-only/get-dev-verification-link.js <email>");
  process.exit(1);
}

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "fis-backend", "--local", "--json", "--command", sql],
    { encoding: "utf8", cwd: __dirname + "/.." }
  );
  // wrangler prints occasional non-JSON warning lines above the JSON
  // payload; find the array/object the --json flag actually produces.
  const jsonStart = out.indexOf("[");
  const parsed = JSON.parse(out.slice(jsonStart));
  return parsed[0].results;
}

const clients = d1(`SELECT id, full_name FROM clients WHERE email = '${email.replace(/'/g, "''")}'`);
if (!clients.length) {
  console.error(`No client found for ${email}. Start a request first -- either:\n` +
    `  - the Instant Services "Apply & Pay Now" form at /instant-services/apply/?service=<id>, or\n` +
    `  - the Client Portal sign-in form at /portal/login/\n` +
    `using this exact email address.`);
  process.exit(1);
}
const clientId = clients[0].id;

const tokens = d1(
  `SELECT id FROM auth_tokens WHERE client_id = '${clientId}' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`
);
if (!tokens.length) {
  console.error(`No pending (unused) verification link for ${email}. Submit the form again, then re-run this script.`);
  process.exit(1);
}
const tokenRowId = tokens[0].id;

const rawToken = crypto.randomBytes(32).toString("base64url");
const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

d1(
  `UPDATE auth_tokens SET token_hash = '${tokenHash}', expires_at = datetime('now', '+15 minutes'), used_at = NULL WHERE id = '${tokenRowId}'`
);

const orders = d1(
  `SELECT id FROM checkout_orders WHERE client_id = '${clientId}' AND status IN ('draft','awaiting_payment','awaiting_verification') ORDER BY created_at DESC LIMIT 1`
);

console.log(`\nVerification link for ${email} (valid 15 minutes, single-use):\n`);
if (orders.length) {
  console.log(`  http://localhost:8080/instant-services/verify/?token=${rawToken}&order=${orders[0].id}&lang=en\n`);
} else {
  console.log(`  http://localhost:8080/portal/verify/?token=${rawToken}\n`);
  console.log(`(No open Instant Services order found for this email -- printing the Client Portal sign-in link instead.)\n`);
}
