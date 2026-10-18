// Thin Resend wrapper. RESEND_API_KEY is read only from env (a Worker
// secret) — never logged, never echoed in a response, never sent to the
// browser. Every email includes a plain-text body; HTML is a light,
// restrained wrapper, not a marketing template.
//
// "FIS -- Final Automation Integration" directive item 3: every
// CUSTOMER-facing template below now takes a `lang` parameter (one of
// CANONICAL_LANGUAGES) and renders its fixed chrome text (greeting,
// explanatory sentences, button labels, subject line) in that language,
// falling back to English whenever the requested language is missing
// from a given table (pick() below) -- never a thrown error, never a
// half-translated email. Only the FIXED WRAPPER text is translated here.
// Anything that is actual case content -- a staff-authored reply, a
// document's label, a payment's description, a status note -- is never
// generated or translated by this file; sendEnquiryReplyEmail's
// replyText/englishOriginal arrive here ALREADY translated (or not, if
// no translation was needed) by the existing Translate & Preview
// workflow (routes/staff.js), exactly as sendDocumentRequestNotification/
// sendPaymentRequestNotification/sendApplicationStatusUpdate's own prior
// comments already established: an email is not part of that publish
// gate, so it must never carry anything that hasn't already cleared it.
// sendStaffEnquiryNotification and sendStaffPortalMessageNotification go
// to FIS staff (env.STAFF_NOTIFICATION_EMAIL), not a customer, and have
// no customer language preference to honor -- deliberately English-only,
// unchanged.
import { CANONICAL_LANGUAGES } from "./translation.js";
import { getLocalizedStatusLabel } from "./clientLocaleStrings.js";

function normalizeLang(lang) {
  return CANONICAL_LANGUAGES.includes(lang) ? lang : "en";
}

// Looks up `table[lang]`, falling back to `table.en` if that specific
// language's entry is missing -- the one fallback rule every template
// below shares, so a template can be added or extended one language at
// a time without ever risking an undefined render.
function pick(lang, table) {
  return table[lang] || table.en;
}

const SIGNATURE_LINE = {
  en: "Bureau of Immigration Accredited Consultancy",
  "zh-CN": "移民局认可顾问机构",
  "zh-Hant": "移民局認可顧問機構",
  ko: "출입국관리청 공인 컨설팅 기관",
  ja: "入国管理局認定コンサルタント",
  vi: "Đơn vị Tư vấn được Cục Di trú công nhận",
};

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

const ENQUIRY_ACK = {
  en: {
    subject: (ref) => `Enquiry received - ${ref}`,
    greeting: (name) => `Dear ${name},`,
    body1: "Thank you for your enquiry to Foreign Immigration Services. We have received it and it is being reviewed.",
    referenceLabel: "Reference:",
    body2: "Please keep this reference for your records. Submitting this enquiry does not itself constitute acceptance of an engagement - our team will review the details you provided and may request further information before confirming next steps.",
    body3: (replyTo) => `If you have any questions in the meantime, reply to this email or contact us at ${replyTo}.`,
    body3Html: "If you have any questions in the meantime, reply to this email.",
  },
  "zh-CN": {
    subject: (ref) => `已收到您的咨询 - ${ref}`,
    greeting: (name) => `亲爱的${name}，`,
    body1: "感谢您向Foreign Immigration Services提交咨询。我们已收到您的咨询，目前正在审核中。",
    referenceLabel: "编号：",
    body2: "请妥善保留此编号以备查询。提交此咨询并不代表我们已接受委托——我们的团队将审核您提供的详细信息，并可能在确认后续步骤前要求您提供更多资料。",
    body3: (replyTo) => `如有任何疑问，请直接回复本邮件，或通过${replyTo}与我们联系。`,
    body3Html: "如有任何疑问，请直接回复本邮件。",
  },
  "zh-Hant": {
    subject: (ref) => `已收到您的諮詢 - ${ref}`,
    greeting: (name) => `親愛的${name}，`,
    body1: "感謝您向Foreign Immigration Services提交諮詢。我們已收到您的諮詢，目前正在審核中。",
    referenceLabel: "編號：",
    body2: "請妥善保留此編號以備查詢。提交此諮詢並不代表我們已接受委託——我們的團隊將審核您提供的詳細資訊，並可能在確認後續步驟前要求您提供更多資料。",
    body3: (replyTo) => `如有任何疑問，請直接回覆本郵件，或透過${replyTo}與我們聯繫。`,
    body3Html: "如有任何疑問，請直接回覆本郵件。",
  },
  ko: {
    subject: (ref) => `문의가 접수되었습니다 - ${ref}`,
    greeting: (name) => `${name}님,`,
    body1: "Foreign Immigration Services에 문의해 주셔서 감사합니다. 문의가 접수되어 검토 중입니다.",
    referenceLabel: "참조 번호:",
    body2: "이 참조 번호를 보관해 주십시오. 본 문의 제출은 그 자체로 위임 수락을 의미하지 않으며, 저희 팀이 제공하신 세부 정보를 검토한 후 다음 단계를 확정하기 전에 추가 정보를 요청할 수 있습니다.",
    body3: (replyTo) => `그 동안 문의사항이 있으시면 본 이메일에 회신하시거나 ${replyTo}로 연락해 주십시오.`,
    body3Html: "그 동안 문의사항이 있으시면 본 이메일에 회신해 주십시오.",
  },
  ja: {
    subject: (ref) => `お問い合わせを受け付けました - ${ref}`,
    greeting: (name) => `${name} 様`,
    body1: "Foreign Immigration Servicesへのお問い合わせをいただき、ありがとうございます。お問い合わせを受け付け、現在確認中です。",
    referenceLabel: "参照番号：",
    body2: "今後の記録のため、この参照番号を保管しておいてください。本お問い合わせの送信自体は、業務委任の承諾を意味するものではありません。担当チームがご提供いただいた詳細を確認し、次のステップを確定する前に追加情報をお願いする場合があります。",
    body3: (replyTo) => `その間にご質問がございましたら、本メールに直接ご返信いただくか、${replyTo}までご連絡ください。`,
    body3Html: "その間にご質問がございましたら、本メールに直接ご返信ください。",
  },
  vi: {
    subject: (ref) => `Đã nhận được yêu cầu của quý khách - ${ref}`,
    greeting: (name) => `Kính gửi ${name},`,
    body1: "Cảm ơn quý khách đã gửi yêu cầu đến Foreign Immigration Services. Chúng tôi đã nhận được yêu cầu và đang xem xét.",
    referenceLabel: "Mã tham chiếu:",
    body2: "Vui lòng lưu giữ mã tham chiếu này. Việc gửi yêu cầu này không đồng nghĩa với việc chúng tôi đã chấp nhận cung cấp dịch vụ — nhóm của chúng tôi sẽ xem xét thông tin quý khách đã cung cấp và có thể yêu cầu thêm thông tin trước khi xác nhận các bước tiếp theo.",
    body3: (replyTo) => `Nếu quý khách có bất kỳ câu hỏi nào trong thời gian này, vui lòng trả lời email này hoặc liên hệ với chúng tôi qua ${replyTo}.`,
    body3Html: "Nếu quý khách có bất kỳ câu hỏi nào trong thời gian này, vui lòng trả lời email này.",
  },
};

export async function sendEnquiryAcknowledgement(env, { to, fullName, reference, lang }) {
  const t = pick(normalizeLang(lang), ENQUIRY_ACK);
  const sig = pick(normalizeLang(lang), SIGNATURE_LINE);

  const text = `${t.greeting(fullName)}

${t.body1}

${t.referenceLabel} ${reference}

${t.body2}

${t.body3(env.EMAIL_REPLY_TO)}

Foreign Immigration Services
${sig}`;

  const html = wrap(`
    <p>${escapeHtml(t.greeting(fullName))}</p>
    <p>${escapeHtml(t.body1)}</p>
    <p style="font-family:monospace;background:#eef1ec;padding:10px 14px;border-radius:4px;display:inline-block;">${escapeHtml(t.referenceLabel)} <strong>${escapeHtml(reference)}</strong></p>
    <p>${escapeHtml(t.body2)}</p>
    <p>${escapeHtml(t.body3Html)}</p>
  `);

  await send(env, { to, subject: t.subject(reference), text, html });
}

export async function sendStaffEnquiryNotification(env, { reference, serviceSlug, fullName, email, priority }) {
  // Staff-facing (env.STAFF_NOTIFICATION_EMAIL) -- not a customer email,
  // so there is no customer language preference to honor here. English
  // only, unchanged, by design.
  //
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
  // Staff-facing -- English only, by design (see sendStaffEnquiryNotification above).
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

const ENQUIRY_REPLY = {
  en: { greeting: (name) => `Dear ${name},`, englishLabel: "English", referenceLabel: "Reference:", closing: (replyTo) => `If you have any questions, reply to this email or contact us at ${replyTo}.`, closingHtml: "If you have any questions, reply to this email." },
  "zh-CN": { greeting: (name) => `亲爱的${name}，`, englishLabel: "英文原文", referenceLabel: "编号：", closing: (replyTo) => `如有任何疑问，请直接回复本邮件，或通过${replyTo}与我们联系。`, closingHtml: "如有任何疑问，请直接回复本邮件。" },
  "zh-Hant": { greeting: (name) => `親愛的${name}，`, englishLabel: "英文原文", referenceLabel: "編號：", closing: (replyTo) => `如有任何疑問，請直接回覆本郵件，或透過${replyTo}與我們聯繫。`, closingHtml: "如有任何疑問，請直接回覆本郵件。" },
  ko: { greeting: (name) => `${name}님,`, englishLabel: "영어 원문", referenceLabel: "참조 번호:", closing: (replyTo) => `질문이 있으시면 본 이메일에 회신하시거나 ${replyTo}로 연락해 주십시오.`, closingHtml: "질문이 있으시면 본 이메일에 회신해 주십시오." },
  ja: { greeting: (name) => `${name} 様`, englishLabel: "英語原文", referenceLabel: "参照番号：", closing: (replyTo) => `ご質問がございましたら、本メールにご返信いただくか、${replyTo}までご連絡ください。`, closingHtml: "ご質問がございましたら、本メールにご返信ください。" },
  vi: { greeting: (name) => `Kính gửi ${name},`, englishLabel: "Bản gốc tiếng Anh", referenceLabel: "Mã tham chiếu:", closing: (replyTo) => `Nếu quý khách có câu hỏi, vui lòng trả lời email này hoặc liên hệ qua ${replyTo}.`, closingHtml: "Nếu quý khách có câu hỏi, vui lòng trả lời email này." },
};

// Staff's translated reply to a pre-conversion enquiry. Unlike every other
// email in this file, the actual message content is the point of this
// email — there is no portal account yet for the client to sign into, so
// the translated reply itself must be the email body. Never mentions
// translation or AI involvement. replyText/englishOriginal are NOT
// translated by this file -- they arrive already resolved by the
// existing Translate & Preview workflow (routes/staff.js); only the
// fixed wrapper text (greeting, "English" label, reference line,
// closing) is localized here, via `lang` (normally the enquiry's own
// saved `language`).
//
// Bilingual correspondence requirement: when the reply was translated
// (englishOriginal provided and different from replyText), the email shows
// the customer's selected language first and the English original directly
// underneath, matching the same presentation the Client Portal and Staff
// Portal now use for a translated staff reply. If targetLanguage is itself
// English (no separate original to show) or no original was passed at all,
// the email is unchanged from before — just the one language, once.
export async function sendEnquiryReplyEmail(env, { to, fullName, reference, replyText, englishOriginal, lang }) {
  const showBoth = englishOriginal && englishOriginal !== replyText;
  const t = pick(normalizeLang(lang), ENQUIRY_REPLY);
  const sig = pick(normalizeLang(lang), SIGNATURE_LINE);

  const text = `${t.greeting(fullName)}

${replyText}
${showBoth ? `\n${t.englishLabel}\n\n${englishOriginal}\n` : ""}
${t.referenceLabel} ${reference}

${t.closing(env.EMAIL_REPLY_TO)}

Foreign Immigration Services
${sig}`;

  const html = wrap(`
    <p>${escapeHtml(t.greeting(fullName))}</p>
    <p>${escapeHtml(replyText).replace(/\n/g, "<br>")}</p>
    ${
      showBoth
        ? `<p style="margin:16px 0 2px;font-size:12px;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;color:#5b6b62;">${escapeHtml(t.englishLabel)}</p>
           <p>${escapeHtml(englishOriginal).replace(/\n/g, "<br>")}</p>`
        : ""
    }
    <p style="font-family:monospace;background:#eef1ec;padding:10px 14px;border-radius:4px;display:inline-block;">${escapeHtml(t.referenceLabel)} <strong>${escapeHtml(reference)}</strong></p>
    <p>${escapeHtml(t.closingHtml)}</p>
  `);

  await send(env, { to, subject: `Re: Your enquiry - ${reference}`, text, html });
}

const INSTANT_VERIFY = {
  en: { subject: "Confirm your Instant Services request", body1: "Confirm your Instant Services request with Foreign Immigration Services.", body2: "Click the link below to verify your email and continue your request. This link is valid for 15 minutes and can only be used once.", button: "Verify my email", footnote: "This link is valid for 15 minutes and can only be used once. If you did not request this, you can safely ignore this email." },
  "zh-CN": { subject: "确认您的Instant Services申请请求", body1: "请确认您在Foreign Immigration Services提交的Instant Services申请请求。", body2: "点击下方链接以验证您的电子邮箱并继续您的申请。此链接有效期为15分钟，且只能使用一次。", button: "验证我的邮箱", footnote: "此链接有效期为15分钟，且只能使用一次。如果您并未提出此请求，可忽略此邮件。" },
  "zh-Hant": { subject: "確認您的Instant Services申請請求", body1: "請確認您在Foreign Immigration Services提交的Instant Services申請請求。", body2: "點擊下方連結以驗證您的電子郵箱並繼續您的申請。此連結有效期為15分鐘，且只能使用一次。", button: "驗證我的郵箱", footnote: "此連結有效期為15分鐘，且只能使用一次。如果您並未提出此請求，可忽略此郵件。" },
  ko: { subject: "Instant Services 신청 확인", body1: "Foreign Immigration Services에 제출하신 Instant Services 신청을 확인해 주십시오.", body2: "아래 링크를 클릭하여 이메일을 인증하고 신청을 계속해 주십시오. 이 링크는 15분간 유효하며 한 번만 사용할 수 있습니다.", button: "이메일 인증하기", footnote: "이 링크는 15분간 유효하며 한 번만 사용할 수 있습니다. 요청하지 않으셨다면 이 이메일을 무시하셔도 됩니다." },
  ja: { subject: "Instant Servicesのお申し込み内容をご確認ください", body1: "Foreign Immigration ServicesへのInstant Servicesのお申し込みをご確認ください。", body2: "以下のリンクをクリックしてメールアドレスを確認し、お申し込み手続きを続けてください。このリンクの有効期限は15分で、1回限り使用できます。", button: "メールアドレスを確認する", footnote: "このリンクの有効期限は15分で、1回限り使用できます。このメールにお心当たりがない場合は、そのまま無視していただいて問題ありません。" },
  vi: { subject: "Xác nhận yêu cầu Instant Services của quý khách", body1: "Xác nhận yêu cầu Instant Services của quý khách với Foreign Immigration Services.", body2: "Nhấp vào liên kết dưới đây để xác minh email và tiếp tục yêu cầu của quý khách. Liên kết này có hiệu lực trong 15 phút và chỉ được sử dụng một lần.", button: "Xác minh email của tôi", footnote: "Liên kết này có hiệu lực trong 15 phút và chỉ được sử dụng một lần. Nếu quý khách không yêu cầu điều này, quý khách có thể bỏ qua email này." },
};

// Instant Services guest email verification. Mechanically identical to
// sendMagicLink (same auth_tokens-backed link, same 15-minute/single-use
// behavior) but its own template/subject line, since this is confirming
// a brand-new request, not signing in to an existing account -- the
// customer has no portal history yet to "sign in" to. `lang` here is
// almost always the catalogue page language the guest was already
// browsing in (see routes/checkoutPublic.js's handleBeginCheckout),
// since a brand-new guest has no saved preference yet to read instead.
export async function sendInstantServicesVerification(env, { to, url, lang }) {
  const t = pick(normalizeLang(lang), INSTANT_VERIFY);

  const text = `${t.body1}

${t.body2}

${url}

${t.footnote}`;

  const html = wrap(`
    <p>${escapeHtml(t.body1)}</p>
    <p><a href="${url}" style="display:inline-block;background:#0d3d25;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;">${escapeHtml(t.button)}</a></p>
    <p style="font-size:13px;color:#5b6b62;">${escapeHtml(t.footnote)}</p>
  `);

  await send(env, { to, subject: t.subject, text, html });
}

const INSTANT_CONFIRM = {
  en: { subject: (ref) => `Instant Services request submitted - ${ref}`, greeting: (name) => `Dear ${name},`, body1: "Your Instant Services request has been submitted for processing.", orderLabel: "Request reference:", appLabel: "Application reference:", body2: "You can track progress at any time through the FIS Client Portal." },
  "zh-CN": { subject: (ref) => `Instant Services申请已提交 - ${ref}`, greeting: (name) => `亲爱的${name}，`, body1: "您的Instant Services申请已提交处理。", orderLabel: "申请编号：", appLabel: "案件编号：", body2: "您可以随时通过FIS客户门户查看进度。" },
  "zh-Hant": { subject: (ref) => `Instant Services申請已提交 - ${ref}`, greeting: (name) => `親愛的${name}，`, body1: "您的Instant Services申請已提交處理。", orderLabel: "申請編號：", appLabel: "案件編號：", body2: "您可以隨時透過FIS客戶入口網站查看進度。" },
  ko: { subject: (ref) => `Instant Services 신청이 제출되었습니다 - ${ref}`, greeting: (name) => `${name}님,`, body1: "Instant Services 신청이 처리를 위해 제출되었습니다.", orderLabel: "주문 참조 번호:", appLabel: "신청 참조 번호:", body2: "FIS 고객 포털을 통해 언제든지 진행 상황을 확인하실 수 있습니다." },
  ja: { subject: (ref) => `Instant Servicesのお申し込みを受け付けました - ${ref}`, greeting: (name) => `${name} 様`, body1: "Instant Servicesのお申し込みが処理のため受け付けられました。", orderLabel: "ご注文番号：", appLabel: "申込番号：", body2: "進行状況はいつでもFISクライアントポータルでご確認いただけます。" },
  vi: { subject: (ref) => `Yêu cầu Instant Services đã được gửi - ${ref}`, greeting: (name) => `Kính gửi ${name},`, body1: "Yêu cầu Instant Services của quý khách đã được gửi để xử lý.", orderLabel: "Mã đơn hàng:", appLabel: "Mã hồ sơ:", body2: "Quý khách có thể theo dõi tiến độ bất cứ lúc nào qua Cổng thông tin khách hàng FIS." },
};

export async function sendInstantServicesConfirmation(env, { to, fullName, orderReference, applicationReference, lang }) {
  const t = pick(normalizeLang(lang), INSTANT_CONFIRM);
  const sig = pick(normalizeLang(lang), SIGNATURE_LINE);

  const text = `${t.greeting(fullName)}

${t.body1}

${t.orderLabel} ${orderReference}
${t.appLabel} ${applicationReference}

${t.body2}

${env.PUBLIC_SITE_URL}/portal/

Foreign Immigration Services
${sig}`;

  const html = wrap(`
    <p>${escapeHtml(t.greeting(fullName))}</p>
    <p>${escapeHtml(t.body1)}</p>
    <p style="font-family:monospace;background:#eef1ec;padding:10px 14px;border-radius:4px;display:inline-block;">${escapeHtml(t.orderLabel)} <strong>${escapeHtml(orderReference)}</strong><br>${escapeHtml(t.appLabel)} <strong>${escapeHtml(applicationReference)}</strong></p>
    <p>${escapeHtml(t.body2)}</p>
  `);

  await send(env, { to, subject: t.subject(orderReference), text, html });
}

const MAGIC_LINK = {
  en: { subject: "Sign in to your Client Portal", body1: "Sign in to your Foreign Immigration Services Client Portal.", body2: "Click the link below to sign in. This link is valid for 15 minutes and can only be used once.", button: "Sign in", footnote: "This link is valid for 15 minutes and can only be used once. If you did not request this, you can safely ignore this email." },
  "zh-CN": { subject: "登录您的客户门户", body1: "登录您的Foreign Immigration Services客户门户。", body2: "点击下方链接登录。此链接有效期为15分钟，且只能使用一次。", button: "登录", footnote: "此链接有效期为15分钟，且只能使用一次。如果您并未提出此请求，可忽略此邮件。" },
  "zh-Hant": { subject: "登入您的客戶入口網站", body1: "登入您的Foreign Immigration Services客戶入口網站。", body2: "點擊下方連結登入。此連結有效期為15分鐘，且只能使用一次。", button: "登入", footnote: "此連結有效期為15分鐘，且只能使用一次。如果您並未提出此請求，可忽略此郵件。" },
  ko: { subject: "고객 포털에 로그인하기", body1: "Foreign Immigration Services 고객 포털에 로그인해 주십시오.", body2: "아래 링크를 클릭하여 로그인해 주십시오. 이 링크는 15분간 유효하며 한 번만 사용할 수 있습니다.", button: "로그인", footnote: "이 링크는 15분간 유효하며 한 번만 사용할 수 있습니다. 요청하지 않으셨다면 이 이메일을 무시하셔도 됩니다." },
  ja: { subject: "クライアントポータルにサインインする", body1: "Foreign Immigration Servicesクライアントポータルにサインインしてください。", body2: "以下のリンクをクリックしてサインインしてください。このリンクの有効期限は15分で、1回限り使用できます。", button: "サインイン", footnote: "このリンクの有効期限は15分で、1回限り使用できます。このメールにお心当たりがない場合は、そのまま無視していただいて問題ありません。" },
  vi: { subject: "Đăng nhập vào Cổng thông tin khách hàng", body1: "Đăng nhập vào Cổng thông tin khách hàng Foreign Immigration Services của quý khách.", body2: "Nhấp vào liên kết dưới đây để đăng nhập. Liên kết này có hiệu lực trong 15 phút và chỉ được sử dụng một lần.", button: "Đăng nhập", footnote: "Liên kết này có hiệu lực trong 15 phút và chỉ được sử dụng một lần. Nếu quý khách không yêu cầu điều này, quý khách có thể bỏ qua email này." },
};

export async function sendMagicLink(env, { to, url, lang }) {
  const t = pick(normalizeLang(lang), MAGIC_LINK);

  const text = `${t.body1}

${t.body2}

${url}

${t.footnote}`;

  const html = wrap(`
    <p>${escapeHtml(t.body1)}</p>
    <p><a href="${url}" style="display:inline-block;background:#0d3d25;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;">${escapeHtml(t.button)}</a></p>
    <p style="font-size:13px;color:#5b6b62;">${escapeHtml(t.footnote)}</p>
  `);

  await send(env, { to, subject: t.subject, text, html });
}

const DOCUMENT_REQUEST = {
  en: { subject: (ref) => `Document requested - ${ref}`, body1: (ref) => `A document has been requested for your application ${ref}.`, body2: "Please sign in to the Client Portal to view the request and upload it." },
  "zh-CN": { subject: (ref) => `已请求补充文件 - ${ref}`, body1: (ref) => `您的案件${ref}需要补充一份文件。`, body2: "请登录客户门户查看请求详情并上传文件。" },
  "zh-Hant": { subject: (ref) => `已請求補充文件 - ${ref}`, body1: (ref) => `您的案件${ref}需要補充一份文件。`, body2: "請登入客戶入口網站查看請求詳情並上傳文件。" },
  ko: { subject: (ref) => `서류 제출 요청 - ${ref}`, body1: (ref) => `귀하의 신청 ${ref}에 대해 서류가 요청되었습니다.`, body2: "고객 포털에 로그인하여 요청 내용을 확인하고 서류를 업로드해 주십시오." },
  ja: { subject: (ref) => `書類のご提出をお願いします - ${ref}`, body1: (ref) => `お申し込み${ref}について、書類のご提出をお願いしております。`, body2: "クライアントポータルにサインインして、依頼内容をご確認のうえ書類をアップロードしてください。" },
  vi: { subject: (ref) => `Yêu cầu bổ sung tài liệu - ${ref}`, body1: (ref) => `Hồ sơ ${ref} của quý khách cần bổ sung một tài liệu.`, body2: "Vui lòng đăng nhập vào Cổng thông tin khách hàng để xem yêu cầu và tải tài liệu lên." },
};

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
//
// Update ("FIS -- Final Automation Integration" directive item 3): the
// above is still true for the document's actual LABEL/description (never
// included here, unchanged) -- but the generic chrome sentences
// themselves carry no case content at all, so they are now localized
// via `lang` like every other customer-facing template in this file.
export async function sendDocumentRequestNotification(env, { to, applicationReference, lang }) {
  const t = pick(normalizeLang(lang), DOCUMENT_REQUEST);

  const text = `${t.body1(applicationReference)}

${t.body2}

${env.PUBLIC_SITE_URL}/portal/`;

  await send(env, {
    to,
    subject: t.subject(applicationReference),
    text,
    html: wrap(`<p>${escapeHtml(t.body1(applicationReference))}</p><p>${escapeHtml(t.body2)}</p>`),
  });
}

const PAYMENT_REQUEST = {
  en: { subject: (ref) => `Payment requested - ${ref}`, body1: (ref) => `A payment is required for your application ${ref}.`, amountLabel: "Amount:", body2: "Please sign in to the Client Portal for payment instructions." },
  "zh-CN": { subject: (ref) => `需要付款 - ${ref}`, body1: (ref) => `您的案件${ref}需要付款。`, amountLabel: "金额：", body2: "请登录客户门户查看付款说明。" },
  "zh-Hant": { subject: (ref) => `需要付款 - ${ref}`, body1: (ref) => `您的案件${ref}需要付款。`, amountLabel: "金額：", body2: "請登入客戶入口網站查看付款說明。" },
  ko: { subject: (ref) => `결제 요청 - ${ref}`, body1: (ref) => `귀하의 신청 ${ref}에 대한 결제가 필요합니다.`, amountLabel: "금액:", body2: "결제 안내는 고객 포털에 로그인하여 확인해 주십시오." },
  ja: { subject: (ref) => `お支払いのお願い - ${ref}`, body1: (ref) => `お申し込み${ref}についてお支払いが必要です。`, amountLabel: "金額：", body2: "お支払い方法についてはクライアントポータルにサインインしてご確認ください。" },
  vi: { subject: (ref) => `Yêu cầu thanh toán - ${ref}`, body1: (ref) => `Hồ sơ ${ref} của quý khách cần thanh toán.`, amountLabel: "Số tiền:", body2: "Vui lòng đăng nhập vào Cổng thông tin khách hàng để xem hướng dẫn thanh toán." },
};

export async function sendPaymentRequestNotification(env, { to, applicationReference, amountPhp, lang }) {
  const t = pick(normalizeLang(lang), PAYMENT_REQUEST);
  const amount = amountPhp.toFixed(2);

  const text = `${t.body1(applicationReference)}

${t.amountLabel} PHP ${amount}

${t.body2}

${env.PUBLIC_SITE_URL}/portal/`;

  await send(env, {
    to,
    subject: t.subject(applicationReference),
    text,
    html: wrap(`<p>${escapeHtml(t.body1(applicationReference))}</p><p>${escapeHtml(t.amountLabel)} PHP ${amount}</p><p>${escapeHtml(t.body2)}</p>`),
  });
}

const STATUS_UPDATE = {
  en: { subject: (ref) => `Application update - ${ref}`, greeting: (name) => `Dear ${name},`, body1: (ref) => `Your application ${ref} has been updated.`, statusLabel: "New status:", body2: "Please sign in to the Client Portal for full details." },
  "zh-CN": { subject: (ref) => `案件更新 - ${ref}`, greeting: (name) => `亲爱的${name}，`, body1: (ref) => `您的案件${ref}已更新。`, statusLabel: "最新状态：", body2: "请登录客户门户查看完整详情。" },
  "zh-Hant": { subject: (ref) => `案件更新 - ${ref}`, greeting: (name) => `親愛的${name}，`, body1: (ref) => `您的案件${ref}已更新。`, statusLabel: "最新狀態：", body2: "請登入客戶入口網站查看完整詳情。" },
  ko: { subject: (ref) => `신청 현황 업데이트 - ${ref}`, greeting: (name) => `${name}님,`, body1: (ref) => `귀하의 신청 ${ref}이 업데이트되었습니다.`, statusLabel: "새로운 상태:", body2: "자세한 내용은 고객 포털에 로그인하여 확인해 주십시오." },
  ja: { subject: (ref) => `お申し込み状況の更新 - ${ref}`, greeting: (name) => `${name} 様`, body1: (ref) => `お申し込み${ref}の状況が更新されました。`, statusLabel: "新しい状況：", body2: "詳細はクライアントポータルにサインインしてご確認ください。" },
  vi: { subject: (ref) => `Cập nhật hồ sơ - ${ref}`, greeting: (name) => `Kính gửi ${name},`, body1: (ref) => `Hồ sơ ${ref} của quý khách đã được cập nhật.`, statusLabel: "Trạng thái mới:", body2: "Vui lòng đăng nhập vào Cổng thông tin khách hàng để xem đầy đủ chi tiết." },
};

export async function sendApplicationStatusUpdate(env, { to, fullName, applicationReference, status, lang }) {
  const normalizedLang = normalizeLang(lang);
  const t = pick(normalizedLang, STATUS_UPDATE);
  // Reuses the SAME status-label table the Client Portal itself renders
  // (clientLocaleStrings.js) rather than retranslating status words
  // independently -- the email and the portal must always agree on what
  // a status is called in a given language.
  const statusLabel = getLocalizedStatusLabel(status, normalizedLang);

  const text = `${fullName ? `${t.greeting(fullName)}\n\n` : ""}${t.body1(applicationReference)}

${t.statusLabel} ${statusLabel}

${t.body2}

${env.PUBLIC_SITE_URL}/portal/`;

  const html = wrap(`
    ${fullName ? `<p>${escapeHtml(t.greeting(fullName))}</p>` : ""}
    <p>${escapeHtml(t.body1(applicationReference))}</p>
    <p style="font-family:monospace;background:#eef1ec;padding:10px 14px;border-radius:4px;display:inline-block;">${escapeHtml(t.statusLabel)} <strong>${escapeHtml(statusLabel)}</strong></p>
    <p>${escapeHtml(t.body2)}</p>
  `);

  await send(env, { to, subject: t.subject(applicationReference), text, html });
}

const CLIENT_MESSAGE = {
  en: { subject: (ref) => `New message from FIS Client Services - ${ref}`, body1: (ref) => `FIS Client Services has sent you a new message regarding application ${ref}.`, body2: "Please sign in to your Client Portal to view and respond to the message." },
  "zh-CN": { subject: (ref) => `FIS客户服务部发来新消息 - ${ref}`, body1: (ref) => `FIS客户服务部就您的案件${ref}发来一条新消息。`, body2: "请登录您的客户门户查看并回复该消息。" },
  "zh-Hant": { subject: (ref) => `FIS客戶服務部發來新訊息 - ${ref}`, body1: (ref) => `FIS客戶服務部就您的案件${ref}發來一則新訊息。`, body2: "請登入您的客戶入口網站查看並回覆該訊息。" },
  ko: { subject: (ref) => `FIS 고객 서비스팀의 새 메시지 - ${ref}`, body1: (ref) => `FIS 고객 서비스팀이 귀하의 신청 ${ref}에 관한 새 메시지를 보냈습니다.`, body2: "메시지를 확인하고 답장하려면 고객 포털에 로그인해 주십시오." },
  ja: { subject: (ref) => `FISカスタマーサービスより新しいメッセージが届いています - ${ref}`, body1: (ref) => `FISカスタマーサービスより、お申し込み${ref}に関する新しいメッセージが届いています。`, body2: "メッセージの確認・返信は、クライアントポータルにサインインして行ってください。" },
  vi: { subject: (ref) => `Tin nhắn mới từ Bộ phận Chăm sóc Khách hàng FIS - ${ref}`, body1: (ref) => `Bộ phận Chăm sóc Khách hàng FIS đã gửi cho quý khách một tin nhắn mới liên quan đến hồ sơ ${ref}.`, body2: "Vui lòng đăng nhập vào Cổng thông tin khách hàng để xem và phản hồi tin nhắn." },
};

export async function sendClientMessageNotification(env, { to, applicationReference, lang }) {
  const t = pick(normalizeLang(lang), CLIENT_MESSAGE);

  const text = `${t.body1(applicationReference)}

${t.body2}

${env.PUBLIC_SITE_URL}/portal/`;

  const html = wrap(`
    <p>${escapeHtml(t.body1(applicationReference))}</p>
    <p>${escapeHtml(t.body2)}</p>
  `);

  await send(env, { to, subject: t.subject(applicationReference), text, html });
}

const PAYMENT_CONFIRM = {
  en: { subject: (ref) => `Payment confirmed - ${ref}`, body1: (ref) => `Foreign Immigration Services has recorded your payment for application ${ref} as paid.`, amountLabel: "Amount:", body2: "Please sign in to the Client Portal for full details." },
  "zh-CN": { subject: (ref) => `付款已确认 - ${ref}`, body1: (ref) => `Foreign Immigration Services已将您案件${ref}的付款记录为已付款。`, amountLabel: "金额：", body2: "请登录客户门户查看完整详情。" },
  "zh-Hant": { subject: (ref) => `付款已確認 - ${ref}`, body1: (ref) => `Foreign Immigration Services已將您案件${ref}的付款記錄為已付款。`, amountLabel: "金額：", body2: "請登入客戶入口網站查看完整詳情。" },
  ko: { subject: (ref) => `결제가 확인되었습니다 - ${ref}`, body1: (ref) => `Foreign Immigration Services는 귀하의 신청 ${ref}에 대한 결제를 완료로 기록하였습니다.`, amountLabel: "금액:", body2: "자세한 내용은 고객 포털에 로그인하여 확인해 주십시오." },
  ja: { subject: (ref) => `お支払いが確認されました - ${ref}`, body1: (ref) => `Foreign Immigration Servicesは、お申し込み${ref}のお支払いを受領済みとして記録しました。`, amountLabel: "金額：", body2: "詳細はクライアントポータルにサインインしてご確認ください。" },
  vi: { subject: (ref) => `Đã xác nhận thanh toán - ${ref}`, body1: (ref) => `Foreign Immigration Services đã ghi nhận thanh toán của quý khách cho hồ sơ ${ref} là đã thanh toán.`, amountLabel: "Số tiền:", body2: "Vui lòng đăng nhập vào Cổng thông tin khách hàng để xem đầy đủ chi tiết." },
};

export async function sendPaymentConfirmation(env, { to, applicationReference, amountPhp, lang }) {
  const t = pick(normalizeLang(lang), PAYMENT_CONFIRM);
  const amount = amountPhp.toFixed(2);

  const text = `${t.body1(applicationReference)}

${t.amountLabel} PHP ${amount}

${t.body2}

${env.PUBLIC_SITE_URL}/portal/`;

  const html = wrap(`
    <p>${escapeHtml(t.body1(applicationReference))}</p>
    <p>${escapeHtml(t.amountLabel)} PHP ${amount}</p>
    <p>${escapeHtml(t.body2)}</p>
  `);

  await send(env, { to, subject: t.subject(applicationReference), text, html });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
