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
| Access Application 1 | "FIS Staging API Staff Portal (owner-only)" | Covers `staging-api.foreignimmigration.ph/staff/*` **only** -- corrected in a follow-up session after it was first scoped to the whole domain, which broke the public catalogue (see section 9). Matches production's own real "FIS Staff Portal" Access application exactly (`api.foreignimmigration.ph/staff/*`, discovered to genuinely exist during that same follow-up session). Policy: single email `Foreignimmigrationservices.ph@gmail.com` (the Cloudflare account's own owner identity, read directly from the Cloudflare account itself -- never a personal email hardcoded into the repo). **Verified live**: an unauthenticated request to `/staff/*` still redirects (302) to Access's login page; every other route (catalogue, guest checkout, etc.) now returns real JSON with no Access interception, exactly like production. |
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
2. ~~Production's own Access Application status~~ -- **resolved in the
   follow-up session (section 9)**: it does exist, correctly scoped to
   `/staff/*`. A prior session's API token simply lacked the read
   permission to see it; no action needed.
3. **Workers AI is account-level**, not isolated between staging and
   production (section elsewhere unchanged from the original proposal).
4. **The Approve/PDF-generation step** should be spot-checked once by the
   owner through the real UI once DNS is live (section 6).

## 9. Fixed in a follow-up session: public catalogue returned Access's login page instead of JSON

**Reported symptom**: once DNS was live and the owner reached
`https://staging.foreignimmigration.ph/instant-services/`, the page
rendered but the catalogue showed "We couldn't load the catalogue right
now."

**Root cause, confirmed by direct network evidence** (not assumed):
`curl https://staging-api.foreignimmigration.ph/api/instant-services/catalogue`
returned an HTTP 302 to Cloudflare Access's own login page
(`text/html`), not JSON -- this public, unauthenticated, customer-facing
endpoint was being intercepted by Access before it ever reached the
Worker. The frontend's `.catch()` in
`src/assets/js/instant-services-catalogue.js` (its `resp.json()` throws a
`SyntaxError` parsing the HTML redirect body) is what produced the
generic error message -- confirmed by reading that exact code path, not
guessed.

**Why**: the staging API's Access Application (section 3, Application 1)
was originally scoped to the *entire* `staging-api.foreignimmigration.ph`
domain, not just `/staff/*` -- unlike production, which (contrary to what
an earlier session's handover recorded) **does** have a real, live Access
Application, discovered this session by querying the Access API with a
token that had the right read permission: `"FIS Staff Portal"`, scoped
to exactly `api.foreignimmigration.ph/staff/*`. Production's public,
customer-facing routes (catalogue, guest checkout, questionnaire,
payment) have never been behind Access; only `/staff/*` is.

**Fix**: narrowed the staging Access Application's scope from the whole
domain to `staging-api.foreignimmigration.ph/staff/*`, matching
production's own pattern exactly (see the `wrangler.toml` comment update
alongside this entry). The application's AUD tag was preserved
unchanged, so no Worker redeploy was needed -- `CF_ACCESS_AUD` in
`[env.staging.vars]` already matched. No code was changed; this was a
Cloudflare Access configuration correction only.

**Also found and fixed while investigating**: twelve leftover, fictional
`checkout_services` rows from this session's own earlier automated
acceptance-testing runs (`service_slug LIKE 'staging-accept-%'`) were
still marked `active = 1`, meaning the catalogue -- once reachable --
would have shown a dozen duplicate "Staging Acceptance Test Service"
cards instead of being properly empty. Deactivated (`active = 0`, not
deleted, in case the owner wants to inspect them later) via a single D1
`UPDATE`, consistent with "offerings remain inactive unless a clearly
isolated fictional test is required." The staging catalogue now correctly
returns `{"services": [], "lang": "en"}` -- empty, not an error, and the
frontend's own existing "No documents or services are available right
now" copy (not the error path) is what renders for this state.

**Verified** (via direct HTTPS requests to the real deployed
`staging-api.foreignimmigration.ph` -- not a local Worker):
- `GET /api/instant-services/catalogue` → `200`, `content-type:
  application/json`, body `{"services": [], "lang": "en"}`.
- `OPTIONS /api/instant-services/catalogue` with
  `Origin: https://staging.foreignimmigration.ph` (the real CORS
  preflight the browser sends) → `200`, correct
  `access-control-allow-origin`/`-credentials`/`-methods` headers, no
  Access interception.
- `GET /staff/` (unauthenticated) → still `302` to Access's login page --
  confirms `/staff/*` remains fully protected; nothing was weakened.
- Production's own route (`api.foreignimmigration.ph/*` → `fis-backend`)
  and D1 database re-confirmed unchanged via the Cloudflare API
  immediately after this fix.

**Not independently re-verified through an actual rendered Chrome
session** (no access to the owner's authenticated browser or their
one-time-PIN inbox) -- the owner should simply reload the
`/instant-services/` page; no re-login is required, since the fix only
widens what was already Access-protected back to the correct, narrower
scope.

## 10. Owner acceptance testing: one service activated (this session)

One existing, already BI-form-linked catalogue service was activated in
**staging D1 only**, for a complete fictional owner journey. No new
service was created; no production catalogue data was touched.

**Service**: `svc-cdr` -- "Certificate of Derogatory Record (CDR)"
(`service_slug: motions-blacklist`), linked to the real, fully-verified
`CCS-A-CDR-2016` BI form (the most exercised form in this entire
project's history -- it has a committed golden reference and is the form
every prior session's e2e/acceptance tests used). `offering_type:
document_automated`, `supports_delivery: true` -- exercises the guided
questionnaire, the live official-PDF preview (including this session's
own overflow-warning fix), a processing-tier choice, a delivery-address
step, guest checkout, fictional GCash payment evidence, Staff Portal
review, and real PDF generation, all in one journey.

**Changes made, staging D1 only** (via direct SQL, no code changed):
- `checkout_services` (`svc-cdr`): `active = 1`, `offering_status =
  'active'`, `customer_price_label = 'STAGING TEST PRICE (not a real
  fee)'`, Regular tier ₱1.23 (1-2 business days), Express tier ₱4.56 (1
  business day) -- both deliberately, unmistakably fake amounts, not
  realistic pricing.
- `checkout_service_i18n` (`svc-cdr`, `en`): `notices_text` replaced with
  an explicit "STAGING TEST ONLY ... not a real FIS offering and no real
  payment is processed" disclaimer, shown to the customer on the
  service's own card/detail page.
- Every other `checkout_services` row confirmed `active = 0` (including
  the twelve leftover rows from section 9's own acceptance-testing runs,
  already deactivated there).
- QR Ph payment settings re-confirmed unchanged from section 6: the
  existing synthetic, non-payable test image ("FIS (STAGING TEST -- NOT A
  REAL GCASH CODE)"), `enabled = 1`.

**Verified via direct HTTPS requests to the real deployed
`staging-api.foreignimmigration.ph`** (not a local Worker):
- `GET /api/instant-services/catalogue` → exactly one service, `svc-cdr`,
  with both processing tiers, the fake prices, and the staging-test
  notice text.
- `GET /api/instant-services/catalogue/svc-cdr` (detail) → `200`.
- `GET /api/instant-services/catalogue/svc-cdr/preview-form` (official
  blank-form preview) → `200`.
- `GET /staff/` and `GET /staff/instant-services/payment-settings/`
  (unauthenticated) → still `302` to Access's login page -- confirms
  nothing about Access was weakened while doing this.
- Production's route and D1 re-confirmed unchanged via the Cloudflare API.

**No fictional order, application, or submission was created by this
session** -- the owner asked to complete the journey themselves, so
nothing beyond the catalogue/pricing/i18n configuration above was
touched.

### Owner testing checklist

1. Go to **`https://staging.foreignimmigration.ph/instant-services/`**
   (sign in with the one-time PIN if prompted).
2. You should see exactly one card: **"Certificate of Derogatory Record
   (CDR)"**, priced at a clearly fake **₱1.23 / ₱4.56**, with a visible
   "STAGING TEST ONLY" notice. **Click that card.**
3. Proceed through: guest details → the real guided questionnaire (try
   typing an overly long Last Name to see this session's live overflow
   warning) → choose a processing tier → delivery address (any fictional
   address) → review → "Confirm and Pay".
4. On the payment screen, you'll see the synthetic "STAGING TEST -- NOT A
   REAL GCASH CODE" QR image -- upload any small image file as your
   "payment evidence" (it's never checked against a real QR Ph
   transaction).
5. To act as staff and finish the journey: go to
   **`https://staging-api.foreignimmigration.ph/staff/`** (same one-time
   PIN), find your test order under Instant Services → Orders, verify the
   payment, open the linked BI form submission, start review, fill in any
   staff-only fields it asks for, and Approve -- this generates the real
   final PDF from the staging original.
6. Back in the Client Portal (the link from your original guest
   checkout, or `https://staging.foreignimmigration.ph/portal/`), confirm
   you can see the order status update and download the generated
   document.

Nothing here authorizes production deployment. Merging to `main`,
deploying to `fis-backend` (the production Worker), or touching the
production R2/D1 remains a separate, explicit future approval.
