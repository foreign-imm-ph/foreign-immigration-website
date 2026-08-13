# Backend Requirements — Enquiry System (Next Phase)

This document describes what the Phase 1.2 frontend expects from a future
backend, so the next implementation phase (Cloudflare Worker + D1) has a
concrete contract to build against. Nothing described here is implemented
yet — see "Current interim behaviour" below for what actually happens today.

## Current interim behaviour (Phase 1.2)

`src/contact.njk` renders a complete enquiry form (`#enquiry-form`) with
proper labels, `required` fields and native HTML5 validation. There is no
Worker/API endpoint yet. Until one exists, `src/assets/js/enquiry-form.js`:

1. Reads a `?service=<slug>` query parameter (set by CTA links across the
   site, e.g. `/contact/?service=airport-vip`) and preselects the matching
   `<option>` in the "Service Required" field.
2. On submit, once native validation passes, composes a `mailto:` link
   from the filled-in field values and navigates to it — opening the
   visitor's own email client with a pre-filled message to
   `info@foreignimmigration.ph`.
3. Shows a status message describing exactly that ("Your email client
   should now open…") — never "Enquiry submitted" or anything implying
   server-side receipt, since nothing has been persisted anywhere.
4. Generates **no** reference number. Reference numbers must be assigned
   server-side once a real backend exists (see below).

This is a genuine, working fallback — not a simulation — but it is a
stopgap. It should be replaced by the API below, at which point
`enquiry-form.js` should be updated to `fetch()` the endpoint instead of
building a `mailto:` link, and only show a success state once the API
confirms receipt.

## Proposed API contract

**Endpoint:** `POST https://api.foreignimmigration.ph/enquiries`
(reserved subdomain, not yet configured — see Phase 1 planning notes)

**Request body** (JSON), mapping directly to the current form fields:

```json
{
  "fullName": "string, required",
  "email": "string, required, valid email",
  "phone": "string, optional",
  "nationality": "string, required",
  "location": "string, optional",
  "language": "English | Simplified Chinese | Korean | Other, optional",
  "service": "one of the 11 service slugs below, required",
  "description": "string, required"
}
```

Service slugs (must stay in sync with the `<select id=\"service\">` options
in `src/contact.njk` and the `?service=` links across `src/services/*` and
`src/index.njk`):

```
visa-applications, extensions-compliance, residency-status,
corporate-mobility, status-review, airport-vip, motions-blacklist,
legal-support, lost-passport, document-verification, other
```

**Required server-side behaviour:**
- Validate and sanitise all fields; reject if required fields are missing.
- Layered anti-abuse controls per the Phase 1 plan: honeypot field,
  minimum-completion-time check, rate limiting, request-size limits.
  Cloudflare Turnstile may be added later as an *optional* enhancement
  only, never a hard dependency (mainland-China compatibility).
- Persist the enquiry in D1.
- Generate a unique, non-sequential reference in the form `FIS-2026-XXXXX`
  server-side. Never generate or display this format client-side before a
  real record exists — a client-side "reference" would be indistinguishable
  from an authoritative one and must not be faked.
- Send a notification email to Foreign Immigration Services staff.
- Return the reference number in the response so the frontend can show a
  genuine confirmation (e.g. "Your enquiry has been received. Reference:
  FIS-2026-00142.").

**Response** (success, `201`):
```json
{ "reference": "FIS-2026-00142" }
```

## Related future work (not in scope for this document's endpoint)

- Document upload to R2, linked to an enquiry/application reference.
- "Applications & Services" status tracking, exposed via the Client Portal
  using the terminology in `docs/content-review-notes.md` (Reference,
  Applications & Services, Documents, Messages, Payments, Profile —
  not "matter").
- Authentication for the Client Portal (method not yet decided — see
  Phase 1 planning notes' open questions).
- Payment processing via a licensed PH gateway, once pricing is confirmed.

None of this should be built until explicitly approved — this document is
scoped to the enquiry API only, as the first backend feature.
