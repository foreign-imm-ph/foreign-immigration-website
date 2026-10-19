import { getSessionClient } from "../lib/session.js";
import { json, requireFields } from "../lib/http.js";
import { readAndValidateUpload, documentKey, streamObject, HttpError } from "../lib/storage.js";
import { newId } from "../lib/crypto.js";
import { getFormConfig, validateAnswers } from "../lib/biFormEngine.js";
import {
  requireOwnedSubmission,
  listSubmissionsForClient,
  updateCustomerAnswers,
  transitionStatus,
  getHistory,
  getFriendlyFormInfo,
} from "../lib/biForms.js";

const MAX_ANSWERS_JSON_BYTES = 200 * 1024; // generous for a questionnaire's worth of text; guards against an abusive payload

async function requireClient(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");
  return client;
}

// A customer may only ever edit a submission that is still awaiting their
// input -- never one staff is already reviewing or has acted on.
const CUSTOMER_EDITABLE_STATUSES = new Set(["draft", "revision_requested"]);

export async function handleListBiForms(request, env) {
  const client = await requireClient(request, env);
  const submissions = await listSubmissionsForClient(env.DB, client.id);
  const lang = client.preferred_communication_language || "en";
  return json({
    submissions: await Promise.all(
      submissions.map(async (s) => {
        // Directive section 3: the friendly, customer-facing service name
        // must be shown, not the raw BI form identifier -- this list was
        // the one customer-facing surface still returning only biFormId.
        const friendly = await getFriendlyFormInfo(env.DB, s.bi_form_id, s.id, lang);
        return {
          id: s.id,
          applicationId: s.application_id,
          biFormId: s.bi_form_id,
          serviceName: friendly.title,
          technicalReference: friendly.technicalReference,
          status: s.status,
          preferredLanguage: s.preferred_language,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          submittedAt: s.submitted_at,
          publishedAt: s.published_at,
        };
      })
    ),
  });
}

export async function handleGetBiForm(request, env, submissionId) {
  const client = await requireClient(request, env);
  const submission = await requireOwnedSubmission(env.DB, client, submissionId);
  const { questionnaire } = getFormConfig(submission.bi_form_id);
  const history = await getHistory(env.DB, submissionId);
  const friendly = await getFriendlyFormInfo(env.DB, submission.bi_form_id, submission.id, client.preferred_communication_language || "en");

  return json({
    submission: {
      id: submission.id,
      biFormId: submission.bi_form_id,
      status: submission.status,
      preferredLanguage: submission.preferred_language,
      answers: submission.customer_answers_json ? JSON.parse(submission.customer_answers_json) : {},
      createdAt: submission.created_at,
      updatedAt: submission.updated_at,
      submittedAt: submission.submitted_at,
      publishedAt: submission.published_at,
      // Service-based naming (directive: customer-facing heading must be
      // the service the customer purchased, e.g. "Request for Travel
      // Records", never the raw BI form identifier) -- technicalReference
      // is preserved as the secondary reference, never the primary one.
      serviceName: friendly.title,
      technicalReference: friendly.technicalReference,
    },
    // Only the customer-facing question set is returned -- never the
    // coordinate map (field positions, staff-only field names), which the
    // customer has no legitimate reason to see.
    questionnaire: { formId: questionnaire.formId, languages: questionnaire.languages, questions: questionnaire.questions },
    // The client never sees a staff-authored note until staff publishes
    // it -- same principle as application_status_history's client_visible
    // gate. For now, every history row's note is surfaced as-is since BI-
    // form notes have no translation workflow yet (unlike
    // application_status_history); this is a known simplification, not
    // an oversight -- see Phase 2 Stage 3 report.
    history: history.map((h) => ({ status: h.status, note: h.note, changedAt: h.changed_at })),
  });
}

export async function handleSaveDraft(request, env, submissionId) {
  const client = await requireClient(request, env);
  const submission = await requireOwnedSubmission(env.DB, client, submissionId);
  if (!CUSTOMER_EDITABLE_STATUSES.has(submission.status)) {
    throw new HttpError(409, `This form is not currently editable (status: ${submission.status}).`);
  }

  const body = await request.json().catch(() => {
    throw new HttpError(400, "Invalid request body");
  });
  requireFields(body, ["answers"]);
  if (typeof body.answers !== "object" || body.answers === null || Array.isArray(body.answers)) {
    throw new HttpError(400, "answers must be an object");
  }
  const answersJson = JSON.stringify(body.answers);
  if (answersJson.length > MAX_ANSWERS_JSON_BYTES) throw new HttpError(413, "Answers payload too large");

  await updateCustomerAnswers(env.DB, submissionId, answersJson);

  if (body.preferredLanguage !== undefined) {
    const lang = String(body.preferredLanguage).trim() || null;
    await env.DB.prepare("UPDATE bi_form_submissions SET preferred_language = ? WHERE id = ?").bind(lang, submissionId).run();
  }

  return json({ ok: true });
}

// Directive section 6: the real-time official BI PDF preview, called by
// the wizard (debounced client-side, never per-keystroke) as the customer
// fills in answers -- NOT a save (handleSaveDraft is the only route that
// persists anything; this never touches the DB). `answers` is passed in
// the request body, not read back from the stored draft, so the preview
// always reflects exactly what's on screen, including a field the
// customer hasn't clicked "Save Draft" on yet. Returns a base64 PNG (not
// a PDF -- a live preview is a convenience image, not the generated
// document) plus the currently-focused question's own highlight rect, so
// the wizard can draw an overlay without duplicating any coordinate math
// client-side. Graceful by design: a form with no pre-rendered background
// yet, or no activeFieldKey supplied, degrades to "no highlight"/"no
// image" rather than an error -- this feature sits on top of an
// already-complete, independently working wizard.
export async function handleBiFormPreviewImage(request, env, submissionId) {
  const client = await requireClient(request, env);
  const submission = await requireOwnedSubmission(env.DB, client, submissionId);
  if (!CUSTOMER_EDITABLE_STATUSES.has(submission.status)) {
    throw new HttpError(409, `This form is not currently editable (status: ${submission.status}).`);
  }

  const body = await request.json().catch(() => {
    throw new HttpError(400, "Invalid request body");
  });
  requireFields(body, ["answers"]);
  if (typeof body.answers !== "object" || body.answers === null || Array.isArray(body.answers)) {
    throw new HttpError(400, "answers must be an object");
  }
  const answersJson = JSON.stringify(body.answers);
  if (answersJson.length > MAX_ANSWERS_JSON_BYTES) throw new HttpError(413, "Answers payload too large");

  const { coordinateMap, questionnaire } = getFormConfig(submission.bi_form_id);
  const activeQuestion = body.activeFieldKey
    ? questionnaire.questions.find((q) => q.dataKey === body.activeFieldKey || q.id === body.activeFieldKey)
    : null;

  const { renderDraftPreviewImage } = await import("../lib/biFormRaster.js");
  let result;
  try {
    result = await renderDraftPreviewImage(env, submission.bi_form_id, coordinateMap, questionnaire, body.answers, activeQuestion);
  } catch (err) {
    // A live preview sits ON TOP of an independently working wizard --
    // any rendering failure against necessarily-incomplete, in-progress
    // draft data (an unusual repeatable-group shape mid-edit, etc.) must
    // degrade to "not available right now", never break the step the
    // customer is actively filling in.
    console.error("Live BI form preview render failed:", err.message);
    result = null;
  }
  if (!result) return json({ available: false });

  return json({
    available: true,
    imageBase64: bytesToBase64(result.pngBytes),
    widthPx: result.widthPx,
    heightPx: result.heightPx,
    highlight: result.highlight,
    // "FIS Smart Application System" directive: the live preview must
    // never silently suggest a too-long answer fits. Same box-count
    // comparison the final-document guard (staffBiForms.js's
    // approveBiForm, commit 756296e) uses -- this is reported, not
    // enforced, here: the wizard shows a warning but never blocks the
    // customer from continuing, since the authoritative block already
    // exists at Approve and a customer must never lose access to
    // checkout over a field they may still want staff's help with.
    overflowFields: result.overflowFields || [],
  });
}

// Same chunked approach as svg-compose.js's own bytesToBase64 (no Buffer
// global in the Workers runtime), duplicated rather than imported since
// that one lives in the lazily-loaded engine module and this is a tiny,
// self-contained, Workers-standard-API-only utility.
function bytesToBase64(bytes) {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Discoverability: lists both (a) the published customer_preview, if any
// -- a document listed here is reachable (and a staff_pdf or an
// unpublished customer_preview is refused) via the same rule enforced
// independently in handleDownloadBiFormDocument below, which is what
// actually protects it; the two must stay in agreement -- and (b) every
// client_upload the customer has attached to this submission themselves
// (e.g. a required supporting document), which is always listable back
// to the client who uploaded it regardless of the submission's status.
export async function handleListBiFormDocuments(request, env, submissionId) {
  const client = await requireClient(request, env);
  const submission = await requireOwnedSubmission(env.DB, client, submissionId);

  const { results: uploads } = await env.DB.prepare(
    "SELECT id, original_filename, created_at FROM documents WHERE bi_form_submission_id = ? AND kind = 'client_upload' ORDER BY created_at DESC"
  )
    .bind(submissionId)
    .all();

  if (!submission.published_at) return json({ documents: [], uploads });

  const { results: previews } = await env.DB.prepare(
    "SELECT id, original_filename, created_at FROM documents WHERE bi_form_submission_id = ? AND kind = 'customer_preview' ORDER BY created_at DESC"
  )
    .bind(submissionId)
    .all();
  return json({ documents: previews, uploads });
}

// A customer may attach a supporting document (e.g. a passport scan) to
// their own BI-form submission directly, independent of the generic
// application-level document_requests flow -- the questionnaire schema
// does not yet model a per-form list of named required documents (noted
// as a gap for a later iteration), so this accepts any upload the
// customer chooses to attach while the form is still theirs to edit.
// Reuses the same validated-upload/storage primitives
// routes/documents.js's application-scoped upload already uses.
export async function handleUploadBiFormDocument(request, env, submissionId) {
  const client = await requireClient(request, env);
  const submission = await requireOwnedSubmission(env.DB, client, submissionId);
  if (!CUSTOMER_EDITABLE_STATUSES.has(submission.status)) {
    throw new HttpError(409, `Documents cannot be attached in this form's current status (${submission.status}).`);
  }
  // documents.application_id is NOT NULL (same column every ordinary
  // uploaded document uses) -- a BI-form submission with no application
  // at all is a future Instant Checkout concern, not yet schema-
  // accommodated (same noted-not-solved gap as staffBiForms.js's
  // generated staff/customer-preview documents). Every submission this
  // phase actually creates is staff-assigned to an existing application,
  // so this is not reachable in practice today.
  if (!submission.application_id) {
    throw new HttpError(501, "Attaching documents to a BI-form submission with no associated application is not yet supported.");
  }

  const { bytes, contentType, filename } = await readAndValidateUpload(request);
  const key = documentKey(client.id, submission.application_id);
  await env.CLIENT_FILES.put(key, bytes, { httpMetadata: { contentType } });

  const id = newId();
  await env.DB.prepare(
    `INSERT INTO documents
      (id, application_id, client_id, bi_form_submission_id, r2_key, original_filename, content_type, size_bytes, uploaded_by, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'client', 'client_upload')`
  )
    .bind(id, submission.application_id, client.id, submissionId, key, filename, contentType, bytes.byteLength)
    .run();

  return json({ id, filename }, { status: 201 });
}

// Dedicated download path for a BI-form-submission-scoped document,
// independent of routes/documents.js's application-scoped one -- a
// submission is not guaranteed to have an application_id (Instant
// Checkout, not yet active), so this never relies on
// requireOwnedApplication. Ownership and the same kind/publication gate
// handleDownloadDocument enforces are both re-checked here directly.
export async function handleDownloadBiFormDocument(request, env, submissionId, documentId) {
  const client = await requireClient(request, env);
  await requireOwnedSubmission(env.DB, client, submissionId);

  const doc = await env.DB.prepare(
    "SELECT * FROM documents WHERE id = ? AND bi_form_submission_id = ? AND client_id = ?"
  )
    .bind(documentId, submissionId, client.id)
    .first();
  if (!doc) throw new HttpError(404, "Not found");

  if (doc.kind === "staff_pdf") throw new HttpError(404, "Not found");
  if (doc.kind === "customer_preview") {
    const submission = await env.DB.prepare("SELECT published_at FROM bi_form_submissions WHERE id = ?")
      .bind(submissionId)
      .first();
    if (!submission || !submission.published_at) throw new HttpError(404, "Not found");
  }

  const response = await streamObject(env.CLIENT_FILES, doc.r2_key, doc.original_filename, doc.content_type);
  if (!response) throw new HttpError(404, "Not found");
  return response;
}

// Directive section 7: a question the customer marked "I'm not sure --
// let FIS help me" must never block submission, and must never be
// silently treated as "No"/"None"/any other substantive answer -- it's
// simply exempted from the required-field check here, by relaxing a
// CLONED copy of the questionnaire (the shared engine's questionnaire.json
// itself, and validateAnswers() in bi-forms-library/engine, are never
// mutated). Everything else about validateAnswers' rules -- type checks
// on whatever the customer DID answer, conditional showIf gating, every
// other required field -- is completely unchanged.
function relaxRequiredForUnsureFields(questionnaire, answers) {
  const unsure = new Set(Array.isArray(answers.__unsureFields) ? answers.__unsureFields : []);
  if (!unsure.size) return questionnaire;
  return {
    ...questionnaire,
    questions: questionnaire.questions.map((q) => {
      const key = q.type === "repeatable-group" ? q.groupDataKey : q.dataKey;
      return unsure.has(key) ? { ...q, required: false } : q;
    }),
  };
}

export async function handleSubmitBiForm(request, env, submissionId) {
  const client = await requireClient(request, env);
  const submission = await requireOwnedSubmission(env.DB, client, submissionId);
  if (!CUSTOMER_EDITABLE_STATUSES.has(submission.status)) {
    throw new HttpError(409, `This form cannot be submitted from its current status (${submission.status}).`);
  }

  const { questionnaire } = getFormConfig(submission.bi_form_id);
  const answers = submission.customer_answers_json ? JSON.parse(submission.customer_answers_json) : {};
  const validation = validateAnswers(relaxRequiredForUnsureFields(questionnaire, answers), answers);
  if (!validation.ok) {
    throw new HttpError(422, `Questionnaire is incomplete: ${validation.errors.join("; ")}`);
  }

  const updated = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
  return json({ ok: true, status: updated.status });
}
