// Instant Services: catalogue reads, order lifecycle, and server-
// authoritative pricing. No browser-submitted amount is ever trusted --
// every price shown to a customer is recomputed here, from
// checkout_price_components, at both catalogue-read time and (again,
// independently) at review-confirm time, when it is snapshotted
// immutably onto the order.
import { newId, generateReference } from "./crypto.js";
import { HttpError } from "./storage.js";
import { sumCentavos, isValidCentavos } from "./money.js";
import { hashEnglishContent, hashEnglishFields } from "./checkoutTranslation.js";

export const ORDER_STATUSES = ["draft", "awaiting_payment", "awaiting_verification", "paid", "cancelled", "expired"];

// Order & Book Online: offering type distinguishes an automated Forms-
// Library document (a real questionnaire/coordinate-map pipeline exists)
// from a staff-processed one (no automated pipeline -- a human prepares
// and files it after the customer pays) from a bookable service (Airport
// VIP and similar, see lib/airportVip.js). Offering status is the
// lifecycle a catalogue row moves through in the Staff Portal; it is
// kept in lockstep with the pre-existing `active` column (see
// setOfferingStatus below) so every already-written "WHERE active = 1"
// query across the codebase keeps working unchanged.
// fixed_price_service: Phase 4's Category C -- a standardized professional
// service (e.g. a status-review assessment) with no government-form
// deliverable and no booking date/time, priced and fulfilled exactly like
// document_manual (customer pays, staff processes and marks complete) but
// kept as its own type rather than overloading document_manual's label,
// since what the customer receives genuinely isn't a document.
export const OFFERING_TYPES = ["document_automated", "document_manual", "bookable_service", "fixed_price_service"];
// 'approved' (Phase 4, Stage C) sits between 'ready_for_review' and
// 'active': a distinct business decision ("FIS actually offers this")
// from a price being set and from the offering going live. Directive's
// own suggested statuses (Pending business approval / Approved but not
// priced / Ready for activation / ...) collapse onto this single new
// state plus the existing price gate below, rather than three new
// columns -- "ready for activation" is simply approved + a price set,
// which setOfferingStatus already computes, not a state worth storing.
export const OFFERING_STATUSES = ["draft", "ready_for_review", "approved", "active", "paused", "archived"];

// ---------------------------------------------------------------------
// Dual processing tiers (Express/Regular) -- document services only.
// Express is always listed first, per the explicit display-order
// requirement; the array order below is relied on wherever tiers are
// iterated for display (Staff Portal editor, customer tier selection).
// ---------------------------------------------------------------------
export const PROCESSING_TIERS = ["express", "regular"];
export const DOCUMENT_OFFERING_TYPES = ["document_automated", "document_manual"];
export const TIER_LABELS = { express: "Express Processing", regular: "Regular Processing" };

export function usesProcessingTiers(offeringType) {
  return DOCUMENT_OFFERING_TYPES.includes(offeringType);
}

// Maps a tier name to its four column names on checkout_services -- the
// one place that mapping is spelled out, so every other function below
// reads/writes columns through this rather than repeating the four
// string literals per tier.
export function tierColumns(tier) {
  return {
    enabled: `${tier}_enabled`,
    price: `${tier}_price_php_centavos`,
    min: `${tier}_min_business_days`,
    max: `${tier}_max_business_days`,
  };
}

// A tier is "approved" only when it has an explicit, non-null price AND
// a complete, valid lead-time range -- never inferred, never defaulted,
// and never confused with the tier simply being enabled. Mirrors
// hasApprovedPrice's "a missing price is not a zero price" rule for the
// legacy single-price model below.
export function tierIsApproved(service, tier) {
  const c = tierColumns(tier);
  const price = service[c.price];
  const min = service[c.min];
  const max = service[c.max];
  return price !== null && price !== undefined && Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= min;
}

// Selectable by a CUSTOMER right now: enabled AND approved. A disabled
// tier is never selectable regardless of what price/lead-time data it
// still holds from before it was disabled.
export function tierIsSelectable(service, tier) {
  const c = tierColumns(tier);
  return !!service[c.enabled] && tierIsApproved(service, tier);
}

// Validates one tier's staff-submitted values before they are ever
// persisted. Intentionally lenient when a field is simply blank (null) --
// the owner is allowed to save a partially-configured tier while still
// working on it; only the ACTIVATION gate (setOfferingStatus below)
// requires a tier to be fully approved. A present-but-invalid value
// (a negative price, a non-integer lead time, max < min) is always
// rejected outright, whether or not the tier is enabled.
export function validateTierInput(tier, { priceCentavos, minDays, maxDays }) {
  if (priceCentavos !== null && !isValidCentavos(priceCentavos)) {
    throw new HttpError(400, `${TIER_LABELS[tier]}: price must be a valid, non-negative PHP amount.`);
  }
  if (minDays !== null && (!Number.isInteger(minDays) || minDays < 1)) {
    throw new HttpError(400, `${TIER_LABELS[tier]}: minimum processing time must be a positive whole number of business days.`);
  }
  if (maxDays !== null && (!Number.isInteger(maxDays) || maxDays < 1)) {
    throw new HttpError(400, `${TIER_LABELS[tier]}: maximum processing time must be a positive whole number of business days.`);
  }
  if (minDays !== null && maxDays !== null && maxDays < minDays) {
    throw new HttpError(400, `${TIER_LABELS[tier]}: maximum processing time must be greater than or equal to the minimum.`);
  }
}

// Persists both tiers in one statement. Clears
// regular_price_migrated_from_legacy unconditionally -- an explicit staff
// save of the tier form IS the required confirmation (the same pattern
// lib/checkoutTranslation.js already uses for its own "needs review"
// flag), whether or not this particular save touched the Regular price.
export async function updateProcessingTiers(db, serviceId, tiers) {
  for (const tier of PROCESSING_TIERS) validateTierInput(tier, tiers[tier]);
  await db
    .prepare(
      `UPDATE checkout_services SET
         express_enabled = ?, express_price_php_centavos = ?, express_min_business_days = ?, express_max_business_days = ?,
         regular_enabled = ?, regular_price_php_centavos = ?, regular_min_business_days = ?, regular_max_business_days = ?,
         regular_price_migrated_from_legacy = 0,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(
      tiers.express.enabled ? 1 : 0, tiers.express.priceCentavos, tiers.express.minDays, tiers.express.maxDays,
      tiers.regular.enabled ? 1 : 0, tiers.regular.priceCentavos, tiers.regular.minDays, tiers.regular.maxDays,
      serviceId
    )
    .run();
}

// Customer-facing tier list for a document service -- Express first,
// Regular second (PROCESSING_TIERS' own order), including only tiers
// that are both enabled and have an approved price/lead-time range. A
// tier the owner hasn't finished pricing yet, or has disabled, is simply
// absent from this list -- never shown with an invented or blank price.
export function getProcessingTiersForCustomer(service) {
  if (!usesProcessingTiers(service.offering_type)) return [];
  return PROCESSING_TIERS.filter((tier) => tierIsSelectable(service, tier)).map((tier) => {
    const c = tierColumns(tier);
    return {
      tier,
      label: TIER_LABELS[tier],
      totalPhpCentavos: service[c.price],
      minBusinessDays: service[c.min],
      maxBusinessDays: service[c.max],
    };
  });
}

const DEFAULT_PRICE_LABEL = {
  document_automated: "Document price",
  document_manual: "Document price",
  bookable_service: "Service price",
  fixed_price_service: "Service price",
};

export function defaultPriceLabel(offeringType) {
  return DEFAULT_PRICE_LABEL[offeringType] || "Price";
}

// A service may only be activated once it actually has an approved,
// non-zero price -- "pause purchases where no approved price exists" is
// enforced here, at the one place offering_status can be set to
// 'active', rather than left to staff discipline.
export function hasApprovedPrice(components) {
  return Array.isArray(components) && components.length > 0 && sumCentavos(components) > 0;
}

// A draft order is still being assembled (service not yet fully
// configured/reviewed); only draft/awaiting_payment/awaiting_verification
// are "still open" for the purposes of idempotent reuse below -- paid,
// cancelled and expired orders are never silently resumed.
const OPEN_STATUSES = new Set(["draft", "awaiting_payment", "awaiting_verification"]);

const ALLOWED_ORDER_TRANSITIONS = {
  draft: ["awaiting_payment", "cancelled", "expired"],
  awaiting_payment: ["awaiting_verification", "cancelled", "expired"],
  awaiting_verification: ["paid", "awaiting_payment", "cancelled"], // awaiting_payment = staff rejected the proof, customer must resubmit
  paid: [],
  cancelled: [],
  expired: [],
};

export function assertOrderTransitionAllowed(fromStatus, toStatus) {
  const allowed = ALLOWED_ORDER_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new HttpError(409, `Cannot move this order from "${fromStatus}" to "${toStatus}".`);
  }
}

// ---------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------

// Returns every ACTIVE service with its priced components and the
// requested language's content (falling back to English only if the
// requested language's row is genuinely missing -- never silently
// fabricated). Never includes an inactive/unapproved service, regardless
// of caller.
export async function listActiveCatalogue(db, lang) {
  const { results: services } = await db
    .prepare("SELECT * FROM checkout_services WHERE active = 1 ORDER BY display_order, id")
    .all();
  const out = [];
  for (const service of services) {
    out.push(await shapeServiceForCustomer(db, service, lang));
  }
  return out;
}

// Returns a single service by id, active or not (callers that need an
// inactive one -- e.g. staff catalogue management, or re-reading an
// order placed while a service was still active -- call this directly;
// customer-facing "begin" flows must check `.active` themselves and
// refuse an inactive service explicitly, not just fail to find it).
export async function getServiceById(db, serviceId) {
  return db.prepare("SELECT * FROM checkout_services WHERE id = ?").bind(serviceId).first();
}

// Customer-facing read. A row flagged needs_review (a manually authored
// translation whose English source has since changed -- see
// lib/checkoutTranslation.js) is treated exactly like a MISSING row:
// falls back to English rather than ever risking a customer seeing
// eligibility/pricing/document-requirement text that might no longer
// match the current English source. The flag is cleared only by an
// explicit staff "Keep" or "Update automatically" decision, never by
// this read path.
export async function getServiceI18n(db, serviceId, lang) {
  const row = await db
    .prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = ?")
    .bind(serviceId, lang)
    .first();
  if (row && !row.needs_review) return row;
  if (lang === "en") return null;
  return db.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'en'").bind(serviceId).first();
}

export async function getPriceComponents(db, serviceId) {
  const { results } = await db
    .prepare("SELECT * FROM checkout_price_components WHERE service_id = ? ORDER BY display_order, id")
    .bind(serviceId)
    .all();
  return results;
}

// Customer-facing shape. Deliberately does NOT include the itemized
// government-fee/service-fee breakdown -- per the explicit "one
// all-inclusive price, no fee breakdown" business decision, every
// customer-facing surface (catalogue, detail page, checkout, receipts,
// Client Portal, email) sees only `totalPhpCentavos` and a generic
// `priceLabel`. The itemized components remain fully available
// internally (getPriceComponents, used directly by the Staff Portal and
// by checkout_price_history) -- this function is the one place that
// deliberately narrows what a customer-facing route is handed, so no
// future customer route can leak the breakdown by accident.
async function shapeServiceForCustomer(db, service, lang) {
  const i18n = await getServiceI18n(db, service.id, lang);
  const components = await getPriceComponents(db, service.id);
  const usesTiers = usesProcessingTiers(service.offering_type);
  const processingTiers = getProcessingTiersForCustomer(service);
  // For a tiered document service, the generic price fields below mirror
  // the CHEAPEST selectable tier -- so every existing customer-facing
  // surface that already reads totalPhpCentavos/hasApprovedPrice (the
  // catalogue grid cards, homepage cards, service-detail CTA badge --
  // see instant-services-catalogue.js) keeps working unchanged, showing
  // a representative "from" price, while the full Express/Regular
  // breakdown a customer actually chooses from is in `processingTiers`.
  const cheapestTier = processingTiers.length
    ? processingTiers.reduce((min, t) => (t.totalPhpCentavos < min.totalPhpCentavos ? t : min))
    : null;
  return {
    id: service.id,
    serviceSlug: service.service_slug,
    biFormId: service.bi_form_id,
    offeringType: service.offering_type,
    serviceGroup: service.service_group,
    supportsDelivery: !!service.supports_delivery,
    title: i18n ? i18n.title : service.id,
    shortDescription: i18n ? i18n.short_description : "",
    eligibilityText: i18n ? i18n.eligibility_text : "",
    noticesText: i18n ? i18n.notices_text : null,
    priceLabel: service.customer_price_label || defaultPriceLabel(service.offering_type),
    hasApprovedPrice: usesTiers ? !!cheapestTier : hasApprovedPrice(components),
    totalPhpCentavos: usesTiers ? (cheapestTier ? cheapestTier.totalPhpCentavos : 0) : sumCentavos(components),
    usesProcessingTiers: usesTiers,
    processingTiers,
  };
}

// Strips the itemized breakdown from an (internal, full) price snapshot
// before it is ever sent to a customer -- used wherever
// order.price_snapshot_json would otherwise reach a customer-facing JSON
// response verbatim (e.g. handleGetOrder, handleConfirmAndPay in
// routes/checkoutCustomer.js). The FULL snapshot (with components) stays
// in the database for staff/audit use (viewOrder in staffCheckout.js) --
// this only narrows what leaves the server toward a customer.
export function publicPriceSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    totalPhpCentavos: snapshot.totalPhpCentavos,
    snapshotAt: snapshot.snapshotAt,
    currency: snapshot.currency || "PHP",
    processingTier: snapshot.processingTier || null,
    tierLabel: snapshot.tierLabel || null,
    minBusinessDays: snapshot.minBusinessDays != null ? snapshot.minBusinessDays : null,
    maxBusinessDays: snapshot.maxBusinessDays != null ? snapshot.maxBusinessDays : null,
    delivery: snapshot.delivery || null,
  };
}

export { shapeServiceForCustomer };

// ---------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------

export async function getOrderById(db, orderId) {
  return db.prepare("SELECT * FROM checkout_orders WHERE id = ?").bind(orderId).first();
}

// Mirrors requireOwnedApplication/requireOwnedSubmission: resolves an
// order AND proves the current session's client owns it in one step --
// an order ID from a URL or query param is never trusted alone.
export async function requireOwnedOrder(db, client, orderId) {
  const order = await db.prepare("SELECT * FROM checkout_orders WHERE id = ? AND client_id = ?").bind(orderId, client.id).first();
  if (!order) throw new HttpError(404, "Not found");
  return order;
}

export async function recordOrderStatus(db, { orderId, status, note = null, staffEmail = null }) {
  await db.prepare("UPDATE checkout_orders SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, orderId).run();
  await db
    .prepare("INSERT INTO checkout_order_status_history (id, order_id, status, note, changed_by_staff_email) VALUES (?, ?, ?, ?, ?)")
    .bind(newId(), orderId, status, note, staffEmail)
    .run();
}

export async function transitionOrder(db, order, toStatus, opts = {}) {
  assertOrderTransitionAllowed(order.status, toStatus);
  await recordOrderStatus(db, { orderId: order.id, status: toStatus, note: opts.note, staffEmail: opts.staffEmail });
  return getOrderById(db, order.id);
}

export async function getOrderHistory(db, orderId) {
  const { results } = await db
    .prepare("SELECT * FROM checkout_order_status_history WHERE order_id = ? ORDER BY changed_at")
    .bind(orderId)
    .all();
  return results;
}

// Idempotent: a client re-starting the "begin" flow for a service they
// already have an open (non-terminal) order for is handed that SAME
// order back, never a duplicate. This is what "idempotent order
// creation" / "duplicate-order protection" means in practice here --
// there is no separate idempotency-key mechanism, because the natural
// key (client + service, while still open) already prevents duplicates.
export async function findOrCreateDraftOrder(db, { clientId, serviceId }) {
  const existing = await db
    .prepare(
      `SELECT * FROM checkout_orders WHERE client_id = ? AND service_id = ?
       AND status IN ('draft', 'awaiting_payment', 'awaiting_verification')
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(clientId, serviceId)
    .first();
  if (existing) return existing;

  const id = newId();
  await db
    .prepare("INSERT INTO checkout_orders (id, client_id, service_id, status) VALUES (?, ?, ?, 'draft')")
    .bind(id, clientId, serviceId)
    .run();
  await recordOrderStatus(db, { orderId: id, status: "draft" });
  return getOrderById(db, id);
}

// Creates the application + bi_form_submission the moment a verified
// customer actually starts filling in the questionnaire -- NOT at "begin"
// time, and always application-before-submission-before-documents, which
// is what lets later document uploads satisfy documents.application_id's
// existing NOT NULL constraint without any schema change. Idempotent:
// calling this twice for the same order (e.g. a page reload) returns the
// SAME application/submission rather than creating a second one.
export async function startOrderApplication(db, order, service) {
  // A document_manual offering has no automated Forms Library pipeline
  // by design (bi_form_id is the "" no-form sentinel -- see
  // validateBiFormId above) -- a human prepares and files it after
  // payment, so there is no questionnaire for the customer to complete.
  // It only needs the application row itself (same reason
  // startBookingApplication below never creates a bi_form_submission
  // either): payment_requests.application_id and the rest of the
  // existing application-scoped plumbing still need SOMETHING to point
  // at. Attempting the automated path here used to throw "Unknown BI
  // form id" the moment a customer reached the questionnaire step.
  // fixed_price_service (Phase 4) has exactly the same shape -- no form,
  // no questionnaire, staff fulfils it manually -- so it takes the same
  // no-submission path.
  const isManual = service.offering_type === "document_manual" || service.offering_type === "fixed_price_service";

  if (order.application_id && (isManual || order.bi_form_submission_id)) {
    return { applicationId: order.application_id, submissionId: order.bi_form_submission_id || null };
  }

  const applicationId = newId();
  const reference = await insertUniqueReference(db, "applications");
  await db
    .prepare("INSERT INTO applications (id, reference, client_id, service_slug) VALUES (?, ?, ?, ?)")
    .bind(applicationId, reference, order.client_id, service.service_slug)
    .run();
  await db
    .prepare("INSERT INTO application_status_history (id, application_id, status) VALUES (?, ?, 'enquiry_received')")
    .bind(newId(), applicationId)
    .run();

  if (isManual) {
    await db
      .prepare("UPDATE checkout_orders SET application_id = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(applicationId, order.id)
      .run();
    return { applicationId, submissionId: null };
  }

  const { createSubmission } = await import("./biForms.js");
  const submission = await createSubmission(db, {
    applicationId,
    clientId: order.client_id,
    biFormId: service.bi_form_id,
    assignedByStaffEmail: null,
    intakePath: "instant_checkout",
  });

  await db
    .prepare("UPDATE checkout_orders SET application_id = ?, bi_form_submission_id = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(applicationId, submission.id, order.id)
    .run();

  return { applicationId, submissionId: submission.id };
}

// The bookable-service sibling of startOrderApplication above: a
// booking has no questionnaire/bi_form_submission of its own (its
// intake is the booking record in lib/airportVip.js), but it still needs
// an `applications` row so payment_requests.application_id (NOT NULL)
// and the rest of the existing application-scoped plumbing -- the
// Client Portal's per-application view, staff messaging, audit --
// keeps working for an Airport VIP order exactly as it does for a
// document order, rather than duplicating that machinery. Idempotent,
// same as startOrderApplication.
export async function startBookingApplication(db, order, service) {
  if (order.application_id) return order.application_id;

  const applicationId = newId();
  const reference = await insertUniqueReference(db, "applications");
  await db
    .prepare("INSERT INTO applications (id, reference, client_id, service_slug) VALUES (?, ?, ?, ?)")
    .bind(applicationId, reference, order.client_id, service.service_slug)
    .run();
  await db
    .prepare("INSERT INTO application_status_history (id, application_id, status) VALUES (?, ?, 'enquiry_received')")
    .bind(newId(), applicationId)
    .run();
  await db
    .prepare("UPDATE checkout_orders SET application_id = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(applicationId, order.id)
    .run();

  return applicationId;
}

// ---------------------------------------------------------------------
// Catalogue management (staff-only writes) -- the Staff Portal's
// catalogue section (routes/staffCheckout.js) is the only caller. A new
// service is created inactive by the table's own DEFAULT (see the
// migration) -- never silently live the moment it's created, same
// fail-closed posture QR Ph's settings log uses.
// ---------------------------------------------------------------------
// Validates a BI Form ID before it can ever be saved against an
// offering_type='document_automated' service -- Finding F2 from the
// October 2026 review ("no validation that a catalogue service's BI Form
// ID is real"). Dynamically imports biFormEngine.js (rather than a
// static import) so routes that never touch catalogue creation/edit
// don't pay for pulling in the Forms Library engine's own import graph.
// A document_manual offering is explicitly exempt: it has no automated
// pipeline by design, so its bi_form_id (if any) is a free-text
// reference code for staff, not validated against the engine registry.
export async function validateBiFormId(offeringType, biFormId) {
  if (offeringType !== "document_automated") return;
  const { KNOWN_BI_FORM_IDS } = await import("./biFormEngine.js");
  if (!biFormId || !KNOWN_BI_FORM_IDS.includes(biFormId)) {
    throw new HttpError(
      400,
      `"${biFormId || "(empty)"}" is not a BI Form ID with an approved, tested Forms Library configuration. ` +
        `Known automated form IDs: ${KNOWN_BI_FORM_IDS.join(", ")}. ` +
        `Choose "Staff-processed document order" instead if this form doesn't have an automated pipeline yet.`
    );
  }
}

// bi_form_id is a legacy NOT NULL column (from before offering_type
// existed, when every catalogue row WAS an automated form). An empty
// string -- never a stored NULL -- is the "no form" sentinel for
// document_manual/bookable_service rows, so this never needs an
// unsupported ALTER on a column that other tables hold live foreign keys
// against; every reader of service.bi_form_id already treats it with a
// falsy check (`|| ""`, `!biFormId`), so "" behaves exactly like "none".
export async function createService(db, { serviceSlug, biFormId, offeringType = "document_automated", serviceGroup, customerPriceLabel, supportsDelivery, displayOrder }) {
  await validateBiFormId(offeringType, biFormId);
  const id = newId();
  await db
    .prepare(
      `INSERT INTO checkout_services (id, service_slug, bi_form_id, offering_type, service_group, customer_price_label, supports_delivery, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, serviceSlug, biFormId || "", offeringType, serviceGroup || null, customerPriceLabel || null, supportsDelivery ? 1 : 0, displayOrder || 0)
    .run();
  return getServiceById(db, id);
}

export async function updateServiceMeta(db, serviceId, { serviceSlug, biFormId, offeringType = "document_automated", serviceGroup, customerPriceLabel, supportsDelivery, displayOrder }) {
  await validateBiFormId(offeringType, biFormId);
  await db
    .prepare(
      `UPDATE checkout_services SET service_slug = ?, bi_form_id = ?, offering_type = ?, service_group = ?, customer_price_label = ?, supports_delivery = ?, display_order = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(serviceSlug, biFormId || "", offeringType, serviceGroup || null, customerPriceLabel || null, supportsDelivery ? 1 : 0, displayOrder || 0, serviceId)
    .run();
  return getServiceById(db, serviceId);
}

// Legacy boolean toggle -- still used by anything that only knows about
// `active` (kept for compatibility; setOfferingStatus below is the new,
// richer entry point and keeps this column in sync itself).
export async function setServiceActive(db, serviceId, active) {
  await db.prepare("UPDATE checkout_services SET active = ?, updated_at = datetime('now') WHERE id = ?").bind(active ? 1 : 0, serviceId).run();
  return getServiceById(db, serviceId);
}

// The new lifecycle entry point. Setting 'active' is refused outright
// (not just discouraged) on two independent grounds -- a business
// approval decision, and an approved price -- "pause purchases where no
// approved price exists" AND "require an authorized administrative
// action before an offering becomes purchasable" both enforced at the
// one place that could ever make a service customer-visible, not left
// to staff remembering to check either one.
export async function setOfferingStatus(db, serviceId, status, staffEmail) {
  if (!OFFERING_STATUSES.includes(status)) throw new HttpError(400, "Unknown offering status");
  if (status === "active") {
    const service = await getServiceById(db, serviceId);
    if (!service.approved_at) {
      throw new HttpError(409, "This offering has not been approved yet. Move it to 'approved' before activating it.");
    }
    if (usesProcessingTiers(service.offering_type)) {
      // At least one tier must be enabled AND fully approved (price +
      // valid lead-time range) -- "an enabled tier must have a valid
      // price/lead-time before activation" and "at least one tier must
      // be enabled before a document service can be activated" are the
      // same gate, since a disabled tier is never selectable anyway.
      if (!PROCESSING_TIERS.some((tier) => tierIsSelectable(service, tier))) {
        throw new HttpError(
          409,
          "This document service has no enabled processing tier with an approved price and lead-time range yet. Configure Express or Regular Processing before activating it."
        );
      }
    } else {
      const components = await getPriceComponents(db, serviceId);
      if (!hasApprovedPrice(components)) {
        throw new HttpError(409, "This offering has no approved price yet. Set a price before activating it.");
      }
    }
  }
  const active = status === "active" ? 1 : 0;
  // approved_by_staff_email/approved_at are an append-only fact, set the
  // first time (and only the first time) an offering is approved --
  // never cleared by a later pause/archive, so the record of who
  // approved the product and when survives the rest of its lifecycle.
  if (status === "approved") {
    await db
      .prepare(
        `UPDATE checkout_services
         SET offering_status = ?, active = ?, updated_at = datetime('now'),
             approved_by_staff_email = COALESCE(approved_by_staff_email, ?),
             approved_at = COALESCE(approved_at, datetime('now'))
         WHERE id = ?`
      )
      .bind(status, active, staffEmail, serviceId)
      .run();
  } else {
    await db
      .prepare("UPDATE checkout_services SET offering_status = ?, active = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(status, active, serviceId)
      .run();
  }
  return getServiceById(db, serviceId);
}

// ---------------------------------------------------------------------
// Price history -- append-only archive, written every time staff saves a
// price change (not every read). "View the current price / view
// historical prices / identify the staff member / date and time /
// optional reason" per the dynamic-pricing requirement.
// ---------------------------------------------------------------------
export async function updatePriceComponentsWithHistory(db, serviceId, components, staffEmail, reason) {
  await replacePriceComponents(db, serviceId, components);
  await db
    .prepare(
      `INSERT INTO checkout_price_history (id, service_id, components_json, total_php_centavos, changed_by_staff_email, reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newId(),
      serviceId,
      JSON.stringify(components.map((c) => ({ type: c.type, label: c.label, amountPhpCentavos: c.amountPhpCentavos }))),
      components.reduce((sum, c) => sum + (Number(c.amountPhpCentavos) || 0), 0),
      staffEmail,
      reason || null
    )
    .run();
}

export async function getPriceHistory(db, serviceId) {
  const { results } = await db
    .prepare("SELECT * FROM checkout_price_history WHERE service_id = ? ORDER BY changed_at DESC")
    .bind(serviceId)
    .all();
  return results.map((r) => ({ ...r, components: JSON.parse(r.components_json) }));
}

// This is the MANUAL save path (the staff catalogue form) for every
// language, English included. A row saved this way is always
// auto_generated = 0 -- "this is staff-authored/approved content, the
// automatic translator must never regenerate it" -- which matters most
// when it OVERWRITES a previously machine-generated row (checked here via
// the explicit SET on conflict, not just the INSERT default) so a manual
// correction can never later be silently replaced again.
//
// For a non-English language, the save is also stamped as RECONCILED
// against the current English content (field_hashes_json/source_hash set
// from the English row as it stands right now -- English is always saved
// first in the same request, see staffCheckout.js saveLanguageContent, so
// this reads the just-saved English text) and needs_review is cleared --
// the owner typing a translation IS the review, so no stale warning can
// linger from before this save.
export async function upsertServiceI18n(db, serviceId, lang, { title, shortDescription, eligibilityText, noticesText }) {
  let fieldHashesJson = null;
  let sourceHash = null;
  if (lang !== "en") {
    const enRow = await db.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'en'").bind(serviceId).first();
    if (enRow) {
      fieldHashesJson = JSON.stringify(hashEnglishFields(enRow));
      sourceHash = hashEnglishContent({
        title: enRow.title,
        shortDescription: enRow.short_description,
        eligibilityText: enRow.eligibility_text,
        noticesText: enRow.notices_text,
      });
    }
  }
  await db
    .prepare(
      `INSERT INTO checkout_service_i18n
         (service_id, lang, title, short_description, eligibility_text, notices_text,
          auto_generated, source_hash, translation_status, generated_at,
          field_hashes_json, needs_review, review_changed_fields)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'ready', NULL, ?, 0, NULL)
       ON CONFLICT(service_id, lang) DO UPDATE SET
         title = excluded.title, short_description = excluded.short_description,
         eligibility_text = excluded.eligibility_text, notices_text = excluded.notices_text,
         auto_generated = 0, source_hash = excluded.source_hash, translation_status = 'ready', generated_at = NULL,
         field_hashes_json = excluded.field_hashes_json, needs_review = 0, review_changed_fields = NULL`
    )
    .bind(serviceId, lang, title, shortDescription, eligibilityText, noticesText || null, sourceHash, fieldHashesJson)
    .run();
}

// Wholesale replace, not a diff -- the staff form always submits the
// service's complete fee breakdown, so stale components (one removed in
// this edit) can never linger. A component with no amount typed in is
// silently dropped rather than stored as zero -- see staffCheckout.js's
// form parsing.
export async function replacePriceComponents(db, serviceId, components) {
  await db.prepare("DELETE FROM checkout_price_components WHERE service_id = ?").bind(serviceId).run();
  let order = 0;
  for (const c of components) {
    await db
      .prepare("INSERT INTO checkout_price_components (id, service_id, component_type, label, amount_php_centavos, display_order) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(newId(), serviceId, c.type, c.label, c.amountPhpCentavos, order++)
      .run();
  }
}

export async function listAllServicesForStaff(db) {
  const { results } = await db.prepare("SELECT * FROM checkout_services ORDER BY display_order, id").all();
  return results;
}

export async function listOrdersForStaff(db, { status } = {}) {
  const query = status
    ? db.prepare(
        `SELECT o.*, c.full_name AS client_full_name, c.email AS client_email
         FROM checkout_orders o JOIN clients c ON c.id = o.client_id
         WHERE o.status = ? ORDER BY o.updated_at DESC`
      ).bind(status)
    : db.prepare(
        `SELECT o.*, c.full_name AS client_full_name, c.email AS client_email
         FROM checkout_orders o JOIN clients c ON c.id = o.client_id
         ORDER BY o.updated_at DESC LIMIT 200`
      );
  const { results } = await query.all();
  return results;
}

// ---------------------------------------------------------------------
// Delivery status -- an append-only trail, same pattern as
// checkout_order_status_history: the LATEST row for an order IS its
// current delivery status. Deliberately NOT a strict state machine like
// assertOrderTransitionAllowed above -- Part VI explicitly gives staff
// latitude to "correct/handle exceptions", so any of DELIVERY_STATUSES
// is accepted from a staff action, not just the "next" one in sequence.
// ---------------------------------------------------------------------
export const DELIVERY_STATUSES = [
  "awaiting_document_completion",
  "ready_for_dispatch",
  "delivery_quotation_issued",
  "awaiting_delivery_payment",
  "delivery_payment_verification",
  "ready_for_shipment",
  "dispatched",
  "delivered",
  "delivery_exception",
];

export async function recordDeliveryStatus(db, { orderId, status, note = null, courier = null, trackingNumber = null, staffEmail = null }) {
  await db
    .prepare(
      `INSERT INTO checkout_delivery_status_history (id, order_id, status, note, courier, tracking_number, changed_by_staff_email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(newId(), orderId, status, note, courier, trackingNumber, staffEmail)
    .run();
}

export async function getCurrentDeliveryStatus(db, orderId) {
  return db.prepare("SELECT * FROM checkout_delivery_status_history WHERE order_id = ? ORDER BY changed_at DESC, id DESC LIMIT 1").bind(orderId).first();
}

export async function getDeliveryStatusHistory(db, orderId) {
  const { results } = await db.prepare("SELECT * FROM checkout_delivery_status_history WHERE order_id = ? ORDER BY changed_at ASC").bind(orderId).all();
  return results;
}

export async function getDeliveryQuotations(db, orderId) {
  const { results } = await db.prepare("SELECT * FROM checkout_delivery_quotations WHERE order_id = ? ORDER BY created_at DESC").bind(orderId).all();
  return results;
}

async function insertUniqueReference(db, table) {
  // Thin re-export point so this file has one obvious place that
  // generates application references, without a circular import back
  // through routes/staff.js -- the actual implementation is lib/db.js's,
  // reused verbatim.
  const { insertUniqueReference: impl } = await import("./db.js");
  return impl(db, table);
}

// ---------------------------------------------------------------------
// Pricing snapshot -- the one function that may ever write
// checkout_orders.price_snapshot_json, and it refuses to overwrite an
// existing snapshot (immutable once set, per the explicit "store an
// immutable price snapshot... so subsequent catalogue changes do not
// alter historical charges" requirement).
// ---------------------------------------------------------------------
export async function computeAndSnapshotPrice(db, order) {
  if (order.price_snapshot_json) {
    return JSON.parse(order.price_snapshot_json);
  }
  const service = await getServiceById(db, order.service_id);
  if (!service) throw new HttpError(409, "This service is no longer available.");

  let snapshot;
  if (usesProcessingTiers(service.offering_type)) {
    // The browser's own claim about which tier it wants is never trusted
    // for price -- the order's SERVER-RECORDED processing_tier (set only
    // via handleSetProcessingTier, itself re-validated against the
    // CURRENT catalogue state) is re-checked again here, at the one
    // moment a price actually gets frozen, so a tier disabled or
    // unpriced between selection and confirm-and-pay can never slip
    // through.
    const tier = order.processing_tier;
    if (!tier || !PROCESSING_TIERS.includes(tier)) {
      throw new HttpError(409, "Please select a processing option (Express or Regular) before proceeding to payment.");
    }
    if (!tierIsSelectable(service, tier)) {
      throw new HttpError(409, "The selected processing option is no longer available. Please choose another and try again.");
    }
    const c = tierColumns(tier);
    const i18nEn = await getServiceI18n(db, service.id, "en");
    snapshot = {
      serviceId: service.id,
      serviceSlug: service.service_slug,
      serviceTitle: i18nEn ? i18nEn.title : service.service_slug,
      processingTier: tier,
      tierLabel: TIER_LABELS[tier],
      minBusinessDays: service[c.min],
      maxBusinessDays: service[c.max],
      totalPhpCentavos: service[c.price],
      currency: "PHP",
      snapshotAt: new Date().toISOString(),
    };
  } else {
    const components = await getPriceComponents(db, order.service_id);
    snapshot = {
      serviceId: service.id,
      serviceSlug: service.service_slug,
      components: components.map((c) => ({ type: c.component_type, label: c.label, amountPhpCentavos: c.amount_php_centavos })),
      totalPhpCentavos: sumCentavos(components),
      currency: "PHP",
      snapshotAt: new Date().toISOString(),
    };
  }

  // Delivery destination, captured into the snapshot at the moment the
  // price itself is frozen -- domestic regular delivery is always free
  // for either tier; an international destination instead records that a
  // separate shipping quotation is required (worker/src/lib/checkout.js
  // getDeliveryQuotations / checkout_delivery_quotations, unchanged --
  // the quotation amount is never folded into this service-fee snapshot,
  // so a customer can never be charged an undisclosed delivery amount as
  // though it were included in the total above).
  if (service.supports_delivery) {
    const address = await db
      .prepare("SELECT country, is_international FROM checkout_delivery_addresses WHERE order_id = ?")
      .bind(order.id)
      .first();
    if (address) {
      snapshot.delivery = {
        country: address.country,
        isInternational: !!address.is_international,
        domesticFree: !address.is_international,
        internationalQuotationRequired: !!address.is_international,
      };
    }
  }

  await db
    .prepare("UPDATE checkout_orders SET price_snapshot_json = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(snapshot), order.id)
    .run();
  return snapshot;
}
