import { getSessionClient } from "../lib/session.js";
import { requireOwnedApplication } from "./applications.js";
import { readAndValidateUpload, documentKey, streamObject, HttpError } from "../lib/storage.js";
import { newId } from "../lib/crypto.js";
import { json } from "../lib/http.js";

async function requireClient(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");
  return client;
}

export async function handleListDocumentRequests(request, env, applicationId) {
  const client = await requireClient(request, env);
  await requireOwnedApplication(env, client, applicationId);

  // client_visible = 1 excludes a request still awaiting staff's explicit
  // Translate & Preview confirmation (see worker/src/routes/staff.js
  // requestDocument/publishDocumentRequest) — a client never sees a
  // document request whose title has not yet been successfully translated
  // (or determined not to need translation).
  const { results: rawRequests } = await env.DB.prepare(
    `SELECT id, label, label_translated, label_target_language, label_translation_status, status, note, created_at
     FROM document_requests WHERE application_id = ? AND client_visible = 1 ORDER BY created_at DESC`
  )
    .bind(applicationId)
    .all();
  const requests = rawRequests.map((r) => ({
    id: r.id,
    label: r.label,
    labelTranslated: r.label_translated,
    labelTranslationStatus: r.label_translation_status,
    status: r.status,
    createdAt: r.created_at,
  }));

  const { results: documents } = await env.DB.prepare(
    "SELECT id, document_request_id, original_filename, uploaded_by, created_at FROM documents WHERE application_id = ? ORDER BY created_at DESC"
  )
    .bind(applicationId)
    .all();

  return json({ documentRequests: requests, documents });
}

export async function handleUploadDocument(request, env, applicationId) {
  const client = await requireClient(request, env);
  const application = await requireOwnedApplication(env, client, applicationId);

  const documentRequestId = new URL(request.url).searchParams.get("documentRequestId") || null;
  if (documentRequestId) {
    // Confirm the document request actually belongs to this application —
    // otherwise a client could attach an upload to someone else's request ID.
    const dr = await env.DB.prepare(
      "SELECT id FROM document_requests WHERE id = ? AND application_id = ?"
    )
      .bind(documentRequestId, applicationId)
      .first();
    if (!dr) throw new HttpError(404, "Document request not found");
  }

  const { bytes, contentType, filename } = await readAndValidateUpload(request);
  const key = documentKey(client.id, applicationId);

  await env.CLIENT_FILES.put(key, bytes, { httpMetadata: { contentType } });

  const id = newId();
  await env.DB.prepare(
    `INSERT INTO documents
      (id, document_request_id, application_id, client_id, r2_key, original_filename, content_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'client')`
  )
    .bind(id, documentRequestId, applicationId, client.id, key, filename, contentType, bytes.byteLength)
    .run();

  if (documentRequestId) {
    await env.DB.prepare(
      "UPDATE document_requests SET status = 'submitted', updated_at = datetime('now') WHERE id = ?"
    )
      .bind(documentRequestId)
      .run();
  }

  return json({ id, filename }, { status: 201 });
}

export async function handleDownloadDocument(request, env, applicationId, documentId) {
  const client = await requireClient(request, env);
  await requireOwnedApplication(env, client, applicationId);

  // Ownership re-checked here too, not just at the application level —
  // client_id must match the SESSION, independent of the application check.
  const doc = await env.DB.prepare(
    "SELECT * FROM documents WHERE id = ? AND application_id = ? AND client_id = ?"
  )
    .bind(documentId, applicationId, client.id)
    .first();
  if (!doc) throw new HttpError(404, "Not found");

  const response = await streamObject(env.CLIENT_FILES, doc.r2_key, doc.original_filename, doc.content_type);
  if (!response) throw new HttpError(404, "Not found");
  return response;
}
