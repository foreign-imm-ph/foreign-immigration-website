-- Multilingual communications (Phase 1). Purely additive against the live
-- production schema: no existing table is altered, rebuilt, or rewritten.
--
-- The existing `messages` table (application_id TEXT NOT NULL REFERENCES
-- applications(id)) is deliberately left untouched. It has no NULL-able path
-- to represent a pre-application (enquiry-stage) conversation without a
-- SQLite table rebuild, and rebuilding it is explicitly out of scope for
-- this phase. Portal messaging keeps using it exactly as today; these new
-- tables exist alongside it, not in place of it.
--
-- No ON DELETE CASCADE anywhere below, matching this schema's existing
-- convention for applications.enquiry_id (see 0001_init.sql): a foreign key
-- with no ON DELETE clause blocks deletion of a still-referenced row rather
-- than silently cascading or orphaning it, so communication history can't
-- disappear as a side effect of deleting something else.

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NULL REFERENCES enquiries(id),
  client_id TEXT NULL REFERENCES clients(id),
  application_id TEXT NULL REFERENCES applications(id),
  preferred_language TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_message_at TEXT NULL
);
-- enquiry_id/client_id/application_id are all nullable: at enquiry creation
-- only enquiry_id is known; client_id and application_id are populated later,
-- in place, at conversion (see routes/staff.js convertEnquiry) — no new
-- conversation row is ever created at that point.

CREATE INDEX idx_conversations_enquiry_id ON conversations(enquiry_id);

CREATE TABLE communication_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_type TEXT NOT NULL,          -- 'client' | 'staff' | 'system'
  channel TEXT NOT NULL,              -- 'web' | 'email' (future: 'portal' | 'sms' | 'whatsapp' | 'telegram' | 'wechat')
  source_language TEXT NOT NULL,
  source_text TEXT NOT NULL,          -- exactly as authored; never overwritten after insert
  target_language TEXT NOT NULL,
  target_text TEXT NULL,              -- NULL until translated, or when source_language = target_language
  translation_status TEXT NOT NULL DEFAULT 'not_required', -- not_required | pending | ready | failed
  translation_provider TEXT NULL,
  translated_at TEXT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | failed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- No CHECK constraints on the enum-like columns above, consistent with how
-- `enquiries.status`/`service_slug`/`priority` are already validated: this
-- schema has never used SQL-level CHECK for enumerated values, relying on
-- server-side validation in Worker code instead (see 0004_enquiry_priority.sql).

CREATE INDEX idx_communication_messages_conversation ON communication_messages(conversation_id, created_at);

-- Durable, cross-conversation client preference. Distinct from
-- conversations.preferred_language (a per-thread snapshot) and from
-- enquiries.language (a one-time, unmodified historical record of what a
-- specific enquiry stated) — see docs discussion in the Phase 0.6 report.
-- NULL for every existing client; only ever set going forward, at
-- conversion time if unset, or later via self-service profile editing.
ALTER TABLE clients ADD COLUMN preferred_communication_language TEXT NULL;
