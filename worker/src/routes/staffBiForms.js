import { staffPage, escapeHtml } from "../lib/staffHtml.js";
import { HttpError } from "../lib/storage.js";
import { newId } from "../lib/crypto.js";
import {
  getFormConfig,
  KNOWN_BI_FORM_IDS,
  getDocumentBuilders,
  originalTemplateKey,
  staffOwnedFields,
  getRequiredStaffFields,
} from "../lib/biFormEngine.js";
import { composeAndFinalizeCustomerPreview } from "../lib/biFormRaster.js";
import {
  createSubmission,
  getSubmissionById,
  listSubmissionsForStaff,
  transitionStatus,
  updateStaffAnswers,
  getHistory,
} from "../lib/biForms.js";

function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function listBiForms(env, staff, url) {
  const status = url.searchParams.get("status") || undefined;
  const submissions = await listSubmissionsForStaff(env.DB, { status });
  const rows = submissions
    .map(
      (s) => `<tr>
        <td><a class="ref" href="/staff/bi-forms/${s.id}">${escapeHtml(s.bi_form_id)}</a></td>
        <td><span class="status">${escapeHtml(s.status)}</span></td>
        <td class="muted">${escapeHtml(s.application_id || "(none)")}</td>
        <td class="muted">${escapeHtml(s.updated_at)}</td>
      </tr>`
    )
    .join("");
  return staffPage(
    "BI Forms",
    `<h1>BI Forms</h1>
     <div class="filter-bar">
       <a href="/staff/bi-forms/">All</a> |
       ${["draft", "submitted", "under_review", "revision_requested", "approved", "published", "cancelled"]
         .map((s) => `<a href="/staff/bi-forms/?status=${s}"${status === s ? ' class="filter-active"' : ""}>${s}</a>`)
         .join(" ")}
     </div>
     <table>
       <tr><th>BI Form</th><th>Status</th><th>Application</th><th>Updated</th></tr>
       ${rows || '<tr><td colspan="4" class="muted">No BI-form submissions yet.</td></tr>'}
     </table>`,
    staff.email
  );
}

// Added to the existing application detail page (staff.js viewApplication)
// so assigning a form is reachable from the same place staff already
// manage everything else about an application -- not a separate,
// disconnected flow.
export async function renderBiFormsCard(env, applicationId) {
  const { results: submissions } = await env.DB.prepare(
    "SELECT * FROM bi_form_submissions WHERE application_id = ? ORDER BY created_at DESC"
  )
    .bind(applicationId)
    .all();
  const rows = submissions
    .map((s) => `<tr><td><a class="ref" href="/staff/bi-forms/${s.id}">${escapeHtml(s.bi_form_id)}</a></td><td><span class="status">${escapeHtml(s.status)}</span></td></tr>`)
    .join("");
  const formOptions = KNOWN_BI_FORM_IDS.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join("");
  return `<div class="card">
    <h2>BI Forms</h2>
    <table>
      <tr><th>Form</th><th>Status</th></tr>
      ${rows || '<tr><td colspan="2" class="muted">No BI form assigned yet.</td></tr>'}
    </table>
    <form method="POST" action="/staff/applications/${applicationId}/bi-forms/assign">
      <label for="biFormId">Assign a BI form</label>
      <select name="biFormId" id="biFormId">${formOptions}</select>
      <button type="submit">Assign</button>
    </form>
  </div>`;
}

export async function assignBiForm(request, env, staff, applicationId) {
  const application = await env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(applicationId).first();
  if (!application) return notFound();
  const form = await request.formData();
  const biFormId = String(form.get("biFormId") || "");
  if (!KNOWN_BI_FORM_IDS.includes(biFormId)) throw new HttpError(400, "Unknown BI form id");

  const submission = await createSubmission(env.DB, {
    applicationId,
    clientId: application.client_id,
    biFormId,
    assignedByStaffEmail: staff.email,
  });
  return Response.redirect(`${new URL(request.url).origin}/staff/bi-forms/${submission.id}`, 303);
}

async function requireSubmission(env, submissionId) {
  const submission = await getSubmissionById(env.DB, submissionId);
  if (!submission) throw new HttpError(404, "Not found");
  return submission;
}

function renderAnswers(questionnaire, answersJson) {
  const answers = answersJson ? JSON.parse(answersJson) : {};
  function renderQuestion(q) {
    if (q.type === "repeatable-group") {
      const items = Array.isArray(answers[q.groupDataKey]) ? answers[q.groupDataKey] : [];
      return `<p><strong>${escapeHtml(q.labels.en)}</strong></p>` + items.map((item, i) =>
        `<p class="muted">Entry ${i + 1}: ${(q.subQuestions || []).map((sub) => `${escapeHtml(sub.labels.en)}: ${escapeHtml(item[sub.dataKey] || "")}`).join(", ")}</p>`
      ).join("");
    }
    const v = answers[q.dataKey];
    return `<p><strong>${escapeHtml(q.labels.en)}:</strong> ${escapeHtml(typeof v === "boolean" ? (v ? "Yes" : "No") : v ?? "")}</p>`;
  }
  return questionnaire.questions.map(renderQuestion).join("");
}

export async function viewBiForm(env, staff, submissionId) {
  const submission = await requireSubmission(env, submissionId);
  const { coordinateMap, questionnaire } = getFormConfig(submission.bi_form_id);
  const client = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(submission.client_id).first();
  const history = await getHistory(env.DB, submissionId);
  const { results: documents } = await env.DB.prepare(
    "SELECT * FROM documents WHERE bi_form_submission_id = ? ORDER BY created_at DESC"
  )
    .bind(submissionId)
    .all();

  const staffFields = staffOwnedFields(coordinateMap);
  const staffAnswers = submission.staff_answers_json ? JSON.parse(submission.staff_answers_json) : {};
  const staffFieldsFormHtml = staffFields
    .map((f) => `<label for="sf-${escapeHtml(f.key)}">${escapeHtml(f.label)}</label><input type="text" name="${escapeHtml(f.key)}" id="sf-${escapeHtml(f.key)}" value="${escapeHtml(staffAnswers[f.key] || "")}">`)
    .join("");

  const historyHtml = history
    .map((h) => `<p class="muted">${escapeHtml(h.changed_at)} — <span class="status">${escapeHtml(h.status)}</span>${h.note ? `: ${escapeHtml(h.note)}` : ""}</p>`)
    .join("");

  const documentsHtml = documents
    .map((d) => `<p><a href="/staff/bi-forms/${submissionId}/documents/${d.id}/download">${escapeHtml(d.kind)}</a> <span class="muted">(${escapeHtml(d.created_at)})</span></p>`)
    .join("") || '<p class="muted">No documents generated yet.</p>';

  const actions = [];
  if (submission.status === "submitted") {
    actions.push(`<form method="POST" action="/staff/bi-forms/${submissionId}/start-review"><button type="submit">Start review</button></form>`);
  }
  if (["under_review", "revision_requested"].includes(submission.status)) {
    actions.push(`<form method="POST" action="/staff/bi-forms/${submissionId}/staff-fields">${staffFieldsFormHtml}<button type="submit">Save staff fields</button></form>`);
  }
  if (["submitted", "under_review", "approved", "published"].includes(submission.status)) {
    actions.push(`<form method="POST" action="/staff/bi-forms/${submissionId}/request-revision"><label for="note">Note to client</label><textarea name="note" id="note" required></textarea><button class="secondary" type="submit">Request revision</button></form>`);
  }
  if (["under_review", "approved"].includes(submission.status)) {
    actions.push(`<form method="POST" action="/staff/bi-forms/${submissionId}/approve"><button type="submit">${submission.status === "approved" ? "Regenerate documents" : "Approve and generate documents"}</button></form>`);
  }
  if (submission.status === "approved") {
    actions.push(`<form method="POST" action="/staff/bi-forms/${submissionId}/publish"><button type="submit">Publish to client</button></form>`);
  }
  if (["draft", "submitted", "under_review", "revision_requested"].includes(submission.status)) {
    actions.push(`<form method="POST" action="/staff/bi-forms/${submissionId}/cancel"><button class="danger" type="submit">Cancel</button></form>`);
  }

  return staffPage(
    `BI Form ${submission.bi_form_id}`,
    `<h1>${escapeHtml(submission.bi_form_id)}</h1>
     <div class="card">
       <p><strong>${escapeHtml(client ? client.full_name : "")}</strong> &lt;${escapeHtml(client ? client.email : "")}&gt;</p>
       <p><strong>Status:</strong> <span class="status">${escapeHtml(submission.status)}</span></p>
     </div>
     <div class="card"><h2>Customer answers</h2>${renderAnswers(questionnaire, submission.customer_answers_json)}</div>
     <div class="card"><h2>Staff-controlled fields</h2>${staffFieldsFormHtml ? "" : '<p class="muted">This form has no staff-controlled fields.</p>'}</div>
     <div class="card"><h2>Actions</h2>${actions.join("") || '<p class="muted">No actions available in this status.</p>'}</div>
     <div class="card"><h2>Documents</h2>${documentsHtml}</div>
     <div class="card"><h2>History</h2>${historyHtml}</div>`,
    staff.email
  );
}

function redirectToSubmission(request, submissionId) {
  return Response.redirect(`${new URL(request.url).origin}/staff/bi-forms/${submissionId}`, 303);
}

export async function startReview(request, env, staff, submissionId) {
  const submission = await requireSubmission(env, submissionId);
  await transitionStatus(env.DB, submission, "under_review", { staffEmail: staff.email });
  return redirectToSubmission(request, submissionId);
}

export async function saveStaffFields(request, env, staff, submissionId) {
  const submission = await requireSubmission(env, submissionId);
  if (!["under_review", "revision_requested", "approved"].includes(submission.status)) {
    throw new HttpError(409, `Staff fields cannot be edited in status "${submission.status}".`);
  }
  const { coordinateMap } = getFormConfig(submission.bi_form_id);
  const allowedKeys = new Set(staffOwnedFields(coordinateMap).map((f) => f.key));
  const form = await request.formData();
  const existing = submission.staff_answers_json ? JSON.parse(submission.staff_answers_json) : {};
  for (const key of allowedKeys) {
    if (form.has(key)) existing[key] = String(form.get(key) || "");
  }
  await updateStaffAnswers(env.DB, submissionId, JSON.stringify(existing));
  return redirectToSubmission(request, submissionId);
}

export async function requestRevision(request, env, staff, submissionId) {
  const submission = await requireSubmission(env, submissionId);
  const form = await request.formData();
  const note = String(form.get("note") || "").trim();
  if (!note) throw new HttpError(400, "A note is required when requesting a revision");
  await transitionStatus(env.DB, submission, "revision_requested", { staffEmail: staff.email, note });
  return redirectToSubmission(request, submissionId);
}

export async function cancelBiForm(request, env, staff, submissionId) {
  const submission = await requireSubmission(env, submissionId);
  await transitionStatus(env.DB, submission, "cancelled", { staffEmail: staff.email });
  return redirectToSubmission(request, submissionId);
}

export async function approveBiForm(request, env, staff, submissionId) {
  const submission = await requireSubmission(env, submissionId);
  if (!["under_review", "approved"].includes(submission.status)) {
    throw new HttpError(409, `Cannot approve/regenerate from status "${submission.status}".`);
  }

  const { coordinateMap, questionnaire } = getFormConfig(submission.bi_form_id);

  // Checked before validating staff-field completeness: there is no point
  // asking staff to finish filling in a form generation cannot proceed
  // with anyway. Reads the EXISTING private fis-bi-forms-library bucket
  // (binding BI_FORMS_LIBRARY, see wrangler.toml) at its already-approved
  // object key -- see bi-forms-library/inventory/
  // forms-library-inventory.json, which documents "originals/<formId>.pdf"
  // for every one of the 20 inventoried forms, these three included.
  // Nothing is re-created or re-uploaded here; this only reads what
  // already exists out of band.
  const originalKey = originalTemplateKey(submission.bi_form_id);
  const originalObject = await env.BI_FORMS_LIBRARY.get(originalKey);
  if (!originalObject) {
    throw new HttpError(501, `Original BI template for "${submission.bi_form_id}" was not found at ${originalKey} in the fis-bi-forms-library bucket (BI_FORMS_LIBRARY binding). Confirm the binding is configured and the object exists at the approved key.`);
  }

  const staffFields = staffOwnedFields(coordinateMap);
  const staffAnswers = submission.staff_answers_json ? JSON.parse(submission.staff_answers_json) : {};
  const customerAnswers = submission.customer_answers_json ? JSON.parse(submission.customer_answers_json) : {};
  // Only fields the form's own rules currently require are checked -- a
  // field marked `required: false`, or one gated by `requiredIf` on a
  // customer answer that doesn't currently apply (e.g. court/legal fields
  // when the customer said this isn't for a court purpose), does not
  // block approval. See questionnaire.json's staffFieldRequirements and
  // engine/lib/questionnaire-answers.js getRequiredStaffFields().
  const requiredStaffFields = getRequiredStaffFields(staffFields, questionnaire, customerAnswers);
  const missing = requiredStaffFields.filter((f) => !staffAnswers[f.key] || String(staffAnswers[f.key]).trim() === "");
  if (missing.length > 0) {
    throw new HttpError(422, `Missing required staff field(s): ${missing.map((f) => f.label).join(", ")}`);
  }
  const originalBytes = new Uint8Array(await originalObject.arrayBuffer());

  const data = { ...customerAnswers, ...staffAnswers };
  const bindings = questionnaire.fieldBindings || {};

  const { buildStaffDocument, buildCustomerFieldsDocument } = await getDocumentBuilders();
  const staffDoc = await buildStaffDocument(originalBytes, coordinateMap, bindings, data);

  const staffKey = `clients/${submission.client_id}/bi-forms/${submissionId}/${newId()}-staff.pdf`;
  await env.CLIENT_FILES.put(staffKey, staffDoc.bytes, { httpMetadata: { contentType: "application/pdf" } });
  await env.DB.prepare(
    `INSERT INTO documents (id, application_id, client_id, bi_form_submission_id, r2_key, original_filename, content_type, size_bytes, uploaded_by, kind)
     VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', ?, 'staff', 'staff_pdf')`
  )
    .bind(newId(), submission.application_id, submission.client_id, submissionId, staffKey, `${submission.bi_form_id}-staff.pdf`, staffDoc.bytes.byteLength)
    .run();

  // The customer preview needs the raster/compose/finalize step, which has
  // no Workers-compatible backend yet (Stage 4, not decided). The staff
  // PDF above is already stored and usable; this throws a clear, specific
  // error rather than silently completing an incomplete approval.
  const customerFieldsDoc = await buildCustomerFieldsDocument(originalBytes, coordinateMap, bindings, data);
  const previewBytes = await composeAndFinalizeCustomerPreview(customerFieldsDoc.bytes, coordinateMap, questionnaire);

  const previewKey = `clients/${submission.client_id}/bi-forms/${submissionId}/${newId()}-customer-preview.pdf`;
  await env.CLIENT_FILES.put(previewKey, previewBytes, { httpMetadata: { contentType: "application/pdf" } });
  await env.DB.prepare(
    `INSERT INTO documents (id, application_id, client_id, bi_form_submission_id, r2_key, original_filename, content_type, size_bytes, uploaded_by, kind)
     VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', ?, 'staff', 'customer_preview')`
  )
    .bind(newId(), submission.application_id, submission.client_id, submissionId, previewKey, `${submission.bi_form_id}-customer-preview.pdf`, previewBytes.byteLength)
    .run();

  if (submission.status === "under_review") {
    await transitionStatus(env.DB, submission, "approved", { staffEmail: staff.email });
  } else {
    const { recordHistory } = await import("../lib/biForms.js");
    await recordHistory(env.DB, { submissionId, status: "approved", note: "Documents regenerated", changedByStaffEmail: staff.email });
  }
  return redirectToSubmission(request, submissionId);
}

export async function publishBiForm(request, env, staff, submissionId) {
  const submission = await requireSubmission(env, submissionId);
  await transitionStatus(env.DB, submission, "published", { staffEmail: staff.email });
  return redirectToSubmission(request, submissionId);
}

export async function downloadBiFormDocument(env, staff, submissionId, documentId) {
  const submission = await requireSubmission(env, submissionId);
  const doc = await env.DB.prepare("SELECT * FROM documents WHERE id = ? AND bi_form_submission_id = ?").bind(documentId, submissionId).first();
  if (!doc) return notFound();
  const { streamObject } = await import("../lib/storage.js");
  const response = await streamObject(env.CLIENT_FILES, doc.r2_key, doc.original_filename, doc.content_type);
  if (!response) return notFound();
  return response;
}
