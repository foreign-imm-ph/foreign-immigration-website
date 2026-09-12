import { newId } from "../lib/crypto.js";
import { insertUniqueReference, logAudit } from "../lib/db.js";
import { checkHoneypot, checkFillTime, checkRateLimit } from "../lib/abuse.js";
import { json, requireFields, isValidEmail } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";
import { sendEnquiryAcknowledgement, sendStaffEnquiryNotification } from "../lib/email.js";
import { createConversation, insertCommunicationMessage, updateMessageTranslation } from "../lib/conversations.js";
import { normalizeCommunicationLanguage, detectLanguage, translateToEnglish } from "../lib/translation.js";
import { normalizePhoneNumber, isSupportedMobileCountry } from "../lib/phone.js";

// Phase 3.1: contact methods FIS actually operates today. Deliberately
// does NOT include whatsapp/sms/telegram/wechat — those channels are
// future-ready internally (see clients.preferred_communication_channel)
// but nothing sends a message through them yet, so the public form must
// never present them as available.
const CONTACT_METHODS = ["email", "phone_call", "portal"];

// Matches the 16 service slugs in src/contact.njk — kept in sync manually,
// same as the original docs/backend-requirements.md contract.
const SERVICE_SLUGS = new Set([
  "visa-applications", "work-visas", "extensions-compliance", "residency-status",
  "family-spousal", "corporate-mobility", "status-review", "motions-blacklist",
  "legal-support", "airport-vip", "lost-passport", "acr-icard", "exit-clearance",
  "document-verification", "complex-tailored", "property-transfer", "other",
]);

const PRIORITY_VALUES = new Set(["standard", "priority", "urgent"]);

// A client-submitted priority is never trusted directly — only these
// service/priority combinations are ever honored. Anything else (an
// unsupported service, or a priority not in that service's allowed set,
// including a manipulated hidden field) is silently downgraded to
// "standard" rather than rejected, so a generic enquiry can never become
// urgent just by editing form data.
const ALLOWED_PRIORITIES_BY_SERVICE = {
  "legal-support": new Set(["standard", "urgent"]),
  "airport-vip": new Set(["standard", "priority"]),
};

function resolvePriority(service, requestedPriority) {
  const requested = PRIORITY_VALUES.has(requestedPriority) ? requestedPriority : "standard";
  const allowedForService = ALLOWED_PRIORITIES_BY_SERVICE[service];
  if (!allowedForService) return "standard";
  return allowedForService.has(requested) ? requested : "standard";
}

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

  // Canonical communication-language validation. Known legacy free-text
  // values (from the four-option form this replaces) are accepted via the
  // normalizer for backward compatibility; anything else non-empty is
  // rejected outright rather than stored as an arbitrary string, closing
  // the gap the Phase 0 audit found. The field remains optional — a
  // missing/empty value is still allowed, same as before.
  const preferredLanguage = body.language ? normalizeCommunicationLanguage(body.language) : null;
  if (body.language && !preferredLanguage) {
    throw new HttpError(400, "Invalid communication language selection");
  }

  // Phase 3.1: the phone field is now specifically a phone number (paired
  // with an optional country selector), not a free-form "preferred contact
  // details" field — but the historical `phone` column is still just
  // whatever text the visitor entered, completely unmodified by
  // normalization succeeding or failing. `mobile_e164`/`phone_country` are
  // new, separate, additive facts, exactly like clients.phone vs
  // clients.mobile_e164 in Phase 3. An ambiguous number with no country
  // context is never guessed at — mobile_e164 simply stays null.
  const phoneCountry = body.phoneCountry ? String(body.phoneCountry).trim().toUpperCase() : null;
  if (phoneCountry && !isSupportedMobileCountry(phoneCountry)) {
    throw new HttpError(400, "Unsupported phone number country");
  }
  let mobileE164 = null;
  if (body.phone) {
    const normalization = normalizePhoneNumber(String(body.phone), phoneCountry);
    if (normalization.valid) mobileE164 = normalization.e164;
  }

  const preferredContactMethod = body.preferredContactMethod ? String(body.preferredContactMethod).trim() : null;
  if (preferredContactMethod && !CONTACT_METHODS.includes(preferredContactMethod)) {
    throw new HttpError(400, "Invalid preferred contact method selection");
  }

  const id = newId();
  const reference = await insertUniqueReference(env.DB, "enquiries");
  const priority = resolvePriority(body.service, body.priority);
  const description = String(body.description).trim().slice(0, 5000);

  await env.DB.prepare(
    `INSERT INTO enquiries
      (id, reference, full_name, email, phone, nationality, location, language, service_slug, description, priority,
       phone_country, mobile_e164, preferred_contact_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      reference,
      String(body.fullName).trim().slice(0, 200),
      String(body.email).trim().toLowerCase().slice(0, 200),
      body.phone ? String(body.phone).trim().slice(0, 60) : null,
      String(body.nationality).trim().slice(0, 100),
      body.location ? String(body.location).trim().slice(0, 150) : null,
      preferredLanguage,
      body.service,
      description,
      priority,
      phoneCountry,
      mobileE164,
      preferredContactMethod
    )
    .run();

  await logAudit(env.DB, {
    actorType: "system",
    actorIdOrEmail: "enquiry-form",
    action: "enquiry_created",
    targetTable: "enquiries",
    targetId: id,
    metadata: JSON.stringify({ priority }),
  });

  // Multilingual communications (Phase 1). The enquiry row above is already
  // safely committed by this point, so nothing below — including a
  // completely unavailable translation provider — can cause the enquiry
  // itself to be lost. Conversation/message creation is cheap, AI-free
  // database work; only the translation attempt can fail, and it fails in
  // isolation, leaving the original text and the enquiry intact.
  try {
    const conversationId = await createConversation(env.DB, { enquiryId: id, preferredLanguage });

    // Preference is not source language (a client may browse in one
    // language and write in another) — detected independently, never
    // assumed from preferredLanguage. detectLanguage() never throws; an
    // unavailable/failed provider resolves to 'und', not an exception.
    const sourceLanguage = await detectLanguage(env, description);
    const isEnglish = sourceLanguage === "en";

    const messageId = await insertCommunicationMessage(env.DB, {
      conversationId,
      senderType: "client",
      channel: "web",
      sourceLanguage,
      sourceText: description,
      targetLanguage: "en",
      translationStatus: isEnglish ? "not_required" : "pending",
      deliveryStatus: "sent", // already fully received from FIS's perspective; nothing to deliver
    });

    if (!isEnglish) {
      const result = await translateToEnglish(env, description, sourceLanguage);
      await updateMessageTranslation(env.DB, {
        id: messageId,
        targetText: result.text,
        translationStatus: result.status,
        translationProvider: result.provider,
      });
    }
  } catch (err) {
    console.error("Conversation/translation setup failed:", err.message);
  }

  // Email failures must not fail the whole request — the enquiry is already
  // safely stored, and staff can still see it even if a notification email
  // bounces.
  try {
    await sendEnquiryAcknowledgement(env, { to: body.email, fullName: body.fullName, reference });
  } catch (err) {
    console.error("Acknowledgement email failed:", err.message);
  }
  try {
    await sendStaffEnquiryNotification(env, { reference, serviceSlug: body.service, fullName: body.fullName, email: body.email, priority });
  } catch (err) {
    console.error("Staff notification email failed:", err.message);
  }

  return json({ reference }, { status: 201 });
}
