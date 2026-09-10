# Phase 2 contact-form localization policy (approved, not yet implemented)

The public contact/enquiry form (`src/contact.njk` +
`src/assets/js/enquiry-form.js`) is untouched in Phase 1. This document
records the approved scope for its localization in Phase 2, so the rule is
settled before that work starts rather than being decided mid-implementation.

## Will be translated (visible only)

- Page heading, lede and surrounding instructional copy.
- All field labels (Full Name, Email Address, Phone, Nationality, Current
  Country/Location, Preferred Language, Service Required, Brief
  Description, etc.).
- Help/hint text (e.g. "(optional)" markers, the note about not submitting
  passport scans through the general form).
- Placeholder text, where the form uses any.
- The visible text of every `<option>` in the "Service Required" dropdown
  (e.g. the Chinese-language label a zh-CN visitor sees for "Property
  Transfer & Documentation Support").
- Button labels ("Send Enquiry," "What Happens Next?" section heading and
  body).
- Client-facing validation, error, and success messages, including the
  `enquiry-form.js` fallback-to-mailto messaging.
- Urgent/priority explanatory text carried over from a service page's
  "Request Urgent/Priority Assistance" CTA (the visible copy only — see
  below for the value it carries).

## Will NOT change (backend contract, preserved exactly)

- Every form field's `name`/`id` attribute (`fullName`, `email`, `phone`,
  `nationality`, `location`, `language`, `service`, `description`, etc.).
- Every `<option value="...">` enum in the Service Required dropdown —
  `property-transfer`, `legal-support`, `airport-vip`, `visa-applications`,
  `work-visas`, and every other existing value, unchanged, in every locale.
  A Chinese visitor sees a Chinese label; the value submitted to the Worker
  is still the English identifier `property-transfer`.
- The `?service=`/`?priority=` query-parameter contract used by service
  pages' CTAs and read by `enquiry-form.js` — priority values (`urgent`,
  `priority`, `standard`) are never translated or re-encoded.
- The Worker's endpoint URL and request/response shape.
- `data-field-label` attributes, since these feed the plain-text
  `mailto:` fallback body — if these are localized for display, the
  underlying value the Worker/staff portal actually stores and keys off of
  must still resolve to the same English identifier; this needs a concrete
  implementation decision in Phase 2 (e.g. keep `data-field-label` as the
  translated *visible* string for the mailto fallback specifically, since
  that fallback is human-read text, not a machine-parsed field — to be
  confirmed against the Worker's actual expectations before implementation,
  not assumed here).

## Implementation note for Phase 2

This form is **not** part of Phase 1's `t`-filter chrome dictionary or the
`src/_translations/` files — it will need its own, larger dictionary
(or hand-authored per-locale form partials) given the number of
field-specific strings involved, following the same "no naive
substitution, full context per string" discipline described in
`docs/i18n-translations-dictionary.md`. No Worker, D1, or endpoint changes
are required to implement this — it is a front-end-only localization of
already-submitted, already-supported values.
