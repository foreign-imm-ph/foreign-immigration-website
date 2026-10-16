// Thin Resend wrapper. RESEND_API_KEY is read only from env (a Worker
// secret) — never logged, never echoed in a response, never sent to the
// browser. Every email includes a plain-text body; HTML is a light,
// restrained wrapper, not a marketing template.

async function send(env, { to, subject, text, html }) {
  if (!env.RESEND_API_KEY) {
    // No key configured (every local/CI/e2e environment today) means
    // this call can only ever fail -- skip the real network round-trip
    // to Resend's API entirely rather than making one just to receive a
    // guaranteed 401. Same observable outcome (no email sent, caller's
    // try/catch still applies), no real external request.
    console.error("Resend send skipped: no RESEND_API_KEY configured");
    throw new Error("email_send_failed");
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      reply_to: env.EMAIL_REPLY_TO,
      to: [to],
      subject,
      text,
      html,
    }),
  });
  if (!resp.ok) {
    // Never log the request body (may contain client PII) — only the
    // failure itself, so delivery problems are visible without leaking data.
    console.error(`Resend send failed: ${resp.status}`);
    throw new Error("email_send_failed");
  }
}

function wrap(bodyHtml) {
  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#1c2620;background:#f7f5f0;padding:32px 16px;margin:0;">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e2dc;border-radius:6px;padding:32px;">
    <tr><td>
      <p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9c7423;margin:0 0 16px;">Foreign Immigration Services</p>
      ${bodyHtml}
    </td></tr>
  </table>
  </body></html>`;
}

export async function sendEnquiryAcknowledgement(env, { to, fullName, reference }) {
  const text = `Dear ${fullName},

Thank you for your enquiry to Foreign Immigration Services. We have received it and it is being reviewed.

Reference: ${reference}

Please keep this reference for your records. Submitting this enquiry does not itself constitute acceptance of an engagement - our team will review the details you provided and may request further information before confirming next steps.

If you have any questions in the meantime, reply to this email or contact us at ${env.EMAIL_REPLY_TO}.

Foreign Immigration Services
Bureau of Immigration Accredited Consultancy`;

  const html = wrap(`
    <p>Dear ${escapeHtml(fullName)},</p>
    <p>Thank you for your enquiry to Foreign Immigration Services. We have received it and it is being reviewed.</p>
    <p style="font-family:monospace;background:#eef1ec;padding:10px 14px;border-radius:4px;display:inline-block;">Reference: <strong>${escapeHtml(reference)}</strong></p>
    <p>Please keep this reference for your records. Submitting this enquiry does not itself constitute acceptance of an engagement - our team will review the details you provided and may request further information before confirming next steps.</p>
    <p>If you have any questions in the meantime, reply to this email.</p>
  `);

  await send(env, { to, subject: `Enquiry received - ${reference}`, text, html });
}

export async function sendStaffEnquiryNotification(env, { reference, serviceSlug, fullName, email, priority }) {
  // priority is the value already resolved and stored server-side by
  // resolvePriority() in routes/enquiries.js — never a raw client-supplied
  // value — so it's safe to surface directly. Standard keeps the exact
  // existing presentation; only urgent/priority add a prefix and one line.
  const subjectPrefix = priority === "urgent" ? "URGENT - " : priority === "priority" ? "PRIORITY - " : "";
  const priorityLine = priority && priority !== "standard" ? `Priority: ${priority.toUpperCase()}\n` : "";
  const priorityHtml = priority && priority !== "standard" ? `<br>Priority: <strong>${escapeHtml(priority.toUpperCase())}</strong>` : "";

  const text = `New enquiry received.

${priorityLine}Reference: ${reference}
Name: ${fullName}
Email: ${email}
Service: ${serviceSlug}

Review it in the staff portal.`;

  await send(env, {
    to: env.STAFF_NOTIFICATION_EMAIL,
    subject: `${subjectPrefix}New enquiry - ${reference}`,
    text,
    html: wrap(`<p>New enquiry received.</p><p>Reference: <strong>${escapeHtml(reference)}</strong><br>Name: ${escapeHtml(fullName)}<br>Email: ${escapeHtml(email)}<br>Service: ${escapeHtml(serviceSlug)}${priorityHtml}</p>`),
  });
}

// A client sent a new message through the authenticated Client Portal.
// Deliberately the most minimal notification in this file: no client name,
// no application reference, no message content or translation output —
// the secure staff portal is the only place any of that is ever shown.
// Best-effort, like every other notification here; the caller is
// responsible for not letting a failure here affect the client's own
// submission.
export async function sendStaffPortalMessageNotification(env, { applicationId } = {}) {
  const link = applicationId
    ? `https://api.foreignimmigration.ph/staff/applications/${applicationId}`
    : "https://api.foreignimmigration.ph/staff/";

  const text = `A client has sent a new message through the FIS Client Portal.

Sign in to the FIS Staff Portal to review and respond.

${link}`;

  const html = wrap(`
    <p>A client has sent a new message through the FIS Client Portal.</p>
    <p><a href="${escapeHtml(link)}">Sign in to the FIS Staff Portal</a> to review and respond.</p>
  `);

  await send(env, { to: env.STAFF_NOTIFICATION_EMAIL, subject: "New client portal message | FIS", text, html });
}

// Staff's translated reply to a pre-conversion enquiry. Unlike every other
// email in this file, the actual message content is the point of this
// email — there is no portal account yet for the client to sign into, so
// the translated reply itself must be the email body. Never mentions
// translation or AI involvement.
//
// Bilingual correspondence requirement: when the reply was translated
// (englishOriginal provided and different from replyText), the email shows
// the customer's selected language first and the English original directly
// underneath, matching the same presentation the Client Portal and Staff
// Portal now use for a translated staff reply. If targetLanguage is itself
// English (no separate original to show) or no original was passed at all,
// the email is unchanged from before — just the one language, once.
export async function sendEnquiryReplyEmail(env, { to, fullName, reference, replyText, englishOriginal }) {
  const showBoth = englishOriginal && englishOriginal !== replyText;

  const text = `Dear ${fullName},

${replyText}
${showBoth ? `\nEnglish\n\n${englishOriginal}\n` : ""}
Reference: ${reference}

If you have any questions, reply to this email or contact us at ${env.EMAIL_REPLY_TO}.

Foreign Immigration Services
Bureau of Immigration Accredited Consultancy`;

  const html = wrap(`
    <p>Dear ${escapeHtml(fullName)},</p>
    <p>${escapeHtml(replyText).replace(/\n/g, "<br>")}</p>
    ${
      showBoth
        ? `<p style="margin:16px 0 2px;font-size:12px;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;color:#5b6b62;">English</p>
           <p>${escapeHtml(englishOriginal).replace(/\n/g, "<br>")}</p>`
        : ""
    }
    <p style="font-family:monospace;background:#eef1ec;padding:10px 14px;border-radius:4px;display:inline-block;">Reference: <strong>${escapeHtml(reference)}</strong></p>
    <p>If you have any questions, reply to this email.</p>
  `);

  await send(env, { to, subject: `Re: Your enquiry - ${reference}`, text, html });
}

// Instant Services guest email verification. Mechanically identical to
// sendMagicLink (same auth_tokens-backed link, same 15-minute/single-use
// behavior) but its own template/subject line, since this is confirming
// a brand-new request, not signing in to an existing account -- the
// customer has no portal history yet to "sign in" to.
export async function sendInstantServicesVerification(env, { to, url }) {
  const text = `Confirm your Instant Services request with Foreign Immigration Services.

Click the link below to verify your email and continue your request. This link is valid for 15 minutes and can only be used once.

${url}

If you did not request this, you can safely ignore this email.`;

  const html = wrap(`
    <p>Confirm your Instant Services request with Foreign Immigration Services.</p>
    <p><a href="${url}" style="display:inline-block;background:#0d3d25;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;">Verify my email</a></p>
    <p style="font-size:13px;color:#5b6b62;">This link is valid for 15 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p>
  `);

  await send(env, { to, subject: "Confirm your Instant Services request", text, html });
}

export async function sendInstantServicesConfirmation(env, { to, fullName, orderReference, applicationReference }) {
  const text = `Dear ${fullName},

Your Instant Services request has been submitted for processing.

Request reference: ${orderReference}
Application reference: ${applicationReference}

You can track progress at any time through the FIS Client Portal.

${env.PUBLIC_SITE_URL}/portal/

Foreign Immigration Services
Bureau of Immigration Accredited Consultancy`;

  const html = wrap(`
    <p>Dear ${escapeHtml(fullName)},</p>
    <p>Your Instant Services request has been submitted for processing.</p>
    <p style="font-family:monospace;background:#eef1ec;padding:10px 14px;border-radius:4px;display:inline-block;">Request reference: <strong>${escapeHtml(orderReference)}</strong><br>Application reference: <strong>${escapeHtml(applicationReference)}</strong></p>
    <p>You can track progress at any time through the FIS Client Portal.</p>
  `);

  await send(env, { to, subject: `Instant Services request submitted - ${orderReference}`, text, html });
}

export async function sendMagicLink(env, { to, url }) {
  const text = `Sign in to your Foreign Immigration Services Client Portal.

Click the link below to sign in. This link is valid for 15 minutes and can only be used once.

${url}

If you did not request this, you can safely ignore this email.`;

  const html = wrap(`
    <p>Sign in to your Foreign Immigration Services Client Portal.</p>
    <p><a href="${url}" style="display:inline-block;background:#0d3d25;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;">Sign in</a></p>
    <p style="font-size:13px;color:#5b6b62;">This link is valid for 15 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p>
  `);

  await send(env, { to, subject: "Sign in to your Client Portal", text, html });
}

// Phase 3.1: deliberately minimal, matching sendClientMessageNotification/
// sendStaffPortalMessageNotification's existing pattern — a generic notice
// and a portal link, no staff-authored prose (a document request's label,
// a payment's description, a status note). Two reasons: (1) that content
// may now require translation before it is client-visible at all, and an
// email is not part of the Translate & Preview / publish workflow, so it
// must never leak an untranslated (or even translated) copy out-of-band;
// (2) the portal remains the single secure source of truth for case
// content. The status itself is a deterministic, non-prose code, so its
// plain-English label is kept here — the email channel is not localized
// (the portal is), by design, consistent with the rest of this file.
export async function sendDocumentRequestNotification(env, { to, applicationReference }) {
  const text = `A document has been requested for your application ${applicationReference}.

Please sign in to the Client Portal to view the request and upload it.

${env.PUBLIC_SITE_URL}/portal/`;

  await send(env, {
    to,
    subject: `Document requested - ${applicationReference}`,
    text,
    html: wrap(`<p>A document has been requested for your application <strong>${escapeHtml(applicationReference)}</strong>.</p><p>Please sign in to the Client Portal to view the request and upload it.</p>`),
  });
}

export async function sendPaymentRequestNotification(env, { to, applicationReference, amountPhp }) {
  const text = `A payment is required for your application ${applicationReference}.

Amount: PHP ${amountPhp.toFixed(2)}

Please sign in to the Client Portal for payment instructions.

${env.PUBLIC_SITE_URL}/portal/`;

  await send(env, {
    to,
    subject: `Payment requested - ${applicationReference}`,
    text,
    html: wrap(`<p>A payment is required for your application <strong>${escapeHtml(applicationReference)}</strong>.</p><p>Amount: PHP ${amountPhp.toFixed(2)}</p><p>Please sign in to the Client Portal for payment instructions.</p>`),
  });
}

export async function sendApplicationStatusUpdate(env, { to, fullName, applicationReference, status }) {
  const statusLabel = String(status).replace(/_/g, " ");

  const text = `${fullName ? `Dear ${fullName},\n\n` : ""}Your application ${applicationReference} has been updated.

New status: ${statusLabel}

Please sign in to the Client Portal for full details.

${env.PUBLIC_SITE_URL}/portal/`;

  const html = wrap(`
    ${fullName ? `<p>Dear ${escapeHtml(fullName)},</p>` : ""}
    <p>Your application <strong>${escapeHtml(applicationReference)}</strong> has been updated.</p>
    <p style="font-family:monospace;background:#eef1ec;padding:10px 14px;border-radius:4px;display:inline-block;">New status: <strong>${escapeHtml(statusLabel)}</strong></p>
    <p>Please sign in to the Client Portal for full details.</p>
  `);

  await send(env, { to, subject: `Application update - ${applicationReference}`, text, html });
}

export async function sendClientMessageNotification(env, { to, applicationReference }) {
  const text = `FIS Client Services has sent you a new message regarding application ${applicationReference}.

Please sign in to your Client Portal to view and respond to the message.

${env.PUBLIC_SITE_URL}/portal/`;

  const html = wrap(`
    <p>FIS Client Services has sent you a new message regarding application <strong>${escapeHtml(applicationReference)}</strong>.</p>
    <p>Please sign in to your Client Portal to view and respond to the message.</p>
  `);

  await send(env, { to, subject: `New message from FIS Client Services - ${applicationReference}`, text, html });
}

export async function sendPaymentConfirmation(env, { to, applicationReference, amountPhp }) {
  const text = `Foreign Immigration Services has recorded your payment for application ${applicationReference} as paid.

Amount: PHP ${amountPhp.toFixed(2)}

Please sign in to the Client Portal for full details.

${env.PUBLIC_SITE_URL}/portal/`;

  const html = wrap(`
    <p>Foreign Immigration Services has recorded your payment for application <strong>${escapeHtml(applicationReference)}</strong> as paid.</p>
    <p>Amount: PHP ${amountPhp.toFixed(2)}</p>
    <p>Please sign in to the Client Portal for full details.</p>
  `);

  await send(env, { to, subject: `Payment confirmed - ${applicationReference}`, text, html });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
