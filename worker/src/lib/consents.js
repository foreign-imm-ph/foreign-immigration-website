import { newId } from "./crypto.js";

// Channel consent for future external messaging (SMS/WhatsApp/Telegram/
// WeChat) — one row per (client, channel), enforced by a unique index
// (migration 0007), never inferred, never pre-granted. Portal/email are
// deliberately out of scope here (see the Phase 3 report) and have no rows
// in this table at all.
export const CONSENT_CHANNELS = ["sms", "whatsapp", "telegram", "wechat"];
const CONSENT_STATUSES = ["granted", "revoked"];

export function isValidConsentChannel(channel) {
  return CONSENT_CHANNELS.includes(channel);
}

export function isValidConsentStatus(status) {
  return CONSENT_STATUSES.includes(status);
}

export async function listClientConsents(db, clientId) {
  const { results } = await db
    .prepare("SELECT channel, status, source, granted_at, revoked_at FROM client_channel_consents WHERE client_id = ?")
    .bind(clientId)
    .all();
  return results;
}

// Returns a plain { sms: 'granted'|'revoked'|null, whatsapp: ..., ... }
// map — null for a channel with no recorded row at all, which is the
// correct default for every existing client (see migration 0007) and must
// never be treated as "granted."
export async function getConsentStatusMap(db, clientId) {
  const rows = await listClientConsents(db, clientId);
  const map = Object.fromEntries(CONSENT_CHANNELS.map((c) => [c, null]));
  for (const row of rows) map[row.channel] = row.status;
  return map;
}

// Upserts the single current-state row for (clientId, channel). A grant
// sets granted_at to now and leaves any prior revoked_at untouched (so a
// grant-revoke-regrant cycle still shows both timestamps); a revoke is the
// mirror image. Never deletes a row — revocation is state, not erasure.
export async function setClientConsent(db, { clientId, channel, status, source }) {
  const existing = await db
    .prepare("SELECT id FROM client_channel_consents WHERE client_id = ? AND channel = ?")
    .bind(clientId, channel)
    .first();

  if (existing) {
    if (status === "granted") {
      await db
        .prepare(
          "UPDATE client_channel_consents SET status = ?, source = ?, granted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
        )
        .bind(status, source, existing.id)
        .run();
    } else {
      await db
        .prepare(
          "UPDATE client_channel_consents SET status = ?, source = ?, revoked_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
        )
        .bind(status, source, existing.id)
        .run();
    }
    return existing.id;
  }

  const id = newId();
  const grantedAtSql = status === "granted" ? "datetime('now')" : "NULL";
  const revokedAtSql = status === "revoked" ? "datetime('now')" : "NULL";
  await db
    .prepare(
      `INSERT INTO client_channel_consents (id, client_id, channel, status, source, granted_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ${grantedAtSql}, ${revokedAtSql})`
    )
    .bind(id, clientId, channel, status, source)
    .run();
  return id;
}
