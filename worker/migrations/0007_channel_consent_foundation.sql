-- Phase 3: contact, channel preference, and consent foundation for future
-- external channels (SMS/WhatsApp/Telegram/WeChat). Purely additive — no
-- existing table is rebuilt or rewritten, and every existing client/enquiry
-- row is left exactly as-is. No external channel is integrated by this
-- migration or the code that uses it; this only creates the storage model.

-- Durable client-level facts, kept deliberately separate from each other
-- (see docs discussion in the Phase 3 report): the language a client wants
-- to be addressed in, the channel they'd prefer to be contacted through,
-- and a properly normalized mobile number are three different facts and
-- must not be conflated into one column or inferred from each other.
--
-- preferred_communication_channel: 'portal' | 'email' | 'sms' | 'whatsapp' |
-- 'telegram' | 'wechat', validated in application code (no CHECK
-- constraint), consistent with this schema's existing convention for every
-- other enumerated column (see 0004_enquiry_priority.sql). NULL means no
-- explicit preference has been recorded — never inferred from the presence
-- of a phone number or anything else.
ALTER TABLE clients ADD COLUMN preferred_communication_channel TEXT NULL;

-- mobile_e164: a new, separate, properly normalized (E.164) mobile number,
-- suitable for a future SMS/WhatsApp integration. The existing `phone`
-- column (free-form, historical, never guaranteed parseable) is completely
-- untouched — this is additive alongside it, never a replacement or an
-- overwrite of it.
ALTER TABLE clients ADD COLUMN mobile_e164 TEXT NULL;

-- One row per (client, channel): a client's CURRENT consent state for one
-- specific external channel. granted_at/revoked_at each hold the most
-- recent time that transition happened and are never cleared by the other
-- (so a grant-then-revoke-then-regrant cycle still shows both timestamps),
-- while `status` alone is the authoritative current state — this keeps a
-- single, unambiguous row per channel rather than an ever-growing event
-- log, matching the field shape actually requested (both granted_at and
-- revoked_at on the same conceptual row). Revocation always updates this
-- row in place; it is never deleted, so the fact that consent existed and
-- was later revoked remains visible.
CREATE TABLE client_channel_consents (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  channel TEXT NOT NULL,   -- 'sms' | 'whatsapp' | 'telegram' | 'wechat'
  status TEXT NOT NULL,    -- 'granted' | 'revoked'
  source TEXT NOT NULL,    -- 'public_enquiry' | 'client_portal' | 'staff_recorded' | 'future_channel_onboarding'
  granted_at TEXT NULL,
  revoked_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_client_channel_consents_client ON client_channel_consents(client_id);
-- Enforced at the database level, not only in application code: a client
-- can have at most one consent row per channel.
CREATE UNIQUE INDEX idx_client_channel_consents_unique ON client_channel_consents(client_id, channel);

-- Storage model only for a future verified external identity (e.g. a
-- WhatsApp-linked phone, a Telegram chat ID, a WeChat openid) — nothing in
-- this phase populates it; no identifier is fabricated, no external
-- platform is contacted. verified_at stays NULL until a real, future
-- verification step (not part of this phase) sets it — a present
-- linked_at with a NULL verified_at must never be treated as verified.
CREATE TABLE client_channel_identities (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  channel TEXT NOT NULL,        -- 'whatsapp' | 'telegram' | 'wechat'
  external_id TEXT NOT NULL,
  display_value TEXT NULL,
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_client_channel_identities_client ON client_channel_identities(client_id);
-- The same external identity (e.g. the same WhatsApp-linked number) can
-- never be linked to two different clients — enforced at the database
-- level since identifier formats differ by channel and application-code-only
-- enforcement would be an easy invariant to accidentally violate later.
CREATE UNIQUE INDEX idx_client_channel_identities_unique ON client_channel_identities(channel, external_id);
