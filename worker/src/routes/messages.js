import { getSessionClient } from "../lib/session.js";
import { requireOwnedApplication } from "./applications.js";
import { json, requireFields } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";
import {
  getConversationByApplicationId,
  getOrCreateConversationForApplication,
  getMergedTimeline,
  insertCommunicationMessage,
  updateMessageTranslation,
} from "../lib/conversations.js";
import { detectLanguage, translateToEnglish } from "../lib/translation.js";

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
        // The client always sees exactly what they wrote — never a
        // round-tripped translation of their own words.
        return { id: item.id, sender_type: "client", sender_label: client.full_name, body: item.originalText, created_at: item.createdAt };
      }
      // Staff reply: the client's own language is the primary text; the
      // English original is offered separately for an optional "show
      // original" control, never as a second message in the list.
      const translated = item.translationText || item.originalText;
      return {
        id: item.id,
        sender_type: "staff",
        sender_label: "Foreign Immigration Services",
        body: translated,
        english_original: translated !== item.originalText ? item.originalText : null,
        created_at: item.createdAt,
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
