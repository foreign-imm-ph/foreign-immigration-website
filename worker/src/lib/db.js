import { newId, generateReference } from "./crypto.js";

// Every helper here takes `env.DB` explicitly rather than being a global,
// so nothing in this file can accidentally be called without a bound database.

export async function insertUniqueReference(db, table, year = new Date().getUTCFullYear()) {
  // Collisions are astronomically unlikely (33^5 keyspace per year) but the
  // reference column is UNIQUE, so retry on the rare conflict rather than
  // trusting randomness alone.
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = generateReference(year);
    const existing = await db
      .prepare(`SELECT id FROM ${table} WHERE reference = ?`)
      .bind(reference)
      .first();
    if (!existing) return reference;
  }
  throw new Error("Could not generate a unique reference after 5 attempts");
}

export async function getClientByEmail(db, email) {
  return db.prepare("SELECT * FROM clients WHERE email = ?").bind(email.toLowerCase()).first();
}

export async function getClientById(db, id) {
  return db.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first();
}

export async function createClient(db, { fullName, email, phone = null, nationality = null }) {
  const id = newId();
  await db
    .prepare(
      "INSERT INTO clients (id, full_name, email, phone, nationality) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, fullName, email.toLowerCase(), phone, nationality)
    .run();
  return getClientById(db, id);
}

export async function logAudit(db, { actorType, actorIdOrEmail, action, targetTable = null, targetId = null }) {
  await db
    .prepare(
      "INSERT INTO audit_log (id, actor_type, actor_id_or_email, action, target_table, target_id) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(newId(), actorType, actorIdOrEmail, action, targetTable, targetId)
    .run();
}
