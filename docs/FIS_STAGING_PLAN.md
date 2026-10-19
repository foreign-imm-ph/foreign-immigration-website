# FIS Staging Environment -- Status and Access Instructions

**Status: DEPLOYED, with one owner action remaining.** The backend
(Worker, D1, R2, Access) is fully live and verified. The frontend
(Cloudflare Pages) is deployed and Access-gated, but its custom domain
(`staging.foreignimmigration.ph`) needs one DNS record only the owner (or
a broader-scoped API token) can create -- see section 4. Until then, the
frontend is reachable at its Access-gated default Pages domain, with the
one limitation noted in section 5.

This document originally circulated as a proposal; the owner approved it
(with one architecture correction -- see section 2) and this session
built it. See `docs/FIS_SMART_FORMS_HANDOVER.md` for how this fits into
the overall project state.

## 1. What's actually running in production (unchanged by this work)

- **Customer-facing frontend**: a static Eleventy (11ty) site, built by
  `.github/workflows/deploy.yml` on every push to `main`, deployed to
  **GitHub Pages** at `foreignimmigration.ph` (`src/CNAME`). Fully public.
- **Backend API**: a single Cloudflare Worker, `fis-backend`
  (`worker/wrangler.toml`), bound to `api.foreignimmigration.ph/*`.
  `src/assets/js/portal-config.js`'s `window.PORTAL_API_BASE` is the one
  hardcoded line the frontend uses to find it.
- **Cloudflare Access**: `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` are set in
  `wrangler.toml`'s default `[vars]` block, intended to protect `/staff/*`.
  **Finding from this session**: querying the account's Access API
  directly showed **zero Access Applications and zero Identity Providers
  existed anywhere on the account** before this session created the
  staging-specific ones described below. The production AUD value may be
  a planning placeholder never actually applied to a live Access
  Application, or an application this session's tokens couldn't see for
  an unknown permission reason -- this session did not change anything in
  the default `[vars]` block or investigate further, since production is
  out of scope, but the owner should be aware `/staff/*` may not currently
  be enforced by a real Access Application the way the code comments
  describe.
- **Data**: one D1 database (`fis-backend`) and two R2 buckets
  (`fis-client-files`, `fis-bi-forms-library`). None touched this session.

## 2. Architecture actually built (corrected from the original proposal)

The original proposal below defaulted to separate `*.pages.dev` /
`*.workers.dev` domains with no DNS changes. Building it surfaced a real
architectural blocker: `worker/src/lib/session.js`'s session cookie is
set with `Domain=.{hostname of PUBLIC_SITE_URL}` and `SameSite=Lax` --
this only works when the frontend and API share a parent domain (true in
production: `foreignimmigration.ph` / `api.foreignimmigration.ph`). Two
unrelated domains like `pages.dev`/`workers.dev` cannot share a cookie
this way at all (a server can never set a `Domain` cookie attribute for a
domain it doesn't own) -- sessions would have silently failed. Presented
to the owner as a choice; **the owner approved staying on a shared parent
domain**: `staging.foreignimmigration.ph` (frontend) and
`staging-api.foreignimmigration.ph` (API), both still just two new,
additive subdomains under the existing zone -- not new DNS records to
`pages.dev`/`workers.dev`, and **zero changes to session.js or any
authentication code**, since this architecture reuses exactly what
production already does.

## 3. Resources actually created (all real, all verified)

| Resource | Name | Notes |
|---|---|---|
| D1 database | `fis-backend-staging` (`34eb40c1-6214-45a3-8125-7ed7fc569f47`) | All 22 `worker/migrations/*.sql` applied in order; 35 tables, confirmed empty of any customer data. |
| R2 bucket | `fis-client-files-staging` | Empty at creation; now holds one synthetic payment-evidence PNG from this session's acceptance test. |
| R2 bucket | `fis-bi-forms-library-staging` | Populated with all 14 `originals/<formId>.pdf` + `backgrounds/<formId>.png` objects, copied from this session's local scratch materials (confidential originals, never committed to git) -- a fully separate copy from production's bucket, per the owner's explicit "do not share the production BI forms R2 binding" instruction. |
| Worker environment | `fis-backend-staging` (`worker/wrangler.toml`'s `[env.staging]`) | Same code as production, isolated bindings above, `workers_dev = false` (no public `*.workers.dev` URL at all). |
| Workers Custom Domain | `staging-api.foreignimmigration.ph` | Declared in `wrangler.toml` (`custom_domain = true`), managed declaratively by Wrangler -- DNS + TLS cert auto-provisioned by the Workers Custom Domains API, no raw DNS permission needed. **Live and verified.** |
| Zero Trust Identity Provider | "One-time PIN" (`onetimepin` type) | No external OAuth app needed -- Cloudflare's own built-in email-code login. Account had zero IdPs before this session. |
| Access Application 1 | "FIS Staging API (owner-only)" | Covers `staging-api.foreignimmigration.ph` in full. Policy: single email `Foreignimmigrationservices.ph@gmail.com` (the Cloudflare account's own owner identity, read directly from the Cloudflare account itself -- never a personal email hardcoded into the repo). **Verified live**: an unauthenticated request gets redirected (302) to Access's login page, never reaches the Worker. |
| Access Application 2 | "FIS Staging Frontend (owner-only)" | Covers `staging.foreignimmigration.ph`. Same policy. |
| Access Application 3 | "FIS Staging Pages default domain (owner-only)" | Covers `fis-staging.pages.dev` and `*.fis-staging.pages.dev` (every per-deployment preview alias). Same policy. **Finding**: Access does not reliably gate Cloudflare's own shared `pages.dev` domain the way it gates a zone you control -- as a backstop, `functions/_middleware.js` (new, committed) refuses any request whose Host header isn't exactly `staging.foreignimmigration.ph`, so the raw Pages domain serves nothing useful even if Access's gate on it is ever bypassed. |
| Cloudflare Pages project | `fis-staging` | Deployed via Direct Upload (`wrangler pages deploy`), building from a local `npm run build:staging` (new script, see below) -- **not** Git-integration-based, since that requires an interactive GitHub App authorization step neither available token could complete non-interactively. Production branch set to `claude/fis-website-planning-r52sii`. |

**No production resource was created, modified, or read-written.**
Confirmed by direct API check after every step: `fis-backend`'s route
(`api.foreignimmigration.ph/*`) is unchanged, still pointing at
`fis-backend`, never at `fis-backend-staging`.

## 4. The one remaining owner action: one DNS record

Cloudflare Pages custom domains require a pre-existing DNS record before
Cloudflare will issue a certificate for them (unlike Workers Custom
Domains, which self-provision their DNS record entirely). **Neither API
token available this session had DNS-record write permission** (confirmed
by direct API test -- both return an authentication error on
`POST /zones/:id/dns_records`), so this one record could not be created
this session.

**To finish wiring up `staging.foreignimmigration.ph`, add one CNAME
record** in the Cloudflare dashboard (DNS → Records → Add record), or
provide a token with `Zone / DNS / Edit` permission for
`foreignimmigration.ph` and this session (or the next one) can add it
via the API in seconds:

```
Type:    CNAME
Name:    staging
Target:  fis-staging.pages.dev
Proxy:   Proxied (orange cloud)
```

Once added, Cloudflare auto-issues the certificate (typically under a
minute) and `https://staging.foreignimmigration.ph` becomes reachable.
No other step is needed -- the Pages project already has this domain
registered as pending (`status: "initializing"`, confirmed via the Pages
API), and the Access Application for it is already live.

## 5. How to test staging right now

**Full testing (after the one DNS record above is added):**
1. Visit `https://staging.foreignimmigration.ph` -- Access will prompt for
   a one-time PIN sent to `Foreignimmigrationservices.ph@gmail.com`.
2. Browse the site, place a guest order, go through the questionnaire,
   upload fictional documents, submit fictional GCash evidence.
3. For Staff Portal actions, visit
   `https://staging-api.foreignimmigration.ph/staff/` -- same Access
   login, same owner email.
4. Configure the QR Ph payment settings once (already done by this
   session -- see section 6 -- but if the staging D1 is ever reset, repeat
   it via `/staff/instant-services/payment-settings`, uploading any small
   PNG and labeling it clearly as a staging test image).

**Limited testing (before the DNS record is added):** the frontend is
already reachable at its Access-gated default domain,
`https://fis-staging.pages.dev` -- Access will prompt for the same
one-time PIN. Static pages (marketing, catalogue) work. **Logged-in
session flows (Client Portal, order tracking) will NOT work yet from this
URL**: the Worker's session cookie is scoped to
`.foreignimmigration.ph` (`PUBLIC_SITE_URL`'s configured value, matching
the eventual custom domain), which a browser will not send back to a
request made to `fis-staging.pages.dev` -- a different, unrelated domain.
This is expected and resolves itself the moment the DNS record in section
4 is added; it is not a defect to fix in code.

## 6. Acceptance testing already performed this session

Since the frontend's custom domain isn't reachable yet (section 4), the
full backend journey was verified directly against the real,
Access-protected `fis-backend-staging` Worker, via a local
`wrangler dev --env staging --remote` session (binds to the real staging
D1/R2 over Cloudflare's API; never a public URL -- the dev-only staff
bypass, gated behind a local-only `.dev.vars` file, was used exactly as
`e2e/global-setup.js` already does for local development, and does not
exist in any deployed environment). A fictional guest, fictional service,
fictional payment, and fictional staff actions were used throughout --
nothing here touches production data.

| Step | Result |
|---|---|
| Guest checkout begin | PASS |
| Magic-link token redemption + session cookie | PASS |
| Start application (creates real BI form submission) | PASS |
| **Live PDF preview + overflow warning** (this session's own commit `8e41878`) | PASS -- rendered from the real staging R2 background, correctly flagged a deliberately overlong field |
| Save + submit questionnaire | PASS |
| Select processing tier | PASS |
| Confirm and pay (reaches the real staging QR Ph settings) | PASS |
| Upload fictional GCash payment evidence | PASS |
| Staff verifies payment (order transitions to `paid`, confirmed in D1) | PASS |
| Staff starts review, fills required staff-only fields | PASS |
| Staff approves (generates the real final PDF from the staging original) | **Intermittent 503 -- see below** |
| Secure document access (owning client can list; a different client is correctly denied, 404) | PASS |
| Order status history | PASS |

**One item not cleanly verified**: the final Approve step, which invokes
the resvg/pdf-lib rendering pipeline, intermittently failed with
`Error: Worker exceeded CPU time limit` -- a `wrangler dev`-local resource
constraint (confirmed in its own log output), not an application error.
This exact rendering code is already extensively verified elsewhere
(`bi-forms-library/tests/run-all.js`'s full regression suite, and this
very session's own successful preview-image calls against the same
staging data) and is unchanged by anything in this session. The real
deployed Cloudflare Worker (reached via the actual
`staging-api.foreignimmigration.ph` domain, once DNS is added) runs on
real Cloudflare infrastructure with production-grade CPU limits, not
`wrangler dev`'s local simulation, and should not hit this. **Recommended
owner follow-up**: once the DNS record is added, click "Approve" once
through the real Staff Portal UI to confirm a generated PDF appears; if
it doesn't, that would be a genuine, newly-discovered issue worth a
follow-up session, but there is no code-level reason to expect one.

QR Ph payment settings were configured for real via the Staff Portal
route during this verification (synthetic, non-payable, clearly labeled
"FIS (STAGING TEST -- NOT A REAL GCASH CODE)") and persist in the staging
D1 for the owner's own testing.

## 7. Exact commands to resume or redeploy

```bash
# Deploy the Worker (bindings, routes, vars) after any wrangler.toml change:
cd worker && CLOUDFLARE_API_TOKEN=<token with Workers+D1+R2+zone edit> npx wrangler deploy --env staging

# Build and deploy the frontend after any site change:
cd .. && STAGING_API_BASE="https://staging-api.foreignimmigration.ph" npm run build:staging
CLOUDFLARE_API_TOKEN=<token with Pages edit> CLOUDFLARE_ACCOUNT_ID=1c557802167a5fab6c7dffd22177ea72 \
  npx wrangler pages deploy _site --project-name=fis-staging --branch=claude/fis-website-planning-r52sii --commit-dirty=true
```

## 8. Limitations / decisions for the owner

1. **The one DNS record** (section 4) -- needed to finish wiring up the
   friendly custom domain for the frontend.
2. **Production's own Access Application status** (section 1) is worth
   the owner independently confirming in the Cloudflare dashboard --this
   session found no evidence one currently exists, which is outside this
   session's authorization to investigate further or fix.
3. **Workers AI is account-level**, not isolated between staging and
   production (section elsewhere unchanged from the original proposal).
4. **The Approve/PDF-generation step** should be spot-checked once by the
   owner through the real UI once DNS is live (section 6).

Nothing here authorizes production deployment. Merging to `main`,
deploying to `fis-backend` (the production Worker), or touching the
production R2/D1 remains a separate, explicit future approval.
