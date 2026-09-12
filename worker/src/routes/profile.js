import { getSessionClient } from "../lib/session.js";
import { json, requireFields } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";
import { CANONICAL_LANGUAGES } from "../lib/translation.js";
import { normalizePhoneNumber, isSupportedMobileCountry } from "../lib/phone.js";
import { getConsentStatusMap, setClientConsent, isValidConsentChannel, isValidConsentStatus } from "../lib/consents.js";

// Preferred communication channel — a separate fact from preferred
// language (Phase 1) and from any specific contact address, and from
// Future Messaging Permissions (client_channel_consents), which remains
// entirely separate. Phase 3.1 correction: a client can only newly SELECT
// a channel FIS can actually use today — 'portal' and 'email'. The four
// external channel identifiers (sms/whatsapp/telegram/wechat) remain
// valid values elsewhere (consent records, external identity records, and
// any value already stored on an existing client from before this
// correction) — this allowlist only governs what a NEW self-service
// update may set, so it deliberately does not reject reading back an
// existing stored value, only writing a new inactive one.
const ACTIVE_COMMUNICATION_CHANNELS = ["portal", "email"];

export async function handleGetProfile(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");
  const consents = await getConsentStatusMap(env.DB, client.id);
  return json({
    fullName: client.full_name,
    email: client.email,
    phone: client.phone,
    nationality: client.nationality,
    preferredCommunicationLanguage: client.preferred_communication_language,
    preferredCommunicationChannel: client.preferred_communication_channel,
    mobileE164: client.mobile_e164,
    consents,
  });
}

export async function handleUpdateProfile(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");

  const body = await request.json().catch(() => {
    throw new HttpError(400, "Invalid request body");
  });

  const fullName = body.fullName ? String(body.fullName).trim().slice(0, 200) : client.full_name;
  const phone = body.phone !== undefined ? String(body.phone).trim().slice(0, 60) || null : client.phone;
  const nationality = body.nationality !== undefined ? String(body.nationality).trim().slice(0, 100) || null : client.nationality;

  let preferredCommunicationLanguage = client.preferred_communication_language;
  if (body.preferredCommunicationLanguage !== undefined) {
    const value = String(body.preferredCommunicationLanguage).trim();
    if (value && !CANONICAL_LANGUAGES.includes(value) && value !== "other") {
      throw new HttpError(400, "Invalid preferred communication language");
    }
    preferredCommunicationLanguage = value || null;
  }

  let preferredCommunicationChannel = client.preferred_communication_channel;
  if (body.preferredCommunicationChannel !== undefined) {
    const value = String(body.preferredCommunicationChannel).trim();
    // Only a genuinely NEW selection is restricted to the active set — an
    // unrelated profile edit (e.g. mobile number) that resubmits an
    // inactive value already on file (from before this correction, or
    // set directly against the API) must not be blocked or silently
    // rewritten (Phase 3.1 correction, Section 37).
    if (value && value !== client.preferred_communication_channel && !ACTIVE_COMMUNICATION_CHANNELS.includes(value)) {
      throw new HttpError(400, "Invalid preferred communication channel");
    }
    preferredCommunicationChannel = value || null;
  }

  // The existing free-form `phone` field (above) is completely untouched by
  // this — mobile_e164 is a new, separate, properly normalized field. An
  // explicit country is required unless the client typed a full
  // international ("+...") number themselves; ambiguous input is rejected
  // with guidance rather than guessed, and the original historical `phone`
  // value is never affected by a failed or successful mobile update either
  // way.
  let mobileE164 = client.mobile_e164;
  if (body.mobileNumber !== undefined) {
    const rawMobile = String(body.mobileNumber).trim();
    if (!rawMobile) {
      mobileE164 = null;
    } else {
      const country = body.mobileCountry ? String(body.mobileCountry).trim().toUpperCase() : null;
      if (country && !isSupportedMobileCountry(country)) {
        throw new HttpError(400, "Unsupported mobile number country");
      }
      const result = normalizePhoneNumber(rawMobile, country);
      if (!result.valid) {
        throw new HttpError(400, "Could not recognize that as a valid mobile number. Include your country, or enter it in full international format (e.g. +639171234567).");
      }
      mobileE164 = result.e164;
    }
  }

  // Email is intentionally not editable here — it's the sign-in identity;
  // changing it is a staff-assisted action, not a self-service one, to
  // avoid a client silently locking themselves out or hijacking another
  // account's magic-link flow.
  await env.DB.prepare(
    `UPDATE clients SET full_name = ?, phone = ?, nationality = ?,
       preferred_communication_language = ?, preferred_communication_channel = ?, mobile_e164 = ?
     WHERE id = ?`
  )
    .bind(fullName, phone, nationality, preferredCommunicationLanguage, preferredCommunicationChannel, mobileE164, client.id)
    .run();

  return json({ ok: true });
}

// A client grants or revokes their own consent for one external channel.
// Source is always 'client_portal' here — staff recording consent obtained
// outside the portal goes through a separate, explicit staff action
// (worker/src/routes/staff.js), never this route.
export async function handleSetOwnConsent(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");

  const body = await request.json().catch(() => {
    throw new HttpError(400, "Invalid request body");
  });
  requireFields(body, ["channel", "status"]);
  const channel = String(body.channel).trim();
  const status = String(body.status).trim();
  if (!isValidConsentChannel(channel)) throw new HttpError(400, "Invalid consent channel");
  if (!isValidConsentStatus(status)) throw new HttpError(400, "Invalid consent status");

  await setClientConsent(env.DB, { clientId: client.id, channel, status, source: "client_portal" });
  return json({ ok: true });
}
