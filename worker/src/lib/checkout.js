// Instant Services: catalogue reads, order lifecycle, and server-
// authoritative pricing. No browser-submitted amount is ever trusted --
// every price shown to a customer is recomputed here, from
// checkout_price_components, at both catalogue-read time and (again,
// independently) at review-confirm time, when it is snapshotted
// immutably onto the order.
import { newId, generateReference } from "./crypto.js";
import { HttpError } from "./storage.js";
import { sumCentavos } from "./money.js";

export const ORDER_STATUSES = ["draft", "awaiting_payment", "awaiting_verification", "paid", "cancelled", "expired"];

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

export async function getServiceI18n(db, serviceId, lang) {
  const row = await db
    .prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = ?")
    .bind(serviceId, lang)
    .first();
  if (row) return row;
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

async function shapeServiceForCustomer(db, service, lang) {
  const i18n = await getServiceI18n(db, service.id, lang);
  const components = await getPriceComponents(db, service.id);
  return {
    id: service.id,
    serviceSlug: service.service_slug,
    biFormId: service.bi_form_id,
    supportsDelivery: !!service.supports_delivery,
    title: i18n ? i18n.title : service.id,
    shortDescription: i18n ? i18n.short_description : "",
    eligibilityText: i18n ? i18n.eligibility_text : "",
    noticesText: i18n ? i18n.notices_text : null,
    priceComponents: components.map((c) => ({ type: c.component_type, label: c.label, amountPhpCentavos: c.amount_php_centavos })),
    totalPhpCentavos: sumCentavos(components),
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
  if (order.application_id && order.bi_form_submission_id) {
    return { applicationId: order.application_id, submissionId: order.bi_form_submission_id };
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

// ---------------------------------------------------------------------
// Catalogue management (staff-only writes) -- the Staff Portal's
// catalogue section (routes/staffCheckout.js) is the only caller. A new
// service is created inactive by the table's own DEFAULT (see the
// migration) -- never silently live the moment it's created, same
// fail-closed posture QR Ph's settings log uses.
// ---------------------------------------------------------------------
export async function createService(db, { serviceSlug, biFormId, supportsDelivery, displayOrder }) {
  const id = newId();
  await db
    .prepare("INSERT INTO checkout_services (id, service_slug, bi_form_id, supports_delivery, display_order) VALUES (?, ?, ?, ?, ?)")
    .bind(id, serviceSlug, biFormId, supportsDelivery ? 1 : 0, displayOrder || 0)
    .run();
  return getServiceById(db, id);
}

export async function updateServiceMeta(db, serviceId, { serviceSlug, biFormId, supportsDelivery, displayOrder }) {
  await db
    .prepare("UPDATE checkout_services SET service_slug = ?, bi_form_id = ?, supports_delivery = ?, display_order = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(serviceSlug, biFormId, supportsDelivery ? 1 : 0, displayOrder || 0, serviceId)
    .run();
  return getServiceById(db, serviceId);
}

export async function setServiceActive(db, serviceId, active) {
  await db.prepare("UPDATE checkout_services SET active = ?, updated_at = datetime('now') WHERE id = ?").bind(active ? 1 : 0, serviceId).run();
  return getServiceById(db, serviceId);
}

export async function upsertServiceI18n(db, serviceId, lang, { title, shortDescription, eligibilityText, noticesText }) {
  await db
    .prepare(
      `INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, notices_text)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(service_id, lang) DO UPDATE SET
         title = excluded.title, short_description = excluded.short_description,
         eligibility_text = excluded.eligibility_text, notices_text = excluded.notices_text`
    )
    .bind(serviceId, lang, title, shortDescription, eligibilityText, noticesText || null)
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
  const components = await getPriceComponents(db, order.service_id);
  const snapshot = {
    serviceId: service.id,
    serviceSlug: service.service_slug,
    components: components.map((c) => ({ type: c.component_type, label: c.label, amountPhpCentavos: c.amount_php_centavos })),
    totalPhpCentavos: sumCentavos(components),
    snapshotAt: new Date().toISOString(),
  };
  await db
    .prepare("UPDATE checkout_orders SET price_snapshot_json = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(snapshot), order.id)
    .run();
  return snapshot;
}
