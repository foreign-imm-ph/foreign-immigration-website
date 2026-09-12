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
