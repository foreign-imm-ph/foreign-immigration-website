import { getSessionClient } from "../lib/session.js";
import { json } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";

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
  return json({ applications: results });
}

export async function handleGetApplication(request, env, applicationId) {
  const client = await requireClient(request, env);
  const application = await requireOwnedApplication(env, client, applicationId);

  const { results: history } = await env.DB.prepare(
    "SELECT status, note, changed_at FROM application_status_history WHERE application_id = ? AND client_visible = 1 ORDER BY changed_at DESC"
  )
    .bind(applicationId)
    .all();

  return json({ application, history });
}
