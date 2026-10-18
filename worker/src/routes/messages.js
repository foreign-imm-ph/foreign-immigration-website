import { getSessionClient } from "../lib/session.js";
import { requireOwnedApplication } from "./applications.js";
import { json, requireFields } from "../lib/http.js";
import { HttpError, readAndValidateUpload, documentKey, streamObject } from "../lib/storage.js";
import { newId } from "../lib/crypto.js";
import {
  getConversationByApplicationId,
  getOrCreateConversationForApplication,
  getMergedTimeline,
  insertCommunicationMessage,
  updateMessageTranslation,
  getMessageById,
} from "../lib/conversations.js";
import { detectLanguage, translateToEnglish } from "../lib/translation.js";
import { sendStaffPortalMessageNotification } from "../lib/email.js";

async function requireClient(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");
  return client;
}

// Legacy `messages` rows and new-style (channel='portal') communication_
// messages rows are merged into one chronological list here — the client
// never sees two separate places for the same application's conversation,
// and nothing in the legacy table is ever read as anything but history.
export async function handleListMessages(request, env, applicationId) {
  const client = await requireClient(request, env);
  await requireOwnedApplication(env, client, applicationId);

  const conversation = await getConversationByApplicationId(env.DB, applicationId);
  const timeline = await getMergedTimeline(env.DB, {
    applicationId,
    conversationId: conversation ? conversation.id : null,
  });

  const clientMessages = timeline
    // A generalized staff reply is only ever shown to the client once
    // actually sent — never a draft, never one that failed to translate,
    // matching the same rule staff-side "Send Reply" already enforces.
    .filter((item) => !(item.source === "generalized" && item.senderType === "staff" && item.deliveryStatus !== "sent"))
    .map((item) => {
      if (item.source === "legacy") {
        return { id: item.id, sender_type: item.senderType, sender_label: item.senderLabel, body: item.originalText, created_at: item.createdAt };
      }
      if (item.senderType === "client") {
        // The client always sees exactly what they wrote as the primary
        // text — never a round-tripped translation of their own words.
        // When they wrote in a non-English language, the English
        // translation staff will see is now shown underneath (bilingual
        // correspondence requirement) purely for transparency; English
        // is never shown twice for an English-authored message.
        const isEnglish = item.originalLanguage === "en";
        return {
          id: item.id,
          sender_type: "client",
          sender_label: client.full_name,
          body: item.originalText,
          body_language: item.originalLanguage,
          english_translation: !isEnglish && item.translationStatus === "ready" ? item.translationText : null,
          translation_unavailable: !isEnglish && item.translationStatus === "failed",
          created_at: item.createdAt,
          attachment: item.attachment,
        };
      }
      // Staff reply: the client's own selected language is the primary
      // text; the English original is now shown underneath in the same
      // card by default (bilingual correspondence requirement), not
      // behind a "show original" disclosure.
      const translated = item.translationText || item.originalText;
      return {
        id: item.id,
        sender_type: "staff",
        sender_label: "Foreign Immigration Services",
        body: translated,
        body_language: item.translationLanguage,
        english_original: translated !== item.originalText ? item.originalText : null,
        created_at: item.createdAt,
        attachment: item.attachment,
      };
    });

  return json({ messages: clientMessages });
}

export async function handleSendMessage(request, env, applicationId) {
  const client = await requireClient(request, env);
  await requireOwnedApplication(env, client, applicationId);

  const body = await request.json().catch(() => {
    throw new HttpError(400, "Invalid request body");
  });
  requireFields(body, ["body"]);
  const text = String(body.body).trim().slice(0, 4000);
  if (!text) throw new HttpError(400, "Message cannot be empty");

  const conversation = await getOrCreateConversationForApplication(env.DB, {
    applicationId,
    clientId: client.id,
    preferredLanguage: client.preferred_communication_language,
  });

  // Preference is not source language — detected independently, exactly
  // like the enquiry pipeline. detectLanguage()/translateToEnglish() never
  // throw; an unavailable/failed provider resolves to a failed-translation
  // status, never a lost message.
  const sourceLanguage = await detectLanguage(env, text);
  const isEnglish = sourceLanguage === "en";

  const id = await insertCommunicationMessage(env.DB, {
    conversationId: conversation.id,
    senderType: "client",
    channel: "portal",
    sourceLanguage,
    sourceText: text,
    targetLanguage: "en",
    translationStatus: isEnglish ? "not_required" : "pending",
    deliveryStatus: "sent", // already fully received from FIS's perspective; nothing left to deliver
  });

  // The message is now persisted — that is the event staff need to hear
  // about, not whether translation subsequently succeeds. Fired here, before
  // the translation attempt below, so a slow or failed translation can never
  // suppress or delay it; best-effort, like every other notification email,
  // so a Resend outage never fails the client's own successful submission.
  try {
    await sendStaffPortalMessageNotification(env, { applicationId });
  } catch (err) {
    console.error("Staff portal message notification failed:", err.message);
  }

  if (!isEnglish) {
    const result = await translateToEnglish(env, text, sourceLanguage);
    await updateMessageTranslation(env.DB, {
      id,
      targetText: result.text,
      translationStatus: result.status,
      translationProvider: result.provider,
    });
  }

  return json({ id }, { status: 201 });
}

// Directive section 9: secure document attachments. Attaches a file to a
// message the CLIENT themselves authored, in THIS application's
// conversation -- never to a staff message (a client cannot attach
// something to FIS's own reply), and never to a message belonging to a
// conversation other than this application's own (the ownership check
// below is on the application, but the message-belongs-to-this-
// conversation check is what actually stops a client guessing another
// customer's messageId from reaching across applications, since
// messageId alone carries no ownership information of its own).
export async function handleUploadMessageAttachment(request, env, applicationId, messageId) {
  const client = await requireClient(request, env);
  const application = await requireOwnedApplication(env, client, applicationId);

  const message = await getMessageById(env.DB, messageId);
  if (!message) throw new HttpError(404, "Not found");
  if (message.sender_type !== "client") throw new HttpError(403, "Cannot attach a file to a staff message");
  const conversation = await getConversationByApplicationId(env.DB, applicationId);
  if (!conversation || message.conversation_id !== conversation.id) throw new HttpError(404, "Not found");

  const { bytes, contentType, filename } = await readAndValidateUpload(request);
  const key = documentKey(client.id, applicationId);
  await env.CLIENT_FILES.put(key, bytes, { httpMetadata: { contentType } });
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO documents (id, application_id, client_id, r2_key, original_filename, content_type, size_bytes, uploaded_by, kind, communication_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'client', 'message_attachment', ?)`
  )
    .bind(id, application.id, client.id, key, filename, contentType, bytes.byteLength, messageId)
    .run();

  return json({ id, filename }, { status: 201 });
}

export async function handleDownloadMessageAttachment(request, env, applicationId, messageId) {
  const client = await requireClient(request, env);
  await requireOwnedApplication(env, client, applicationId);

  const conversation = await getConversationByApplicationId(env.DB, applicationId);
  const message = conversation ? await getMessageById(env.DB, messageId) : null;
  if (!message || message.conversation_id !== conversation.id) throw new HttpError(404, "Not found");

  const doc = await env.DB.prepare("SELECT * FROM documents WHERE communication_message_id = ? AND kind = 'message_attachment'").bind(messageId).first();
  if (!doc) return new Response("Not found", { status: 404 });

  const response = await streamObject(env.CLIENT_FILES, doc.r2_key, doc.original_filename, doc.content_type);
  if (!response) return new Response("Not found", { status: 404 });
  return response;
}
