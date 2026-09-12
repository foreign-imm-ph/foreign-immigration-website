-- Phase 2 (portal messaging) introduces lazy conversation creation: the
-- first new-style portal message on an application that doesn't yet have a
-- generalized conversation creates one on the fly. Application code already
-- checks-then-inserts to avoid a duplicate, but a database-level constraint
-- is a stronger guarantee against ever ending up with two conversations for
-- the same application (e.g. a genuine race between two near-simultaneous
-- requests). Purely additive: no existing table is altered, no existing row
-- is touched, and every current conversations row already satisfies this
-- constraint (application_id is NULL until conversion, and conversion links
-- exactly one already-existing conversation, never creating a second one).
--
-- Partial (WHERE application_id IS NOT NULL) so any number of conversations
-- with a NULL application_id (not yet converted) remain unaffected — only
-- an actual duplicate application_id would violate this.
CREATE UNIQUE INDEX idx_conversations_application_id_unique
  ON conversations(application_id)
  WHERE application_id IS NOT NULL;
