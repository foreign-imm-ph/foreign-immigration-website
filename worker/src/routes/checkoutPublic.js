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
import { listActiveCatalogue, getServiceById, findOrCreateDraftOrder, shapeServiceForCustomer } from "../lib/checkout.js";
import { sendInstantServicesVerification } from "../lib/email.js";

const CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];
const VERIFICATION_TTL_MINUTES = 15;

function resolveLang(url) {
  const lang = url.searchParams.get("lang");
  return CANONICAL_LANGUAGES.includes(lang) ? lang : "en";
}

export async function handleListCatalogue(request, env, url) {
  const lang = resolveLang(url);
  const services = await listActiveCatalogue(env.DB, lang);
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
  return json({ service: await shapeServiceForCustomer(env.DB, service, lang) });
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
