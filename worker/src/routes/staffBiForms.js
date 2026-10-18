import { staffPage, escapeHtml } from "../lib/staffHtml.js";
import { HttpError } from "../lib/storage.js";
import { newId } from "../lib/crypto.js";
import { logAudit } from "../lib/db.js";
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
  updateCustomerAnswers,
  getHistory,
  getFriendlyFormInfo,
} from "../lib/biForms.js";

function notFound() {
  return new Response("Not found", { status: 404 });
}

// Directive section 9: "exception-based operations -- where all required
// info is present/verified, prepare the document automatically for
// review/approval; where missing, flag only the relevant exceptions."
// Computed with the SAME logic approveBiForm itself uses (requiredStaff
// Fields minus what staff already supplied, plus any customer-marked
// "I'm not sure" field) -- not a second, possibly-drifting notion of
// "exception". Returns null for a submission not yet under review (the
// concept doesn't apply until staff review has actually started), so the
// list can distinguish "not applicable yet" from "reviewed, zero
// exceptions, ready to finalize".
function exceptionCountFor(submission) {
  if (submission.status !== "under_review") return null;
  const { coordinateMap, questionnaire } = getFormConfig(submission.bi_form_id);
  const customerAnswers = submission.customer_answers_json ? JSON.parse(submission.customer_answers_json) : {};
  const staffAnswers = submission.staff_answers_json ? JSON.parse(submission.staff_answers_json) : {};
  const staffFields = staffOwnedFields(coordinateMap);
  const requiredStaffFields = getRequiredStaffFields(staffFields, questionnaire, customerAnswers);
  const missingStaffFields = requiredStaffFields.filter((f) => !staffAnswers[f.key] || String(staffAnswers[f.key]).trim() === "");
  return unsureFieldSet(customerAnswers).size + missingStaffFields.length;
}

function exceptionBadgeHtml(count) {
  if (count === null) return '<span class="muted">—</span>';
  if (count === 0) return '<span class="priority-badge priority-badge--standard">✓ Ready to finalize</span>';
  return `<span class="priority-badge priority-badge--urgent">⚠ ${count} exception${count === 1 ? "" : "s"}</span>`;
}

export async function listBiForms(env, staff, url) {
  const status = url.searchParams.get("status") || undefined;
  const onlyExceptions = url.searchParams.get("onlyExceptions") === "1";
  let submissions = await listSubmissionsForStaff(env.DB, { status });
  let decorated = submissions.map((s) => ({ s, exceptionCount: exceptionCountFor(s) }));
  if (onlyExceptions) decorated = decorated.filter((d) => d.exceptionCount !== null && d.exceptionCount > 0);

  // Directive section 3: the Staff Portal must show the friendly,
  // customer-facing service name prominently, with the official BI form
  // ID as a secondary reference -- not the raw ID alone, which is what
  // this list showed before. One lookup per row (this list is a solo
  // owner's own exception dashboard, never a high-volume table).
  const rows = (
    await Promise.all(
      decorated.map(async ({ s, exceptionCount }) => {
        const friendly = await getFriendlyFormInfo(env.DB, s.bi_form_id, s.id, "en");
        return `<tr>
        <td><a class="ref" href="/staff/bi-forms/${s.id}">${escapeHtml(friendly.title)}</a><br><span class="muted">${escapeHtml(s.bi_form_id)}</span></td>
        <td><span class="status">${escapeHtml(s.status)}</span></td>
        <td>${exceptionBadgeHtml(exceptionCount)}</td>
        <td class="muted">${escapeHtml(s.application_id || "(none)")}</td>
        <td class="muted">${escapeHtml(s.updated_at)}</td>
      </tr>`;
      })
    )
  ).join("");
  return staffPage(
    "BI Forms",
    `<h1>BI Forms</h1>
     <div class="filter-bar">
       <a href="/staff/bi-forms/">All</a> |
       ${["draft", "submitted", "under_review", "revision_requested", "approved", "published", "cancelled"]
         .map((s) => `<a href="/staff/bi-forms/?status=${s}"${status === s && !onlyExceptions ? ' class="filter-active"' : ""}>${s}</a>`)
         .join(" ")}
       | <a href="/staff/bi-forms/?status=under_review&onlyExceptions=1"${onlyExceptions ? ' class="filter-active"' : ""}>⚠ Needs attention</a>
     </div>
     <table>
       <tr><th>BI Form</th><th>Status</th><th>Exceptions</th><th>Application</th><th>Updated</th></tr>
       ${rows || '<tr><td colspan="5" class="muted">No BI-form submissions yet.</td></tr>'}
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
  const rows = (
    await Promise.all(
      submissions.map(async (s) => {
        const friendly = await getFriendlyFormInfo(env.DB, s.bi_form_id, s.id, "en");
        return `<tr><td><a class="ref" href="/staff/bi-forms/${s.id}">${escapeHtml(friendly.title)}</a><br><span class="muted">${escapeHtml(s.bi_form_id)}</span></td><td><span class="status">${escapeHtml(s.status)}</span></td></tr>`;
      })
    )
  ).join("");
  // "FIS -- Final Automation Integration" directive item 2: rather than
  // creating a second, CGAF-002-Rev3-specific offering, this EXISTING
  // per-submission assignment choice is the "internal, explicitly
  // selected form-version configuration" the directive asks about --
  // staff already picks exactly which registered form a submission
  // uses, per case, independent of which catalogue service sold it.
  // What was missing was making that an INFORMED choice: the dropdown
  // showed only raw form IDs, which tells a staff member nothing about
  // what they're choosing between. Each option now shows the form's own
  // title; the two forms covering the same work-visa subject matter
  // (BOC04.QF.002 and CGAF-002-Rev3 -- see
  // docs/BI_FORMS_LIBRARY_RECONCILIATION.md section D.1, which both
  // confirmed are genuinely still in independent use at different BI
  // counters and must never be substituted for one another) each carry
  // a short, source-cited disambiguating hint so staff can tell them
  // apart without having to go look up that document first.
  const FORM_OPTION_HINTS = {
    "BOC04.QF.002": " -- standard/more complete version (5 duration options, fuller certification section)",
    "CGAF-002-Rev3": " -- alternate version, independently filed at a different BI counter (NOT a duplicate of BOC04.QF.002 -- confirm which counter applies before assigning)",
  };
  const formOptions = KNOWN_BI_FORM_IDS.map((id) => {
    const title = getFormConfig(id).coordinateMap.formTitle || id;
    const hint = FORM_OPTION_HINTS[id] || "";
    return `<option value="${escapeHtml(id)}">${escapeHtml(title)} (${escapeHtml(id)})${escapeHtml(hint)}</option>`;
  }).join("");
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

// Directive section 7: a field the customer marked "I'm not sure -- let
// FIS help me" is recorded in the SAME customer_answers_json blob as a
// reserved top-level `__unsureFields` array of dataKeys -- no migration,
// no second answers table. Never treated as any substantive answer
// ("No"/"None"/etc.); it's simply absent from validation's required-field
// check (see relaxRequiredForUnsureFields in biFormsCustomer.js) until
// staff supplies it here.
function unsureFieldSet(answers) {
  return new Set(Array.isArray(answers.__unsureFields) ? answers.__unsureFields : []);
}

function renderAnswers(questionnaire, answersJson) {
  const answers = answersJson ? JSON.parse(answersJson) : {};
  const unsure = unsureFieldSet(answers);
  function renderQuestion(q) {
    if (q.type === "repeatable-group") {
      const items = Array.isArray(answers[q.groupDataKey]) ? answers[q.groupDataKey] : [];
      const flagged = unsure.has(q.groupDataKey) ? ' <span class="priority-badge priority-badge--priority">assistance requested</span>' : "";
      return `<p><strong>${escapeHtml(q.labels.en)}</strong>${flagged}</p>` + items.map((item, i) =>
        `<p class="muted">Entry ${i + 1}: ${(q.subQuestions || []).map((sub) => `${escapeHtml(sub.labels.en)}: ${escapeHtml(item[sub.dataKey] || "")}`).join(", ")}</p>`
      ).join("");
    }
    const v = answers[q.dataKey];
    const flagged = unsure.has(q.dataKey) ? ' <span class="priority-badge priority-badge--priority">assistance requested</span>' : "";
    return `<p><strong>${escapeHtml(q.labels.en)}:</strong> ${escapeHtml(typeof v === "boolean" ? (v ? "Yes" : "No") : v ?? "")}${flagged}</p>`;
  }
  return questionnaire.questions.map(renderQuestion).join("");
}

// The customer-field completion/correction form (directive section 9:
// "complete missing fields", "correct errors with an audit record").
// Scoped to text/date/select questions -- the vast majority of a typical
// BI form's customer fields, and every field CCS-A-CDR-2016 has today.
// A yes/no or repeatable-group field is shown read-only above (via
// renderAnswers) but is not yet editable through this form; see the
// final report's "Outstanding Dependencies" for why this is a deliberate
// scope boundary, not an oversight.
function customerScalarQuestions(questionnaire) {
  return (questionnaire.questions || []).filter((q) => q.type === "text" || q.type === "date" || q.type === "select");
}

function customerFieldsFormHtml(questionnaire, answers) {
  const unsure = unsureFieldSet(answers);
  return customerScalarQuestions(questionnaire)
    .map((q) => {
      const flagged = unsure.has(q.dataKey) ? ' <span class="priority-badge priority-badge--priority">assistance requested</span>' : "";
      const current = answers[q.dataKey] || "";
      if (q.type === "select") {
        const options = (q.options || [])
          .map((opt) => `<option value="${escapeHtml(opt)}" ${opt === current ? "selected" : ""}>${escapeHtml(opt)}</option>`)
          .join("");
        return `<label for="cf-${escapeHtml(q.dataKey)}">${escapeHtml(q.labels.en)}${flagged}</label><select name="${escapeHtml(q.dataKey)}" id="cf-${escapeHtml(q.dataKey)}"><option value="">(leave as not yet provided)</option>${options}</select>`;
      }
      return `<label for="cf-${escapeHtml(q.dataKey)}">${escapeHtml(q.labels.en)}${flagged}</label><input type="text" name="${escapeHtml(q.dataKey)}" id="cf-${escapeHtml(q.dataKey)}" value="${escapeHtml(current)}">`;
    })
    .join("");
}

export async function viewBiForm(env, staff, submissionId) {
  const submission = await requireSubmission(env, submissionId);
  const { coordinateMap, questionnaire } = getFormConfig(submission.bi_form_id);
  const friendly = await getFriendlyFormInfo(env.DB, submission.bi_form_id, submission.id, "en");
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

  // Directive section 7/9: a submission with any field marked "I'm not
  // sure" is an assisted-completion request -- surfaced here as a clear,
  // impossible-to-miss badge, and completed through the SAME existing
  // staff workflow (the form below), never a second dashboard.
  const customerAnswers = submission.customer_answers_json ? JSON.parse(submission.customer_answers_json) : {};
  const unsureCount = unsureFieldSet(customerAnswers).size;
  const assistanceBadge = unsureCount
    ? ` <span class="priority-badge priority-badge--urgent">Assistance Requested (${unsureCount} field${unsureCount > 1 ? "s" : ""})</span>`
    : "";
  const customerFieldsEditableNow = ["under_review", "revision_requested"].includes(submission.status);
  const customerFieldsFormHtmlStr = customerFieldsFormHtml(questionnaire, customerAnswers);

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
  if (customerFieldsEditableNow) {
    actions.push(`<form method="POST" action="/staff/bi-forms/${submissionId}/customer-fields">${customerFieldsFormHtmlStr}<button type="submit">Save customer field completions/corrections</button></form>`);
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
    `${friendly.title} (${submission.bi_form_id})`,
    `<h1>${escapeHtml(friendly.title)}</h1>
     <p class="muted">Bureau of Immigration Form No. ${escapeHtml(submission.bi_form_id)}</p>
     <div class="card">
       <p><strong>${escapeHtml(client ? client.full_name : "")}</strong> &lt;${escapeHtml(client ? client.email : "")}&gt;</p>
       <p><strong>Status:</strong> <span class="status">${escapeHtml(submission.status)}</span>${assistanceBadge}</p>
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

// Directive section 9: staff completing a field the customer marked "I'm
// not sure" on, or correcting an error in one they did answer -- distinct
// from saveStaffFields above, which only ever touches STAFF-exclusive
// fields (suppliedBy: "staff"). This writes into customer_answers_json
// itself (never staff_answers_json), so field-bindings.js's existing
// {...customerAnswers, ...staffAnswers} merge at generation time needs no
// change at all to pick up a staff correction. Every change is written to
// the audit log by field name -- "do not silently change customer
// declarations" means never doing this invisibly, not never doing it.
export async function saveCustomerFields(request, env, staff, submissionId) {
  const submission = await requireSubmission(env, submissionId);
  if (!["under_review", "revision_requested", "approved"].includes(submission.status)) {
    throw new HttpError(409, `Customer answers cannot be completed or corrected in status "${submission.status}".`);
  }
  const { questionnaire } = getFormConfig(submission.bi_form_id);
  const allowedKeys = new Set(customerScalarQuestions(questionnaire).map((q) => q.dataKey));
  const form = await request.formData();
  const existing = submission.customer_answers_json ? JSON.parse(submission.customer_answers_json) : {};
  const unsure = unsureFieldSet(existing);
  const changed = [];
  for (const key of allowedKeys) {
    if (!form.has(key)) continue;
    const value = String(form.get(key) || "");
    if (!value) continue; // blank means "staff hasn't supplied this yet either" -- never overwrite a real answer with blank
    if (existing[key] !== value) changed.push(key);
    existing[key] = value;
    unsure.delete(key); // now supplied -- no longer outstanding
  }
  existing.__unsureFields = Array.from(unsure);
  await updateCustomerAnswers(env.DB, submissionId, JSON.stringify(existing));
  if (changed.length) {
    await logAudit(env.DB, {
      actorType: "staff",
      actorIdOrEmail: staff.email,
      action: "completed_or_corrected_bi_form_customer_answers",
      targetTable: "bi_form_submissions",
      targetId: submissionId,
      metadata: JSON.stringify({ fields: changed }),
    });
  }
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

  const { buildStaffDocument } = await getDocumentBuilders();
  const staffDoc = await buildStaffDocument(originalBytes, coordinateMap, bindings, data);

  // "FIS Smart Application System" directive, non-negotiable requirement:
  // "Never silently truncate... customer information. If a field cannot
  // accommodate valid input, provide a clear, recoverable exception for
  // staff resolution rather than generating an apparently complete but
  // inaccurate document." The shared engine (pdf-fields.js's
  // populateCharField) already detects and reports every character-box
  // overflow via staffDoc.overflowReport -- it was simply never checked
  // here, so a too-long value was silently truncated on the real,
  // released document with no signal to staff. fieldsForAudience(...,
  // "staff") (used by buildStaffDocument) returns every drawable field on
  // the form regardless of audience, so this one check covers the
  // customer preview's identical char-box geometry too -- nothing is
  // written to R2/D1, and no customer preview is composed, until every
  // overflow is resolved. Recoverable: staff shortens/corrects the
  // offending answer via the existing "customer field completions/
  // corrections" form below and retries Approve.
  if (staffDoc.overflowReport.length > 0) {
    throw new HttpError(
      422,
      `The following field(s) are too long to fit on the official form and must be corrected before this document can be generated: ${staffDoc.overflowReport
        .map((o) => `"${o.field}" (${o.issue})`)
        .join("; ")}`
    );
  }

  const staffKey = `clients/${submission.client_id}/bi-forms/${submissionId}/${newId()}-staff.pdf`;
  await env.CLIENT_FILES.put(staffKey, staffDoc.bytes, { httpMetadata: { contentType: "application/pdf" } });
  await env.DB.prepare(
    `INSERT INTO documents (id, application_id, client_id, bi_form_submission_id, r2_key, original_filename, content_type, size_bytes, uploaded_by, kind)
     VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', ?, 'staff', 'staff_pdf')`
  )
    .bind(newId(), submission.application_id, submission.client_id, submissionId, staffKey, `${submission.bi_form_id}-staff.pdf`, staffDoc.bytes.byteLength)
    .run();

  // Customer preview: Stage 5.3's resvg-wasm compositor draws the
  // customer's resolved field values directly onto the form's
  // pre-rendered blank-region background (read from R2 inside
  // composeAndFinalizeCustomerPreview) -- it does not need originalBytes
  // or a pdf-lib-populated intermediate document at all, unlike the staff
  // PDF above.
  const previewBytes = await composeAndFinalizeCustomerPreview(env, submission.bi_form_id, coordinateMap, questionnaire, data);

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
