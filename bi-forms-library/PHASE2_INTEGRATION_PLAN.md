# FIS Forms Library — Phase 2 Integration Plan (proposal, not yet approved)

**Status: architecture proposal only.** Nothing in this document has been
built. No Worker route, D1 migration, `wrangler.toml` binding, or
frontend code has been written or changed; no Cloudflare resource has
been created or modified; nothing has been deployed. This is the
"present the architecture for approval first" deliverable you asked for.

## 0. Commit reconciliation

Already corrected in commit `1cae68f`: the Phase 1 completion report's
"commit hashes" section originally listed 5 commits because it was
written inside the 6th (`88941e3`) and couldn't cite its own hash. The
chat summary's count of 6 was correct from the start; there was no
underlying discrepancy in the git history itself, only in which commit
the report's own text had been able to name at the time it was written.
The report now lists all 6 explicitly.

## 1. What already exists (inspection findings)

This section is the basis for everything below — Phase 2 is designed to
extend this, not replace or duplicate it.

### Static site
- Eleventy, deployed to **GitHub Pages** via `.github/workflows/deploy.yml`
  (push to `main` → build → `actions/deploy-pages`). This is a separate
  deployment surface from the Worker — there is no Cloudflare Pages here.
- Six locale trees: `en` (default, no prefix), `zh-cn`, `zh-hant`, `ko`,
  `ja`, `vi` — each has its own translated `client-portal.njk` marketing
  page and service pages. **The authenticated Client Portal app itself
  (`src/portal/{index,login,verify}.njk` + `src/assets/js/portal-*.js`)
  has no localized versions and is hard-coded English** (status labels,
  "Welcome, ", tab names, etc. are literal English strings in
  `portal-app.js`). This is a real gap for "complete the questionnaire in
  six languages" — see Risks.
- Canonical language codes actually used site-wide:
  `en, zh-CN, zh-Hant, ko, ja, vi` (mixed case — see
  `worker/src/lib/translation.js` `CANONICAL_LANGUAGES`,
  `src/_data/site.json`, `src/assets/js/language-gateway.js`). The BI
  Forms Library engine's `questionnaire.schema.json` currently uses
  lowercase `zh-cn`/`zh-hant`, which does not match. This needs to be
  reconciled in Phase 2 (align the engine to the site's real codes).

### Backend (Cloudflare Worker `fis-backend`)
- One Worker, `worker/wrangler.toml`: D1 binding `DB` (database
  `fis-backend`), R2 binding `CLIENT_FILES` (bucket `fis-client-files`),
  Workers AI binding `AI` (used only for translation, via
  `worker/src/lib/translation.js`, model `@cf/meta/llama-3.1-70b-instruct`).
  This bucket is **separate from and unrelated to** the BI Forms
  Library's own `fis-bi-forms-library` R2 bucket (used only during engine
  development to store original BI templates; never referenced by the
  live Worker).
- **No CI/CD for the Worker.** Only the static site auto-deploys; the
  Worker is deployed manually via `wrangler deploy`. There are no
  `wrangler.toml` environments defined (no staging/production split).
- **No automated tests exist for the Worker at all** — confirmed by
  inspection. The BI Forms Library engine is the only part of this
  codebase with a test suite today.

### Authentication / authorization
- **Customers**: passwordless magic link (`worker/src/routes/auth.js`) →
  single-use token → 30-day session cookie (`HttpOnly; Secure;
  SameSite=Lax`), hashed token stored in D1 `sessions`
  (`worker/src/lib/session.js`). No password anywhere.
- **Staff**: Cloudflare Access (Zero Trust) gates `/staff/*` at the edge;
  the Worker independently re-verifies the Access JWT itself
  (`worker/src/lib/staffAuth.js`, JWKS fetch + RSASSA-PKCS1-v1_5 verify)
  and cross-checks the verified email against a `staff` allow-list table
  — two independent checks, no separate staff login system, no staff
  passwords.
- **CSRF**: every state-changing request (JSON API and staff HTML form
  posts alike) is rejected unless its `Origin`/`Referer` matches the
  site's own host (`isSameSiteOrigin`) — no token scheme.
- **R2 access**: the Worker is the only thing that ever touches R2
  directly — no public bucket, no presigned URLs. Every download goes
  through `storage.js`'s `streamObject()`, and every route calls it only
  after an explicit per-request ownership check
  (`requireOwnedApplication` + a matching `client_id` on the row, for
  clients; `requireStaff` for staff). Uploads are sniffed by magic bytes
  (never trust the browser's claimed Content-Type), capped at 15MB,
  restricted to PDF/JPEG/PNG/WebP.

### Domain model already in D1 (`worker/migrations/0001`–`0008`)
`clients` → `applications` (`service_slug`, `status`,
`application_status_history`) → `document_requests`/`documents`,
`payment_requests`/`payment_proofs` (manual QR Ph + staff "mark paid";
**no payment gateway exists**), `messages`/`communication_messages`
(bilingual via Workers AI, with a staff "Translate & Preview → explicit
Publish" gate before anything becomes client-visible), `audit_log`,
`rate_limit_events`, `client_channel_consents`/`client_channel_identities`
(future SMS/WhatsApp/etc. — not active).

Every migration from `0002` onward is purely additive (new nullable
column or new table) — this schema has never had a breaking migration,
and Phase 2 should not be the first.

### Staff Portal (`worker/src/routes/staff.js`, ~1700 lines)
Plain server-rendered HTML (`lib/staffHtml.js`), no JS framework, gated
end-to-end by Access. Already implements the exact pattern Phase 2 needs
to reuse for form approval: staff fills in a field, submits, and (for
anything client-visible with a possible translation) the result sits as
a draft (`client_visible = 0`) until staff explicitly clicks
Publish — see `updateStatus`/`publishStatusUpdate`,
`requestDocument`/`publishDocumentRequest`,
`createPaymentRequest`/`publishPaymentRequest`. There is no concept of a
"form" or "generated PDF" anywhere in this file today.

### Client Portal (`src/portal/index.njk` + `portal-app.js`)
Vanilla JS, two tabs: **Applications & Services**, **Profile**. No
"start a new service" or intake flow of any kind — today, every
`applications` row is created only by staff converting an enquiry
(`convertEnquiry` in `staff.js`). This is the main structural gap Phase 2
needs to fill for "how customers select a service and complete a
questionnaire."

### Service taxonomy
`applications.service_slug` is one of 16 fixed strings (defined in
`worker/src/routes/enquiries.js` `SERVICE_SLUGS`, kept in sync by hand
with `src/contact.njk`). **There is no existing mapping between a
`service_slug` and a BI form** — `IMPLEMENTATION_ROADMAP.md` classifies
forms by BI code/tier only. Phase 2 needs to create this mapping; see
§2.1 and §2.8.

### Instant checkout
Confirmed by a repo-wide search: **no instant-checkout or payment-gateway
feature exists anywhere live.** "Instant checkout" appears only inside
`bi-forms-library`'s own planning docs as a provisional label. This
matches your standing instruction and nothing here changes that —
instant-checkout stays unapproved and unbuilt until you separately
approve it per service.

## 2. Proposed Phase 2 architecture

### 2.1 Service selection + six-language questionnaire
- New, additive column: `applications.bi_form_id TEXT NULL` — keeps
  `service_slug` as the existing broad public category untouched;
  `bi_form_id` (e.g. `"CCS-A-CDR-2016"`) is a narrower, optional
  attribute only form-generating applications have.
- New, small, reviewed config (e.g.
  `bi-forms-library/configs/service-mapping.json`) listing, per BI form:
  its eligible `service_slug`(s) and a `clientPortalEnabled` flag,
  separate from `checkoutEligible` (which stays provisional). Nothing is
  flagged enabled until you approve that form's activation, per the
  roadmap's existing gate.
- New Client Portal entry point, additive to the existing two tabs
  (e.g. "Start a New Service"), listing only services whose mapped form
  has `clientPortalEnabled: true`.
- Selecting a service loads that form's `questionnaire.json` (already
  built in Phase 1) and renders it generically from the schema — no new
  per-form UI code as more forms are migrated. Field/question labels
  come from the engine config's own `labels.*`; the engine's language
  codes are first reconciled to the site's real canonical codes (§1).

### 2.2 Conditional questions, repeatable records, drafts, document uploads
- Conditional/repeatable logic is already fully specified by each form's
  `questionnaire.json` (`showIf`, `repeatable-group`) — the portal
  renderer interprets it generically, mirroring how `field-bindings.js`
  already does server-side. No new logic is invented; the renderer is a
  second consumer of a schema Phase 1 already built and tested.
- New table `bi_form_drafts` (`id`, `client_id`, `application_id NULL`,
  `bi_form_id`, `answers_json`, `updated_at`) — additive, follows the
  schema's existing conventions (`TEXT PRIMARY KEY`, no `CHECK`
  constraints, validation in Worker code). `application_id` is nullable
  until first submitted, the same pattern already used by
  `conversations.application_id`.
- Required-document uploads reuse `document_requests`/`documents` and
  `routes/documents.js` **unchanged** — a form's config can declare which
  supporting documents it needs, and new glue code auto-creates the
  matching `document_requests` rows when a form-linked application is
  created, instead of staff typing each one in by hand. This is new glue
  code only, not a new storage or upload mechanism.

### 2.3 Staff review, staff-controlled fields, approval
- A new "BI Form" card on the existing `viewApplication` staff page,
  showing the customer's submitted answers read-only, plus a form for
  exactly the fields the form's `coordinate-map.json` marks
  `suppliedBy: "staff"` — the same "staff fills in a form, submits"
  pattern already used for status/documents/payments in that file, not a
  new one.
- "Approve" calls the engine (as a library, not a subprocess — §2.4) to
  produce both PDFs, stores them, and advances the application's status.
  Whether that's an existing `STATUS_OPTIONS` value (e.g. `completed`) or
  a new one needs your decision — see §5. Note `STATUS_OPTIONS` is
  currently duplicated by hand in `clientLocaleStrings.js` **and**
  `portal-app.js` with an explicit comment that they must be kept in
  sync manually; any new value touches both.
- The generated customer preview follows the exact same draft → explicit
  Publish gate as everything else client-visible in this system — staff
  confirms before a client ever sees it, never automatic.

### 2.4 The shared engine generates both PDFs
- The engine (`bi-forms-library/engine/`) is plain Node.js + `pdf-lib`
  today, **except** its raster step shells out to `pdftoppm` (a native
  binary), which cannot run inside a Workers isolate. This is the one
  real architectural problem Phase 2 must solve — not assumed away.
- Everything else (`field-permissions.js`, `render-pipeline.js`'s
  `pdf-lib` document assembly, `validate.js`'s audits, the fail-closed
  schema/consistency checks) is plain JS and needs no rewrite to run in
  a Worker — only the raster backend is in question, and it was already
  built pluggable in Phase 1 (`lib/raster/index.js`'s `BACKENDS` map)
  specifically for this reason.
- Generated PDFs are stored in the existing `CLIENT_FILES` bucket under a
  new key prefix (e.g.
  `clients/<clientId>/applications/<applicationId>/bi-forms/<formId>/{staff,customer-preview}.pdf`),
  tracked as new rows in the existing `documents` table, streamed back
  only through the existing `streamObject()` — never a new access path.

### 2.5 Production-compatible rendering approach for Cloudflare
Phase 1's local POC found the screenshot route accurate and the direct
`page.pdf()` export route mis-paginated. Extending that with the real
integration requirements for Phase 2:

- **Option A — Cloudflare Browser Rendering.** Requires a new
  `browser_rendering` binding in `wrangler.toml` (not present today) and
  the `@cloudflare/puppeteer` package as a new Worker dependency. Per
  Cloudflare's own published limits (already researched in Phase 1):
  Free tier is 10 min/day, 3 concurrent browsers, 1 new instance/20s;
  **Browser Rendering itself requires the Workers Paid plan** — this is a
  real recurring cost floor regardless of actual BI-forms volume, not
  conditional on usage. Paid tier then includes 10 hrs/month browser time
  and 10 concurrent browsers, billed at $0.09/hr and $2/extra concurrent
  beyond that.
- **Option B — Pre-rendered templates + WASM compositing**, the
  fallback already flagged in Phase 1's POC report: rasterize each
  approved blank region once, offline, store as static PNGs in R2, and
  composite customer data onto them at request time with a
  Workers-compatible WASM image library (e.g. the `resvg`/`photon`
  family), then embed via `pdf-lib` (already Workers-compatible). No
  Paid-plan floor, no browser automation, no new per-hour cost — but
  requires re-implementing the font-fit/centering logic already proven in
  `pdf-fields.js` against a different library's API, and was not
  prototyped in Phase 1.
- **Option C — external rendering service**, not previously considered:
  keep Poppler exactly as-is, running on a small always-on
  non-Cloudflare host (e.g. a small VM/container service), called by the
  Worker over HTTPS. Avoids both the Paid-plan floor and a WASM
  rewrite, at the cost of a second piece of infrastructure outside
  Cloudflare with its own hosting bill, patching, and uptime burden.
- **No recommendation is finalized here** — Phase 1 only recommended
  Browser Rendering provisionally, explicitly pending real integration
  review, which is what this is. The right choice depends on your actual
  expected volume and current Cloudflare plan tier, both business facts
  I don't have access to (see §5, Decisions needed).

### 2.6 Secure handling of submissions and uploads
No new auth, upload, or storage mechanism — this reuses what already
exists end to end:
- Customer flows: `getSessionClient` / magic link, unchanged.
- Staff flows: `requireStaff` / Access, unchanged.
- Required-document uploads: `readAndValidateUpload` /
  `CLIENT_FILES.put`, unchanged.
- Questionnaire answers (free-text PII) stored as JSON in D1, consistent
  with how `enquiries.description` and `communication_messages.source_text`
  already store free-form client text today — not a new class of data
  risk, just a new table holding the same kind of thing.
- Generated PDFs: same "Worker is the only thing that ever touches R2,
  no public bucket, no presigned URLs" rule already stated as a hard
  invariant in `storage.js`, applied without exception to BI-form PDFs.

### 2.7 Strict server-side permissions — no customer access to staff PDF/BI-only content
Phase 1 solved this at the *document* level (fail-closed field
ownership, secure reconstruction, non-recoverability audits proven
against actual boundary-expansion attacks). Phase 2's job is making sure
the *delivery path* doesn't reopen it:
- A new, explicit `documents.kind` value (or equivalent) distinguishing
  `staff_pdf` from `customer_preview`.
- A new, additive check in the download path: a request authenticated as
  a **client** must be refused a `staff_pdf` row outright, regardless of
  application ownership — enforced in Worker code as defense in depth,
  not merely relied upon because the customer preview is already
  provably safe if it ever leaked.
- Only Access-gated staff requests can ever retrieve a `staff_pdf`.

### 2.8 Assigning forms through the Client Portal, separate from instant checkout
Two genuinely separate paths, never conflated:
- **(a) Staff-assigned** (what Phase 2 builds): staff, reviewing an
  enquiry or application, decides a BI form applies and assigns it —
  creating the `bi_form_id`-linked application/draft and notifying the
  client (reusing the existing notification-email pattern) to complete
  the questionnaire in the portal. This is the only path needed for the
  three validated forms, since none has instant-checkout approval.
- **(b) Instant checkout** (future, not built here): a customer
  self-selects a form from a public catalogue with no staff step first.
  This needs its own pricing/payment-gateway work (`payment_requests` is
  manual QR Ph only today — no gateway exists) and your explicit
  per-service approval. Phase 2 keeps (a) fully independent of (b) so
  nothing about building (a) presumes or half-builds (b).

### 2.9 Integrating without duplicating or disrupting existing workflows
- Every schema change is additive (new nullable columns/tables), matching
  every migration since `0002`.
- Enquiry→application conversion, messaging, payments, and the
  translate/publish gate are reused unmodified. A BI-form application is
  an ordinary row in `applications` — visible in the existing staff
  "Applications" list and the existing client "Applications & Services"
  tab, not a parallel system.
- The only genuinely new staff surface is the "BI Form" card on an
  existing application page; the only genuinely new client surface is
  the "Start a New Service" entry point and the questionnaire renderer.

### 2.10 Staged implementation and testing plan
0. **This document** — architecture approval only.
1. **Schema**: draft the additive migration (`bi_form_drafts` table,
   `applications.bi_form_id`, `documents.kind`) as a reviewed `.sql` file,
   not applied to production until you approve it — same review-before-
   apply pattern already used for every existing migration.
2. **Engine-as-library**: make the engine callable as a plain function
   from Worker code (no CLI subprocess) — buildable and testable locally
   against Poppler first, independent of the §2.5 decision, since only
   the raster backend changes between local and production.
3. **Staff Portal "BI Form" card** first (read answers, staff fields,
   generate, approve) — lowest risk, since it's entirely behind Access
   with no new customer-facing surface, and lets staff start using
   generated PDFs even before the Client Portal intake flow exists.
4. **Client Portal questionnaire renderer** + draft saving + document
   uploads — limited at first to the three validated forms only.
5. **Production rendering backend**, per whichever §2.5 option you pick,
   deployed to a new, reviewed staging Worker environment (none exists
   today) before touching the production route.
6. **Go-live**, one form at a time, each gated by your explicit
   per-form activation approval (reusing the roadmap's existing gate).
   At every stage: extend `bi-forms-library/tests/run-all.js` rather than
   building a second suite, and add Worker-side tests before stage 2 is
   considered done (none exist today — a real, pre-existing gap, not one
   Phase 2 introduces but one it inherits).

## 3. Dependencies

- A reviewed D1 migration (additive only) — see §2.10 stage 1.
- **If** Browser Rendering (§2.5 Option A): a new `browser_rendering`
  binding, the `@cloudflare/puppeteer` npm package, and confirmation the
  Cloudflare account is (or will be) on the Workers Paid plan.
- **If** external rendering service (§2.5 Option C): a new hosting
  account entirely outside Cloudflare, with its own credentials.
- **If** WASM compositing (§2.5 Option B): a new Workers-compatible
  image/raster library dependency, not yet selected or evaluated.
- No new engine dependency is anticipated beyond Phase 1's `ajv`/`pdf-lib`
  for stages 1-4.

## 4. Costs

- Browser Rendering: Workers Paid plan floor (~$5/mo base, likely needed
  regardless at FIS's probable D1/R2 usage growth) plus genuinely
  usage-dependent charges per the published limits in §2.5 — likely small
  at a handful of forms/day, but not zero, and **not enabled by this
  document**.
- External rendering service: a small always-on VM/container typically
  runs on the order of $5-10/mo (a ballpark, not a quote) plus ongoing
  patching/uptime responsibility Cloudflare's managed options avoid.
- WASM compositing: no new recurring cost, only engineering time to
  reimplement the rendering step.
- No other new recurring cost identified — D1/R2/Workers AI usage for BI
  forms adds to already-existing bindings, not a new paid product.

## 5. Risks and decisions needed from you

1. **Raster backend (§2.5)**: I can't respons‑ibly pick between Options
   A/B/C without knowing your real expected form volume and current
   Cloudflare plan tier — both business facts outside this repo.
2. **Client Portal app shell is English-only today.** Genuinely
   multilingual questionnaire completion needs i18n work on the portal
   shell itself (tab labels, status labels, buttons) in addition to
   per-form field labels — bigger than just "translate the
   questionnaire," and not scoped by any existing document. Confirm
   this is in Phase 2's scope, or should be split out.
3. **New application status value(s)** for the BI-form approval
   lifecycle — if needed, touches the two hand-duplicated
   `STATUS_OPTIONS` copies (`clientLocaleStrings.js` and
   `portal-app.js`); I'd rather you see the exact proposed values before
   I add them.
4. **No Worker test suite exists today.** Confirm whether building one
   (at least for the new BI-forms routes) is in scope for Phase 2's
   "testing plan," since inspection found none exist to extend.
5. **Service ↔ BI-form mapping (§2.1)**: I have not pre-assigned the
   three validated forms to specific `service_slug` values — that's a
   business judgment (which of the 16 existing services each form
   belongs under), not a technical one, and I'd rather propose candidates
   for your confirmation than decide it unilaterally.
6. **Real-data-safe testing**: Phase 1's non-recoverability guarantees
   were proven against fictional data only. Phase 2 needs an explicit
   rule — synthetic-but-representative test data only, never actual
   customer submissions — before any form goes live; confirm you want
   this formalized as an explicit policy before Stage 6.

## 6. What this document does not do

No code was written beyond what already exists. No `wrangler.toml`, D1
migration, Worker route, or frontend file was created or modified. No
Cloudflare resource was created or changed. No paid service was enabled.
Nothing was deployed. Awaiting your review before any implementation
begins.
