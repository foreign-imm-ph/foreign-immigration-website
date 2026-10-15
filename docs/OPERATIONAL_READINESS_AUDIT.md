# Operational integration readiness audit (Phase 4, Stage E)

Scope: a code-level readiness audit of the four operational integrations
named in the Phase 4 directive — transactional email, the QR Ph payment
workflow, refund operations, and Cloudflare infrastructure config. This is
**not** a production verification exercise. No real email was sent, no real
payment was processed, no real refund was issued, and no production
Cloudflare resource (Worker, D1, R2, Access) was modified or deployed to
while producing this document. Where a claim below is based on reading code
rather than exercising it against a real external service, that distinction
is stated explicitly, per the directive's requirement to keep "code-level
readiness" separate from "successful production verification."

Each subsystem gets one of four verdicts: **CONFIGURED** (env vars named,
code complete, but not exercised under test), **LOCALLY TESTED** (exercised
against synthetic data / Miniflare-local bindings, no network egress),
**NOT TESTED**, or **MISSING CONFIG**.

## A. Transactional email — verdict: CONFIGURED, not meaningfully tested

Provider: Resend, via a thin wrapper (`worker/src/lib/email.js:1-28`),
`POST https://api.resend.com/emails`.

Required config:
- `env.RESEND_API_KEY` — a Worker **secret** (`wrangler secret put`, never in
  `wrangler.toml`). Not present in `worker/.dev.vars` and not set anywhere in
  this repository, confirmed by inspection.
- `env.EMAIL_FROM`, `env.EMAIL_REPLY_TO`, `env.STAFF_NOTIFICATION_EMAIL` —
  all non-secret, already set in `worker/wrangler.toml` `[vars]` (lines
  79–83).

Eleven templates exist in `email.js` and are wired to real call sites across
`worker/src/routes/` (enquiry acknowledgement, staff new-enquiry notice,
staff portal-message notice, translated enquiry reply, Instant Services
guest verification, magic link, document-request notice, payment-requested
notice, application-status update, client-message notice, payment
confirmation). One defined template (`sendInstantServicesConfirmation`) is
currently unused by any route. **No dedicated email exists for Airport VIP
booking confirmation, rescheduling, or refund** — those three notices are
portal-only today (the client sees them via the Client Portal's own status
display, localized in Stage D, not via a separate email). Every send is
wrapped in `try/catch` and never blocks the underlying DB write — a failed
send is logged (without leaking client PII) and otherwise ignored, which is
a deliberate, consistent pattern across all twelve call sites, not an
oversight.

**Finding, fixed this stage:** the test suite had no mock for Resend. Any
test that hit a route calling `send*()` (e.g. the magic-link round trip in
`worker/test/auth.test.js`) was making a real, doomed-to-fail outbound HTTPS
request to `api.resend.com` on every `npm test` run — never asserted on
(since `RESEND_API_KEY` is unset, Resend would reject it), but still a real
external network call during local/CI test runs, which conflicts with this
directive's explicit requirement that email testing be "mocked/sandboxed
only." Fixed by adding a global `fetch` intercept for exactly
`https://api.resend.com/emails` in `worker/test/apply-migrations.js` (the
suite's shared setup file), returning a synthetic 200 response and
delegating every other URL to whatever `fetch` was already installed —
composable with the per-test Access-JWKS mock in
`worker/test/access-jwt-helper.js`, which still works unchanged. Full suite
re-run after the fix: 249 passed, 2 skipped, 4 todo, no regressions. This
makes the suite hermetic for this subsystem; it does **not** add an
assertion on email content/recipient/subject, which remains a gap — no test
today checks that the right template was chosen for a given route, only
that the route completes despite (now-synthetic, previously real-and-silent)
email delivery.

No live Resend send was attempted or authorized at any point in this stage.

## B. QR Ph payment workflow — verdict: LOCALLY TESTED

This is a manual-verification flow by design, not an automated gateway:
`worker/src/lib/paymentGateway.js` declares `requiresManualVerification:
true` and `verifyWebhookSignature()` unconditionally returns `false` for QR
Ph ("QR Ph has no webhook at all"). A `TEST_MOCK_GATEWAY` scaffold exists for
a *future* automated gateway but is deliberately excluded from the live
`PROVIDERS` map and unreachable from any customer route — confirmed by
reading the provider registration and every route that reads it. No
PayMongo/Stripe/bank API client exists anywhere in `worker/src/`.

Two separate QR images exist, both stored in the private `CLIENT_FILES` R2
bucket, neither publicly reachable (served only via the Worker's
`streamObject`, no presigned URLs):
- A legacy, single, fixed object (`config/qr-ph.png`) for the original
  per-application payment flow, replaced out of band (dashboard or `wrangler
  r2 object put` — no in-app upload path for this one).
- An admin-uploaded image for the Instant Services / Order & Book Online
  catalogue, gated by `staff.role === "admin"`
  (`worker/src/routes/staffCheckout.js:366`), with explicit validation: size
  ≤ 5 MB and real PNG/JPEG magic-byte sniffing (not a trusted
  browser-declared MIME type).

Customer-submitted payment proofs go through the same real-byte-sniffing
validation (`worker/src/lib/storage.js`), ≤ 15 MB, allow-listed to
PDF/JPEG/PNG/WebP/HEIC, stored per-client/per-payment, never publicly
exposed.

Status machines are explicit and transition-checked in code
(`assertOrderTransitionAllowed` / `ALLOWED_ORDER_TRANSITIONS` in
`worker/src/lib/checkout.js`): a customer upload can only move a payment to
"submitted," never to "paid"; only a staff action
(`verifyOrderPayment`/`markPaymentPaid`) can mark a payment paid. Both
verification paths are idempotent against double-verification (a SQL
`WHERE status != 'paid'` guard and an early-return check respectively), so
re-clicking "verify" is a structural no-op rather than a duplicate charge or
duplicate notification — though no test explicitly exercises "verify the
same payment twice," so this protection is sound by code inspection, not by
a dedicated regression test yet.

All of the above is exercised against synthetic D1 + local R2-binding data
in `worker/test/checkoutCustomer.test.js`, `worker/test/staffCheckout.test.js`,
and `worker/test/checkoutLib.test.js`, entirely inside Miniflare — no network
egress occurs anywhere in this subsystem's test or production code path.

## C. Refund operations — verdict: LOCALLY TESTED, with two flagged gaps

Refunds exist only for Airport VIP bookings; no generic refund mechanism
exists elsewhere in the codebase. The 120-hour rescheduling-eligibility rule
is encoded as a pure function (`worker/src/lib/airportVipPolicy.js`,
`NOTICE_HOURS_REQUIRED = 120`, inclusive boundary — exactly 120 hours'
notice counts as eligible), exhaustively unit-tested at the exact boundary
and on both sides of it. Refund status transitions
(`requested → approved/declined → processing → completed`) are
transition-checked in code, and every refund action is audit-logged with
staff email and timestamp. The booking-and-refund lifecycle, including the
"FIS unable to accommodate → full refund" and rescheduled-then-cancelled
paths, is exercised end to end in `worker/test/staffAirportVip.test.js`
against local D1 only. Refund completion **never** calls a real
payment-reversal API — this is stated explicitly in the route's own code
comment and repeated to the staff operator in the Staff Portal UI itself
("This environment never processes a real refund transaction — recording a
status here is for workflow tracking and testing only"); the "method" and
"transaction reference" fields staff fill in are free-text record-keeping
for a refund the staff member issues manually outside this system, not a
live gateway call.

**Two findings flagged for business/technical confirmation, not changed in
this stage** (per the directive's instruction to flag rather than invent or
redesign existing Airport VIP business logic):

1. The 120-hour rule is enforced where it decides *rescheduling* eligibility,
   but the refund-creation route itself does not re-derive or require one of
   the policy's named outcome keys (e.g.
   `CUSTOMER_CANCELLATION_NON_REFUNDABLE`) before allowing a refund to be
   started — the "reason" recorded on a refund is a free-text staff-entered
   field. In practice this means the system trusts staff judgment (reading
   the policy and deciding) rather than hard-gating refund creation on a
   computed eligibility outcome. This may be intentional — refund eligibility
   sometimes depends on facts only a human can determine (e.g. "was this a
   non-attendance or did the airport agent verify the client showed up") —
   but it is worth an explicit confirmation that this is the intended design
   rather than an oversight, since adding a hard gate here would be a
   business-logic change this phase is not authorized to make unilaterally.
2. Neither payment verification (`markPaymentPaid`, `verifyOrderPayment`) nor
   refund actions (`createRefundHandler`, `updateRefundStatusHandler`) are
   restricted to an elevated staff role — any staff account that passes the
   general Cloudflare Access + allow-list gate can verify a payment or walk a
   refund to "completed." (Only QR-image configuration and catalogue
   offering-status changes are `admin`-only today.) Whether payment
   verification and refunds should be restricted to a subset of staff is a
   business/access-control decision, not something this audit changes on its
   own authority.

## D. Cloudflare infrastructure — code-level config review only

This section reflects a **local configuration review only**. No remote
Cloudflare API call was made to verify any of it against the live account
this stage. Earlier in this engagement a Cloudflare API token was shared
directly in chat; because this environment's shell does not persist
exported environment variables between separate command invocations, using
that token again here would have meant re-typing the raw secret into
command text on every call — which this phase's own security rules (no
printing/logging a credential, narrowest use only) weigh against for a
check whose value (confirming local config matches reality) is marginal
next to the risk. Remote, read-only verification (e.g. `wrangler whoami`,
checking the live Access application's AUD tag, confirming the
`fis-bi-forms-library` R2 bucket actually contains the expected object keys)
remains available on request, ideally with the credential supplied via this
environment's own secret mechanism rather than pasted into chat again.

Configuration found in `worker/wrangler.toml` as committed:
- D1 binding `DB` → database `fis-backend` (id `85d16e91-...`), route
  `api.foreignimmigration.ph/*` on zone `foreignimmigration.ph`.
- R2 binding `CLIENT_FILES` → bucket `fis-client-files` (customer-submitted
  files: payment proofs, documents, QR Ph images — private, Worker-only
  access, no presigned URLs anywhere in the code).
- R2 binding `BI_FORMS_LIBRARY` → bucket `fis-bi-forms-library`, prepared in
  config but explicitly commented as "not yet applied to the live Worker" —
  takes effect only on a `wrangler deploy` that has not been run.
- `[ai]` binding for Workers AI (translation feature) — present in the
  committed config; must be commented out for *local* `wrangler dev`/browser
  testing (Workers AI always needs a live connection even locally), but this
  local-only change is never committed, confirmed via `git diff` before each
  commit this phase.
- Cloudflare Access staff auth: `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`
  are both non-secret config values already set in `[vars]`.
  `worker/src/lib/staffAuth.js` verifies the Access JWT's signature against
  the team's live JWKS endpoint and checks `aud`/`exp` — no custom staff
  auth exists; Cloudflare Access does all identity verification.
- 13 migrations exist (`0001` through `0013`), applied locally for every
  test run via `applyD1Migrations`; none were run against the remote
  database this stage.

No Free-plan quota concern was identified in anything read this stage — no
new remote resource was created, no remote migration was run, no file was
uploaded to a live bucket. This section should be re-verified with
authorized, read-only remote access if the business wants confirmation that
local config actually matches the live account (e.g. that the Access
application's AUD tag in the dashboard still matches the value committed
here, or that `fis-bi-forms-library` is reachable), since "committed config"
and "what's actually live" are two different claims this review cannot
unify without a remote call.

## Summary table

| Integration | Verdict | Real external call possible in current code? |
|---|---|---|
| Transactional email (Resend) | Configured, not meaningfully tested | Yes, in production with a real `RESEND_API_KEY` — by design. Test suite now mocked (fixed this stage). |
| QR Ph payment workflow | Locally tested | No — explicitly manual-verification only, no gateway API client exists |
| Refund operations (Airport VIP) | Locally tested, 2 flagged gaps | No — explicitly simulated/record-only, confirmed in code and in the Staff Portal's own UI copy |
| Cloudflare infrastructure | Code-level review only | N/A — no remote call made this stage |
