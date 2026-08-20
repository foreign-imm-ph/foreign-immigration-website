import { getSessionClient } from "../lib/session.js";
import { requireOwnedApplication } from "./applications.js";
import { newId } from "../lib/crypto.js";
import { json, requireFields } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";

async function requireClient(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");
  return client;
}

export async function handleListMessages(request, env, applicationId) {
  const client = await requireClient(request, env);
  await requireOwnedApplication(env, client, applicationId);

  const { results } = await env.DB.prepare(
    "SELECT id, sender_type, sender_label, body, created_at FROM messages WHERE application_id = ? ORDER BY created_at ASC"
  )
    .bind(applicationId)
    .all();

  return json({ messages: results });
}

export async function handleSendMessage(request, env, applicationId) {
  const client = await requireClient(request, env);
  await requireOwnedApplication(env, client, applicationId);

  const body = await request.json().catch(() => {
    throw new HttpError(400, "Invalid request body");
  });
  requireFields(body, ["body"]);
  const text = String(body.body).trim().slice(0, 4000);
  if (!text) throw new HttpError(400, "Message cannot be empty");

  const id = newId();
  await env.DB.prepare(
    "INSERT INTO messages (id, application_id, sender_type, sender_label, body) VALUES (?, ?, 'client', ?, ?)"
  )
    .bind(id, applicationId, client.full_name, text)
    .run();

  return json({ id }, { status: 201 });
}
