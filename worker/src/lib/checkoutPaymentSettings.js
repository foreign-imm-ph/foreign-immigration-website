// QR Ph configuration: append-only log (checkout_payment_settings_log),
// where the latest row by changed_at IS the current configuration and
// the whole table IS the audit trail -- see the migration's own comment
// for why this is one table, not a current-config table plus a separate
// history table.
import { newId } from "./crypto.js";

// No row at all (table empty) means "never configured" -- callers must
// treat that identically to `enabled: 0`. Never returns a placeholder.
export async function getCurrentPaymentSettings(db) {
  const row = await db.prepare("SELECT * FROM checkout_payment_settings_log ORDER BY changed_at DESC, id DESC LIMIT 1").first();
  if (!row) {
    return { qr_image_r2_key: null, merchant_display_name: null, customer_instructions: null, enabled: 0 };
  }
  return row;
}

export async function getPaymentSettingsHistory(db, limit = 50) {
  const { results } = await db
    .prepare("SELECT * FROM checkout_payment_settings_log ORDER BY changed_at DESC, id DESC LIMIT ?")
    .bind(limit)
    .all();
  return results;
}

// Every change is a new row -- never an UPDATE -- so the audit trail is
// structurally impossible to lose or rewrite. `changes` only needs to
// carry the fields actually being changed; unset fields carry over from
// the current settings, so e.g. toggling `enabled` alone doesn't require
// re-submitting the image key or instructions.
export async function recordPaymentSettingsChange(db, { changedByStaffEmail, changes }) {
  const current = await getCurrentPaymentSettings(db);
  const next = {
    qr_image_r2_key: changes.qrImageR2Key !== undefined ? changes.qrImageR2Key : current.qr_image_r2_key,
    merchant_display_name: changes.merchantDisplayName !== undefined ? changes.merchantDisplayName : current.merchant_display_name,
    customer_instructions: changes.customerInstructions !== undefined ? changes.customerInstructions : current.customer_instructions,
    enabled: changes.enabled !== undefined ? (changes.enabled ? 1 : 0) : current.enabled,
  };
  await db
    .prepare(
      `INSERT INTO checkout_payment_settings_log
        (id, qr_image_r2_key, merchant_display_name, customer_instructions, enabled, changed_by_staff_email)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(newId(), next.qr_image_r2_key, next.merchant_display_name, next.customer_instructions, next.enabled, changedByStaffEmail)
    .run();
  return getCurrentPaymentSettings(db);
}
