import { newId } from "../lib/crypto.js";
import { insertUniqueReference, logAudit } from "../lib/db.js";
import { checkHoneypot, checkFillTime, checkRateLimit } from "../lib/abuse.js";
import { json, requireFields, isValidEmail } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";
import { sendEnquiryAcknowledgement, sendStaffEnquiryNotification } from "../lib/email.js";

// Matches the 16 service slugs in src/contact.njk — kept in sync manually,
// same as the original docs/backend-requirements.md contract.
const SERVICE_SLUGS = new Set([
  "visa-applications", "work-visas", "extensions-compliance", "residency-status",
  "family-spousal", "corporate-mobility", "status-review", "motions-blacklist",
  "legal-support", "airport-vip", "lost-passport", "acr-icard", "exit-clearance",
  "document-verification", "complex-tailored", "other",
]);

export async function handleCreateEnquiry(request, env) {
  const body = await request.json().catch(() => {
    throw new HttpError(400, "Invalid request body");
  });

  // Anti-abuse, cheapest checks first, before touching the database for
  // anything but the rate-limit counter itself.
  checkHoneypot(body);
  checkFillTime(body);
  await checkRateLimit(env.DB, request, "enquiry", { maxEvents: 5, windowMinutes: 15 });

  requireFields(body, ["fullName", "email", "nationality", "service", "description"]);
  if (!isValidEmail(body.email)) throw new HttpError(400, "Please provide a valid email address");
  if (!SERVICE_SLUGS.has(body.service)) throw new HttpError(400, "Invalid service selection");

  const id = newId();
  const reference = await insertUniqueReference(env.DB, "enquiries");

  await env.DB.prepare(
    `INSERT INTO enquiries
      (id, reference, full_name, email, phone, nationality, location, language, service_slug, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      reference,
      String(body.fullName).trim().slice(0, 200),
      String(body.email).trim().toLowerCase().slice(0, 200),
      body.phone ? String(body.phone).trim().slice(0, 60) : null,
      String(body.nationality).trim().slice(0, 100),
      body.location ? String(body.location).trim().slice(0, 150) : null,
      body.language ? String(body.language).trim().slice(0, 40) : null,
      body.service,
      String(body.description).trim().slice(0, 5000)
    )
    .run();

  await logAudit(env.DB, { actorType: "system", actorIdOrEmail: "enquiry-form", action: "enquiry_created", targetTable: "enquiries", targetId: id });

  // Email failures must not fail the whole request — the enquiry is already
  // safely stored, and staff can still see it even if a notification email
  // bounces.
  try {
    await sendEnquiryAcknowledgement(env, { to: body.email, fullName: body.fullName, reference });
  } catch (err) {
    console.error("Acknowledgement email failed:", err.message);
  }
  try {
    await sendStaffEnquiryNotification(env, { reference, serviceSlug: body.service, fullName: body.fullName, email: body.email });
  } catch (err) {
    console.error("Staff notification email failed:", err.message);
  }

  return json({ reference }, { status: 201 });
}
