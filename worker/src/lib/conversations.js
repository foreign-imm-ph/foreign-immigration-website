import { newId } from "./crypto.js";

// Small helpers around the new conversations/communication_messages tables
// (Phase 1 multilingual communications). Deliberately separate from db.js's
// existing helpers rather than mixed in, and completely independent of
// messages.js/the legacy `messages` table — nothing here ever touches it.

export async function createConversation(db, { enquiryId = null, preferredLanguage = null }) {
  const id = newId();
  await db
    .prepare("INSERT INTO conversations (id, enquiry_id, preferred_language) VALUES (?, ?, ?)")
    .bind(id, enquiryId, preferredLanguage)
    .run();
  return id;
}

export async function getConversationByEnquiryId(db, enquiryId) {
  return db.prepare("SELECT * FROM conversations WHERE enquiry_id = ?").bind(enquiryId).first();
}

export async function getConversationById(db, id) {
  return db.prepare("SELECT * FROM conversations WHERE id = ?").bind(id).first();
}

export async function getConversationByApplicationId(db, applicationId) {
  return db.prepare("SELECT * FROM conversations WHERE application_id = ?").bind(applicationId).first();
}

// Phase 2: an application converted before generalized communications
// existed (or any application whose enquiry-time conversation was somehow
// never linked) has no conversation yet. This creates one lazily, exactly
// once, the first time a new-style portal message needs it — never
// fabricating an enquiry_id, since there may genuinely be none. The
// idx_conversations_application_id_unique constraint (migration 0006) is
// the actual guarantee against a duplicate; the SELECT-first here just
// avoids the extra round trip on the far more common case where a
// conversation already exists, and the catch-and-recheck below handles the
// rare case where two requests raced past the initial SELECT.
export async function getOrCreateConversationForApplication(db, { applicationId, clientId, preferredLanguage = null }) {
  const existing = await getConversationByApplicationId(db, applicationId);
  if (existing) return existing;

  const id = newId();
  try {
    await db
      .prepare("INSERT INTO conversations (id, client_id, application_id, preferred_language) VALUES (?, ?, ?, ?)")
      .bind(id, clientId, applicationId, preferredLanguage)
      .run();
  } catch (err) {
    // Unique constraint hit — another request created it first between our
    // SELECT and this INSERT. Use theirs rather than treating this as an
    // error.
    const raceWinner = await getConversationByApplicationId(db, applicationId);
    if (raceWinner) return raceWinner;
    throw err;
  }
  return getConversationById(db, id);
}

export async function listConversationMessages(db, conversationId) {
  const { results } = await db
    .prepare("SELECT * FROM communication_messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .bind(conversationId)
    .all();
  return results;
}

// Links an existing conversation to a client/application at enquiry
// conversion. Never creates a new conversation — the caller is expected to
// have already resolved the conversation by enquiry_id.
export async function linkConversationToClient(db, { conversationId, clientId, applicationId }) {
  await db
    .prepare("UPDATE conversations SET client_id = ?, application_id = ? WHERE id = ?")
    .bind(clientId, applicationId, conversationId)
    .run();
}

export async function insertCommunicationMessage(
  db,
  {
    conversationId,
    senderType,
    channel,
    sourceLanguage,
    sourceText,
    targetLanguage,
    targetText = null,
    translationStatus = "not_required",
    translationProvider = null,
    translatedAt = null,
    deliveryStatus = "draft",
  }
) {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO communication_messages
        (id, conversation_id, sender_type, channel, source_language, source_text, target_language,
         target_text, translation_status, translation_provider, translated_at, delivery_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      conversationId,
      senderType,
      channel,
      sourceLanguage,
      sourceText,
      targetLanguage,
      targetText,
      translationStatus,
      translationProvider,
      translatedAt,
      deliveryStatus
    )
    .run();
  await db
    .prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?")
    .bind(conversationId)
    .run();
  return id;
}

export async function updateMessageTranslation(db, { id, targetText, translationStatus, translationProvider }) {
  await db
    .prepare(
      "UPDATE communication_messages SET target_text = ?, translation_status = ?, translation_provider = ?, translated_at = datetime('now') WHERE id = ?"
    )
    .bind(targetText, translationStatus, translationProvider, id)
    .run();
}

export async function updateMessageDeliveryStatus(db, { id, deliveryStatus }) {
  await db.prepare("UPDATE communication_messages SET delivery_status = ? WHERE id = ?").bind(deliveryStatus, id).run();
}

export async function getMessageById(db, id) {
  return db.prepare("SELECT * FROM communication_messages WHERE id = ?").bind(id).first();
}

// A single normalized shape for a communication_messages row, reused by
// every consumer (client-facing JSON, staff HTML) so there is exactly one
// place that knows how to read a raw generalized-message row.
export function normalizeGeneralizedMessage(m) {
  return {
    id: m.id,
    source: "generalized",
    senderType: m.sender_type,
    senderLabel: null,
    originalText: m.source_text,
    originalLanguage: m.source_language,
    translationText: m.target_text,
    translationLanguage: m.target_language,
    translationStatus: m.translation_status,
    deliveryStatus: m.delivery_status,
    createdAt: m.created_at,
  };
}

function normalizeLegacyMessage(m) {
  return {
    id: m.id,
    source: "legacy",
    senderType: m.sender_type,
    senderLabel: m.sender_label,
    originalText: m.body,
    originalLanguage: null,
    translationText: null,
    translationLanguage: null,
    translationStatus: null,
    deliveryStatus: null,
    createdAt: m.created_at,
  };
}

// Merges historical legacy `messages` rows (untouched, never migrated) with
// new-style `communication_messages` rows into one chronological,
// normalized timeline. Pass applicationId: null for a conversation that
// never has legacy rows (e.g. an enquiry-stage conversation, before any
// application exists) to skip that query entirely. Returns every row
// unfiltered — the caller decides what to hide (e.g. the client-facing view
// must never show a staff reply that hasn't actually been sent yet; the
// staff view shows everything, drafts included). Never mutates either
// source table.
export async function getMergedTimeline(db, { applicationId, conversationId }) {
  const [legacyRows, generalizedRows] = await Promise.all([
    applicationId
      ? db.prepare("SELECT * FROM messages WHERE application_id = ? ORDER BY created_at ASC").bind(applicationId).all().then((r) => r.results)
      : Promise.resolve([]),
    conversationId ? listConversationMessages(db, conversationId) : Promise.resolve([]),
  ]);

  const items = [...legacyRows.map(normalizeLegacyMessage), ...generalizedRows.map(normalizeGeneralizedMessage)];
  return items.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}
