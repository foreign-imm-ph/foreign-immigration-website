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

## Deployment Approval Request

The integrated FIS release is ready. Phases 1–4 are complete: the baseline
was re-confirmed, a full visual/navigation review across every required page
found the design already fully unified (zero corrective changes were
needed), the existing 249 worker tests and 16 Playwright journeys pass fresh,
and the migration/deployment sequence above has been assessed for backward
compatibility.

**Do you authorize the production deployment described above** — applying
migrations `0009`–`0013` to the live D1 database, deploying the current
Worker code, and merging the relevant static-site changes to `main` for
GitHub Pages — on the understanding that the catalogue goes live empty and
no offering, QR Ph image, or Airport VIP package is activated without your
separate approval?
