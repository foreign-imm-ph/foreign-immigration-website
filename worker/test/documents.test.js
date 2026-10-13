import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { createTestClient, createSessionCookieFor, createTestApplication, authedRequest, SITE_ORIGIN } from "./helpers.js";

function fakePdfBytes() {
  return new TextEncoder().encode("%PDF-1.7\n% fake but correctly-signed test content\n");
}

describe("document upload/download", () => {
  it("a client can upload a PDF to their own application and download it back", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);

    const uploadReq = new Request(`${SITE_ORIGIN}/api/applications/${application.id}/documents`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookie, "X-Filename": "passport.pdf" },
      body: fakePdfBytes(),
    });
    const uploadResp = await worker.fetch(uploadReq, env);
    expect(uploadResp.status).toBe(201);
    const { id: documentId } = await uploadResp.json();

    const dlResp = await worker.fetch(authedRequest(`/api/applications/${application.id}/documents/${documentId}`, { cookie }), env);
    expect(dlResp.status).toBe(200);
    expect(new Uint8Array(await dlResp.arrayBuffer())).toEqual(fakePdfBytes());
  });

  it("the browser's claimed Content-Type is never trusted -- real file bytes are sniffed instead", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);

    const uploadReq = new Request(`${SITE_ORIGIN}/api/applications/${application.id}/documents`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookie, "X-Filename": "not-really-a-pdf.pdf", "Content-Type": "application/pdf" },
      body: new TextEncoder().encode("this is just plain text, not a PDF, despite the filename and header"),
    });
    const resp = await worker.fetch(uploadReq, env);
    expect(resp.status).toBe(415);
  });

  it("an upload over the 15MB limit is rejected", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const application = await createTestApplication(client);

    const oversized = new Uint8Array(15 * 1024 * 1024 + 1);
    oversized.set([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes, so it fails on size, not type
    const uploadReq = new Request(`${SITE_ORIGIN}/api/applications/${application.id}/documents`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookie, "X-Filename": "huge.pdf" },
      body: oversized,
    });
    const resp = await worker.fetch(uploadReq, env);
    expect(resp.status).toBe(413);
  });

  it("client B cannot download a document belonging to client A's application", async () => {
    const clientA = await createTestClient();
    const cookieA = await createSessionCookieFor(clientA);
    const applicationA = await createTestApplication(clientA);
    const uploadReq = new Request(`${SITE_ORIGIN}/api/applications/${applicationA.id}/documents`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookieA, "X-Filename": "a-document.pdf" },
      body: fakePdfBytes(),
    });
    const { id: documentId } = await (await worker.fetch(uploadReq, env)).json();

    const clientB = await createTestClient();
    const cookieB = await createSessionCookieFor(clientB);
    // Client B doesn't even own applicationA, so requireOwnedApplication
    // should refuse before the document lookup is ever reached.
    const resp = await worker.fetch(authedRequest(`/api/applications/${applicationA.id}/documents/${documentId}`, { cookie: cookieB }), env);
    expect(resp.status).toBe(404);
  });

  it("a document ID that belongs to a different application than the one in the URL is rejected", async () => {
    const client = await createTestClient();
    const cookie = await createSessionCookieFor(client);
    const applicationOne = await createTestApplication(client);
    const applicationTwo = await createTestApplication(client);

    const uploadReq = new Request(`${SITE_ORIGIN}/api/applications/${applicationOne.id}/documents`, {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, Cookie: cookie, "X-Filename": "doc.pdf" },
      body: fakePdfBytes(),
    });
    const { id: documentId } = await (await worker.fetch(uploadReq, env)).json();

    // Same client, same session -- but the document belongs to
    // applicationOne, and this URL asks for it under applicationTwo.
    const resp = await worker.fetch(authedRequest(`/api/applications/${applicationTwo.id}/documents/${documentId}`, { cookie }), env);
    expect(resp.status).toBe(404);
  });
});
