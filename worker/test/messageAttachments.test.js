import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import worker from "../src/index.js";
import { createTestClient, createTestApplication, createTestStaff, createSessionCookieFor, authedRequest, SITE_ORIGIN } from "./helpers.js";
import { generateTestAccessKeypair, signTestAccessJwt, mockAccessJwksEndpoint } from "./access-jwt-helper.js";
import { getOrCreateConversationForApplication, insertCommunicationMessage } from "../src/lib/conversations.js";

// Directive section 9: secure document attachments on an order/application
// message -- the client-side half (messages.js's handleUploadMessage
// Attachment/handleDownloadMessageAttachment), reusing the EXISTING
// documents table/R2 bucket, never a second storage mechanism.
function fakePdfBytes() {
  return new TextEncoder().encode("%PDF-1.7\n% fake but correctly-signed test content\n");
}

let keypair;
let restoreFetch;

beforeAll(async () => {
  keypair = await generateTestAccessKeypair();
  restoreFetch = mockAccessJwksEndpoint(env.CF_ACCESS_TEAM_DOMAIN, keypair.jwks);
});

afterAll(() => {
  restoreFetch();
});

async function staffRequest(path, staffRow, { method = "GET", body, headers = {} } = {}) {
  const jwt = await signTestAccessJwt(keypair.keyPair, keypair.kid, { email: staffRow.email, aud: [env.CF_ACCESS_AUD], exp: Math.floor(Date.now() / 1000) + 300 });
  return worker.fetch(new Request(`${SITE_ORIGIN}${path}`, { method, headers: { "Cf-Access-Jwt-Assertion": jwt, Origin: SITE_ORIGIN, ...headers }, body }), env);
}

describe("Order messaging: secure attachments (directive section 9)", () => {
  it("a client can attach a file to their own message and download it back", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const cookie = await createSessionCookieFor(client);

    const sendResp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages`, { method: "POST", cookie, body: { body: "Here is my document." } }), env);
    expect(sendResp.status).toBe(201);
    const { id: messageId } = await sendResp.json();

    const uploadReq = new Request(`${SITE_ORIGIN}/api/applications/${application.id}/messages/${messageId}/attachment`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookie, "X-Filename": "passport.pdf" },
      body: fakePdfBytes(),
    });
    const uploadResp = await worker.fetch(uploadReq, env);
    expect(uploadResp.status).toBe(201);

    const listResp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages`, { cookie }), env);
    const { messages } = await listResp.json();
    const msg = messages.find((m) => m.id === messageId);
    expect(msg.attachment).toBeTruthy();
    expect(msg.attachment.filename).toBe("passport.pdf");

    const dlResp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages/${messageId}/attachment`, { cookie }), env);
    expect(dlResp.status).toBe(200);
    expect(new Uint8Array(await dlResp.arrayBuffer())).toEqual(fakePdfBytes());
  });

  it("a client cannot attach a file to a staff-authored message", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const cookie = await createSessionCookieFor(client);
    const conversation = await getOrCreateConversationForApplication(env.DB, { applicationId: application.id, clientId: client.id });
    const staffMessageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "staff",
      channel: "portal",
      sourceLanguage: "en",
      sourceText: "A staff reply.",
      targetLanguage: "en",
      translationStatus: "not_required",
      deliveryStatus: "sent",
    });

    const uploadReq = new Request(`${SITE_ORIGIN}/api/applications/${application.id}/messages/${staffMessageId}/attachment`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookie, "X-Filename": "x.pdf" },
      body: fakePdfBytes(),
    });
    const resp = await worker.fetch(uploadReq, env);
    expect(resp.status).toBe(403);
  });

  it("a different client cannot download another customer's message attachment, nor attach to it", async () => {
    const owner = await createTestClient();
    const application = await createTestApplication(owner);
    const ownerCookie = await createSessionCookieFor(owner);

    const sendResp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages`, { method: "POST", cookie: ownerCookie, body: { body: "Owner's message." } }), env);
    const { id: messageId } = await sendResp.json();
    await worker.fetch(
      new Request(`${SITE_ORIGIN}/api/applications/${application.id}/messages/${messageId}/attachment`, {
        method: "POST",
        headers: { Origin: SITE_ORIGIN, Cookie: ownerCookie, "X-Filename": "owner-file.pdf" },
        body: fakePdfBytes(),
      }),
      env
    );

    const intruder = await createTestClient();
    const intruderCookie = await createSessionCookieFor(intruder);
    const dlResp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages/${messageId}/attachment`, { cookie: intruderCookie }), env);
    expect(dlResp.status).toBe(404);

    const uploadResp = await worker.fetch(
      new Request(`${SITE_ORIGIN}/api/applications/${application.id}/messages/${messageId}/attachment`, {
        method: "POST",
        headers: { Origin: SITE_ORIGIN, Cookie: intruderCookie, "X-Filename": "intruder-file.pdf" },
        body: fakePdfBytes(),
      }),
      env
    );
    expect(uploadResp.status).toBe(404);
  });

  it("staff can attach a file to their own reply (multipart form), and can download a client's attachment via the existing document-download route", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const clientCookie = await createSessionCookieFor(client);

    // Client's own attachment, downloadable by staff via the existing
    // generic documents route (an attachment is just another `documents`
    // row -- no new staff download route needed).
    const sendResp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages`, { method: "POST", cookie: clientCookie, body: { body: "From the client." } }), env);
    const { id: clientMessageId } = await sendResp.json();
    const uploadResp = await worker.fetch(
      new Request(`${SITE_ORIGIN}/api/applications/${application.id}/messages/${clientMessageId}/attachment`, {
        method: "POST",
        headers: { Origin: SITE_ORIGIN, Cookie: clientCookie, "X-Filename": "client-file.pdf" },
        body: fakePdfBytes(),
      }),
      env
    );
    const { id: clientDocumentId } = await uploadResp.json();

    const staffDlResp = await staffRequest(`/staff/applications/${application.id}/documents/${clientDocumentId}/download`, staff);
    expect(staffDlResp.status).toBe(200);

    // Staff's own reply + attachment (plain multipart form, matching the
    // Staff Portal's existing upload convention).
    const conversation = await getOrCreateConversationForApplication(env.DB, { applicationId: application.id, clientId: client.id });
    const staffMessageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "staff",
      channel: "portal",
      sourceLanguage: "en",
      sourceText: "Please see the attached document.",
      targetLanguage: "en",
      translationStatus: "not_required",
      deliveryStatus: "draft",
    });

    const formData = new FormData();
    formData.set("file", new File([fakePdfBytes()], "staff-reply.pdf", { type: "application/pdf" }));
    const staffUploadResp = await staffRequest(`/staff/applications/${application.id}/messages/${staffMessageId}/attachment`, staff, { method: "POST", body: formData });
    expect(staffUploadResp.status).toBe(303);

    const doc = await env.DB.prepare("SELECT * FROM documents WHERE communication_message_id = ?").bind(staffMessageId).first();
    expect(doc).toBeTruthy();
    expect(doc.uploaded_by).toBe("staff");
    expect(doc.original_filename).toBe("staff-reply.pdf");
  });

  it("staff cannot attach a file to a client-authored message", async () => {
    const client = await createTestClient();
    const application = await createTestApplication(client);
    const staff = await createTestStaff();
    const clientCookie = await createSessionCookieFor(client);

    const sendResp = await worker.fetch(authedRequest(`/api/applications/${application.id}/messages`, { method: "POST", cookie: clientCookie, body: { body: "From the client." } }), env);
    const { id: clientMessageId } = await sendResp.json();

    const formData = new FormData();
    formData.set("file", new File([fakePdfBytes()], "x.pdf", { type: "application/pdf" }));
    const resp = await staffRequest(`/staff/applications/${application.id}/messages/${clientMessageId}/attachment`, staff, { method: "POST", body: formData });
    expect(resp.status).toBe(403);
  });
});
