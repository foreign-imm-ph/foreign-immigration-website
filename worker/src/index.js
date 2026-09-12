import { json, withErrorHandling, corsHeaders, securityHeaders } from "./lib/http.js";
import { isSameSiteOrigin } from "./lib/session.js";
import { HttpError } from "./lib/storage.js";
import { handleCreateEnquiry } from "./routes/enquiries.js";
import { handleRequestMagicLink, handleVerifyMagicLink, handleLogout, handleMe } from "./routes/auth.js";
import { handleListApplications, handleGetApplication } from "./routes/applications.js";
import { handleListDocumentRequests, handleUploadDocument, handleDownloadDocument } from "./routes/documents.js";
import { handleListMessages, handleSendMessage } from "./routes/messages.js";
import { handleListPayments, handleGetQrPhImage, handleUploadPaymentProof } from "./routes/payments.js";
import { handleGetProfile, handleUpdateProfile, handleSetOwnConsent } from "./routes/profile.js";
import { handleStaffRequest } from "./routes/staff.js";

// Requests that change state must come from our own site — checked once,
// here, rather than repeated in every handler.
const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "DELETE", "PUT"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    // Staff pages are plain HTML form posts from the browser, gated by
    // Cloudflare Access at the edge before the request even reaches here —
    // they're intentionally not part of the JSON API / CORS surface below.
    if (path.startsWith("/staff")) {
      return handleStaffRequest(request, env, url);
    }

    return withErrorHandling(async () => {
      if (STATE_CHANGING_METHODS.has(method) && !isSameSiteOrigin(request, env)) {
        throw new HttpError(403, "Request rejected");
      }

      const response = await route(request, env, path, method, url);
      if (!response) return json({ error: "Not found" }, { status: 404 });

      // Attach CORS + baseline security headers to every API response.
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(corsHeaders(env))) headers.set(k, v);
      for (const [k, v] of Object.entries(securityHeaders())) headers.set(k, v);
      return new Response(response.body, { status: response.status, headers });
    });
  },
};

async function route(request, env, path, method) {
  if (path === "/api/enquiries" && method === "POST") return handleCreateEnquiry(request, env);

  if (path === "/api/auth/magic-link" && method === "POST") return handleRequestMagicLink(request, env);
  if (path === "/api/auth/verify" && method === "POST") return handleVerifyMagicLink(request, env);
  if (path === "/api/auth/logout" && method === "POST") return handleLogout(request, env);
  if (path === "/api/auth/me" && method === "GET") return handleMe(request, env);

  if (path === "/api/applications" && method === "GET") return handleListApplications(request, env);

  const appMatch = path.match(/^\/api\/applications\/([^/]+)$/);
  if (appMatch && method === "GET") return handleGetApplication(request, env, appMatch[1]);

  const docsMatch = path.match(/^\/api\/applications\/([^/]+)\/documents$/);
  if (docsMatch && method === "GET") return handleListDocumentRequests(request, env, docsMatch[1]);
  if (docsMatch && method === "POST") return handleUploadDocument(request, env, docsMatch[1]);

  const docDlMatch = path.match(/^\/api\/applications\/([^/]+)\/documents\/([^/]+)$/);
  if (docDlMatch && method === "GET") return handleDownloadDocument(request, env, docDlMatch[1], docDlMatch[2]);

  const msgMatch = path.match(/^\/api\/applications\/([^/]+)\/messages$/);
  if (msgMatch && method === "GET") return handleListMessages(request, env, msgMatch[1]);
  if (msgMatch && method === "POST") return handleSendMessage(request, env, msgMatch[1]);

  const payMatch = path.match(/^\/api\/applications\/([^/]+)\/payments$/);
  if (payMatch && method === "GET") return handleListPayments(request, env, payMatch[1]);

  if (path === "/api/qr-ph-image" && method === "GET") return handleGetQrPhImage(request, env);

  const payProofMatch = path.match(/^\/api\/applications\/([^/]+)\/payments\/([^/]+)\/proof$/);
  if (payProofMatch && method === "POST") return handleUploadPaymentProof(request, env, payProofMatch[1], payProofMatch[2]);

  if (path === "/api/profile" && method === "GET") return handleGetProfile(request, env);
  if (path === "/api/profile" && method === "PATCH") return handleUpdateProfile(request, env);
  if (path === "/api/consents" && method === "POST") return handleSetOwnConsent(request, env);

  return null;
}
