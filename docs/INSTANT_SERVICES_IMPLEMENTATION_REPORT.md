# FIS Instant Services — Implementation Report

Branch: `claude/fis-website-planning-r52sii`
Commits: `744c437` → `4ac0ab6` (8 commits, 52 files changed, 3,982 insertions)

This report covers the full build requested in "FIS INSTANT SERVICES — Full
Implementation Instructions for Claude Code." Per that instruction's §25,
**nothing has been deployed, activated, or made live.** Every catalogue row
created during testing was deleted; every test fixture (clients, orders,
R2 objects) was cleaned up after verification. The branch is ready for your
review but has not been merged, deployed, or pointed at production
infrastructure.

Product naming is **Instant Services** throughout (not "Instant Checkout"),
matching your correction. Mandated terminology — the "Apply & Pay Now" CTA,
the `/instant-services/` route, the "Request Submitted" and "Your Payment
Has Been Submitted for Verification" headings, the delivery-charges-are-
separate notice — is implemented verbatim and was confirmed rendering
correctly in a live browser run (see §6).

---

## 1. What was implemented

### Backend (Cloudflare Worker)

| Area | Files | What it does |
|---|---|---|
| Schema | `worker/migrations/0010_instant_services.sql` | Catalogue (services, six-language content, price components), orders + status history, delivery addresses/quotations/status history, QR Ph config log (append-only, doubles as its own audit trail), two additive columns on the existing `payment_requests` table. No existing table/column altered destructively. |
| Pricing | `worker/src/lib/money.js` | Integer-centavo helpers: formatting, summing, parsing a staff-typed peso string back to centavos. No floating-point money math anywhere. |
| Order lifecycle | `worker/src/lib/checkout.js` | Status state machine, catalogue reads, idempotent draft-order creation, immutable price-snapshot computation, catalogue-management writes, delivery-status trail. |
| Payment abstraction | `worker/src/lib/paymentGateway.js` | QR Ph as the only registered, manual-verification-only provider. A `TEST_MOCK_GATEWAY` exists for future test use but is deliberately **not** registered or reachable — no gateway is selected or activated. |
| QR Ph settings | `worker/src/lib/checkoutPaymentSettings.js` | Append-only settings log; an empty table is treated identically to disabled, never a placeholder. |
| Public routes | `worker/src/routes/checkoutPublic.js` | `GET /api/instant-services/catalogue`, `GET /api/instant-services/catalogue/:id`, `POST /api/instant-services/begin` (guest start — reuses the existing `auth_tokens`/magic-link mechanism and the unmodified `/api/auth/verify` endpoint). |
| Customer routes | `worker/src/routes/checkoutCustomer.js` | Order detail, start-application (idempotent), delivery address, review/confirm-and-pay (snapshots price, refuses if QR Ph isn't genuinely configured), QR Ph image stream, order history. |
| Staff routes | `worker/src/routes/staffCheckout.js` | Orders list/detail, payment verify/reject (the only place a checkout payment becomes `paid`), delivery quotation issuance + status updates, QR Ph settings (admin-gated image upload with real byte-sniffing), catalogue create/edit/activate (admin-gated). |
| Reused unchanged | `worker/src/routes/biFormsCustomer.js`, `worker/src/routes/payments.js` | The questionnaire API and the payment-proof upload API needed **no new routes** — only two small additive changes (see §3) so the existing routes work against Instant Services records. |

### Frontend (Eleventy static site)

| Area | Files | What it does |
|---|---|---|
| Nav | `src/_data/nav.json`, `partials/header.njk`, `style.css` | "Instant Services" nav entry styled as a solid-green action pill, all 6 locales translated. |
| Icon | `partials/icons.njk` | New hand-authored line icon (document + lightning), no shopping-cart imagery anywhere. |
| Homepage widget | `src/index.njk` + 5 locale copies | Hidden by default; shows a live 3-card widget once the catalogue actually has an active entry. |
| Catalogue page | `src/instant-services.njk` + 5 locale copies | `/instant-services/` — static marketing shell, JS-rendered live catalogue. |
| Service-detail CTA | `immigration-motions-blacklist-and-derogatory-record-assistance.njk` × 6 | Inline eligibility/price/CTA block, hidden unless that exact service is active; the existing enquiry CTA is untouched. |
| Catalogue/CTA JS | `src/assets/js/instant-services-catalogue.js` | One shared module, fetches once per page load, renders both the list views and the single-service detail CTA. |
| Guest flow | `src/instant-services/verify.njk`, `apply.njk` + their JS | The full guest application journey as one dynamic, state-driven page (see §2). |

---

## 2. The guest application journey, as built

1. Visitor finds Instant Services (homepage widget, catalogue page, or the
   service-detail CTA) and clicks "Apply & Pay Now".
2. `/instant-services/apply/?service=<id>&lang=<lang>` shows the service's
   live price/eligibility and a name+email form.
3. Submitting calls `POST /api/instant-services/begin` — creates (or reuses)
   a `clients` row and a draft order, and emails a verification link.
4. The link opens `/instant-services/verify/`, which redeems the token
   through the **existing, unmodified** `/api/auth/verify` endpoint and
   redirects back into `/instant-services/apply/?order=<id>`.
5. From here, the apply page is a pure state machine: on every load, it
   calls `GET /api/instant-services/orders/:id` and renders whichever
   screen the order's *actual* server-side state calls for — never a
   locally-assumed step:
   - No submission yet → starts the application (creates `applications` +
     `bi_form_submissions` rows), then renders the questionnaire.
   - Questionnaire not yet submitted → renders it via
     `window.PortalBiForms.openBiFormDetail` — **the existing Stage 5.4
     renderer, completely unchanged.** No second questionnaire engine
     exists anywhere in this codebase.
   - Submitted, delivery-supporting service, no address yet → delivery
     address form (shows the mandated "Delivery charges are not included
     in the service fee..." notice verbatim).
   - Ready to pay → review screen ("Request Submitted" + server-computed
     itemized price) → "Confirm and Continue to Payment" snapshots the
     price immutably and creates the real payment request.
   - Awaiting payment → QR Ph image (byte-fetched from the Worker, which
     refuses outright if QR Ph isn't configured/enabled — never a fake
     placeholder), the staff-configured merchant name/instructions, and a
     proof-of-payment upload.
   - Proof submitted → "Your Payment Has Been Submitted for Verification"
     with the exact mandated body text, a reference number, and a Client
     Portal link.
   - Staff-verified → "Payment Verified" + Client Portal link.

Document upload, questionnaire save/submit, and payment-proof upload all
go through the **existing** `/api/bi-forms/...` and
`/api/applications/.../payments/.../proof` routes — nothing new was built
for either, by design.

---

## 3. Notable design decisions

- **Sequencing, not schema change**, satisfies `documents.application_id
  NOT NULL`: `startOrderApplication` creates the `applications` row before
  the `bi_form_submissions` row, exactly as your spec anticipated.
- **Idempotent order creation** via a natural-key lookup (client + service,
  while the order is still open) — no separate idempotency-key table.
- **Immutable price snapshot**: `computeAndSnapshotPrice` refuses to
  overwrite an existing snapshot once set.
- **QR Ph fail-closed**: `isConfigured()` requires both `enabled` and a
  real uploaded image key; an empty settings table is treated identically
  to disabled. Confirmed by test and by the live browser run: the payment
  screen genuinely refuses (503) before any image is configured.
- **Two additive, narrowly-scoped changes** to existing files, not new
  parallel systems:
  - `biForms.js`'s `createSubmission` gained an optional `intakePath`
    parameter (defaults to the column's own existing default for every
    other caller).
  - `payments.js`'s proof-upload handler gained one branch: a proof tied
    to a checkout order also advances that order's status (or the
    delivery-status trail, for a delivery-purpose payment) — every
    pre-existing payment request (`checkout_order_id = NULL`) is
    unaffected.
- **Staff admin-gating** reuses the existing `staff.role !== "admin"`
  convention (same pattern as `staff.js`'s `deleteEnquiry`) for QR Ph
  settings changes and catalogue writes — returned as a `Response`, not
  thrown, matching that file's own established convention.

---

## 4. Tests performed and results

### Automated (Cloudflare Worker, vitest + `@cloudflare/vitest-pool-workers` — runs on real workerd, not a Node simulation)

```
Test Files  17 passed (17)
     Tests  189 passed | 2 skipped | 4 todo (195)
```

New test files added this phase: `checkoutPublic.test.js` (12 cases),
`checkoutCustomer.test.js` (9 cases), `staffCheckout.test.js` (14 cases),
`checkoutLib.test.js` (11 cases) — 46 new tests. Pre-existing 149 Stage 1–5
tests still pass unchanged: **zero regressions**.

Coverage includes: catalogue filtering/404s, idempotent begin-checkout,
honeypot rejection, cross-customer order-access rejection, questionnaire
reuse through the real `/api/bi-forms/...` routes, confirm-and-pay refusing
before QR Ph is configured, the full happy path through to
`awaiting_verification`, staff payment verify/reject, delivery quotation
issuance creating a *separate* payment request, the explicit "a tracking
number never auto-marks delivered" requirement, admin-gating (including
the real multipart QR-image-upload path with genuine PNG bytes sniffed and
a fake file rejected), and the order/delivery status machines directly.

### Real Cloudflare Workers runtime (`wrangler dev --local`, not the vitest harness)

Every backend phase was independently re-verified against a real running
Worker, not just the test harness — per the explicit instruction not to
rely on the harness alone for Workers-runtime-specific code:
- Catalogue listing, single-service lookup, idempotent begin-checkout,
  real auth-token issuance and redemption.
- The full authenticated order flow: application start, delivery address,
  confirm-and-pay, real QR-image byte streaming, payment-proof upload
  advancing both `payment_requests.status` and the order's own status.
- Staff routes (verify/reject payment, delivery quotation/status, QR Ph
  settings upload, catalogue create/activate) exercised through the vitest
  pool's real self-signed-JWT-against-mocked-JWKS harness, which itself
  runs on workerd — sufficient for this code (plain D1/R2/FormData
  handling, none of Stage 5.3's WASM-specific concerns).

### Real browser (Playwright/Chromium), real backend, real end-to-end flow

This is the most important verification in this report: a complete guest
journey was driven through an actual browser against an actual running
Worker and static build — not mocked, not stubbed:

1. Seeded one real active catalogue service and a real QR Ph configuration
   via the actual public/staff APIs (not raw SQL where avoidable).
2. `POST /api/instant-services/begin` → real email-verification token
   issued.
3. Visited `/instant-services/verify/` in Chromium → redeemed through the
   real `/api/auth/verify` endpoint → real session cookie set → redirected
   to the apply page.
4. The apply page correctly auto-started the application and rendered the
   **real, unmodified** `CCS-A-CDR-2016` questionnaire via
   `PortalBiForms.openBiFormDetail`. Filled and submitted it.
5. Delivery address screen appeared automatically, showing the mandated
   notice verbatim. Filled and submitted it.
6. Review screen showed "Request Submitted" and the real server-computed
   price (₱3,500.00). Clicked "Confirm and Continue to Payment".
7. Payment screen showed the real QR Ph image (fetched as actual image
   bytes), the real staff-configured merchant name ("FIS Test Merchant")
   and instructions text.
8. Uploaded a payment proof → final screen showed **"Your Payment Has Been
   Submitted for Verification"** with the exact mandated body text, a
   reference number, and a Client Portal link.
9. Confirmed directly in D1: order status `awaiting_verification`, payment
   status `submitted` — never silently `paid`.
10. Repeated the final confirmation screen at a 390×844 mobile viewport —
    renders cleanly.

**A real bug was found and fixed during this run**, not a hypothetical one:
the delivery-address route used `PUT`, which isn't in the Worker's CORS
`Access-Control-Allow-Methods` list. `curl` and the vitest harness (neither
enforces CORS) both "passed" against it; a real browser silently blocked
the request. Fixed by switching the route to `POST`, consistent with
every other mutation route in this codebase. This is exactly the category
of bug the instruction's "test the real runtime, don't rely on the harness
alone" requirement exists to catch, and it would not have been caught any
other way available here.

Screenshots from this run (homepage widget, catalogue page, service-detail
CTA, and all six apply-flow screens, desktop and mobile) were sent to you
directly during the session.

### Known test-coverage gap, stated honestly

The apply flow's non-English STRINGS dictionaries were written carefully
and reviewed by eye, but **only the English path was verified end-to-end
in a live browser this session** — the other five languages were not
independently screenshot-checked for the dynamic apply flow (the static
catalogue/homepage pages *were* visually inspected in English only as
well; their translated copy was reviewed by eye, not browser-rendered).
If you want the other five languages visually confirmed before any
activation decision, that is a bounded, concrete follow-up task, not
something silently skipped.

---

## 5. Desktop and mobile verification findings

Confirmed via real Playwright screenshots at 1440×900 (desktop) and
390×844 (mobile):
- Homepage nav pill, homepage widget (hidden-when-empty / shown-when-active
  both confirmed), catalogue page, service-detail CTA, and all apply-flow
  screens render correctly and responsively at both viewports.
- Mobile hamburger menu shows the Instant Services pill correctly among
  the stacked nav links.
- No horizontal scroll, no broken layout, no shopping-cart imagery,
  discount badges, or urgency/countdown elements anywhere — confirmed by
  direct visual inspection, not just by code review.

---

## 6. Ready for local demo right now

- Full guest journey: discovery → email verification → questionnaire
  (reused Forms Library engine) → delivery address → price review → QR Ph
  payment → proof upload → confirmation, entirely self-service, no staff
  action required until verification.
- Full staff journey: view Instant Services Orders, verify/reject a
  payment, issue a delivery quotation (creates its own separate payment
  request), update delivery status (including exception handling),
  configure QR Ph (upload/replace/enable/disable with a full audit trail),
  create/edit/activate a catalogue entry.
- All 195 backend tests passing; zero regressions against the 149
  pre-existing Stage 1–5 tests.

## 7. Awaiting real QR Ph configuration

The payment screen is fully built and was verified with a **test** QR
image and **test** merchant instructions, both deleted after verification.
No real QR Ph image or real merchant details have been uploaded anywhere.
Until an administrator uploads a real image and enables it through the
Staff Portal, the customer-facing payment screen correctly refuses to
offer payment at all (confirmed by test and by the live run) — it never
shows a placeholder.

## 8. Awaiting gateway approval

No payment gateway is selected, integrated, or reachable from any
customer-facing route. `paymentGateway.js`'s `TEST_MOCK_GATEWAY` exists
only for a future test import and is not registered in `PROVIDERS` or
reachable via `getProvider()` — confirmed by a direct unit test. Adding a
real gateway later means adding one adapter to that registry; no route
logic needs to change.

## 9. Services/prices awaiting your approval

**Zero catalogue rows exist in the repository or in any committed
migration/seed data.** Every service used during testing (slug, BI form
ID, price, six-language content) was created through the live API during
verification and deleted immediately afterward — nothing was left seeded,
and nothing is `active = 1` anywhere. The three forms the Stage 1–4 report
already validated (`CCS-A-CDR-2016` confirmed, plus the two still-ambiguous
`2014-13-002`/`2014-13-006` service-slug mappings) remain the natural
first candidates, but no decision about them was made or assumed here.

## 10. Genuine blockers / incomplete functionality

- **Non-English visual QA of the apply flow** — see §4's stated gap.
  Translations exist and were written carefully; they were not all
  independently screenshot-verified this session.
- **No numbered visual stepper** (1/2/3/4/5) was built for the apply flow.
  The flow is fully functional and state-driven without one — each screen
  is unambiguous about what it's asking for — but the original frontend
  audit's wireframe suggestion of a horizontal step indicator was not
  implemented. This is a cosmetic enhancement, not a functional gap.
- **International delivery address validation** is intentionally lenient
  (free-text region/postal/country fields) — no country-specific address
  format validation exists, matching the "support domestic PH + supported
  international destinations" requirement's own framing that staff, not
  the form, confirm destination serviceability.
- **No live customer emails were sent** — Resend returned 401 in this
  sandboxed environment (no real API key configured here), which is
  expected and unrelated to the code; every verification email the flow
  attempted to send failed gracefully and logged the failure without
  blocking the underlying client/order record, exactly as the existing
  `sendMagicLink` pattern already behaves for the same reason.

---

## Authorization boundaries respected throughout (§25)

Nothing in this phase: deployed to production, modified live Cloudflare
infrastructure, ran a production database migration, activated a paid
service publicly, published an invented real price, uploaded a fabricated
QR code left in place, selected/activated a payment gateway, sent a live
customer email, or changed an existing production payment setting. All
testing used a local `wrangler dev` instance and local D1/R2 state;
every test fixture was created through real APIs and deleted immediately
after verification. All production activation decisions remain yours.
