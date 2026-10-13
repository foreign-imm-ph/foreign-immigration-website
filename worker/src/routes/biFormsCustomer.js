import { getSessionClient } from "../lib/session.js";
import { json, requireFields } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";
import { getFormConfig, validateAnswers } from "../lib/biFormEngine.js";
import {
  requireOwnedSubmission,
  listSubmissionsForClient,
  updateCustomerAnswers,
  transitionStatus,
  getHistory,
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
  return json({
    submissions: submissions.map((s) => ({
      id: s.id,
      applicationId: s.application_id,
      biFormId: s.bi_form_id,
      status: s.status,
      preferredLanguage: s.preferred_language,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      submittedAt: s.submitted_at,
      publishedAt: s.published_at,
    })),
  });
}

export async function handleGetBiForm(request, env, submissionId) {
  const client = await requireClient(request, env);
  const submission = await requireOwnedSubmission(env.DB, client, submissionId);
  const { questionnaire } = getFormConfig(submission.bi_form_id);
  const history = await getHistory(env.DB, submissionId);

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

// Discoverability only -- a document returned here is reachable (and a
// staff_pdf or an unpublished customer_preview is refused) via the same
// rule enforced independently in routes/documents.js handleDownloadDocument,
// which is what actually protects it. The two must stay in agreement:
// only a published submission's customer_preview document is ever listed.
export async function handleListBiFormDocuments(request, env, submissionId) {
  const client = await requireClient(request, env);
  const submission = await requireOwnedSubmission(env.DB, client, submissionId);
  if (!submission.published_at) return json({ documents: [] });

  const { results } = await env.DB.prepare(
    "SELECT id, original_filename, created_at FROM documents WHERE bi_form_submission_id = ? AND kind = 'customer_preview' ORDER BY created_at DESC"
  )
    .bind(submissionId)
    .all();
  return json({ documents: results });
}

export async function handleSubmitBiForm(request, env, submissionId) {
  const client = await requireClient(request, env);
  const submission = await requireOwnedSubmission(env.DB, client, submissionId);
  if (!CUSTOMER_EDITABLE_STATUSES.has(submission.status)) {
    throw new HttpError(409, `This form cannot be submitted from its current status (${submission.status}).`);
  }

  const { questionnaire } = getFormConfig(submission.bi_form_id);
  const answers = submission.customer_answers_json ? JSON.parse(submission.customer_answers_json) : {};
  const validation = validateAnswers(questionnaire, answers);
  if (!validation.ok) {
    throw new HttpError(422, `Questionnaire is incomplete: ${validation.errors.join("; ")}`);
  }

  const updated = await transitionStatus(env.DB, submission, "submitted", { clientId: client.id });
  return json({ ok: true, status: updated.status });
}
