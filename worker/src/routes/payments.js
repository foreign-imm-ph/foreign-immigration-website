import { getSessionClient } from "../lib/session.js";
import { requireOwnedApplication } from "./applications.js";
import { readAndValidateUpload, paymentProofKey, streamObject, HttpError } from "../lib/storage.js";
import { newId } from "../lib/crypto.js";
import { json } from "../lib/http.js";

// No gateway anywhere in this file. A client action can only ever move a
// payment_request from 'pending' to 'submitted' — never to 'paid'. Only a
// staff action (staff.js) can mark something paid.
//
// QR Ph is ONE reusable image for the whole business, not one per payment
// request — see QR_PH_KEY. Staff/owner adds or replaces it by uploading an
// object to this exact key in the R2 bucket (Cloudflare dashboard's R2
// browser, or `wrangler r2 object put`) — no code change, no redeploy.
export const QR_PH_KEY = "config/qr-ph.png";

async function requireClient(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");
  return client;
}

export async function handleListPayments(request, env, applicationId) {
  const client = await requireClient(request, env);
  await requireOwnedApplication(env, client, applicationId);

  const { results } = await env.DB.prepare(
    `SELECT id, amount_php, description, status, created_at, submitted_at, paid_at
     FROM payment_requests WHERE application_id = ? ORDER BY created_at DESC`
  )
    .bind(applicationId)
    .all();

  // A single flag for the whole list, not per row — there is one QR Ph
  // image for the business, not one per payment request.
  const qrObject = await env.CLIENT_FILES.head(QR_PH_KEY);

  return json({ payments: results, qrPhConfigured: !!qrObject });
}

// Deliberately not scoped to a specific application/payment — this is one
// shared, non-sensitive business asset (the same image for every client),
// so ownership checks don't apply the way they do for documents. Still
// requires a signed-in session, consistent with the rest of the portal.
export async function handleGetQrPhImage(request, env) {
  await requireClient(request, env);

  const response = await streamObject(env.CLIENT_FILES, QR_PH_KEY, "qr-ph-payment.png", "image/png");
  if (!response) throw new HttpError(404, "Not found");
  return response;
}

export async function handleUploadPaymentProof(request, env, applicationId, paymentId) {
  const client = await requireClient(request, env);
  await requireOwnedApplication(env, client, applicationId);

  const payment = await env.DB.prepare(
    "SELECT * FROM payment_requests WHERE id = ? AND application_id = ?"
  )
    .bind(paymentId, applicationId)
    .first();
  if (!payment) throw new HttpError(404, "Not found");
  if (payment.status === "paid") throw new HttpError(400, "This payment has already been verified as paid");

  const { bytes, contentType, filename } = await readAndValidateUpload(request);
  const key = paymentProofKey(client.id, paymentId);
  await env.CLIENT_FILES.put(key, bytes, { httpMetadata: { contentType } });

  await env.DB.prepare(
    "INSERT INTO payment_proofs (id, payment_request_id, r2_key, original_filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(newId(), paymentId, key, filename, contentType, bytes.byteLength)
    .run();

  // Client action can only ever reach 'submitted' — never 'paid'.
  await env.DB.prepare(
    "UPDATE payment_requests SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?"
  )
    .bind(paymentId)
    .run();

  return json({ status: "submitted" }, { status: 201 });
}
