import { newId, newToken, sha256Hex } from "../lib/crypto.js";
import { getClientByEmail, createClient, insertUniqueReference, logAudit } from "../lib/db.js";
import { requireStaff } from "../lib/staffAuth.js";
import { isSameSiteOrigin } from "../lib/session.js";
import { staffPage, escapeHtml } from "../lib/staffHtml.js";
import { streamObject } from "../lib/storage.js";
import {
  sendMagicLink,
  sendDocumentRequestNotification,
  sendPaymentRequestNotification,
  sendApplicationStatusUpdate,
  sendClientMessageNotification,
  sendPaymentConfirmation,
  sendEnquiryReplyEmail,
} from "../lib/email.js";
import {
  getConversationByEnquiryId,
  getConversationByApplicationId,
  getOrCreateConversationForApplication,
  getMergedTimeline,
  getMessageById,
  insertCommunicationMessage,
  updateMessageTranslation,
  updateMessageDeliveryStatus,
  linkConversationToClient,
} from "../lib/conversations.js";
import { translateFromEnglish, translateToEnglish, CANONICAL_LANGUAGES } from "../lib/translation.js";
import { normalizePhoneNumber, isSupportedMobileCountry, SUPPORTED_MOBILE_COUNTRIES } from "../lib/phone.js";
import { getConsentStatusMap, setClientConsent, isValidConsentChannel, isValidConsentStatus, CONSENT_CHANNELS } from "../lib/consents.js";

// Same allowlist as the client-facing profile route (worker/src/routes/profile.js)
// — kept duplicated rather than shared to avoid a cross-route import for a
// four-line constant; 'portal' and 'email' are always-available defaults,
// the rest are future external channels with no active integration.
const COMMUNICATION_CHANNELS = ["portal", "email", "sms", "whatsapp", "telegram", "wechat"];

const LANGUAGE_LABELS = {
  en: "English",
  "zh-CN": "Simplified Chinese",
  "zh-Hant": "Traditional Chinese",
  ko: "Korean",
  ja: "Japanese",
  vi: "Vietnamese",
  other: "Other",
  und: "Undetermined",
};

const STATUS_OPTIONS = [
  "enquiry_received", "under_review", "documents_required", "documents_received",
  "preparing_application", "submitted", "awaiting_authority_action",
  "additional_information_required", "completed",
];

function notFound() {
  return new Response("Not found", { status: 404 });
}

// Every handler below first resolves `staff` via Access + the staff
// allow-list (lib/staffAuth.js), then goes through this dispatcher. If
// resolving staff fails, the request never reaches application logic.
// Staff routes query D1 directly (they're not scoped to a single client_id
// the way client routes are), but every action that touches a specific
// client's data is written to audit_log.
export async function handleStaffRequest(request, env, url) {
  try {
    return await dispatch(request, env, url);
  } catch (err) {
    // Same principle as the JSON API's withErrorHandling: log server-side
    // only, never return a stack trace or internal detail to the client.
    console.error("Unhandled staff route error:", err.message);
    return new Response("Something went wrong. Please try again.", { status: 500 });
  }
}

async function dispatch(request, env, url) {
  const staff = await requireStaff(request, env);
  if (!staff) {
    return new Response("Staff sign-in required. This page is only reachable through Cloudflare Access.", { status: 401 });
  }

  const path = url.pathname.replace(/^\/staff/, "") || "/";
  const method = request.method;

  // Cloudflare Access authenticates WHO is asking, but its own session
  // cookie is attached by the browser automatically like any cookie. It
  // does not by itself stop a malicious page from triggering a mutation
  // from a signed-in staff member's browser, so every state-changing
  // staff request gets the same Origin check as the client-facing API.
  if (method === "POST" && !isSameSiteOrigin(request, env)) {
    return new Response("Request rejected", { status: 403 });
  }

  if (path === "/" || path === "/enquiries/") return listEnquiries(env, staff, url.searchParams.get("priority"));
  // Must be checked before the generic single-enquiry matcher below, or
  // "archived" would be parsed as an enquiry ID and 404.
  if (path === "/enquiries/archived/") return listArchivedEnquiries(env, staff);
  const enquiryMatch = path.match(/^\/enquiries\/([^/]+)\/?$/);
  if (enquiryMatch && method === "GET") return viewEnquiry(env, staff, enquiryMatch[1]);
  const convertMatch = path.match(/^\/enquiries\/([^/]+)\/convert$/);
  if (convertMatch && method === "POST") return convertEnquiry(request, env, staff, convertMatch[1]);
  const priorityMatch = path.match(/^\/enquiries\/([^/]+)\/priority$/);
  if (priorityMatch && method === "POST") return updateEnquiryPriority(request, env, staff, priorityMatch[1]);
  const archiveMatch = path.match(/^\/enquiries\/([^/]+)\/archive$/);
  if (archiveMatch && method === "POST") return archiveEnquiry(request, env, staff, archiveMatch[1]);
  const restoreMatch = path.match(/^\/enquiries\/([^/]+)\/restore$/);
  if (restoreMatch && method === "POST") return restoreEnquiry(request, env, staff, restoreMatch[1]);
  const deleteMatch = path.match(/^\/enquiries\/([^/]+)\/delete$/);
  if (deleteMatch && method === "POST") return deleteEnquiry(request, env, staff, deleteMatch[1]);

  const translateReplyMatch = path.match(/^\/enquiries\/([^/]+)\/reply\/translate$/);
  if (translateReplyMatch && method === "POST") return translateReply(request, env, staff, translateReplyMatch[1]);
  const sendReplyMatch = path.match(/^\/enquiries\/([^/]+)\/reply\/([^/]+)\/send$/);
  if (sendReplyMatch && method === "POST") return sendReply(request, env, staff, sendReplyMatch[1], sendReplyMatch[2]);
  const retryMatch = path.match(/^\/enquiries\/([^/]+)\/messages\/([^/]+)\/retry-translation$/);
  if (retryMatch && method === "POST") return retryTranslation(request, env, staff, retryMatch[1], retryMatch[2]);

  if (path === "/applications/") return listApplications(env, staff);
  const appMatch = path.match(/^\/applications\/([^/]+)\/?$/);
  if (appMatch && method === "GET") return viewApplication(env, staff, appMatch[1]);

  const statusMatch = path.match(/^\/applications\/([^/]+)\/status$/);
  if (statusMatch && method === "POST") return updateStatus(request, env, staff, statusMatch[1]);

  const docReqMatch = path.match(/^\/applications\/([^/]+)\/documents\/request$/);
  if (docReqMatch && method === "POST") return requestDocument(request, env, staff, docReqMatch[1]);

  const docDlMatch = path.match(/^\/applications\/([^/]+)\/documents\/([^/]+)\/download$/);
  if (docDlMatch && method === "GET") return downloadDocument(env, staff, docDlMatch[1], docDlMatch[2]);

  const docStatusMatch = path.match(/^\/applications\/([^/]+)\/documents\/([^/]+)\/status$/);
  if (docStatusMatch && method === "POST") return updateDocumentRequestStatus(request, env, staff, docStatusMatch[1], docStatusMatch[2]);

  const portalTranslateMatch = path.match(/^\/applications\/([^/]+)\/reply\/translate$/);
  if (portalTranslateMatch && method === "POST") return translatePortalReply(request, env, staff, portalTranslateMatch[1]);
  const portalSendMatch = path.match(/^\/applications\/([^/]+)\/reply\/([^/]+)\/send$/);
  if (portalSendMatch && method === "POST") return sendPortalReply(request, env, staff, portalSendMatch[1], portalSendMatch[2]);
  const portalRetryMatch = path.match(/^\/applications\/([^/]+)\/messages\/([^/]+)\/retry-translation$/);
  if (portalRetryMatch && method === "POST") return retryPortalMessageTranslation(request, env, staff, portalRetryMatch[1], portalRetryMatch[2]);

  const commsUpdateMatch = path.match(/^\/applications\/([^/]+)\/communication$/);
  if (commsUpdateMatch && method === "POST") return updateClientCommunicationPreferences(request, env, staff, commsUpdateMatch[1]);
  const consentMatch = path.match(/^\/applications\/([^/]+)\/communication\/consent$/);
  if (consentMatch && method === "POST") return recordClientConsent(request, env, staff, consentMatch[1]);

  const payMatch = path.match(/^\/applications\/([^/]+)\/payments$/);
  if (payMatch && method === "POST") return createPaymentRequest(request, env, staff, payMatch[1]);

  const payPaidMatch = path.match(/^\/applications\/([^/]+)\/payments\/([^/]+)\/mark-paid$/);
  if (payPaidMatch && method === "POST") return markPaymentPaid(request, env, staff, payPaidMatch[1], payPaidMatch[2]);

  const proofMatch = path.match(/^\/applications\/([^/]+)\/payments\/([^/]+)\/proof$/);
  if (proofMatch && method === "GET") return viewPaymentProof(env, staff, proofMatch[1], proofMatch[2]);

  return notFound();
}

const PRIORITY_OPTIONS = ["standard", "priority", "urgent"];
const PRIORITY_LABELS = { standard: "Standard", priority: "Priority", urgent: "Urgent" };

function priorityBadge(priority) {
  const label = PRIORITY_LABELS[priority] || priority;
  return `<span class="priority-badge priority-badge--${escapeHtml(priority)}">${escapeHtml(label)}</span>`;
}

// Active enquiries were previously sorted purely newest-first. This adds a
// priority tier ahead of that (urgent, then priority, then standard), and
// gives urgent/priority a different within-tier direction than standard:
// urgent and priority behave as triage queues, where the longest-waiting
// matter should surface first (oldest first); standard behaves as an
// incoming-lead feed, where the newest submission should stay immediately
// visible (newest first). A single ORDER BY can't apply ASC to one tier and
// DESC to another directly, so the second sort key is a signed epoch
// (negative for standard, positive otherwise) that sorts ascending into
// exactly that effect — see WITHIN_TIER_ORDER_SQL below, reused by the
// filtered query so "?priority=standard" also sorts newest-first while
// "?priority=urgent"/"priority" still sort oldest-first.
const WITHIN_TIER_ORDER_SQL =
  "CASE WHEN priority = 'standard' THEN -strftime('%s', created_at) ELSE strftime('%s', created_at) END";

async function listEnquiries(env, staff, priorityFilter) {
  const validFilter = PRIORITY_OPTIONS.includes(priorityFilter) ? priorityFilter : null;

  const query = validFilter
    ? env.DB.prepare(
        `SELECT id, reference, full_name, email, service_slug, status, priority, created_at
         FROM enquiries WHERE archived_at IS NULL AND priority = ?
         ORDER BY ${WITHIN_TIER_ORDER_SQL} LIMIT 100`
      ).bind(validFilter)
    : env.DB.prepare(
        `SELECT id, reference, full_name, email, service_slug, status, priority, created_at
         FROM enquiries WHERE archived_at IS NULL
         ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, ${WITHIN_TIER_ORDER_SQL}
         LIMIT 100`
      );
  const { results } = await query.all();

  const rows = results
    .map(
      (e) => `<tr>
        <td><a class="ref" href="/staff/enquiries/${e.id}">${escapeHtml(e.reference)}</a></td>
        <td>${escapeHtml(e.full_name)}</td>
        <td>${escapeHtml(e.email)}</td>
        <td>${escapeHtml(e.service_slug)}</td>
        <td>${priorityBadge(e.priority)}</td>
        <td><span class="status">${escapeHtml(e.status)}</span></td>
        <td class="muted">${escapeHtml(e.created_at)}</td>
        <td><form method="POST" action="/staff/enquiries/${e.id}/archive"><button class="secondary" type="submit">Archive</button></form></td>
      </tr>`
    )
    .join("");

  const filterLink = (value, label) =>
    `<a href="/staff/enquiries/${value ? "?priority=" + value : ""}" class="${validFilter === value ? "filter-active" : ""}">${label}</a>`;

  return staffPage(
    "Enquiries",
    `<h1>Enquiries</h1>
     <p class="filter-bar">${filterLink(null, "All")} · ${filterLink("urgent", "Urgent")} · ${filterLink("priority", "Priority")} · ${filterLink("standard", "Standard")}</p>
     <table>
       <tr><th>Reference</th><th>Name</th><th>Email</th><th>Service</th><th>Priority</th><th>Status</th><th>Received</th><th></th></tr>
       ${rows || '<tr><td colspan="8" class="muted">No enquiries yet.</td></tr>'}
     </table>`,
    staff.email
  );
}

async function listArchivedEnquiries(env, staff) {
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.reference, e.full_name, e.email, e.archived_at,
            EXISTS(SELECT 1 FROM applications a WHERE a.enquiry_id = e.id) AS converted
     FROM enquiries e WHERE e.archived_at IS NOT NULL ORDER BY e.archived_at DESC LIMIT 100`
  ).all();

  const rows = results
    .map(
      (e) => `<tr>
        <td><a class="ref" href="/staff/enquiries/${e.id}">${escapeHtml(e.reference)}</a></td>
        <td>${escapeHtml(e.full_name)}</td>
        <td>${escapeHtml(e.email)}</td>
        <td class="muted">${escapeHtml(e.archived_at)}</td>
        <td>
          <form method="POST" action="/staff/enquiries/${e.id}/restore" style="display:inline"><button class="secondary" type="submit">Restore</button></form>
          ${e.converted
            ? '<span class="muted">Converted — archive only</span>'
            : `<form method="POST" action="/staff/enquiries/${e.id}/delete" style="display:inline" onsubmit="return confirm('Permanently delete enquiry ${escapeHtml(e.reference)}?\\n\\nThis action cannot be undone.');"><button class="danger" type="submit">Permanently Delete</button></form>`}
        </td>
      </tr>`
    )
    .join("");

  return staffPage(
    "Archived Enquiries",
    `<h1>Archived Enquiries</h1>
     <table>
       <tr><th>Reference</th><th>Name</th><th>Email</th><th>Archived</th><th>Actions</th></tr>
       ${rows || '<tr><td colspan="5" class="muted">No archived enquiries.</td></tr>'}
     </table>`,
    staff.email
  );
}

async function viewEnquiry(env, staff, id) {
  const enquiry = await env.DB.prepare("SELECT * FROM enquiries WHERE id = ?").bind(id).first();
  if (!enquiry) return notFound();

  const existingClient = await getClientByEmail(env.DB, enquiry.email);

  const archiveControl = enquiry.archived_at
    ? `<form method="POST" action="/staff/enquiries/${enquiry.id}/restore"><button class="secondary" type="submit">Restore from archive</button></form>`
    : `<form method="POST" action="/staff/enquiries/${enquiry.id}/archive"><button class="secondary" type="submit">Archive</button></form>`;

  const priorityOptionsHtml = PRIORITY_OPTIONS.map(
    (p) => `<option value="${p}" ${p === enquiry.priority ? "selected" : ""}>${PRIORITY_LABELS[p]}</option>`
  ).join("");

  const conversation = await getConversationByEnquiryId(env.DB, enquiry.id);
  const communicationsHtml = conversation
    ? await renderCommunicationsCard(env, enquiry, conversation)
    : "";

  return staffPage(
    `Enquiry ${enquiry.reference}`,
    `<h1>Enquiry ${escapeHtml(enquiry.reference)} ${priorityBadge(enquiry.priority)}</h1>
     <div class="card">
       <p><strong>${escapeHtml(enquiry.full_name)}</strong> &lt;${escapeHtml(enquiry.email)}&gt;</p>
       <p class="muted">${escapeHtml(enquiry.phone || "No phone given")} · ${escapeHtml(enquiry.nationality)} · ${escapeHtml(enquiry.location || "")}</p>
       <p><strong>Service:</strong> ${escapeHtml(enquiry.service_slug)}</p>
       <p>${escapeHtml(enquiry.description).replace(/\n/g, "<br>")}</p>
       <p class="muted">Received ${escapeHtml(enquiry.created_at)}${enquiry.archived_at ? ` · Archived ${escapeHtml(enquiry.archived_at)}` : ""}</p>
       <form method="POST" action="/staff/enquiries/${enquiry.id}/priority">
         <label for="priority">Priority</label>
         <select name="priority" id="priority">${priorityOptionsHtml}</select>
         <button class="secondary" type="submit">Update priority</button>
       </form>
     </div>
     ${communicationsHtml}
     <div class="card">
       <h2>${existingClient ? "Create application for existing client" : "Convert to client"}</h2>
       <p class="muted">${existingClient ? `${escapeHtml(existingClient.full_name)} is already a client — this creates a new application linked to their existing account.` : "Creates a client account (a magic-link welcome email is sent) and opens a linked application."}</p>
       <form method="POST" action="/staff/enquiries/${enquiry.id}/convert">
         <button type="submit">${existingClient ? "Create application" : "Convert to client"}</button>
       </form>
     </div>
     <div class="card">
       <h2>Archive</h2>
       <p class="muted">Archiving removes this enquiry from the active list without deleting it. It can be restored at any time.</p>
       ${archiveControl}
     </div>`,
    staff.email
  );
}

// Renders the original-language + English translation for one inbound
// client message, and the English original + client-language content for
// one outbound staff message. All text is escaped — original client text,
// translated text, and staff-authored text are all untrusted input as far
// as HTML rendering is concerned.
// basePath is e.g. "/staff/enquiries/<id>" or "/staff/applications/<id>" —
// the two contexts render an identical card shape for a generalized
// message, differing only in which resource's reply/retry routes they
// point at.
// message is a normalized timeline item (see conversations.js
// normalizeGeneralizedMessage/getMergedTimeline) — never a raw DB row.
function renderMessage(basePath, message) {
  const nl2br = (text) => escapeHtml(text).replace(/\n/g, "<br>");
  const retryForm = `<form method="POST" action="${basePath}/messages/${message.id}/retry-translation" style="display:inline"><button class="secondary" type="submit">Retry translation</button></form>`;

  if (message.senderType === "client") {
    const sourceLabel = LANGUAGE_LABELS[message.originalLanguage] || escapeHtml(message.originalLanguage);
    let translationBlock;
    if (message.translationStatus === "not_required") {
      translationBlock = `<p class="muted">English translation: not required (already in English).</p>`;
    } else if (message.translationStatus === "ready") {
      translationBlock = `<p><strong>English translation</strong></p><p>${nl2br(message.translationText)}</p>`;
    } else if (message.translationStatus === "failed") {
      translationBlock = `<p class="muted">Translation unavailable.</p>${retryForm}`;
    } else {
      translationBlock = `<p class="muted">Translation in progress.</p>`;
    }
    return `<div class="card">
      <p class="muted">Client message · ${escapeHtml(sourceLabel)} · ${escapeHtml(message.createdAt)}</p>
      <p><strong>Client original</strong></p>
      <p>${nl2br(message.originalText)}</p>
      ${translationBlock}
    </div>`;
  }

  // Staff-authored outbound message.
  const targetLabel = LANGUAGE_LABELS[message.translationLanguage] || escapeHtml(message.translationLanguage);
  let clientFacingBlock;
  if (message.translationStatus === "not_required") {
    clientFacingBlock = `<p class="muted">Sent as English (client requested English communication).</p>`;
  } else if (message.translationStatus === "ready") {
    clientFacingBlock = `<p><strong>Client-language preview (${escapeHtml(targetLabel)})</strong></p><p>${nl2br(message.translationText)}</p>`;
  } else if (message.translationStatus === "unsupported_target") {
    clientFacingBlock = `<p class="muted">Automatic translation is unavailable for the selected communication language. This draft has not been sent.</p>`;
  } else if (message.translationStatus === "failed") {
    clientFacingBlock = `<p class="muted">Translation unavailable.</p>${retryForm}`;
  } else {
    clientFacingBlock = `<p class="muted">Translation in progress.</p>`;
  }

  let deliveryBlock;
  const canSend = message.deliveryStatus !== "sent" && ["ready", "not_required"].includes(message.translationStatus);
  if (message.deliveryStatus === "sent") {
    deliveryBlock = `<p class="muted">Sent.</p>`;
  } else if (message.deliveryStatus === "failed") {
    deliveryBlock = `<p class="muted">Delivery failed.</p>`;
  } else {
    deliveryBlock = "";
  }
  const sendForm = canSend
    ? `<form method="POST" action="${basePath}/reply/${message.id}/send"><button type="submit">Send Reply</button></form>`
    : "";

  return `<div class="card">
    <p class="muted">Staff reply · ${escapeHtml(message.createdAt)}</p>
    <p><strong>English original</strong></p>
    <p>${nl2br(message.originalText)}</p>
    ${clientFacingBlock}
    ${deliveryBlock}
    ${sendForm}
  </div>`;
}

// A historical legacy `messages` row, rendered in its existing simple form
// (no translation concept applies to it) — never mutated, never migrated.
function renderLegacyMessage(message) {
  const nl2br = (text) => escapeHtml(text).replace(/\n/g, "<br>");
  return `<div class="card">
    <p class="muted">${escapeHtml(message.senderLabel)} · ${escapeHtml(message.createdAt)}</p>
    <p>${nl2br(message.originalText)}</p>
  </div>`;
}

function renderTimelineItem(basePath, item) {
  return item.source === "legacy" ? renderLegacyMessage(item) : renderMessage(basePath, item);
}

async function renderCommunicationsCard(env, enquiry, conversation) {
  // applicationId: null — an enquiry-stage conversation never has legacy
  // `messages` rows (those only ever exist for a converted application).
  const timeline = await getMergedTimeline(env.DB, { applicationId: null, conversationId: conversation.id });
  const preferredLabel = conversation.preferred_language
    ? LANGUAGE_LABELS[conversation.preferred_language] || escapeHtml(conversation.preferred_language)
    : "Not specified";

  const basePath = `/staff/enquiries/${enquiry.id}`;
  const messagesHtml = timeline.map((item) => renderTimelineItem(basePath, item)).join("");

  return `<div class="card">
    <h2>Communications</h2>
    <p class="muted">Preferred communication language: <strong>${escapeHtml(preferredLabel)}</strong></p>
  </div>
  ${messagesHtml}
  <div class="card">
    <h2>Write a reply</h2>
    <p class="muted">Write in English. You will preview the translated version before anything is sent.</p>
    <form method="POST" action="/staff/enquiries/${enquiry.id}/reply/translate">
      <label for="englishText">English reply</label>
      <textarea name="englishText" id="englishText" required></textarea>
      <button type="submit">Translate &amp; Preview</button>
    </form>
  </div>`;
}

// Step 1 of the reply workflow: staff submits English text. The draft
// message row is created here, at this deliberate action point — not on
// every keystroke, not automatically. Translation is attempted immediately
// so the very next page load already shows the preview; nothing is sent
// yet regardless of the outcome.
async function translateReply(request, env, staff, enquiryId) {
  const enquiry = await env.DB.prepare("SELECT id FROM enquiries WHERE id = ?").bind(enquiryId).first();
  if (!enquiry) return notFound();
  const conversation = await getConversationByEnquiryId(env.DB, enquiryId);
  if (!conversation) return notFound();

  const form = await request.formData();
  const englishText = String(form.get("englishText") || "").trim().slice(0, 5000);
  if (!englishText) return new Response("Reply text required", { status: 400 });

  const target = conversation.preferred_language;

  let messageId;
  if (!target || target === "other") {
    // Never guess a target for an unsupported/unspecified preference — the
    // draft is created so the English text isn't lost, but no translation
    // is attempted and no send action becomes available for it.
    messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "staff",
      channel: "email",
      sourceLanguage: "en",
      sourceText: englishText,
      targetLanguage: target || "other",
      translationStatus: "unsupported_target",
      deliveryStatus: "draft",
    });
  } else if (target === "en") {
    messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "staff",
      channel: "email",
      sourceLanguage: "en",
      sourceText: englishText,
      targetLanguage: "en",
      targetText: englishText,
      translationStatus: "not_required",
      deliveryStatus: "draft",
    });
  } else {
    messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "staff",
      channel: "email",
      sourceLanguage: "en",
      sourceText: englishText,
      targetLanguage: target,
      translationStatus: "pending",
      deliveryStatus: "draft",
    });
    const result = await translateFromEnglish(env, englishText, target);
    await updateMessageTranslation(env.DB, {
      id: messageId,
      targetText: result.text,
      translationStatus: result.status,
      translationProvider: result.provider,
    });
  }

  return Response.redirect(`${new URL(request.url).origin}/staff/enquiries/${enquiryId}`, 303);
}

// Step 2: staff explicitly confirms send after reviewing the preview.
async function sendReply(request, env, staff, enquiryId, messageId) {
  const enquiry = await env.DB.prepare("SELECT * FROM enquiries WHERE id = ?").bind(enquiryId).first();
  if (!enquiry) return notFound();
  const message = await getMessageById(env.DB, messageId);
  if (!message || message.sender_type !== "staff") return notFound();
  if (!["ready", "not_required"].includes(message.translation_status)) {
    return new Response("This reply has not been translated yet", { status: 400 });
  }
  if (message.delivery_status === "sent") {
    return Response.redirect(`${new URL(request.url).origin}/staff/enquiries/${enquiryId}`, 303);
  }

  const replyText = message.target_text || message.source_text;
  try {
    await sendEnquiryReplyEmail(env, {
      to: enquiry.email,
      fullName: enquiry.full_name,
      reference: enquiry.reference,
      replyText,
    });
    await updateMessageDeliveryStatus(env.DB, { id: messageId, deliveryStatus: "sent" });
    await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "sent_enquiry_reply", targetTable: "communication_messages", targetId: messageId });
  } catch (err) {
    console.error("Enquiry reply email failed:", err.message);
    await updateMessageDeliveryStatus(env.DB, { id: messageId, deliveryStatus: "failed" });
  }

  return Response.redirect(`${new URL(request.url).origin}/staff/enquiries/${enquiryId}`, 303);
}

// Re-attempts translation for one message that previously failed. Only
// touches translation fields, never delivery_status, so retrying can never
// cause a duplicate send. Shared by the enquiry and application/portal
// contexts — identical logic, differing only in where it redirects back to.
async function retryMessageTranslation(request, env, messageId, redirectPath) {
  const message = await getMessageById(env.DB, messageId);
  if (!message) return notFound();

  if (message.sender_type === "client") {
    const result = await translateToEnglish(env, message.source_text, message.source_language);
    await updateMessageTranslation(env.DB, {
      id: messageId,
      targetText: result.text,
      translationStatus: result.status,
      translationProvider: result.provider,
    });
  } else if (message.sender_type === "staff" && message.target_language && message.target_language !== "other") {
    const result = await translateFromEnglish(env, message.source_text, message.target_language);
    await updateMessageTranslation(env.DB, {
      id: messageId,
      targetText: result.text,
      translationStatus: result.status,
      translationProvider: result.provider,
    });
  }

  return Response.redirect(`${new URL(request.url).origin}${redirectPath}`, 303);
}

async function retryTranslation(request, env, staff, enquiryId, messageId) {
  return retryMessageTranslation(request, env, messageId, `/staff/enquiries/${enquiryId}`);
}

async function retryPortalMessageTranslation(request, env, staff, applicationId, messageId) {
  return retryMessageTranslation(request, env, messageId, `/staff/applications/${applicationId}`);
}

// Step 1 of the portal reply workflow (mirrors translateReply above for
// enquiries): staff submits English text for an application. Resolves or
// lazily creates the generalized conversation for this application, then
// creates the draft and attempts translation immediately.
async function translatePortalReply(request, env, staff, applicationId) {
  const application = await env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(applicationId).first();
  if (!application) return notFound();

  const form = await request.formData();
  const englishText = String(form.get("englishText") || "").trim().slice(0, 5000);
  if (!englishText) return new Response("Reply text required", { status: 400 });

  const client = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(application.client_id).first();
  const conversation = await getOrCreateConversationForApplication(env.DB, {
    applicationId,
    clientId: application.client_id,
    preferredLanguage: client ? client.preferred_communication_language : null,
  });

  // The client's current durable preference takes priority over the
  // conversation's own (possibly stale) snapshot — a client may have
  // updated their preference since the conversation was first created.
  const target = (client && client.preferred_communication_language) || conversation.preferred_language;

  let messageId;
  if (!target || target === "other") {
    messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "staff",
      channel: "portal",
      sourceLanguage: "en",
      sourceText: englishText,
      targetLanguage: target || "other",
      translationStatus: "unsupported_target",
      deliveryStatus: "draft",
    });
  } else if (target === "en") {
    messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "staff",
      channel: "portal",
      sourceLanguage: "en",
      sourceText: englishText,
      targetLanguage: "en",
      targetText: englishText,
      translationStatus: "not_required",
      deliveryStatus: "draft",
    });
  } else {
    messageId = await insertCommunicationMessage(env.DB, {
      conversationId: conversation.id,
      senderType: "staff",
      channel: "portal",
      sourceLanguage: "en",
      sourceText: englishText,
      targetLanguage: target,
      translationStatus: "pending",
      deliveryStatus: "draft",
    });
    const result = await translateFromEnglish(env, englishText, target);
    await updateMessageTranslation(env.DB, {
      id: messageId,
      targetText: result.text,
      translationStatus: result.status,
      translationProvider: result.provider,
    });
  }

  return Response.redirect(`${new URL(request.url).origin}/staff/applications/${applicationId}`, 303);
}

// Step 2: staff explicitly confirms send. For the portal channel, "sent"
// means persisted and now visible to the client in their portal — there is
// no external service call here (Resend is never used for portal
// messages), so unlike the enquiry-email path there is no realistic
// external failure mode to model; a genuine database error surfaces as the
// route's normal 500, the same as any other unexpected failure in this file.
async function sendPortalReply(request, env, staff, applicationId, messageId) {
  const application = await env.DB.prepare(
    `SELECT a.*, c.email, c.full_name FROM applications a JOIN clients c ON c.id = a.client_id WHERE a.id = ?`
  )
    .bind(applicationId)
    .first();
  if (!application) return notFound();
  const message = await getMessageById(env.DB, messageId);
  if (!message || message.sender_type !== "staff") return notFound();
  if (!["ready", "not_required"].includes(message.translation_status)) {
    return new Response("This reply has not been translated yet", { status: 400 });
  }
  if (message.delivery_status === "sent") {
    return Response.redirect(`${new URL(request.url).origin}/staff/applications/${applicationId}`, 303);
  }

  await updateMessageDeliveryStatus(env.DB, { id: messageId, deliveryStatus: "sent" });
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "sent_portal_reply", targetTable: "communication_messages", targetId: messageId });

  // Same generic "you have a new message, sign in to view" notification
  // already used by the legacy messaging path — reused unchanged, and
  // fired exactly once per actual send (the old plain-message route this
  // replaces is removed, so there is no second path that could double it).
  try {
    await sendClientMessageNotification(env, { to: application.email, applicationReference: application.reference });
  } catch (err) {
    console.error("Portal message notification email failed:", err.message);
  }

  return Response.redirect(`${new URL(request.url).origin}/staff/applications/${applicationId}`, 303);
}

async function updateEnquiryPriority(request, env, staff, id) {
  const form = await request.formData();
  const priority = String(form.get("priority") || "");
  if (!PRIORITY_OPTIONS.includes(priority)) return new Response("Invalid priority", { status: 400 });

  const enquiry = await env.DB.prepare("SELECT id FROM enquiries WHERE id = ?").bind(id).first();
  if (!enquiry) return notFound();

  await env.DB.prepare("UPDATE enquiries SET priority = ? WHERE id = ?").bind(priority, id).run();
  await logAudit(env.DB, {
    actorType: "staff",
    actorIdOrEmail: staff.email,
    action: "updated_priority",
    targetTable: "enquiries",
    targetId: id,
    metadata: JSON.stringify({ priority }),
  });

  return Response.redirect(`${new URL(request.url).origin}/staff/enquiries/${id}`, 303);
}

async function archiveEnquiry(request, env, staff, id) {
  const enquiry = await env.DB.prepare("SELECT id FROM enquiries WHERE id = ?").bind(id).first();
  if (!enquiry) return notFound();

  await env.DB.prepare("UPDATE enquiries SET archived_at = datetime('now') WHERE id = ? AND archived_at IS NULL")
    .bind(id)
    .run();
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "archived_enquiry", targetTable: "enquiries", targetId: id });

  return Response.redirect(`${new URL(request.url).origin}/staff/enquiries/`, 303);
}

async function restoreEnquiry(request, env, staff, id) {
  const enquiry = await env.DB.prepare("SELECT id FROM enquiries WHERE id = ?").bind(id).first();
  if (!enquiry) return notFound();

  await env.DB.prepare("UPDATE enquiries SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL")
    .bind(id)
    .run();
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "restored_enquiry", targetTable: "enquiries", targetId: id });

  return Response.redirect(`${new URL(request.url).origin}/staff/enquiries/archived/`, 303);
}

// Deliberately more restrictive than archive: admin role only, must already
// be archived (an extra deliberate step, not a one-click action from the
// busy Active list), and rejected outright if any application was ever
// created from this enquiry — applications.enquiry_id has no ON DELETE
// clause in the schema, so deleting a referenced enquiry risks either a
// foreign-key failure or an orphaned reference, neither acceptable.
async function deleteEnquiry(request, env, staff, id) {
  if (staff.role !== "admin") {
    return new Response("Permanent deletion requires administrator authorization.", { status: 403 });
  }

  const enquiry = await env.DB.prepare("SELECT id, reference, service_slug, created_at, archived_at FROM enquiries WHERE id = ?").bind(id).first();
  if (!enquiry) return notFound();

  if (!enquiry.archived_at) {
    return new Response("Archive this enquiry before deleting it.", { status: 400 });
  }

  const linkedApplication = await env.DB.prepare("SELECT id FROM applications WHERE enquiry_id = ? LIMIT 1").bind(id).first();
  if (linkedApplication) {
    return new Response(
      "This enquiry has been converted to an application and cannot be permanently deleted. Archive it instead.",
      { status: 400 }
    );
  }

  // Logged before deletion, so the audit trail still shows who deleted what
  // and when even though the enquiry row itself is about to be gone. The
  // metadata snapshot is deliberately limited to non-PII fields — never
  // full_name, email, phone, nationality, location, language, or
  // description, since the whole point of the deletion is to remove those.
  await logAudit(env.DB, {
    actorType: "staff",
    actorIdOrEmail: staff.email,
    action: "permanently_deleted_enquiry",
    targetTable: "enquiries",
    targetId: id,
    metadata: JSON.stringify({
      reference: enquiry.reference,
      service_slug: enquiry.service_slug,
      created_at: enquiry.created_at,
    }),
  });
  await env.DB.prepare("DELETE FROM enquiries WHERE id = ?").bind(id).run();

  return Response.redirect(`${new URL(request.url).origin}/staff/enquiries/archived/`, 303);
}

async function convertEnquiry(request, env, staff, id) {
  const enquiry = await env.DB.prepare("SELECT * FROM enquiries WHERE id = ?").bind(id).first();
  if (!enquiry) return notFound();

  let client = await getClientByEmail(env.DB, enquiry.email);
  let isNewClient = false;
  if (!client) {
    // Opportunistic only: the public enquiry form has no country selector,
    // so this only ever succeeds when a visitor happened to type their own
    // number in full international format ("+..."), which the parser can
    // resolve unambiguously without any country guess. Anything else
    // leaves mobile_e164 null here — never inferred, never guessed. The
    // historical free-form `phone` value is carried over unchanged either way.
    const phoneNormalization = normalizePhoneNumber(enquiry.phone, null);
    client = await createClient(env.DB, {
      fullName: enquiry.full_name,
      email: enquiry.email,
      phone: enquiry.phone,
      nationality: enquiry.nationality,
      mobileE164: phoneNormalization.valid ? phoneNormalization.e164 : null,
    });
    isNewClient = true;
  }

  const applicationId = newId();
  const reference = await insertUniqueReference(env.DB, "applications");
  await env.DB.prepare(
    "INSERT INTO applications (id, reference, client_id, service_slug, enquiry_id) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(applicationId, reference, client.id, enquiry.service_slug, enquiry.id)
    .run();

  await env.DB.prepare(
    "INSERT INTO application_status_history (id, application_id, status, changed_by_staff_email) VALUES (?, ?, 'enquiry_received', ?)"
  )
    .bind(newId(), applicationId, staff.email)
    .run();

  await env.DB.prepare("UPDATE enquiries SET status = 'converted' WHERE id = ?").bind(enquiry.id).run();
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "converted_enquiry", targetTable: "applications", targetId: applicationId });

  // Multilingual communications (Phase 1): the conversation created at
  // enquiry time continues — never a new one — now linked to the resulting
  // client/application. The client's durable preference is backfilled only
  // if they don't already have one (a returning client's existing stated
  // preference is never overwritten by whatever this particular enquiry said).
  const conversation = await getConversationByEnquiryId(env.DB, enquiry.id);
  if (conversation) {
    await linkConversationToClient(env.DB, { conversationId: conversation.id, clientId: client.id, applicationId });
    if (!client.preferred_communication_language && conversation.preferred_language) {
      await env.DB.prepare("UPDATE clients SET preferred_communication_language = ? WHERE id = ?")
        .bind(conversation.preferred_language, client.id)
        .run();
    }
  }

  if (isNewClient) {
    // Welcome email doubles as the client's first magic link.
    const rawToken = newToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT INTO auth_tokens (id, client_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
      .bind(newId(), client.id, tokenHash, expiresAt)
      .run();
    try {
      await sendMagicLink(env, { to: client.email, url: `${env.PUBLIC_SITE_URL}/portal/verify/?token=${rawToken}` });
    } catch (err) {
      console.error("Welcome email failed:", err.message);
    }
  }

  return Response.redirect(`${new URL(request.url).origin}/staff/applications/${applicationId}`, 303);
}

async function listApplications(env, staff) {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.reference, a.service_slug, a.status, a.created_at, c.full_name, c.email
     FROM applications a JOIN clients c ON c.id = a.client_id
     ORDER BY a.updated_at DESC LIMIT 100`
  ).all();

  const rows = results
    .map(
      (a) => `<tr>
        <td><a class="ref" href="/staff/applications/${a.id}">${escapeHtml(a.reference)}</a></td>
        <td>${escapeHtml(a.full_name)}</td>
        <td>${escapeHtml(a.service_slug)}</td>
        <td><span class="status">${escapeHtml(a.status)}</span></td>
        <td class="muted">${escapeHtml(a.created_at)}</td>
      </tr>`
    )
    .join("");

  return staffPage(
    "Applications",
    `<h1>Applications</h1>
     <table>
       <tr><th>Reference</th><th>Client</th><th>Service</th><th>Status</th><th>Opened</th></tr>
       ${rows || '<tr><td colspan="5" class="muted">No applications yet.</td></tr>'}
     </table>`,
    staff.email
  );
}

// Staff correcting a client's communication preferences — language,
// channel, and the normalized mobile number. This never touches the
// client's existing free-form `phone` field, and never creates or changes
// any consent row (that's the separate, explicit recordClientConsent
// action below).
async function updateClientCommunicationPreferences(request, env, staff, applicationId) {
  const application = await env.DB.prepare("SELECT client_id FROM applications WHERE id = ?").bind(applicationId).first();
  if (!application) return notFound();

  const form = await request.formData();
  const client = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(application.client_id).first();
  if (!client) return notFound();

  const languageValue = String(form.get("preferredCommunicationLanguage") || "").trim();
  if (languageValue && !CANONICAL_LANGUAGES.includes(languageValue) && languageValue !== "other") {
    return new Response("Invalid preferred communication language", { status: 400 });
  }
  const preferredCommunicationLanguage = languageValue || null;

  const channelValue = String(form.get("preferredCommunicationChannel") || "").trim();
  if (channelValue && !COMMUNICATION_CHANNELS.includes(channelValue)) {
    return new Response("Invalid preferred communication channel", { status: 400 });
  }
  const preferredCommunicationChannel = channelValue || null;

  let mobileE164 = client.mobile_e164;
  const rawMobile = String(form.get("mobileNumber") || "").trim();
  if (!rawMobile) {
    mobileE164 = null;
  } else {
    const country = String(form.get("mobileCountry") || "").trim().toUpperCase() || null;
    if (country && !isSupportedMobileCountry(country)) {
      return new Response("Unsupported mobile number country", { status: 400 });
    }
    const result = normalizePhoneNumber(rawMobile, country);
    if (!result.valid) {
      return new Response("Could not recognize that as a valid mobile number. Select a country, or enter it in full international format (e.g. +639171234567).", { status: 400 });
    }
    mobileE164 = result.e164;
  }

  await env.DB.prepare(
    `UPDATE clients SET preferred_communication_language = ?, preferred_communication_channel = ?, mobile_e164 = ?
     WHERE id = ?`
  )
    .bind(preferredCommunicationLanguage, preferredCommunicationChannel, mobileE164, client.id)
    .run();
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "updated_communication_preferences", targetTable: "clients", targetId: client.id });

  return Response.redirect(`${new URL(request.url).origin}/staff/applications/${applicationId}`, 303);
}

// Staff explicitly recording that a client granted or revoked consent for
// an external channel outside the portal (e.g. over the phone, in person).
// This is a deliberate, separate action from updateClientCommunicationPreferences
// above — it never runs implicitly, and the source is always 'staff_recorded',
// never defaulted to 'granted'.
async function recordClientConsent(request, env, staff, applicationId) {
  const application = await env.DB.prepare("SELECT client_id FROM applications WHERE id = ?").bind(applicationId).first();
  if (!application) return notFound();

  const form = await request.formData();
  const channel = String(form.get("channel") || "").trim();
  const status = String(form.get("status") || "").trim();
  if (!isValidConsentChannel(channel)) return new Response("Invalid consent channel", { status: 400 });
  if (!isValidConsentStatus(status)) return new Response("Invalid consent status", { status: 400 });

  await setClientConsent(env.DB, { clientId: application.client_id, channel, status, source: "staff_recorded" });
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: `staff_recorded_consent_${status}`, targetTable: "client_channel_consents", targetId: application.client_id });

  return Response.redirect(`${new URL(request.url).origin}/staff/applications/${applicationId}`, 303);
}

async function viewApplication(env, staff, id) {
  const application = await env.DB.prepare(
    `SELECT a.*, c.full_name, c.email FROM applications a JOIN clients c ON c.id = a.client_id WHERE a.id = ?`
  )
    .bind(id)
    .first();
  if (!application) return notFound();

  const conversation = await getConversationByApplicationId(env.DB, id);
  const [{ results: docRequests }, { results: documents }, timeline, { results: payments }, client, consents] = await Promise.all([
    env.DB.prepare("SELECT * FROM document_requests WHERE application_id = ? ORDER BY created_at DESC").bind(id).all(),
    env.DB.prepare("SELECT * FROM documents WHERE application_id = ? ORDER BY created_at DESC").bind(id).all(),
    getMergedTimeline(env.DB, { applicationId: id, conversationId: conversation ? conversation.id : null }),
    env.DB.prepare("SELECT * FROM payment_requests WHERE application_id = ? ORDER BY created_at DESC").bind(id).all(),
    env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(application.client_id).first(),
    getConsentStatusMap(env.DB, application.client_id),
  ]);

  const statusOptionsHtml = STATUS_OPTIONS.map(
    (s) => `<option value="${s}" ${s === application.status ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`
  ).join("");

  const docRequestRows = docRequests
    .map((dr) => {
      const matchingDoc = documents.find((d) => d.document_request_id === dr.id);
      return `<tr>
        <td>${escapeHtml(dr.label)}</td>
        <td><span class="status">${escapeHtml(dr.status)}</span></td>
        <td>${matchingDoc ? `<a href="/staff/applications/${id}/documents/${matchingDoc.id}/download">${escapeHtml(matchingDoc.original_filename)}</a>` : '<span class="muted">Not uploaded</span>'}</td>
        <td>${matchingDoc ? `<form method="POST" action="/staff/applications/${id}/documents/${dr.id}/status" style="display:inline"><input type="hidden" name="status" value="received"><button class="secondary" type="submit">Mark received</button></form>
             <form method="POST" action="/staff/applications/${id}/documents/${dr.id}/status" style="display:inline"><input type="hidden" name="status" value="rejected"><button class="secondary" type="submit">Reject</button></form>` : ""}</td>
      </tr>`;
    })
    .join("");

  const otherDocs = documents.filter((d) => !d.document_request_id);
  const otherDocRows = otherDocs
    .map((d) => `<tr><td colspan="3"><a href="/staff/applications/${id}/documents/${d.id}/download">${escapeHtml(d.original_filename)}</a> <span class="muted">(${escapeHtml(d.uploaded_by)})</span></td></tr>`)
    .join("");

  const basePath = `/staff/applications/${id}`;
  const messageRows = timeline.map((item) => renderTimelineItem(basePath, item)).join("") || '<p class="muted">No messages yet.</p>';
  const preferredLabel = client && client.preferred_communication_language
    ? LANGUAGE_LABELS[client.preferred_communication_language] || escapeHtml(client.preferred_communication_language)
    : conversation && conversation.preferred_language
      ? LANGUAGE_LABELS[conversation.preferred_language] || escapeHtml(conversation.preferred_language)
      : "Not specified";

  const languageOptionsHtml = [...CANONICAL_LANGUAGES, "other"]
    .map((code) => `<option value="${code}" ${client && client.preferred_communication_language === code ? "selected" : ""}>${escapeHtml(LANGUAGE_LABELS[code] || code)}</option>`)
    .join("");
  const channelOptionsHtml = COMMUNICATION_CHANNELS
    .map((c) => `<option value="${c}" ${client && client.preferred_communication_channel === c ? "selected" : ""}>${escapeHtml(c)}</option>`)
    .join("");
  const countryOptionsHtml = SUPPORTED_MOBILE_COUNTRIES.map((c) => `<option value="${c}">${c}</option>`).join("");
  const consentChannelOptionsHtml = CONSENT_CHANNELS.map((c) => `<option value="${c}">${escapeHtml(c)}</option>`).join("");
  const consentRows = CONSENT_CHANNELS
    .map((c) => `<tr><td>${escapeHtml(c)}</td><td>${consents[c] ? `<span class="status">${escapeHtml(consents[c])}</span>` : '<span class="muted">Not recorded</span>'}</td></tr>`)
    .join("");

  const paymentRows = payments
    .map(
      (p) => `<tr>
        <td>PHP ${p.amount_php.toFixed(2)}</td>
        <td>${escapeHtml(p.description)}</td>
        <td><span class="status">${escapeHtml(p.status)}</span></td>
        <td>${p.status === "submitted" ? `<a href="/staff/applications/${id}/payments/${p.id}/proof">View proof</a>` : ""}</td>
        <td>${p.status !== "paid" ? `<form method="POST" action="/staff/applications/${id}/payments/${p.id}/mark-paid"><button type="submit">Mark paid</button></form>` : `<span class="muted">Verified by ${escapeHtml(p.verified_by_staff_email || "")}</span>`}</td>
      </tr>`
    )
    .join("");

  return staffPage(
    `Application ${application.reference}`,
    `<h1>Application ${escapeHtml(application.reference)}</h1>
     <div class="card">
       <p><strong>${escapeHtml(application.full_name)}</strong> &lt;${escapeHtml(application.email)}&gt;</p>
       <p><strong>Service:</strong> ${escapeHtml(application.service_slug)} &nbsp; <strong>Status:</strong> <span class="status">${escapeHtml(application.status)}</span></p>
       <form method="POST" action="/staff/applications/${id}/status">
         <label for="status">Update status</label>
         <select name="status" id="status">${statusOptionsHtml}</select>
         <label for="note">Note (client-visible)</label>
         <textarea name="note" id="note" rows="2" placeholder="Optional note shown to the client with this status change"></textarea>
         <button type="submit">Update status</button>
       </form>
     </div>

     <div class="card">
       <h2>Communication Preferences</h2>
       <p><strong>Preferred language:</strong> ${escapeHtml(preferredLabel)}</p>
       <p><strong>Preferred channel:</strong> ${client && client.preferred_communication_channel ? escapeHtml(client.preferred_communication_channel) : "Not specified"}</p>
       <p><strong>Mobile number:</strong> ${client && client.mobile_e164 ? escapeHtml(client.mobile_e164) : "Not on file"}</p>
       <table>
         <tr><th>Channel</th><th>Consent status</th></tr>
         ${consentRows}
       </table>
       <form method="POST" action="/staff/applications/${id}/communication">
         <label for="preferredCommunicationLanguage">Preferred language</label>
         <select name="preferredCommunicationLanguage" id="preferredCommunicationLanguage">
           <option value="">Not specified</option>
           ${languageOptionsHtml}
         </select>
         <label for="preferredCommunicationChannel">Preferred channel</label>
         <select name="preferredCommunicationChannel" id="preferredCommunicationChannel">
           <option value="">Not specified</option>
           ${channelOptionsHtml}
         </select>
         <label for="mobileNumber">Mobile number</label>
         <input type="text" name="mobileNumber" id="mobileNumber" value="${client && client.mobile_e164 ? escapeHtml(client.mobile_e164) : ""}" placeholder="e.g. +639171234567">
         <label for="mobileCountry">Country (only needed if not entering full international format)</label>
         <select name="mobileCountry" id="mobileCountry">
           <option value="">—</option>
           ${countryOptionsHtml}
         </select>
         <button type="submit">Save communication preferences</button>
       </form>
       <div class="card">
         <h3>Record consent obtained outside the portal</h3>
         <p class="muted">Only use this if the client has genuinely agreed, outside the client portal, to be contacted through this channel. This action never defaults to granted.</p>
         <form method="POST" action="/staff/applications/${id}/communication/consent">
           <label for="consentChannel">Channel</label>
           <select name="channel" id="consentChannel">${consentChannelOptionsHtml}</select>
           <label for="consentStatus">Action</label>
           <select name="status" id="consentStatus">
             <option value="granted">Record granted</option>
             <option value="revoked">Record revoked</option>
           </select>
           <button type="submit">Save</button>
         </form>
       </div>
     </div>

     <div class="card">
       <h2>Documents</h2>
       <table>
         <tr><th>Requested</th><th>Status</th><th>File</th><th>Action</th></tr>
         ${docRequestRows || '<tr><td colspan="4" class="muted">No documents requested yet.</td></tr>'}
         ${otherDocRows}
       </table>
       <form method="POST" action="/staff/applications/${id}/documents/request">
         <label for="label">Request a document</label>
         <input type="text" name="label" id="label" placeholder="e.g. Passport bio page" required>
         <button type="submit">Request document</button>
       </form>
     </div>

     <div class="card">
       <h2>Messages</h2>
       <p class="muted">Preferred communication language: <strong>${escapeHtml(preferredLabel)}</strong></p>
       ${messageRows}
       <div class="card">
         <h3>Write a reply</h3>
         <p class="muted">Write in English. You will preview the translated version before anything is sent.</p>
         <form method="POST" action="/staff/applications/${id}/reply/translate">
           <label for="englishText">English reply</label>
           <textarea name="englishText" id="englishText" rows="3" required></textarea>
           <button type="submit">Translate &amp; Preview</button>
         </form>
       </div>
     </div>

     <div class="card">
       <h2>Payments</h2>
       <table>
         <tr><th>Amount</th><th>Description</th><th>Status</th><th>Proof</th><th>Action</th></tr>
         ${paymentRows || '<tr><td colspan="5" class="muted">No payment requests yet.</td></tr>'}
       </table>
       <form method="POST" action="/staff/applications/${id}/payments">
         <label for="amount">Amount due (PHP)</label>
         <input type="number" step="0.01" min="0" name="amount" id="amount" required>
         <label for="description">Description</label>
         <input type="text" name="description" id="description" placeholder="e.g. ACR I-Card processing fee" required>
         <p class="muted">The client sees the single, standard FIS QR Ph code automatically once it's configured in R2. No per-request upload needed.</p>
         <button type="submit">Create payment request</button>
       </form>
     </div>`,
    staff.email
  );
}

async function updateStatus(request, env, staff, id) {
  const form = await request.formData();
  const status = String(form.get("status") || "");
  const note = String(form.get("note") || "").trim().slice(0, 1000) || null;
  if (!STATUS_OPTIONS.includes(status)) return new Response("Invalid status", { status: 400 });

  await env.DB.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(status, id)
    .run();
  await env.DB.prepare(
    "INSERT INTO application_status_history (id, application_id, status, note, changed_by_staff_email) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(newId(), id, status, note, staff.email)
    .run();
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "updated_status", targetTable: "applications", targetId: id });

  // application_status_history.client_visible defaults to 1 and nothing in
  // this codebase currently sets it otherwise, so every status update is
  // client-visible today — notify unconditionally, matching that reality.
  const application = await env.DB.prepare(
    "SELECT a.reference, c.full_name, c.email FROM applications a JOIN clients c ON c.id = a.client_id WHERE a.id = ?"
  )
    .bind(id)
    .first();
  if (application) {
    try {
      await sendApplicationStatusUpdate(env, {
        to: application.email,
        fullName: application.full_name,
        applicationReference: application.reference,
        status,
        note,
      });
    } catch (err) {
      console.error("Status update email failed:", err.message);
    }
  }

  return Response.redirect(`${new URL(request.url).origin}/staff/applications/${id}`, 303);
}

async function requestDocument(request, env, staff, applicationId) {
  const form = await request.formData();
  const label = String(form.get("label") || "").trim().slice(0, 200);
  if (!label) return new Response("Label required", { status: 400 });

  await env.DB.prepare(
    "INSERT INTO document_requests (id, application_id, label, requested_by_staff_email) VALUES (?, ?, ?, ?)"
  )
    .bind(newId(), applicationId, label, staff.email)
    .run();
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "requested_document", targetTable: "applications", targetId: applicationId });

  const application = await env.DB.prepare(
    "SELECT a.reference, c.email FROM applications a JOIN clients c ON c.id = a.client_id WHERE a.id = ?"
  )
    .bind(applicationId)
    .first();
  if (application) {
    try {
      await sendDocumentRequestNotification(env, { to: application.email, applicationReference: application.reference, label });
    } catch (err) {
      console.error("Document request email failed:", err.message);
    }
  }

  return Response.redirect(`${new URL(request.url).origin}/staff/applications/${applicationId}`, 303);
}

async function downloadDocument(env, staff, applicationId, documentId) {
  const doc = await env.DB.prepare("SELECT * FROM documents WHERE id = ? AND application_id = ?")
    .bind(documentId, applicationId)
    .first();
  if (!doc) return notFound();
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "viewed_document", targetTable: "documents", targetId: documentId });
  return streamObject(env.CLIENT_FILES, doc.r2_key, doc.original_filename, doc.content_type);
}

async function updateDocumentRequestStatus(request, env, staff, applicationId, documentRequestId) {
  const form = await request.formData();
  const status = String(form.get("status") || "");
  if (!["received", "rejected"].includes(status)) return new Response("Invalid status", { status: 400 });
  await env.DB.prepare("UPDATE document_requests SET status = ?, updated_at = datetime('now') WHERE id = ? AND application_id = ?")
    .bind(status, documentRequestId, applicationId)
    .run();
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "document_request_" + status, targetTable: "document_requests", targetId: documentRequestId });
  return Response.redirect(`${new URL(request.url).origin}/staff/applications/${applicationId}`, 303);
}

async function createPaymentRequest(request, env, staff, applicationId) {
  const form = await request.formData();
  const amount = parseFloat(form.get("amount"));
  const description = String(form.get("description") || "").trim().slice(0, 300);
  if (!amount || amount <= 0 || !description) return new Response("Amount and description required", { status: 400 });

  const paymentId = newId();

  await env.DB.prepare(
    "INSERT INTO payment_requests (id, application_id, amount_php, description) VALUES (?, ?, ?, ?)"
  )
    .bind(paymentId, applicationId, amount, description)
    .run();
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "created_payment_request", targetTable: "payment_requests", targetId: paymentId });

  const application = await env.DB.prepare(
    "SELECT a.reference, c.email FROM applications a JOIN clients c ON c.id = a.client_id WHERE a.id = ?"
  )
    .bind(applicationId)
    .first();
  if (application) {
    try {
      await sendPaymentRequestNotification(env, { to: application.email, applicationReference: application.reference, amountPhp: amount, description });
    } catch (err) {
      console.error("Payment request email failed:", err.message);
    }
  }

  return Response.redirect(`${new URL(request.url).origin}/staff/applications/${applicationId}`, 303);
}

async function markPaymentPaid(request, env, staff, applicationId, paymentId) {
  const existing = await env.DB.prepare(
    "SELECT status, amount_php, description FROM payment_requests WHERE id = ? AND application_id = ?"
  )
    .bind(paymentId, applicationId)
    .first();
  if (!existing) return notFound();

  if (existing.status !== "paid") {
    // Deliberately the ONLY place a payment_request can become 'paid' — a
    // manual staff action, never automatic. See routes/payments.js. The
    // "status != 'paid'" guard, combined with checking meta.changes below,
    // makes a duplicate/concurrent mark-paid submission a no-op rather than
    // a second audit event or a second confirmation email.
    const result = await env.DB.prepare(
      "UPDATE payment_requests SET status = 'paid', paid_at = datetime('now'), verified_by_staff_email = ? WHERE id = ? AND application_id = ? AND status != 'paid'"
    )
      .bind(staff.email, paymentId, applicationId)
      .run();

    if (result.meta.changes > 0) {
      await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "marked_payment_paid", targetTable: "payment_requests", targetId: paymentId });

      const application = await env.DB.prepare(
        "SELECT a.reference, c.email FROM applications a JOIN clients c ON c.id = a.client_id WHERE a.id = ?"
      )
        .bind(applicationId)
        .first();
      if (application) {
        try {
          await sendPaymentConfirmation(env, {
            to: application.email,
            applicationReference: application.reference,
            amountPhp: existing.amount_php,
            description: existing.description,
          });
        } catch (err) {
          console.error("Payment confirmation email failed:", err.message);
        }
      }
    }
  }

  return Response.redirect(`${new URL(request.url).origin}/staff/applications/${applicationId}`, 303);
}

async function viewPaymentProof(env, staff, applicationId, paymentId) {
  const { results: proofs } = await env.DB.prepare(
    "SELECT * FROM payment_proofs WHERE payment_request_id = ? ORDER BY uploaded_at DESC"
  )
    .bind(paymentId)
    .all();
  if (!proofs.length) return notFound();

  const latest = proofs[0];
  await logAudit(env.DB, { actorType: "staff", actorIdOrEmail: staff.email, action: "viewed_payment_proof", targetTable: "payment_proofs", targetId: latest.id });
  return streamObject(env.CLIENT_FILES, latest.r2_key, latest.original_filename, latest.content_type);
}
