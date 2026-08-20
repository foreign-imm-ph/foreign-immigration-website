import { getSessionClient } from "../lib/session.js";
import { json } from "../lib/http.js";
import { HttpError } from "../lib/storage.js";

export async function handleGetProfile(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");
  return json({
    fullName: client.full_name,
    email: client.email,
    phone: client.phone,
    nationality: client.nationality,
  });
}

export async function handleUpdateProfile(request, env) {
  const client = await getSessionClient(request, env);
  if (!client) throw new HttpError(401, "Sign in required");

  const body = await request.json().catch(() => {
    throw new HttpError(400, "Invalid request body");
  });

  const fullName = body.fullName ? String(body.fullName).trim().slice(0, 200) : client.full_name;
  const phone = body.phone !== undefined ? String(body.phone).trim().slice(0, 60) || null : client.phone;
  const nationality = body.nationality !== undefined ? String(body.nationality).trim().slice(0, 100) || null : client.nationality;

  // Email is intentionally not editable here — it's the sign-in identity;
  // changing it is a staff-assisted action, not a self-service one, to
  // avoid a client silently locking themselves out or hijacking another
  // account's magic-link flow.
  await env.DB.prepare(
    "UPDATE clients SET full_name = ?, phone = ?, nationality = ? WHERE id = ?"
  )
    .bind(fullName, phone, nationality, client.id)
    .run();

  return json({ ok: true });
}
