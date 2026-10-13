// Shared test helpers: seed D1 rows directly (bypassing email/magic-link
// for speed where the test isn't specifically about that flow) and build
// authenticated requests against the real Worker entry point.
import { env } from "cloudflare:workers";
import { createSession } from "../src/lib/session.js";
import { newId } from "../src/lib/crypto.js";

export const SITE_ORIGIN = "https://foreignimmigration.ph"; // matches wrangler.toml PUBLIC_SITE_URL

export async function createTestClient(overrides = {}) {
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO clients (id, full_name, email, phone, nationality) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, overrides.fullName || "Test Client", overrides.email || `${id}@example.test`, overrides.phone || null, overrides.nationality || "Testlandian")
    .run();
  return env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first();
}

export async function createSessionCookieFor(client) {
  const { rawToken } = await createSession(env.DB, env, client.id);
  return `fis_session=${rawToken}`;
}

export async function createTestApplication(client, overrides = {}) {
  const id = newId();
  const reference = `FIS-TEST-${id.slice(0, 8)}`;
  await env.DB.prepare(
    "INSERT INTO applications (id, reference, client_id, service_slug, status) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, reference, client.id, overrides.serviceSlug || "visa-applications", overrides.status || "enquiry_received")
    .run();
  return env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
}

export async function createTestStaff(overrides = {}) {
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO staff (id, email, full_name, role, active) VALUES (?, ?, ?, ?, 1)"
  )
    .bind(id, overrides.email || `staff-${id.slice(0, 8)}@foreignimmigration.ph`, overrides.fullName || "Test Staff", overrides.role || "staff")
    .run();
  return env.DB.prepare("SELECT * FROM staff WHERE id = ?").bind(id).first();
}

export async function createBiFormSubmission(client, application, staff, overrides = {}) {
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO bi_form_submissions (id, application_id, client_id, bi_form_id, status, customer_answers_json, staff_answers_json, assigned_by_staff_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      application ? application.id : null,
      client.id,
      overrides.biFormId || "CCS-A-CDR-2016",
      overrides.status || "draft",
      overrides.customerAnswersJson || null,
      overrides.staffAnswersJson || null,
      staff ? staff.email : null
    )
    .run();
  return env.DB.prepare("SELECT * FROM bi_form_submissions WHERE id = ?").bind(id).first();
}

// Builds a Request with the headers every state-changing endpoint in this
// Worker requires in production (same-site Origin, for the CSRF check in
// lib/session.js isSameSiteOrigin) -- so a test deliberately checking CSRF
// rejection should build its own request without this helper instead.
export function authedRequest(path, { method = "GET", cookie, body, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      Origin: SITE_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`${SITE_ORIGIN}${path}`, init);
}
