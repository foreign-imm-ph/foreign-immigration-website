# FIS Staging Environment -- Proposed Architecture (Plan Only)

**Status: NOT DEPLOYED.** This document is a proposal for owner review and
approval. Nothing in it has been created, deployed, or configured. No
production resource, DNS record, or R2 bucket has been touched while
writing it. See `docs/FIS_SMART_FORMS_HANDOVER.md` for how this fits into
the overall project state.

## 1. What's actually running today (confirmed by reading the repo, not assumed)

- **Customer-facing frontend**: a static Eleventy (11ty) site, built by
  `.github/workflows/deploy.yml` on every push to `main`, deployed to
  **GitHub Pages** (not Cloudflare Pages) at `foreignimmigration.ph`
  (`src/CNAME`). It is 100% public -- no Cloudflare Access gate on it today,
  because customers must be able to browse and order without logging in.
- **Backend API**: a single Cloudflare Worker, `fis-backend`
  (`worker/wrangler.toml`), bound to `api.foreignimmigration.ph/*`. The
  frontend's only connection to it is one hardcoded constant:
  `src/assets/js/portal-config.js` -- `window.PORTAL_API_BASE =
  "https://api.foreignimmigration.ph"`. This is the one line a staging
  frontend build needs to override.
- **Cloudflare Access** already protects `/staff/*` on the API only (see
  `worker/src/lib/staffAuth.js` -- verifies the `Cf-Access-Jwt-Assertion`
  header against `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD`). The public
  marketing site and the Client Portal are deliberately NOT behind Access in
  production. **Staging needs the opposite: everything gated**, since a
  staging copy of the whole site must not be reachable by the public at all
  (requirement 4.1).
- **Data**: one D1 database (`fis-backend`, binding `DB`) and two R2
  buckets -- `fis-client-files` (binding `CLIENT_FILES`, real customer
  uploads) and `fis-bi-forms-library` (binding `BI_FORMS_LIBRARY`,
  confidential BI form originals + preview backgrounds, FIS's own reference
  material, never customer data, Worker-read-only).
- **Email**: `worker/src/lib/email.js` already no-ops safely when
  `RESEND_API_KEY` isn't set (confirmed directly in this session's own
  Playwright run: `Resend send skipped: no RESEND_API_KEY configured`,
  `email_send_failed` surfaced to the caller but nothing crashes). **This
  means requirement 4.4 (no real customer emails) is already satisfied by
  simply never setting that secret on a staging Worker -- no new code.**
- **Payment**: GCash is manual-evidence-upload + staff review, gated by
  `QR_PH.isConfigured()` reading a payment-settings row from `DB`. There is
  no live payment gateway to isolate -- a staging D1 with its own
  payment-settings row (a synthetic QR image, same pattern the e2e suite
  already uses in `e2e/global-setup.js`) is sufficient isolation.
- **Workers AI**: one `[ai]` binding (`AI`), used only for the
  translation provider (`worker/src/lib/translation.js`). This is an
  **account-level** binding, not a per-environment resource like D1/R2 --
  staging and production share the same underlying Workers AI
  account/billing. Low-risk for the low volume of manual staging testing,
  but worth the owner knowing it isn't isolated the way data is.

## 2. Proposed staging architecture

Two new Cloudflare resources, both free-tier, both on default
`*.pages.dev` / `*.workers.dev` subdomains -- **no new DNS records, no
changes to `foreignimmigration.ph` or `api.foreignimmigration.ph`, no new
paid infrastructure** (requirement 4.9):

### 2a. Staging frontend -- Cloudflare Pages project

- New Cloudflare Pages project (e.g. `fis-staging`), connected to this
  same GitHub repo, **building only from
  `claude/fis-website-planning-r52sii`** (or whichever branch is under
  test) -- never from `main`, so this never touches what GitHub Pages
  deploys (requirement 4.8).
- Build command `npm run build`, output directory `_site` -- identical to
  `deploy.yml`'s own build step, just a different destination.
- One line changed in the staging build only:
  `src/assets/js/portal-config.js`'s `PORTAL_API_BASE` must point at the
  staging Worker's URL (2b), not `api.foreignimmigration.ph`. Proposed
  approach: read it from a Pages environment variable injected at build
  time (e.g. an Eleventy global data file reading
  `process.env.PORTAL_API_BASE`), so the exact same source file serves both
  a prod build (defaults to the current hardcoded value) and a staging
  build (overridden per-environment) without hand-editing the file before
  every deploy.
- Resulting URL: `https://fis-staging.pages.dev` (or the auto-assigned
  equivalent) -- no DNS change.
- **Access control**: Cloudflare Pages projects have a native "Enable
  Access policy" toggle in their settings, backed by the same Zero Trust
  team already in use (`still-wave-079c.cloudflareaccess.com`). Turning
  this on and creating one Access policy scoped to the owner's email
  (`catherinelizmorgan@gmail.com`) satisfies requirement 4.1 with zero new
  infrastructure -- it reuses the existing Zero Trust team rather than
  standing up a second one, which also satisfies requirement 4.6 ("preserve
  existing Cloudflare Access protections": the existing `/staff/*`
  application on the production API is never touched).

### 2b. Staging backend -- a second Wrangler environment, same Worker code

Add an `[env.staging]` block to `worker/wrangler.toml` (committed to this
branch, inert until deployed) rather than a second copy of the code:

```toml
[env.staging]
name = "fis-backend-staging"
# No routes = block -- Wrangler leaves this on its default
# fis-backend-staging.<account-subdomain>.workers.dev, so nothing here
# touches api.foreignimmigration.ph or any DNS record.

[[env.staging.d1_databases]]
binding = "DB"
database_name = "fis-backend-staging"
database_id = "<created when approved>"

[[env.staging.r2_buckets]]
binding = "CLIENT_FILES"
bucket_name = "fis-client-files-staging"

[[env.staging.r2_buckets]]
binding = "BI_FORMS_LIBRARY"
bucket_name = "fis-bi-forms-library-staging"

[env.staging.vars]
PUBLIC_SITE_URL = "https://fis-staging.pages.dev"
EMAIL_FROM = "Foreign Immigration Services (STAGING) <portal@foreignimmigration.ph>"
# RESEND_API_KEY deliberately never set for staging -- see section 1.
CF_ACCESS_TEAM_DOMAIN = "still-wave-079c.cloudflareaccess.com"
CF_ACCESS_AUD = "<staging Access app's own AUD, once created>"
```

- Deployed with `wrangler deploy --env staging`, run manually from this
  branch -- never from `main`, never via the existing `deploy.yml` (which
  only builds/publishes the static frontend and has no Worker-deploy step
  at all today).
- **Isolated D1**: a brand-new, empty `fis-backend-staging` database, migrated
  with the exact same `worker/migrations/*.sql` files already used for
  local dev (`wrangler d1 execute fis-backend-staging --remote
  --file=migrations/0001_init.sql`, repeated per file, same as
  `db:migrate:remote` but against the staging DB name) -- never a copy of
  production data (requirement 4.2, 4.3).
- **Isolated R2 for customer files**: a brand-new, empty
  `fis-client-files-staging` bucket. Nothing from production's
  `fis-client-files` is copied into it (requirement 4.3).
- **BI forms library bucket -- one open decision for the owner**: the
  confidential original PDFs and preview backgrounds are FIS's own
  reference material, not customer data, and already Worker-read-only in
  production. Two options, either is defensible:
  - **(a) Share the same bucket** (`fis-bi-forms-library`) as a read-only
    binding on the staging Worker too. Simpler, no duplicate copy of
    confidential originals to manage, and staging is just as
    Access-gated as production's staff routes are. Satisfies requirement
    4.7 ("make the necessary PDF preview backgrounds available securely
    within staging") immediately, with zero new uploads.
  - **(b) A fully separate `fis-bi-forms-library-staging` bucket**,
    populated by copying only the already-generated preview backgrounds
    (not the originals, which staging's automated/live-preview paths don't
    need) from this session's local scratch directory. Stronger
    isolation, at the cost of a second copy of confidential material to
    track and keep in sync.
  - **This plan defaults to (a)** unless the owner prefers (b); either way,
    nothing is uploaded until the owner approves this plan.
- **Payment settings**: once staging is live, configure its QR Ph payment
  settings once via the Staff Portal UI (`/staff/instant-services/payment-settings`)
  using an obviously-synthetic test image and the label "STAGING TEST --
  NOT A REAL GCASH CODE", exactly as `e2e/global-setup.js` already does for
  local dev. This is a manual one-time step after staging is deployed, not
  part of the deploy itself.
- **Access control on the API itself**: a second Cloudflare Access
  self-hosted application, same Zero Trust team, covering
  `fis-backend-staging.<account-subdomain>.workers.dev/*` in full (not just
  `/staff/*` the way production's application does), restricted to the
  same owner email. This matters because a Workers AI binding and a raw
  `workers.dev` hostname are not secret, only obscure -- without this, the
  staging API would otherwise answer any request that happened to find the
  URL.

### 2c. Testing the existing development branch without touching `main`

Both halves of staging (2a, 2b) are deployed FROM the
`claude/fis-website-planning-r52sii` branch directly -- Cloudflare Pages
supports building from a specific non-default branch per project, and
`wrangler deploy --env staging` is just run locally/manually from a
checkout of that branch. Neither action merges anything into `main`, opens
a PR, or affects what `deploy.yml` publishes to the live site (requirement
4.8).

## 3. What the owner can test once staging is approved and deployed

Every item listed in the directive's staging requirements becomes testable
end-to-end against isolated data:
customer-facing website and service catalogue, guided Smart Application
questionnaires, live official-PDF previews (once 2b's BI-forms-library
decision is made), assisted completion, supporting-document uploads, guest
checkout, GCash payment-evidence submission with fictional test
transactions, Client Portal access and messaging, Staff Portal review and
document completion, generated PDF accuracy, and order statuses/fulfillment
workflows -- all against `fis-backend-staging`'s own empty D1 and R2, never
production's.

## 4. Owner-approval steps needed before any of this is created

Nothing below has been done. In order:

1. **Confirm the overall approach** (Cloudflare Pages + a second Wrangler
   environment, both on default subdomains, no DNS changes) is acceptable,
   or redirect to a different approach.
2. **Decide the BI-forms-library bucket question** (2b: share the existing
   bucket read-only, or duplicate backgrounds into a separate staging
   bucket).
3. **Approve creating** the new Cloudflare Pages project, the new D1
   database, the two new R2 buckets (or one, per decision 2), and the new
   Cloudflare Access application -- each of these is a real resource
   creation in the Cloudflare account, not covered by this session's
   existing "commit and push to the development branch" authorization.
4. **Approve running** `wrangler deploy --env staging` and the D1 migration
   commands against the new staging database.
5. After staging is reachable and owner-tested to satisfaction, a
   **separate, explicit approval** is required before any production
   deployment (merging to `main`, running `wrangler deploy` against
   `fis-backend` itself, or uploading anything to the production
   `fis-bi-forms-library` bucket) -- none of that is in scope for this plan.

See `docs/FIS_SMART_FORMS_HANDOVER.md` section on staging for the current
summary status of this plan and the exact next commands once approved.
