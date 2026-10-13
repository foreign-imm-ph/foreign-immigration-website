# BI-Form Submission Lifecycle

Phase 2, Stage 1. This defines a lifecycle for one BI-form instance
assigned to a client (`bi_form_submissions`, see
`worker/migrations/0009_bi_form_lifecycle.sql`), deliberately **separate
from** `applications.status`/`STATUS_OPTIONS`. Completing, approving, or
publishing a BI form never changes the underlying immigration
application's status — that progresses independently, under staff's
existing, unmodified status-update workflow. A BI form is one piece of
evidence/paperwork inside a larger application, not a synonym for it.

## Why a separate table, not a reused `applications.status` value

`applications.status` answers "where is this person's immigration matter
as a whole?" (`enquiry_received` → … → `completed`). A BI form answers a
narrower question — "has this specific document been filled in,
reviewed, and handed over?" — and a single application can need more than
one BI form over its life (e.g. a clearance certificate now, a travel
records request later). Conflating the two would mean either inventing
application-level statuses for form paperwork (polluting a system that
already works for every non-form service), or losing the ability to track
more than one form per application. `bi_form_submissions.application_id`
is nullable and many-to-one, exactly like `conversations.application_id`
(`0005_communications.sql`) — one application can have zero, one, or
several associated form submissions.

## States

| Status | Meaning | Who can see the submission in this state |
|---|---|---|
| `draft` | Staff has assigned the form; the customer has not yet submitted it (may be untouched, or partially filled and saved). | Client (to edit), staff (read-only progress view) |
| `submitted` | Customer has submitted a complete, server-validated questionnaire. Staff has not yet started reviewing it. | Staff (queued for review); client sees "submitted, awaiting review" |
| `under_review` | Staff has explicitly started reviewing the submission. | Staff (actively working); client sees "under review" |
| `revision_requested` | Staff found a problem with the customer-supplied answers and sent it back with a note. | Client (can edit and resubmit); staff sees it's waiting on the client |
| `approved` | Staff has entered every staff-controlled field and the engine has generated both the full staff PDF and the restricted customer preview. **Nothing is client-visible yet.** | Staff only |
| `published` | Staff has explicitly published the generated customer preview. | Client can now view/download the customer preview; staff retains full access |
| `cancelled` | Staff (or, later, a client-initiated withdrawal) ended this submission before publication — e.g. assigned in error, or no longer needed. Terminal. | Staff (history only); client sees it is no longer active |

`cancelled` is the one state added beyond your stated minimum of six. A
BI form can be assigned to the wrong client, for the wrong form, or become
unnecessary before anything is published — without it, the only way to
represent that today would be deleting the row, which destroys the audit
trail this whole schema is built to preserve (see `bi_form_status_history`
below and the existing `application_status_history`/`audit_log`
convention). Reversible only by creating a new submission, never by
reopening a cancelled one.

No other state was added. A "resubmitted after revision" state was
considered and rejected: the full chronological history in
`bi_form_status_history` already shows a resubmission as
`revision_requested → submitted`, distinguishable from a first-time
`draft → submitted` by simply looking at the prior row — a second status
value would duplicate information the history table already carries.

## Transitions

| From | To | Actor | Precondition | Side effect |
|---|---|---|---|---|
| *(none)* | `draft` | Staff | An approved, `clientPortalEnabled` BI form exists for this client/application | Row created; client notified a form is waiting (reuses the existing notification-email pattern) |
| `draft` | `submitted` | Client | Server-side questionnaire validation passes (required fields present, conditional/repeatable rules satisfied — reuses the engine's `questionnaire.json` schema, not a second validation path) | `submitted_at` set |
| `draft` | `cancelled` | Staff | — | `cancelled_at` set |
| `submitted` | `under_review` | Staff | — | `review_started_at` set |
| `submitted` | `cancelled` | Staff | — | `cancelled_at` set |
| `under_review` | `revision_requested` | Staff | A note is required (same pattern as the existing client-visible status note) | Client notified; customer answers remain editable |
| `under_review` | `cancelled` | Staff | — | `cancelled_at` set |
| `revision_requested` | `submitted` | Client | Same validation as `draft → submitted` | `submitted_at` updated |
| `revision_requested` | `cancelled` | Staff | — | `cancelled_at` set |
| `under_review` | `approved` | Staff | Every `suppliedBy: "staff"` field the form's `coordinate-map.json` requires has a value (fail-closed, mirroring `field-permissions.js`); engine generation (both PDFs) succeeds and passes its own audits (metadata, content-stream, boundary-expansion) | `approved_at`/`approved_by_staff_email` set; two new `documents` rows created (`kind = 'staff_pdf'`, `kind = 'customer_preview'`), **not yet downloadable by the client** |
| `approved` | `published` | Staff | Explicit, separate action — never automatic on approval | `published_at`/`published_by_staff_email` set; the `customer_preview` document becomes downloadable to the client |
| `approved` | `revision_requested` | Staff | A note is required | Safety valve for catching a mistake before anything reaches the client — nothing was ever shown to the customer, so this is always safe |
| `published` | `revision_requested` | Staff | A note is required | Re-opens an already-published form for correction. The previously published `documents` rows are never deleted — a later re-approval/re-publication simply creates newer rows; "the current published version" is the most recent `customer_preview` document for a submission whose `published_at` is set. Client is notified the form was reopened. |

No other transition is permitted. In particular: `submitted → approved`
directly (skipping `under_review`) is not allowed — staff must explicitly
start review first, so the audit trail always shows review happened
before approval, not just that it could have.

## What "approved" and "published" each gate

- **Approved** gates PDF *generation* (the engine runs, both documents
  exist) — this is a staff-only milestone, visible only in the Staff
  Portal.
- **Published** gates *client visibility* of the customer preview only.
  The full staff PDF (`kind = 'staff_pdf'`) is never made downloadable to
  a client-authenticated request at any status, including `published` —
  enforced in the document-download route itself (defense in depth), not
  only by what the lifecycle intends.
- Neither approval nor publication ever writes to `applications.status`
  or `application_status_history`. If staff also wants to reflect "this
  document is done" on the broader application, that is a separate,
  manual status update through the existing, unmodified mechanism — never
  automatic.

## Validation

`draft → submitted` and `revision_requested → submitted` both re-run the
same server-side validation: every question the form's `questionnaire.json`
marks required must have an answer; every `showIf`-gated question must be
present when its gate is true and may be absent when false; every
`repeatable-group` must not exceed its form's `maxCount` (mirroring
`field-bindings.js`'s existing `resolveFieldValues()` guard, which already
throws under exactly this condition). This is one shared validation
function, reused by both transitions — not duplicated.
