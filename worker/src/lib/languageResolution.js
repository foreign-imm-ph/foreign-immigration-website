// Phase 3.1 correction: decides whether NEW staff-authored client-facing
// prose (a status note, a document request title, a payment description)
// may be published in English, must go through Translate & Preview, or
// must be BLOCKED until staff resolves the client's communication
// language. Replaces the earlier requiresClientTranslation(language)
// boolean, whose "false" answer incorrectly collapsed three different
// states (English, no preference recorded, and an explicitly unsupported
// preference) into one — a client with no preference on file was treated
// exactly like an English speaker, which is precisely the mistake this
// correction removes.
import { CANONICAL_LANGUAGES } from "./translation.js";
import { getConversationByApplicationId } from "./conversations.js";

export const LANGUAGE_MODE = {
  ENGLISH: "english", // language === 'en': publish in English, no translation call
  SUPPORTED_TRANSLATION: "supported_translation", // one of the five non-English canonical languages: Translate & Preview required
  MISSING: "missing_language", // no durable preference recorded anywhere reliable: block, ask staff to set one
  UNSUPPORTED: "unsupported_language", // 'other', or any value outside the canonical set: block, ask staff to confirm a supported language with the client
};

// NULL ("no preference recorded yet") and 'other' ("known to be outside
// the supported set, or explicitly chosen as Other") are deliberately
// different LANGUAGE_MODE values — never collapsed into one "not
// translatable" bucket — because the correct staff-facing guidance (and
// the correct blocked-publication reason) differs between them.
export function resolvePublicationMode(language) {
  if (language === "en") return LANGUAGE_MODE.ENGLISH;
  if (CANONICAL_LANGUAGES.includes(language)) return LANGUAGE_MODE.SUPPORTED_TRANSLATION;
  if (!language) return LANGUAGE_MODE.MISSING;
  return LANGUAGE_MODE.UNSUPPORTED;
}

// Resolution order (never anything else — no browser locale, no
// nationality, no phone country, no name, no AI guess, no borrowing a
// single inbound message's detected source language as a durable
// preference):
//   1. clients.preferred_communication_language — the client's own durable
//      preference, whenever one has been recorded.
//   2. The conversation linked to this application's own
//      preferred_language — set either from the client's own
//      Phase 1 enquiry-time selection or carried over at conversion; this
//      is still the client's own declared preference, just not yet copied
//      onto the client row.
//   3. The original enquiry's own `language` column, via
//      applications.enquiry_id — again the client's own explicit
//      selection on the public form, just further back in the chain.
// All three columns are already validated against the canonical set (or
// null/'other') at the point they were originally written — normalizeCommunicationLanguage
// in translation.js is the one and only place that ever turns a legacy
// label into a canonical code, and it already ran before any of these
// columns were populated, so there is nothing left to re-normalize here.
//
// If found via (2) or (3), this also persists the resolved value onto
// clients.preferred_communication_language — conservatively, because both
// sources are the client's own previously-captured, already-validated
// preference (not a weak inference), so writing it through closes the gap
// durably instead of re-deriving it on every future publish attempt.
export async function resolveClientCommunicationLanguage(db, { client, applicationId }) {
  if (client.preferred_communication_language) {
    return { language: client.preferred_communication_language, source: "client" };
  }

  if (applicationId) {
    const conversation = await getConversationByApplicationId(db, applicationId);
    if (conversation && conversation.preferred_language) {
      await persistResolvedLanguage(db, client.id, conversation.preferred_language);
      return { language: conversation.preferred_language, source: "conversation" };
    }

    const application = await db.prepare("SELECT enquiry_id FROM applications WHERE id = ?").bind(applicationId).first();
    if (application && application.enquiry_id) {
      const enquiry = await db.prepare("SELECT language FROM enquiries WHERE id = ?").bind(application.enquiry_id).first();
      if (enquiry && enquiry.language) {
        await persistResolvedLanguage(db, client.id, enquiry.language);
        return { language: enquiry.language, source: "enquiry" };
      }
    }
  }

  return { language: null, source: null };
}

async function persistResolvedLanguage(db, clientId, language) {
  await db
    .prepare("UPDATE clients SET preferred_communication_language = ? WHERE id = ? AND preferred_communication_language IS NULL")
    .bind(language, clientId)
    .run();
}

// Concise, actionable staff-facing guidance for a blocked publication —
// used identically by the status/document/payment routes so the wording
// staff sees is consistent everywhere this correction applies.
export function blockedPublicationMessage(mode) {
  if (mode === LANGUAGE_MODE.MISSING) {
    return "Preferred communication language is not set. Set the client's communication language before publishing this request.";
  }
  return "Automatic translation is not available for this client's current language setting. Confirm a supported communication language with the client before publishing this request.";
}
