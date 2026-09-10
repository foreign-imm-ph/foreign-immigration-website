// Thin Resend wrapper. RESEND_API_KEY is read only from env (a Worker
// secret) — never logged, never echoed in a response, never sent to the
// browser. Every email includes a plain-text body; HTML is a light,
// restrained wrapper, not a marketing template.

async function send(env, { to, subject, text, html }) {
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

Please keep this reference for your records. Submitting this enquiry does not itself constitute acceptance of an engagement — our team will review the details you provided and may request further information before confirming next steps.

If you have any questions in the meantime, reply to this email or contact us at ${env.EMAIL_REPLY_TO}.

Foreign Immigration Services
Bureau of Immigration Accredited Consultancy`;

  const html = wrap(`
    <p>Dear ${escapeHtml(fullName)},</p>
    <p>Thank you for your enquiry to Foreign Immigration Services. We have received it and it is being reviewed.</p>
    <p style="font-family:monospace;background:#eef1ec;padding:10px 14px;border-radius:4px;display:inline-block;">Reference: <strong>${escapeHtml(reference)}</strong></p>
    <p>Please keep this reference for your records. Submitting this enquiry does not itself constitute acceptance of an engagement — our team will review the details you provided and may request further information before confirming next steps.</p>
    <p>If you have any questions in the meantime, reply to this email.</p>
  `);

  await send(env, { to, subject: `Enquiry received — ${reference}`, text, html });
}

export async function sendStaffEnquiryNotification(env, { reference, serviceSlug, fullName, email, priority }) {
  // priority is the value already resolved and stored server-side by
  // resolvePriority() in routes/enquiries.js — never a raw client-supplied
  // value — so it's safe to surface directly. Standard keeps the exact
  // existing presentation; only urgent/priority add a prefix and one line.
  const subjectPrefix = priority === "urgent" ? "URGENT — " : priority === "priority" ? "PRIORITY — " : "";
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
    subject: `${subjectPrefix}New enquiry — ${reference}`,
    text,
    html: wrap(`<p>New enquiry received.</p><p>Reference: <strong>${escapeHtml(reference)}</strong><br>Name: ${escapeHtml(fullName)}<br>Email: ${escapeHtml(email)}<br>Service: ${escapeHtml(serviceSlug)}${priorityHtml}</p>`),
  });
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

export async function sendDocumentRequestNotification(env, { to, applicationReference, label }) {
  const text = `A document has been requested for your application ${applicationReference}: ${label}.

Please sign in to the Client Portal to upload it.

${env.PUBLIC_SITE_URL}/portal/`;

  await send(env, {
    to,
    subject: `Document requested — ${applicationReference}`,
    text,
    html: wrap(`<p>A document has been requested for your application <strong>${escapeHtml(applicationReference)}</strong>: ${escapeHtml(label)}.</p><p>Please sign in to the Client Portal to upload it.</p>`),
  });
}

export async function sendPaymentRequestNotification(env, { to, applicationReference, amountPhp, description }) {
  const text = `A payment is required for your application ${applicationReference}.

Amount: PHP ${amountPhp.toFixed(2)}
Description: ${description}

Please sign in to the Client Portal for payment instructions.

${env.PUBLIC_SITE_URL}/portal/`;

  await send(env, {
    to,
    subject: `Payment requested — ${applicationReference}`,
    text,
    html: wrap(`<p>A payment is required for your application <strong>${escapeHtml(applicationReference)}</strong>.</p><p>Amount: PHP ${amountPhp.toFixed(2)}<br>Description: ${escapeHtml(description)}</p><p>Please sign in to the Client Portal for payment instructions.</p>`),
  });
}

export async function sendApplicationStatusUpdate(env, { to, fullName, applicationReference, status, note }) {
  const statusLabel = String(status).replace(/_/g, " ");

  const text = `${fullName ? `Dear ${fullName},\n\n` : ""}Your application ${applicationReference} has been updated.

New status: ${statusLabel}${note ? `\n\nNote: ${note}` : ""}

Please sign in to the Client Portal for full details.

${env.PUBLIC_SITE_URL}/portal/`;

  const html = wrap(`
    ${fullName ? `<p>Dear ${escapeHtml(fullName)},</p>` : ""}
    <p>Your application <strong>${escapeHtml(applicationReference)}</strong> has been updated.</p>
    <p style="font-family:monospace;background:#eef1ec;padding:10px 14px;border-radius:4px;display:inline-block;">New status: <strong>${escapeHtml(statusLabel)}</strong></p>
    ${note ? `<p>${escapeHtml(note)}</p>` : ""}
    <p>Please sign in to the Client Portal for full details.</p>
  `);

  await send(env, { to, subject: `Application update — ${applicationReference}`, text, html });
}

export async function sendClientMessageNotification(env, { to, applicationReference }) {
  const text = `FIS Client Services has sent you a new message regarding application ${applicationReference}.

Please sign in to your Client Portal to view and respond to the message.

${env.PUBLIC_SITE_URL}/portal/`;

  const html = wrap(`
    <p>FIS Client Services has sent you a new message regarding application <strong>${escapeHtml(applicationReference)}</strong>.</p>
    <p>Please sign in to your Client Portal to view and respond to the message.</p>
  `);

  await send(env, { to, subject: `New message from FIS Client Services — ${applicationReference}`, text, html });
}

export async function sendPaymentConfirmation(env, { to, applicationReference, amountPhp, description }) {
  const text = `Foreign Immigration Services has recorded your payment for application ${applicationReference} as paid.

Amount: PHP ${amountPhp.toFixed(2)}
Description: ${description}

Please sign in to the Client Portal for full details.

${env.PUBLIC_SITE_URL}/portal/`;

  const html = wrap(`
    <p>Foreign Immigration Services has recorded your payment for application <strong>${escapeHtml(applicationReference)}</strong> as paid.</p>
    <p>Amount: PHP ${amountPhp.toFixed(2)}<br>Description: ${escapeHtml(description)}</p>
    <p>Please sign in to the Client Portal for full details.</p>
  `);

  await send(env, { to, subject: `Payment confirmed — ${applicationReference}`, text, html });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
