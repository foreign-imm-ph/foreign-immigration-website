// Instant Services: the unauthenticated surface -- browsing the catalogue
// and starting a guest request. No session is required for either; the
// catalogue is deliberately public (price transparency, browsable before
// committing to anything), and "begin" is what ISSUES the first
// credential (a verification link), so it can't itself require one.
import { json, isValidEmail } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";
import { newId, newToken, sha256Hex } from "../lib/crypto.js";
import { getClientByEmail, createClient } from "../lib/db.js";
import { checkHoneypot, checkRateLimit } from "../lib/abuse.js";
import { listActiveCatalogue, getServiceById, findOrCreateDraftOrder, shapeServiceForCustomer, getServiceI18n, usesProcessingTiers } from "../lib/checkout.js";
import { sendInstantServicesVerification } from "../lib/email.js";
import { ensureServiceTranslations } from "../lib/checkoutTranslation.js";
import { PREVIEWABLE_FORM_IDS, originalTemplateKey, buildWatermarkedFormPreview } from "../lib/biFormEngine.js";

const CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];
const VERIFICATION_TTL_MINUTES = 15;

function resolveLang(url) {
  const lang = url.searchParams.get("lang");
  return CANONICAL_LANGUAGES.includes(lang) ? lang : "en";
}

// Whether the "Preview Official BI Form" button (handlePreviewOfficialForm
// below) has anything to show for this service -- computed from the
// already-shaped service's own offeringType/biFormId fields, not a second
// DB read, so listing the whole catalogue never costs anything extra.
//
// Directive section 8.2: gated on PREVIEWABLE_FORM_IDS (reproduction-
// rights/document-type eligibility), never on KNOWN_BI_FORM_IDS (engine-
// mapping completeness) -- a form with no fillable-document mapping yet
// can still have a safe, authorized, applicant-only blank preview. Whether
// the underlying R2 object actually exists is checked only when the
// preview is actually requested (handlePreviewOfficialForm), not here --
// the same "don't re-check per catalogue listing" posture this function
// already had.
function withFormPreviewFlag(shaped) {
  return { ...shaped, hasOfficialFormPreview: usesProcessingTiers(shaped.offeringType) && !!shaped.biFormId && PREVIEWABLE_FORM_IDS.includes(shaped.biFormId) };
}

export async function handleListCatalogue(request, env, url) {
  const lang = resolveLang(url);
  const services = (await listActiveCatalogue(env.DB, lang)).map(withFormPreviewFlag);
  return json({ services, lang });
}

// Public detail read for a single (active) service -- used by the
// service-detail page's CTA block and the "apply" flow's first screen.
// Deliberately 404s (not just omits) an inactive service: discoverability
// of an unapproved service's existence is refused, not merely its price.
export async function handleGetCatalogueService(request, env, url, serviceId) {
  const lang = resolveLang(url);
  const service = await getServiceById(env.DB, serviceId);
  if (!service || !service.active) throw new HttpError(404, "Not found");

  // Bounded, first-request fallback: a save-time translation (the primary
  // path -- see staffCheckout.js) should already have this ready, but if
  // this specific language is genuinely missing for this one service
  // (e.g. generated before this language existed, or a prior attempt
  // failed), generate it now rather than silently showing English forever.
  // Scoped to a single service's five languages, never the whole
  // catalogue, so this can never balloon into an unbounded Workers AI
  // bill or block a customer browsing the LIST (listActiveCatalogue,
  // above, never does this).
  if (lang !== "en") {
    const existing = await getServiceI18n(env.DB, service.id, lang);
    if (!existing || existing.lang !== lang) {
      try {
        await ensureServiceTranslations(env, service.id);
      } catch (err) {
        console.error("First-request catalogue translation failed:", err.message);
      }
    }
  }

  return json({ service: withFormPreviewFlag(await shapeServiceForCustomer(env.DB, service, lang)) });
}

// "Preview Official BI Form" (directive section 5): the ORIGINAL official
// PDF, watermarked "PREVIEW ONLY", for a prospective customer to view
// BEFORE starting the questionnaire -- never the customer's own answers
// (that's a different, authenticated route entirely). Deliberately
// public, same reasoning as the rest of this file: a blank government
// form is not private information, and requiring sign-in just to preview
// it would defeat the point of showing it before the customer commits to
// anything. 404s (not a confusing blank page) for a service with no
// previewable BI form (PREVIEWABLE_FORM_IDS -- directive section 8.2:
// eligibility is about reproduction rights/document type, NEVER about
// whether the form has been engine-mapped) -- "show an appropriate
// service explanation instead of a misleading PDF preview button" is the
// customer-facing frontend's job once it sees this 404, not this route's.
export async function handlePreviewOfficialForm(request, env, serviceId) {
  const service = await getServiceById(env.DB, serviceId);
  if (!service || !service.active) throw new HttpError(404, "Not found");
  if (!usesProcessingTiers(service.offering_type) || !service.bi_form_id || !PREVIEWABLE_FORM_IDS.includes(service.bi_form_id)) {
    throw new HttpError(404, "No official form preview is available for this service.");
  }

  const originalObject = await env.BI_FORMS_LIBRARY.get(originalTemplateKey(service.bi_form_id));
  if (!originalObject) {
    throw new HttpError(501, "The official form template is not currently available. Please contact FIS directly.");
  }
  const originalBytes = new Uint8Array(await originalObject.arrayBuffer());
  const watermarked = await buildWatermarkedFormPreview(originalBytes);

  return new Response(watermarked, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${service.bi_form_id}-preview.pdf"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// Begins (or resumes) a guest Instant Services request. Deliberately
// distinct from handleRequestMagicLink (routes/auth.js): that endpoint
// never creates an account for an unknown email, by design, to prevent
// portal-access enumeration. THIS endpoint is the one place a brand-new
// client record is allowed to be created outside staff action --
// appropriate here because the customer is explicitly, intentionally
// registering by starting a purchase, not probing for an existing
// account. An existing client (by email) is reused, never duplicated.
export async function handleBeginCheckout(request, env) {
  const body = await request.json().catch(() => ({}));
  checkHoneypot(body);
  await checkRateLimit(env.DB, request, "checkout_begin", { maxEvents: 8, windowMinutes: 15 });

  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.fullName || "").trim();
  const serviceId = String(body.serviceId || "").trim();
  if (!isValidEmail(email)) throw new HttpError(400, "A valid email address is required");
  if (!fullName) throw new HttpError(400, "Full name is required");
  if (!serviceId) throw new HttpError(400, "Missing service selection");

  const service = await getServiceById(env.DB, serviceId);
  if (!service || !service.active) throw new HttpError(404, "This service is not currently available");

  let client = await getClientByEmail(env.DB, email);
  if (!client) {
    client = await createClient(env.DB, { fullName, email });
  }

  const order = await findOrCreateDraftOrder(env.DB, { clientId: client.id, serviceId });

  // Reuses the exact same auth_tokens table and single-use/expiry rules
  // handleRequestMagicLink already relies on -- verification is completed
  // through the EXISTING, unmodified POST /api/auth/verify endpoint; this
  // route only ever issues the token and sends the email.
  const rawToken = newToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO auth_tokens (id, client_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(newId(), client.id, tokenHash, expiresAt)
    .run();

  const verifyUrl = `${env.PUBLIC_SITE_URL}/instant-services/verify/?token=${rawToken}&order=${order.id}`;
  try {
    await sendInstantServicesVerification(env, { to: email, url: verifyUrl });
  } catch (err) {
    // Best-effort, matching every other transactional email in this
    // codebase (lib/email.js) -- a delivery failure must never block the
    // order/client record that already exists from being usable once the
    // customer does get a working link (e.g. a resend).
    console.error("Instant Services verification email failed:", err.message);
  }

  return json({ message: "Check your email to verify your request and continue.", orderId: order.id });
}
