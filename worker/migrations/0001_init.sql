-- Foreign Immigration Services — backend schema (V1)
-- Authorization is enforced in Worker code (every query scopes by the
-- caller's client_id/session), not by database-level policies.

CREATE TABLE enquiries (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  nationality TEXT NOT NULL,
  location TEXT,
  language TEXT,
  service_slug TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', -- new | reviewed | converted | closed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_enquiries_email ON enquiries(email);
CREATE INDEX idx_enquiries_status ON enquiries(status);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  nationality TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE auth_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_auth_tokens_client ON auth_tokens(client_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_client ON sessions(client_id);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES clients(id),
  service_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enquiry_received',
  enquiry_id TEXT REFERENCES enquiries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_applications_client ON applications(client_id);

CREATE TABLE application_status_history (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  status TEXT NOT NULL,
  note TEXT,
  client_visible INTEGER NOT NULL DEFAULT 1,
  changed_by_staff_email TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_status_history_application ON application_status_history(application_id);

CREATE TABLE document_requests (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested', -- requested | submitted | received | rejected
  note TEXT,
  requested_by_staff_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_document_requests_application ON document_requests(application_id);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  document_request_id TEXT REFERENCES document_requests(id),
  application_id TEXT NOT NULL REFERENCES applications(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL, -- 'client' | 'staff'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_documents_application ON documents(application_id);
CREATE INDEX idx_documents_client ON documents(client_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  sender_type TEXT NOT NULL, -- 'client' | 'staff'
  sender_label TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_application ON messages(application_id);

-- The QR Ph image itself is NOT stored per payment_request. It is one
-- reusable business asset at a fixed R2 key (QR_PH_KEY in
-- worker/src/routes/payments.js, currently "config/qr-ph.png"), added or
-- replaced by uploading an object to that key directly in R2. No schema
-- change, no code change, no redeploy needed to add or update it.
CREATE TABLE payment_requests (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  amount_php REAL NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | submitted | paid
  gateway_provider TEXT, -- reserved, unused in V1
  gateway_reference TEXT, -- reserved, unused in V1
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  paid_at TEXT,
  verified_by_staff_email TEXT
);

CREATE INDEX idx_payment_requests_application ON payment_requests(application_id);

CREATE TABLE payment_proofs (
  id TEXT PRIMARY KEY,
  payment_request_id TEXT NOT NULL REFERENCES payment_requests(id),
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', -- 'admin' | 'staff'
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL, -- 'staff' | 'client' | 'system'
  actor_id_or_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_target ON audit_log(target_table, target_id);

-- Sliding-window rate limiting for public, unauthenticated endpoints
-- (enquiries, magic-link requests). Stores a hash of the requester's IP,
-- never the raw address, consistent with collecting only what's needed.
CREATE TABLE rate_limit_events (
  id TEXT PRIMARY KEY,
  bucket TEXT NOT NULL, -- e.g. 'enquiry' | 'magic_link'
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rate_limit_lookup ON rate_limit_events(bucket, ip_hash, created_at);
