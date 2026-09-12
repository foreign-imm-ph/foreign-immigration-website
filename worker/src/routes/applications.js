import { getSessionClient } from "../lib/session.js";
import { json } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";
import { getLocalizedStatusLabel } from "../lib/clientLocaleStrings.js";

// The invariant this whole file exists to enforce: every query that
// touches an application (or anything hanging off one) includes
// `client_id = ?` bound to the SESSION's client, never a client-supplied
// value. A resource ID from the URL is never trusted alone.

async function requireClient(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");
  return client;
}

// Resolves an application AND proves the current session owns it, in one
// query — used by every other route (documents, messages, payments) before
// they touch anything scoped to that application.
export async function requireOwnedApplication(env, client, applicationId) {
  const application = await env.DB.prepare(
    "SELECT * FROM applications WHERE id = ? AND client_id = ?"
  )
    .bind(applicationId, client.id)
    .first();
  if (!application) throw new HttpError(404, "Not found");
  return application;
}

export async function handleListApplications(request, env) {
  const client = await requireClient(request, env);
  const { results } = await env.DB.prepare(
    "SELECT id, reference, service_slug, status, created_at, updated_at FROM applications WHERE client_id = ? ORDER BY created_at DESC"
  )
    .bind(client.id)
    .all();
  const language = client.preferred_communication_language || "en";
  const applications = results.map((a) => ({ ...a, statusLabel: getLocalizedStatusLabel(a.status, language) }));
  return json({ applications });
}

export async function handleGetApplication(request, env, applicationId) {
  const client = await requireClient(request, env);
  const application = await requireOwnedApplication(env, client, applicationId);

  // client_visible = 1 excludes any status update still awaiting staff's
  // explicit Translate & Preview confirmation (see worker/src/routes/
  // staff.js updateStatus/publishStatusUpdate) — a client never sees a
  // status change whose note has not yet been successfully translated
  // (or determined not to need translation).
  const { results: rawHistory } = await env.DB.prepare(
    `SELECT status, note, note_translated, note_target_language, note_translation_status, changed_at
     FROM application_status_history WHERE application_id = ? AND client_visible = 1 ORDER BY changed_at DESC`
  )
    .bind(applicationId)
    .all();

  const language = client.preferred_communication_language || "en";
  const history = rawHistory.map((row) => ({
    status: row.status,
    statusLabel: getLocalizedStatusLabel(row.status, language),
    note: row.note,
    noteTranslated: row.note_translated,
    noteTranslationStatus: row.note_translation_status,
    changedAt: row.changed_at,
  }));

  return json({
    application: { ...application, statusLabel: getLocalizedStatusLabel(application.status, language) },
    history,
  });
}
