// D1 access + lifecycle-transition rules for bi_form_submissions, per
// bi-forms-library/BI_FORM_LIFECYCLE.md. The transition table lives in
// exactly one place (ALLOWED_TRANSITIONS below) so every route that
// changes a submission's status goes through the same rules.
import { newId } from "./crypto.js";
import { HttpError } from "./storage.js";

export const STATUSES = ["draft", "submitted", "under_review", "revision_requested", "approved", "published", "cancelled"];

// from -> [allowed next statuses]. See BI_FORM_LIFECYCLE.md "Transitions"
// for the full rationale of each entry.
const ALLOWED_TRANSITIONS = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "cancelled"],
  under_review: ["revision_requested", "approved", "cancelled"],
  revision_requested: ["submitted", "cancelled"],
  approved: ["published", "revision_requested"],
  published: ["revision_requested"],
  cancelled: [],
};

export function assertTransitionAllowed(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new HttpError(409, `Cannot move a BI-form submission from "${fromStatus}" to "${toStatus}".`);
  }
}

// `intakePath` defaults to the column's own DB default ('staff_assigned')
// when omitted, so every existing caller (staff assigning a form) is
// unaffected -- Instant Services is the one caller that passes
// 'instant_checkout' explicitly, with assignedByStaffEmail left null.
export async function createSubmission(db, { applicationId, clientId, biFormId, assignedByStaffEmail, intakePath }) {
  const id = newId();
  if (intakePath) {
    await db
      .prepare(
        `INSERT INTO bi_form_submissions (id, application_id, client_id, bi_form_id, assigned_by_staff_email, intake_path)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, applicationId, clientId, biFormId, assignedByStaffEmail, intakePath)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO bi_form_submissions (id, application_id, client_id, bi_form_id, assigned_by_staff_email)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, applicationId, clientId, biFormId, assignedByStaffEmail)
      .run();
  }
  await recordHistory(db, { submissionId: id, status: "draft", changedByStaffEmail: assignedByStaffEmail });
  return getSubmissionById(db, id);
}

export async function getSubmissionById(db, id) {
  return db.prepare("SELECT * FROM bi_form_submissions WHERE id = ?").bind(id).first();
}

// Mirrors requireOwnedApplication in routes/applications.js: resolves a
// submission AND proves the current session's client owns it, in one
// query -- a submission ID from the URL is never trusted alone.
export async function requireOwnedSubmission(db, client, submissionId) {
  const submission = await db
    .prepare("SELECT * FROM bi_form_submissions WHERE id = ? AND client_id = ?")
    .bind(submissionId, client.id)
    .first();
  if (!submission) throw new HttpError(404, "Not found");
  return submission;
}

export async function listSubmissionsForClient(db, clientId) {
  const { results } = await db
    .prepare("SELECT * FROM bi_form_submissions WHERE client_id = ? ORDER BY created_at DESC")
    .bind(clientId)
    .all();
  return results;
}

export async function listSubmissionsForStaff(db, { status } = {}) {
  const query = status
    ? db.prepare("SELECT * FROM bi_form_submissions WHERE status = ? ORDER BY updated_at DESC").bind(status)
    : db.prepare("SELECT * FROM bi_form_submissions ORDER BY updated_at DESC LIMIT 200");
  const { results } = await query.all();
  return results;
}

export async function recordHistory(db, { submissionId, status, note = null, changedByStaffEmail = null, changedByClientId = null }) {
  await db
    .prepare(
      `INSERT INTO bi_form_status_history (id, bi_form_submission_id, status, note, changed_by_staff_email, changed_by_client_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(newId(), submissionId, status, note, changedByStaffEmail, changedByClientId)
    .run();
}

export async function getHistory(db, submissionId) {
  const { results } = await db
    .prepare("SELECT * FROM bi_form_status_history WHERE bi_form_submission_id = ? ORDER BY changed_at ASC")
    .bind(submissionId)
    .all();
  return results;
}

// Transitions a submission's status, recording history and the relevant
// timestamp/actor columns in one place -- every route that changes status
// calls this, rather than hand-rolling its own UPDATE.
export async function transitionStatus(db, submission, toStatus, { note, staffEmail, clientId } = {}) {
  assertTransitionAllowed(submission.status, toStatus);

  const columnsByStatus = {
    submitted: "submitted_at = datetime('now')",
    under_review: "review_started_at = datetime('now')",
    approved: "approved_at = datetime('now'), approved_by_staff_email = ?",
    published: "published_at = datetime('now'), published_by_staff_email = ?",
    cancelled: "cancelled_at = datetime('now')",
  };
  const extraSql = columnsByStatus[toStatus] || null;
  const binds = [toStatus];
  let sql = "UPDATE bi_form_submissions SET status = ?, updated_at = datetime('now')";
  if (extraSql) {
    sql += `, ${extraSql}`;
    if (toStatus === "approved" || toStatus === "published") binds.push(staffEmail || null);
  }
  sql += " WHERE id = ?";
  binds.push(submission.id);

  await db.prepare(sql).bind(...binds).run();
  await recordHistory(db, { submissionId: submission.id, status: toStatus, note: note || null, changedByStaffEmail: staffEmail || null, changedByClientId: clientId || null });
  return getSubmissionById(db, submission.id);
}

export async function updateCustomerAnswers(db, submissionId, answersJson) {
  await db.prepare("UPDATE bi_form_submissions SET customer_answers_json = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(answersJson, submissionId)
    .run();
}

export async function updateStaffAnswers(db, submissionId, answersJson) {
  await db.prepare("UPDATE bi_form_submissions SET staff_answers_json = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(answersJson, submissionId)
    .run();
}

// Service-based naming (not the raw technical form ID) as the authoritative
// customer/staff-facing heading. Prefers the catalogue service's own
// i18n title when this submission is linked to an Instant Services order
// (checkout_orders.bi_form_submission_id) -- the SAME title already shown
// on the catalogue card/service page/checkout for that order, so there is
// exactly one authoritative name, not a second one invented here. Falls
// back to the official form's own title (coordinate-map.json's formTitle,
// English only -- it has no translation workflow) for a submission with
// no linked order (e.g. a BI form a staff member assigned directly on an
// application, outside Instant Services). `technicalReference` is always
// the raw biFormId, preserved as the secondary reference the directive
// requires, never as the primary heading.
export async function getFriendlyFormInfo(db, biFormId, submissionId, lang = "en") {
  const link = await db
    .prepare("SELECT service_id FROM checkout_orders WHERE bi_form_submission_id = ? LIMIT 1")
    .bind(submissionId)
    .first();
  if (link) {
    const { getServiceI18n } = await import("./checkout.js");
    const i18n = await getServiceI18n(db, link.service_id, lang);
    if (i18n && i18n.title) {
      return { title: i18n.title, technicalReference: biFormId };
    }
  }
  try {
    const { getFormConfig } = await import("./biFormEngine.js");
    const { coordinateMap } = getFormConfig(biFormId);
    return { title: coordinateMap.formTitle || biFormId, technicalReference: biFormId };
  } catch {
    return { title: biFormId, technicalReference: biFormId };
  }
}
