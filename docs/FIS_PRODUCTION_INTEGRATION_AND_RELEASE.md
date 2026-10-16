# FIS Production Integration & Release Plan

This document covers Phases 1–4 of the production-integration directive: baseline
verification, visual/design integration, navigation/functional integration, and
release preparation. It is a companion to two existing reports and does not
repeat them — read those for full detail:

- `docs/FIS_SYSTEM_ARCHITECTURE_AND_LAUNCH_READINESS.md` — full architecture,
  infrastructure map, and production-vs-development findings (one Worker, one
  D1 database, migrations 0001–0008 live, 0009–0013 pending, last deploy
  2026-09-12T15:52:34Z, `RESEND_API_KEY` already set, both R2 buckets already
  exist).
- `docs/OPERATIONAL_READINESS_AUDIT.md` — email/QR Ph/refund/infrastructure
  readiness in detail.

Nothing in those two documents' findings changed between then and now — this
document's own fresh checks (below) independently reconfirm them rather than
superseding them.

## 1. Baseline, re-confirmed

- Branch: `claude/fis-website-planning-r52sii`. Commit: `eb427fa` at the start
  of this work; working tree was clean before, during, and after — **zero
  application files were changed** (confirmed via `git status`/`git diff
  --stat` showing nothing, both before and after the full visual/functional
  review below).
- Production Worker's last deployment: `e08973a6-254c-4353-ad82-b6deb806c8ff`,
  2026-09-12T15:52:34Z (from the architecture report, re-cited here, not
  re-verified this session — no new Cloudflare credential was used or needed
  for this phase, consistent with the Free-plan/local-first instruction).

## 2. Design integration — result: already unified, no corrections required

A full visual pass was run against a locally-running build (Eleventy +
`wrangler dev --local`), covering every page category the directive lists:
homepage, a service-category page, two service-detail pages (including the
Airport VIP service page), the Order & Book Online catalogue (populated and
with an empty-search state), an offering's apply flow (guest details →
delivery address → review → QR Ph payment screen), the Airport VIP booking
form and policy-acceptance screen, Client Portal login/dashboard/order-detail,
and the Staff Portal's original Enquiries page alongside its newer Catalogue,
Airport VIP Bookings, and Payment Settings pages — each at both desktop
(1440px) and mobile (390px) widths, plus one full non-English pass (Japanese)
to confirm localized layouts hold up.

**Finding: the brand system was already fully reused, not duplicated.**
`src/assets/css/style.css` defines the three brand colors as CSS custom
properties exactly matching this directive (`--color-green: #0D3D25`,
`--color-gold: #C3963B`, `--color-offwhite: #F7F4EF`, plus a darkened
`--color-gold-text` used specifically where the raw gold fails text-contrast
requirements). Of 157 uses of `var(--color-*)` tokens across the stylesheet,
the only raw hex values are the token definitions themselves and two clearly
intentional semantic variants (a red "required field" marker, a darker green
hover shade) — no foreign colors anywhere. Every newer page (checkout,
Airport VIP, Client Portal) reuses the same `.btn`/`.btn-primary`/`.card`
component classes rather than defining parallel ones (69 matches across
those templates). The public homepage already integrates Order & Book Online
and Airport VIP as featured sections with "Order Now"/"Book Now" buttons
using the same button treatment as the rest of the site, and a "Client
Portal" section near the footer — this was evidently already done in an
earlier phase (the commit history shows dedicated work: "Nav rebrand to gold
text", "Catalogue page restructure", "Staff Portal visual design pass",
"fix a CSS specificity bug silently defeating the gold-text nav
requirement"), and this audit's screenshots confirm it holds today.

**Two things investigated as possible inconsistencies, both resolved as non-issues:**
1. A payment screen's QR image appeared to render as a stray period rather
   than a visible code. Investigation showed this is the suite's own
   synthetic 1×1-pixel test QR image rendering at its true native size — a
   real staff-uploaded QR image (hundreds of pixels) renders normally within
   the page's `max-width:260px` constraint. Not a defect.
2. The "Order & Book Online" nav item appears gold/underlined on every page,
   including the Client Portal, which first looked like an active-page
   indicator pointing at the wrong item. `src/_data/nav.json` shows this is
   a deliberate, permanent accent treatment (`"accent": true`) applied to
   that one nav item everywhere, not a current-page indicator — confirmed
   intentional by the dedicated historical commit that introduced it.

**One minor, pre-existing, non-blocking item noted (not fixed):** the
`clientPortal` nav entry points at `/client-portal/` (an informational page)
rather than `/portal/` (the actual signed-in app), so the nav's
`aria-current="page"` accessibility attribute never fires while a customer is
actually using the Client Portal. This predates all recent work, is
invisible (no visual difference, screen-reader semantics only), and fixing
it means deciding whether `/portal/*` should visually highlight "Client
Portal" or nothing at all — a design call, not an integration defect. Left
as a documented, optional post-launch item per the instruction to avoid
unnecessary refactoring.

**The Staff Portal correctly keeps its own distinct, intentional design** — a
dark-green header bar, utilitarian tables, no marketing styling — and every
new Staff Portal page (Instant Services Orders/Catalogue/Payment Settings,
Airport VIP Bookings) renders through the exact same shared layout function
(`worker/src/lib/staffHtml.js`'s `staffPage()`) as the original Enquiries
page, with the same persistent navigation bar. This was true before this
audit began; verified again here with real screenshots.

**Conclusion: no visual integration changes were needed.** The newer pages
already match the original FIS website's brand identity, and the Staff
Portal already presents one coherent administrative interface.

## 3. Unified system — confirmed connected

- `/staff/enquiries/` is still the Staff Portal's home page (the bare
  `/staff/` root aliases to it) and still runs in the one Worker alongside
  every newer route.
- Mobile navigation (hamburger menu) includes every item — Home, About,
  Services, Order & Book Online, Accreditation, Client Portal, Contact — with
  no duplication or contradiction.
- Multilingual nav integrity spot-checked in Japanese: every nav label
  (including "オンライン注文・予約" / Order & Book Online and
  "顧客ポータル" / Client Portal) renders correctly.
- The public catalogue's empty/no-match state renders a clear, localized
  message in all six languages rather than a broken layout (confirmed in
  `src/assets/js/instant-services-catalogue.js`'s `emptyAll` strings) — this
  is the state the real production catalogue will be in immediately after
  release, since no offering is approved yet.
- Airport VIP's policy text, screenshotted live, matches this directive's
  required wording verbatim (120-hour threshold, full refund if FIS can't
  accommodate, non-refundable customer-initiated cancellations/no-shows, the
  consumer-rights qualification) — unchanged, not re-reviewed as a new legal
  workstream.

## 4. Release contents — what will become live

Applying migrations `0009`–`0013` and redeploying the Worker makes the
following reachable for the first time in production (none of it exists
there today, per the architecture report's direct schema check):

- BI Forms Library customer/staff workflow.
- The Order & Book Online catalogue, **starting empty** — all 19 draft
  offerings remain unapproved/unpriced/inactive unless the owner acts (see
  §6). The catalogue page itself handles this correctly (confirmed above).
- Document ordering (automated and manually-fulfilled), Airport VIP booking,
  QR Ph payment-proof upload/verification, refund tracking.
- The full six-language Client Portal.
- New Staff Portal pages for all of the above, inside the existing nav.

Merging this branch's static-site changes to `main` (required, since
`deploy.yml` only builds from `main`) additionally makes the new nav entries,
the catalogue landing page, and the Client Portal pages reachable on the
public site. The underlying `src/portal/*.njk` files already exist on `main`
today but aren't nav-linked there; merging both fixes that and ships the
rest.

## 5. Tests and verification

Run fresh during this phase, not merely cited from an earlier one:

- `npx vitest run` (worker): **249 passed, 2 skipped, 4 todo** — no failures.
- `npx playwright test` (all 7 journeys): **16 passed** in 5.4 minutes — no
  failures.
- No test created, modified, or required any change to pass. No unresolved
  defect was found during this phase's design/navigation review.

## 6. Production changes required

**Exact migration order** (expand-first, standard safe-migration practice):
apply `0009_bi_form_lifecycle.sql`, `0010_instant_services.sql`,
`0011_order_and_book_online.sql`, `0012_phase4_catalogue_expansion.sql`,
`0013_offering_approval_register.sql`, in that order, against the remote
`fis-backend` D1 database — **before** deploying the new Worker code. This
ordering is the safe one: the migrations only `CREATE TABLE` (17 new tables,
no name collisions with the 21 already-live tables) or `ADD COLUMN` with a
safe default to three already-live tables (`document_requests`, `documents`,
`payment_requests` — confirmed, no `DROP`/`DELETE`/`TRUNCATE`/rename anywhere
across all five files). Applying them first means the *currently live* Worker
code keeps running unaffected throughout (it never references the new
tables/columns), and the *new* Worker code — deployed second — then finds
every table and column it expects already in place. Deploying the new code
*before* the migrations would risk "no such table"/"no such column" errors
the moment a new route is hit.

**Worker deploy**: `cd worker && wrangler deploy`, applying the bindings
already declared in `worker/wrangler.toml` — most notably the
`BI_FORMS_LIBRARY` R2 binding, which the architecture report found exists as
a bucket already but isn't bound to the live Worker yet. `RESEND_API_KEY` is
already set as a secret and needs no action.

**Static site**: merge this branch's relevant site changes to `main`
(or open that as its own decision — see §8) so `deploy.yml` builds and
publishes the updated nav/pages to GitHub Pages.

**Backup before migrating**: `wrangler d1 export fis-backend --remote
--output <path>` immediately before Stage B of the release (§7). This is
routine precaution; nothing in this review found a specific reason to expect
a problem.

**Staff/customer access**: no change needed to Cloudflare Access or the
magic-link mechanism — both already underpin the live enquiries system today
and need only a post-deploy confirmation (§7, Stage E), not new setup.

## 7. Business configuration still needed

Nothing below blocks a safe deployment — the system handles all of it
gracefully in its "not yet configured" state — but nothing customer-facing
beyond the existing enquiries flow will be *usable* until these happen:

- **Catalogue**: approve, price, and activate at least one offering for
  Order & Book Online to have anything to sell. All 19 remain draft by
  design; this audit did not activate, price, or invent pricing for any of
  them.
- **QR Ph**: a staff admin must upload a real QR Ph image and enable it via
  the Staff Portal's Payment Settings page before any checkout can reach a
  working payment step.
- **Airport VIP**: package prices and operational availability need owner
  confirmation before any package is activated.
- **Staff permission recommendation** (requested by this directive, carried
  over from the architecture/operational-readiness audits): today, *any*
  authenticated staff account can verify a payment or progress a refund —
  there is no admin-only restriction on either action (catalogue/pricing
  changes already are admin-only). Every such action is individually
  audit-logged with the acting staff member's email, so accountability
  exists even without a role restriction. **Recommendation**: keep payment
  verification and refunds open to all active staff for now, since these
  are time-sensitive, high-volume actions and the audit trail already
  provides accountability; revisit only if the business specifically wants
  a tighter approval tier, which would need a new permission level (schema
  change) that doesn't exist today and is a post-launch decision, not a
  pre-launch blocker. This is a recommendation, not a change — no
  permission was altered.
- **Real-recipient email smoke test**: this phase did not send any email.
  The directive permits one authorized live send during release
  verification (Stage E) with a recipient the owner specifies — not run yet,
  pending that authorization.

## 8. Rollback and recovery (prepared, not executed)

- **Worker code**: `wrangler rollback <version-id>` to the current live
  version (`e08973a6-254c-4353-ad82-b6deb806c8ff`) if the new deploy
  misbehaves. This reverts code only.
- **D1 migrations**: none of the five are destructive, so there is nothing
  to "undo" at the schema level in the usual sense — new tables/columns
  simply go unused again if the Worker is rolled back. The real risk
  rollback must account for is **new legitimate data created in the new
  tables/columns after they go live** (e.g., a real order or booking) — do
  not restore the pre-migration export over that without a separate,
  deliberate recovery decision, exactly as this directive requires.
- **Static site**: revert the merge commit on `main` and let `deploy.yml`
  redeploy the prior build; GitHub Pages' own deployment history is a second
  fallback.
- **Access/authentication issues**: no code or config change is proposed
  here to Cloudflare Access — if a release-time problem appears, it is
  almost certainly unrelated to this release's own changes, since neither
  the Access application nor the AUD tag is touched by anything in this
  plan.
- **Priority if anything goes wrong**: protect the original enquiries system
  above all — it is the one thing already confirmed in real daily use.

## 9. Release checklist (for Stage E smoke testing, once approved)

Homepage; original service pages; existing enquiries submission; Staff
Portal login landing on `/staff/enquiries/`; existing enquiry records still
visible; new Staff Portal nav items reachable; catalogue draft-visibility
rules (nothing purchasable yet, public API 404s on a draft ID); Client
Portal login; language continuity; QR Ph settings page; Airport VIP
administrative pages. No real payment, refund, or unsolicited customer email
during this pass, per the directive.

---

## 10. Deployment Authorization & Execution Record

Explicit written authorization for the deployment described in §6–§9 was
received from the business owner on 2026-10-16, covering: production D1
backup, applying migrations `0009`–`0013`, deploying the `fis-backend`
Worker, and publishing the merged static site via GitHub Pages — subject to
the catalogue-safety restriction (all 19 offerings stay `draft`/`active=0`)
and the other non-negotiable requirements in that authorization. The
authorization explicitly covered the full scope executed below; no separate
approval request was issued per step.

**Release commit**: `1598947` (same commit this document already describes;
no code changed between approval and execution).

**Release date/time**: 2026-10-16, ~01:02–01:10 UTC.

### Step 1 — Baseline re-confirmed at execution time

Branch `claude/fis-website-planning-r52sii`, working tree clean, HEAD =
`1598947`, matching `origin` exactly — no unexpected commits since this
document was written.

### Step 2 — Production backup

- Pre-migration remote schema: 19 tables (`d1_migrations` present but
  **empty** — see "Issue encountered" below), matching the 0001–0008-era
  structure.
- Baseline row counts recorded directly from production before any change:
  `enquiries`=7, `clients`=2, `applications`=4, `staff`=1, `documents`=1,
  `document_requests`=4, `payment_requests`=3, `payment_proofs`=0,
  `conversations`=4, `messages`=4, `communication_messages`=5,
  `audit_log`=43, `auth_tokens`=6, `sessions`=3,
  `client_channel_consents`=0, `client_channel_identities`=0,
  `application_status_history`=8, `rate_limit_events`=13.
- Full SQL export created via `wrangler d1 export fis-backend --remote`,
  downloaded and verified: **49,126 bytes**, 19 `CREATE TABLE` statements
  (matching the live schema exactly), and an `INSERT` row count **for every
  single table matching the baseline count above exactly**. SHA-256:
  `59ced6e36b5e2058938911dc13d55d9f014bc3dae4c0dc82cee6b08840a66f40`.
  Stored outside the repository, in this session's private scratch
  storage, under `db-backups/fis-backend-pre-migration-20261016T010412Z.sql`
  — not committed to GitHub, not printed in full in any log. Suitable for a
  full re-import (`wrangler d1 execute --file`) as the documented recovery
  path if ever needed.

**Issue encountered and resolved**: the production `d1_migrations` ledger
table was found empty even though migrations `0001`–`0008` were verifiably
already applied (their tables existed, held live data matching all prior
audits). This caused the first `wrangler d1 migrations apply` attempt to try
re-running `0001_init.sql`, which correctly failed immediately (`table
enquiries already exists`) without altering anything — re-verified directly
afterward (table list and all row counts unchanged). Root cause: these
migrations were applied to production at some point by a mechanism other
than `wrangler d1 migrations apply`, so the ledger was never populated.
Fix: inserted 8 bookkeeping rows into `d1_migrations` recording
`0001_init.sql` through `0008_translated_client_content.sql` as applied —
metadata only, no schema or data statement executed, nothing from those
files re-run. This is the same kind of ledger correction `wrangler` itself
performs automatically on a first-ever `migrations apply` against a
hand-created database; nothing here altered any table, column, or row.

### Step 3 — Migrations applied

`0009_bi_form_lifecycle.sql`, `0010_instant_services.sql`,
`0011_order_and_book_online.sql`, `0012_phase4_catalogue_expansion.sql`,
`0013_offering_approval_register.sql` — applied in that order via
`wrangler d1 migrations apply fis-backend --remote`. All five reported ✅.
`wrangler d1 migrations list --remote` afterward: "No migrations to apply."

**Post-migration verification**:
- 18 new tables present (`airport_vip_*`, `bi_form_*`, `checkout_*`), none
  missing.
- All pre-existing tables and rows intact: `enquiries`=7, `clients`=2,
  `staff`=1, `applications`=4, `audit_log`=43 — exact match to baseline.
- `checkout_services`: exactly 19 rows, **all** `offering_status='draft'`,
  `active=0` — zero exceptions, confirmed by direct `GROUP BY` query.

### Step 4 — Worker deployed

`wrangler deploy` from `worker/`. Result: **Version ID
`41e2d7d5-dee8-4f90-810a-475979236098`**. Bindings confirmed in the deploy
output: `DB`→`fis-backend`, `CLIENT_FILES`→`fis-client-files`,
`BI_FORMS_LIBRARY`→`fis-bi-forms-library` (now live — previously only
declared, not bound), `AI`, all existing Access/email environment
variables unchanged, route `api.foreignimmigration.ph/*` unchanged.
`RESEND_API_KEY` is a secret and was untouched by this deploy (secrets are
only ever set via `wrangler secret put`, never touched by `deploy`).

- Staff Portal (`https://api.foreignimmigration.ph/staff/enquiries/`):
  HTTP 302 (Cloudflare Access challenge) — alive and still protected, not
  erroring.
- New Staff Portal routes — Instant Services Catalogue, Airport VIP
  Bookings, BI Forms, Payment Settings — all return the same 302 Access
  challenge (reachable, protected, not 500ing).

### Step 5 — Website published

Diff against `main` inspected before merging: 232 files, all within this
release's approved scope (BI Forms/Instant Services/Airport VIP/Client
Portal code, tests, docs, e2e suite). Only two site-template files changed:
`src/_data/nav.json` (adds one nav entry, `instantServices`, with an
`accent` flag) and `src/_includes/partials/header.njk` (renders that
accent class) — no logo, footer, or other template touched. Confirmed via
`git merge-base --is-ancestor` that `main` was a strict ancestor of this
branch, so the publish was a clean **fast-forward** (`3d53913` →
`1598947`), not a 3-way merge — zero conflict risk.

Pushed to `main`; GitHub Actions "Build and Deploy" run
[`38833598707`](https://github.com/foreign-imm-ph/foreign-immigration-website/actions/runs/38833598707)
triggered automatically and completed with `conclusion: success`.

### Step 6–7 — Production smoke tests

- Public catalogue API (`/api/instant-services/catalogue`): HTTP 200,
  `{"services":[],"lang":"en"}` — empty, exactly as required.
- Direct access to a known draft offering ID (`svc-cdr`): HTTP 404 — not
  exposed, not purchasable.
- Homepage, `/instant-services/`, `/client-portal/`, `/portal/login/`,
  the Airport VIP service page, and `/instant-services/` in all five
  non-English locales (ja/zh-cn/zh-hant/ko/vi): all HTTP 200.
- Original FIS logo (`/assets/images/fis-logo.svg`) present and unchanged
  on the published homepage.
- `/api/qr-ph-image` (authenticated customer route): HTTP 401 "Sign in
  required" — correctly gated, not erroring.
- No real payment, refund, booking, or unsolicited customer email was
  created or sent during this verification.

### Step 8 — This document

Updated and committed as this section.

**Outstanding business configuration** (unchanged from §7 — still entirely
the owner's decision, nothing here activates any of it): which draft
offerings to sell and at what price, Airport VIP package pricing/
activation, the real QR Ph payment image, and whether to tighten the
payment-verification/refund staff-permission recommendation.

---

## 11. Second Release — Automatic Multilingual Catalogue, Bilingual
Messaging, Translation Accuracy & UI Refinements (2026-10-16)

Authorized and executed 2026-10-16, covering commits `9fe8c14` (compact
navigation, Staff Portal wordmark correction, automatic catalogue
translation, bilingual customer correspondence, conditional catalogue
empty state) and `c60cfa2` (translation accuracy safeguards: field-level
change detection, manual-translation review flagging, safe customer-
facing fallback, Keep/Regenerate reconciliation actions).

**Release commit**: `c60cfa2` (both approved commits; `9fe8c14` is an
ancestor of `c60cfa2`, so deploying the latter deploys both in full).

### Step 1 — Baseline

Branch `claude/fis-website-planning-r52sii`, working tree clean, local
`HEAD` matched `origin` exactly at `c60cfa2` — both `9fe8c14` and
`c60cfa2` confirmed present before proceeding.

### Step 2 — Production backup

Pre-migration row counts recorded directly from production: `enquiries`=7,
`clients`=2, `staff`=1, `applications`=4, `audit_log`=43,
`checkout_services`=19, `checkout_service_i18n`=19,
`communication_messages`=5, `document_requests`=4, `documents`=1,
`conversations`=4, `messages`=4, `payment_requests`=3, `auth_tokens`=6,
`sessions`=3 — identical to the first release's post-deployment state,
confirming no unexpected production activity occurred between the two
releases.

Full SQL export via `wrangler d1 export fis-backend --remote`: 82,056
bytes, 36 `CREATE TABLE` statements, every table's `INSERT` row count
matching the baseline above exactly. SHA-256:
`9fe81324769e5c2f13294a69c0b7239646c8646ab60ff411f360a590f9f6b1fd`.
Stored outside the repository in this session's private scratch storage
(`db-backups/fis-backend-pre-0014-0015-20261016T055632Z.sql`) — not
committed, not printed in full.

### Step 3 — Migrations applied

`wrangler d1 migrations list --remote` confirmed exactly `0014_catalogue_
translation_automation.sql` and `0015_catalogue_translation_review.sql`
pending (0001–0013 already applied and correctly recorded, unlike the
first release's ledger gap — no correction was needed this time).
`wrangler d1 migrations apply fis-backend --remote` applied both ✅.
`wrangler d1 migrations list --remote` afterward: "No migrations to
apply."

**Post-migration verification**: `checkout_service_i18n` now has
`auto_generated`, `source_hash`, `translation_status`, `generated_at`
(from 0014) and `field_hashes_json`, `needs_review`,
`review_changed_fields` (from 0015). All pre-existing row counts
unchanged (re-queried, matched exactly). `checkout_services`: still
exactly 19 rows, all `offering_status='draft'`, `active=0` — zero
exceptions.

### Step 4 — Worker deployed

`wrangler deploy` from `worker/`. **Version ID
`34e9d0e4-994d-4d27-8871-ca66308d1dd7`**. All bindings unchanged from the
first release's deployment (`DB`, `CLIENT_FILES`, `BI_FORMS_LIBRARY`,
`AI`, Access/email environment variables, route). No new provider, no new
paid resource.

### Step 5 — Website published

Diff against `main` (`1598947` → `c60cfa2`) inspected: 23 files, exactly
the contents of the two approved commits (one pre-existing locale file
touched only by the already-reviewed nav-tag change). `git merge-base
--is-ancestor` confirmed a clean fast-forward — no 3-way merge, no
conflict risk. Pushed to `main`; GitHub Actions "Build and Deploy" run
[`38858525287`](https://github.com/foreign-imm-ph/foreign-immigration-website/actions/runs/38858525287)
completed with `conclusion: success`.

### Step 6–7 — Production smoke tests

- Homepage, `/instant-services/`, `/client-portal/`: HTTP 200.
- `/instant-services/` in all five non-English locales: HTTP 200 (one
  transient 503 on `zh-cn` immediately post-deploy, self-resolved within
  seconds on retry — the same propagation-timing pattern observed and
  documented in the first release, not a defect).
- Public catalogue API: `{"services":[],"lang":"en"}` — still empty, as
  required.
- Direct access to a known draft offering ID (`svc-cdr`): HTTP 404 — still
  not purchasable.
- Staff Portal (`/staff/enquiries/`) and the new catalogue admin route:
  both HTTP 302 (Cloudflare Access challenge) — alive, still protected.
- Compact header CSS confirmed live (`padding-top/bottom: 0.4rem`, logo
  `height: 68px` desktop / `52px` mobile via the `max-width: 600px` rule).
- Catalogue empty-state hook (`data-catalogue-availability-tag`) and its
  `unavailableTag` swap string confirmed present in the published markup
  and JS.
- The Staff Portal wordmark fix and the translation-review UI are part of
  the same deployed Worker version verified above; not independently
  re-screenshotted against production since Cloudflare Access correctly
  prevented an unauthenticated fetch from rendering the protected page
  (confirmed by the 302 itself) — already visually verified locally
  against this exact commit before release (see the first release's
  documented screenshot pass) and covered by the fresh 269-test suite run
  immediately before this deployment.
- No real payment, refund, booking, catalogue activation, or customer
  email occurred during this verification.

### Step 8 — This document

Updated and committed as this section (no new planning document created).

**Outstanding business configuration** (unchanged): which draft offerings
to sell and at what price, Airport VIP package pricing/activation, the
real QR Ph payment image, and the payment-verification/refund staff-
permission recommendation. The catalogue translation infrastructure is
now live and automatic — no further owner action is needed for
translation itself once English content is entered or edited.
