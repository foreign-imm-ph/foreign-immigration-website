import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { createTestClient, createTestApplication, createSessionCookieFor, authedRequest } from "./helpers.js";
import { getOrCreateConversationForApplication, insertCommunicationMessage } from "../src/lib/conversations.js";

// Bilingual correspondence requirement: the Client Portal message list
// must show the customer's selected language first and English directly
// underneath, in the same card, for both directions -- never a second
// message, never a disclosure the customer has to click. Rows are
// inserted directly (bypassing detectLanguage/translateToEnglish, which
// need Workers AI and are not available in this test environment -- see
// checkoutTranslation.test.js) so this test proves the SHAPE
// handleListMessages returns, independent of translation itself.
describe("Client Portal messages: bilingual shape", () => {
  it("a client's own non-English message carries its English translation for display underneath, when ready", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const conversation = await getOrCreateConversationForApplication(env.DB, { applicationId: application.id, clientId: client.id, preferredLanguage: "zh-CN" });
    const messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "client",
      channel: "portal",
      sourceLanguage: "zh-CN",
      sourceText: "你好，我想咨询一下我的申请进度。",
      targetLanguage: "en",
      translationStatus: "pending",
      deliveryStatus: "sent",
    });
    await env.DB.prepare("UPDATE communication_messages SET target_text = ?, translation_status = 'ready' WHERE id = ?")
      .bind("Hello, I would like to ask about my application progress.", messageId)
      .run();

    const cookie = await createSessionCookieFor(client);
    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages`, { cookie }), env);
    expect(resp.status).toBe(200);
    const { messages } = await resp.json();
    const msg = messages.find((m) => m.id === messageId);
    expect(msg.sender_type).toBe("client");
    expect(msg.body).toBe("你好，我想咨询一下我的申请进度。");
    expect(msg.body_language).toBe("zh-CN");
    expect(msg.english_translation).toBe("Hello, I would like to ask about my application progress.");
  });

  it("a client's own English message never carries a redundant 'translation'", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const conversation = await getOrCreateConversationForApplication(env.DB, { applicationId: application.id, clientId: client.id, preferredLanguage: "en" });
    const messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "client",
      channel: "portal",
      sourceLanguage: "en",
      sourceText: "Hello, just checking in.",
      targetLanguage: "en",
      translationStatus: "not_required",
      deliveryStatus: "sent",
    });

    const cookie = await createSessionCookieFor(client);
    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages`, { cookie }), env);
    const { messages } = await resp.json();
    const msg = messages.find((m) => m.id === messageId);
    expect(msg.body).toBe("Hello, just checking in.");
    expect(msg.english_translation).toBeNull();
    expect(msg.translation_unavailable).toBe(false);
  });

  it("a client's own message whose translation failed is still shown, flagged as temporarily unavailable, never fabricated", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const conversation = await getOrCreateConversationForApplication(env.DB, { applicationId: application.id, clientId: client.id, preferredLanguage: "ja" });
    const messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "client",
      channel: "portal",
      sourceLanguage: "ja",
      sourceText: "こんにちは、進捗を確認したいです。",
      targetLanguage: "en",
      translationStatus: "failed",
      deliveryStatus: "sent",
    });

    const cookie = await createSessionCookieFor(client);
    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages`, { cookie }), env);
    const { messages } = await resp.json();
    const msg = messages.find((m) => m.id === messageId);
    expect(msg.body).toBe("こんにちは、進捗を確認したいです。");
    expect(msg.english_translation).toBeNull();
    expect(msg.translation_unavailable).toBe(true);
  });

  it("a sent staff reply shows the customer's language as the primary body, with the English original available for the same bilingual display", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const conversation = await getOrCreateConversationForApplication(env.DB, { applicationId: application.id, clientId: client.id, preferredLanguage: "ko" });
    const messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "staff",
      channel: "portal",
      sourceLanguage: "en",
      sourceText: "Please upload a copy of your passport.",
      targetLanguage: "ko",
      translationStatus: "pending",
      deliveryStatus: "draft",
    });
    await env.DB.prepare("UPDATE communication_messages SET target_text = ?, translation_status = 'ready', delivery_status = 'sent' WHERE id = ?")
      .bind("여권 사본을 업로드해 주세요.", messageId)
      .run();

    const cookie = await createSessionCookieFor(client);
    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages`, { cookie }), env);
    const { messages } = await resp.json();
    const msg = messages.find((m) => m.id === messageId);
    expect(msg.sender_type).toBe("staff");
    expect(msg.body).toBe("여권 사본을 업로드해 주세요.");
    expect(msg.body_language).toBe("ko");
    expect(msg.english_original).toBe("Please upload a copy of your passport.");
  });

  it("a staff reply still in draft (not yet sent) is never shown to the client at all", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const conversation = await getOrCreateConversationForApplication(env.DB, { applicationId: application.id, clientId: client.id, preferredLanguage: "ko" });
    const messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "staff",
      channel: "portal",
      sourceLanguage: "en",
      sourceText: "Draft reply, not yet sent.",
      targetLanguage: "ko",
      translationStatus: "ready",
      deliveryStatus: "draft",
    });

    const cookie = await createSessionCookieFor(client);
    const resp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages`, { cookie }), env);
    const { messages } = await resp.json();
    expect(messages.find((m) => m.id === messageId)).toBeUndefined();
  });
});
