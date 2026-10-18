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
import {
  handleListBiForms,
  handleGetBiForm,
  handleSaveDraft,
  handleSubmitBiForm,
  handleListBiFormDocuments,
  handleUploadBiFormDocument,
  handleDownloadBiFormDocument,
  handleBiFormPreviewImage,
} from "./routes/biFormsCustomer.js";
import { handleListCatalogue, handleGetCatalogueService, handleBeginCheckout, handlePreviewOfficialForm } from "./routes/checkoutPublic.js";
import {
  handleGetOrder,
  handleStartApplication,
  handleSetDeliveryAddress,
  handleSetProcessingTier,
  handleConfirmAndPay,
  handleGetOrderHistory,
  handleGetOrderReceipt,
  handleGetQrPhImage as handleGetInstantServicesQrPhImage,
} from "./routes/checkoutCustomer.js";
import {
  handleSaveBooking,
  handleGetBooking,
  handleAcceptPolicy,
  handleGetBookingHistory,
  handleCreateRescheduleRequest,
  handleListRescheduleRequests,
} from "./routes/airportVipCustomer.js";

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

    // withErrorHandling's own catch block returns an error Response
    // directly (see lib/http.js) -- CORS/security headers are attached
    // HERE, outside it, so they land on every response uniformly whether
    // the handler succeeded or threw. Attaching them only on the success
    // path (as a previous version of this function did) meant every
    // error response -- 400/401/403/404/409/422/500, including this very
    // PATCH/POST's own validation errors -- reached the browser with no
    // Access-Control-Allow-Origin header at all, which a browser reports
    // as an opaque "CORS policy" / "Failed to fetch" error, hiding the
    // real, human-readable error message from the user entirely. Caught
    // directly while browser-testing Stage 5.4's questionnaire submit
    // flow (a real 422 "incomplete questionnaire" response), not
    // something only this new feature could trigger -- any cross-origin
    // error response site-wide was affected.
    const response = await withErrorHandling(async () => {
      if (STATE_CHANGING_METHODS.has(method) && !isSameSiteOrigin(request, env)) {
        throw new HttpError(403, "Request rejected");
      }
      const routed = await route(request, env, path, method, url);
      return routed || json({ error: "Not found" }, { status: 404 });
    });

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders(env))) headers.set(k, v);
    for (const [k, v] of Object.entries(securityHeaders())) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  },
};

async function route(request, env, path, method, url) {
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

  if (path === "/api/bi-forms" && method === "GET") return handleListBiForms(request, env);
  const biFormMatch = path.match(/^\/api\/bi-forms\/([^/]+)$/);
  if (biFormMatch && method === "GET") return handleGetBiForm(request, env, biFormMatch[1]);
  const biFormDraftMatch = path.match(/^\/api\/bi-forms\/([^/]+)\/draft$/);
  if (biFormDraftMatch && method === "PATCH") return handleSaveDraft(request, env, biFormDraftMatch[1]);
  const biFormPreviewMatch = path.match(/^\/api\/bi-forms\/([^/]+)\/preview-image$/);
  if (biFormPreviewMatch && method === "POST") return handleBiFormPreviewImage(request, env, biFormPreviewMatch[1]);
  const biFormSubmitMatch = path.match(/^\/api\/bi-forms\/([^/]+)\/submit$/);
  if (biFormSubmitMatch && method === "POST") return handleSubmitBiForm(request, env, biFormSubmitMatch[1]);
  const biFormDocsMatch = path.match(/^\/api\/bi-forms\/([^/]+)\/documents$/);
  if (biFormDocsMatch && method === "GET") return handleListBiFormDocuments(request, env, biFormDocsMatch[1]);
  if (biFormDocsMatch && method === "POST") return handleUploadBiFormDocument(request, env, biFormDocsMatch[1]);
  const biFormDocDlMatch = path.match(/^\/api\/bi-forms\/([^/]+)\/documents\/([^/]+)$/);
  if (biFormDocDlMatch && method === "GET") return handleDownloadBiFormDocument(request, env, biFormDocDlMatch[1], biFormDocDlMatch[2]);

  if (path === "/api/profile" && method === "GET") return handleGetProfile(request, env);
  if (path === "/api/profile" && method === "PATCH") return handleUpdateProfile(request, env);
  if (path === "/api/consents" && method === "POST") return handleSetOwnConsent(request, env);

  // Instant Services -- public catalogue browsing + guest request start.
  // No auth: catalogue is intentionally public, and "begin" is what
  // issues the first credential (a verification link), so it can't
  // itself require a session. Verification itself reuses the existing,
  // unmodified /api/auth/verify route above -- no new endpoint for that.
  if (path === "/api/instant-services/catalogue" && method === "GET") return handleListCatalogue(request, env, url);
  const catalogueItemMatch = path.match(/^\/api\/instant-services\/catalogue\/([^/]+)$/);
  if (catalogueItemMatch && method === "GET") return handleGetCatalogueService(request, env, url, catalogueItemMatch[1]);
  const previewFormMatch = path.match(/^\/api\/instant-services\/catalogue\/([^/]+)\/preview-form$/);
  if (previewFormMatch && method === "GET") return handlePreviewOfficialForm(request, env, previewFormMatch[1]);
  if (path === "/api/instant-services/begin" && method === "POST") return handleBeginCheckout(request, env);

  // Instant Services -- authenticated, order-scoped routes. The
  // questionnaire itself and payment-proof upload are deliberately NOT
  // duplicated here: once handleStartApplication has created the
  // application/submission rows, the existing /api/bi-forms/:id/... and
  // /api/applications/:id/payments/:id/proof routes above already work
  // unchanged against them.
  const orderMatch = path.match(/^\/api\/instant-services\/orders\/([^/]+)$/);
  if (orderMatch && method === "GET") return handleGetOrder(request, env, orderMatch[1]);

  const orderAppMatch = path.match(/^\/api\/instant-services\/orders\/([^/]+)\/application$/);
  if (orderAppMatch && method === "POST") return handleStartApplication(request, env, orderAppMatch[1]);

  const orderAddressMatch = path.match(/^\/api\/instant-services\/orders\/([^/]+)\/delivery-address$/);
  if (orderAddressMatch && method === "POST") return handleSetDeliveryAddress(request, env, orderAddressMatch[1]);

  const orderTierMatch = path.match(/^\/api\/instant-services\/orders\/([^/]+)\/processing-tier$/);
  if (orderTierMatch && method === "POST") return handleSetProcessingTier(request, env, orderTierMatch[1]);

  const orderConfirmMatch = path.match(/^\/api\/instant-services\/orders\/([^/]+)\/confirm-and-pay$/);
  if (orderConfirmMatch && method === "POST") return handleConfirmAndPay(request, env, orderConfirmMatch[1]);

  const orderHistoryMatch = path.match(/^\/api\/instant-services\/orders\/([^/]+)\/history$/);
  if (orderHistoryMatch && method === "GET") return handleGetOrderHistory(request, env, orderHistoryMatch[1]);

  const orderReceiptMatch = path.match(/^\/api\/instant-services\/orders\/([^/]+)\/receipt$/);
  if (orderReceiptMatch && method === "GET") return handleGetOrderReceipt(request, env, orderReceiptMatch[1]);

  const orderQrMatch = path.match(/^\/api\/instant-services\/orders\/([^/]+)\/qr-ph-image$/);
  if (orderQrMatch && method === "GET") return handleGetInstantServicesQrPhImage(request, env, orderQrMatch[1]);

  // Airport VIP Meet & Assist -- booking details, policy acceptance, and
  // rescheduling requests on top of the same order/service routes above.
  const orderBookingMatch = path.match(/^\/api\/instant-services\/orders\/([^/]+)\/booking$/);
  if (orderBookingMatch && method === "GET") return handleGetBooking(request, env, orderBookingMatch[1]);
  if (orderBookingMatch && method === "POST") return handleSaveBooking(request, env, orderBookingMatch[1]);

  const orderBookingPolicyMatch = path.match(/^\/api\/instant-services\/orders\/([^/]+)\/booking\/accept-policy$/);
  if (orderBookingPolicyMatch && method === "POST") return handleAcceptPolicy(request, env, orderBookingPolicyMatch[1]);

  const bookingHistoryMatch = path.match(/^\/api\/instant-services\/bookings\/([^/]+)\/history$/);
  if (bookingHistoryMatch && method === "GET") return handleGetBookingHistory(request, env, bookingHistoryMatch[1]);

  const rescheduleMatch = path.match(/^\/api\/instant-services\/bookings\/([^/]+)\/reschedule-requests$/);
  if (rescheduleMatch && method === "GET") return handleListRescheduleRequests(request, env, rescheduleMatch[1]);
  if (rescheduleMatch && method === "POST") return handleCreateRescheduleRequest(request, env, rescheduleMatch[1]);

  return null;
}
