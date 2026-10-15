# Phase 4 Stage F: committed browser journeys

Seven Playwright journeys covering the Order & Book Online catalogue, Airport
VIP booking/rescheduling/refunds, the six-language Client Portal, and
catalogue administration. Everything here runs against two **local**
servers — the Eleventy static site and `wrangler dev --local` — and never
touches a real Cloudflare resource, sends a real email, takes a real
payment, or issues a real refund. See each spec file's own header comment
for exactly what it covers and why.

## Running locally

```sh
npm ci
cd worker && npm ci && cd ..
npx playwright test
```

`playwright.config.js`'s `webServer` entries start both dev servers for
you (and reuse already-running ones outside CI, so this also works if
you already have `npm start` / `wrangler dev` open from manual testing).
Needs `worker/.dev.vars` to exist with at least:

```
PUBLIC_SITE_URL="http://127.0.0.1:8080"
DEV_STAFF_BYPASS_EMAIL="dev-staff@local.test"
```

(`worker/dev-only/README.md`/`worker/TESTING.md` already document this
file for manual local testing; the suite reuses the exact same
convention and the exact same bypass identity, provisioned automatically
by `e2e/fixtures/testHelpers.js#ensureTestStaffAdmin`.)

To run a single journey: `npx playwright test e2e/tests/01-automated-document-order.spec.js`.

## Why `wrangler dev` needs `--config .wrangler-e2e.toml`

`worker/scripts/make-e2e-wrangler-toml.js` generates a gitignored copy of
`wrangler.toml` with the `routes` entry commented out, and
`playwright.config.js`'s Worker `webServer` command runs it before
starting `wrangler dev`. This isn't needed for local D1/R2/manual testing
(that's why nothing elsewhere in this repo does it) — it's specifically
because, observed directly while building this suite, `wrangler dev` in
this execution environment rewrites the `Origin` header of a request
that targets the dev server's own address to the configured route's
production domain, but **only when a `routes` entry is configured**. The
Staff Portal is served from that same local port, so every staff form
submission is same-origin with it, and the rewritten header fails this
app's own same-site Origin/CSRF check
(`worker/src/lib/session.js` `isSameSiteOrigin`) — not because that check
is wrong, but because something downstream silently altered the header
first. Commenting out `routes` for a local test run (never for a real
deploy — the committed `wrangler.toml` is never touched) avoids it
entirely.

## Why the session cookie needs its own fix, not just `--local`

`src/assets/js/portal-config.js` points at the real
`https://api.foreignimmigration.ph`. A network-level redirect of that
origin to the local Worker was the first thing tried and didn't work:
the session cookie is set with an explicit `Domain=.<PUBLIC_SITE_URL's
hostname>` attribute (a real, deliberate security property), and a
browser that believes it's talking to `api.foreignimmigration.ph` will
silently drop a cookie scoped to `127.0.0.1` — it never gets stored, and
every authenticated call after sign-in comes back 401.
`testHelpers.js#routeApiToLocalWorker` instead intercepts only
`portal-config.js` itself and serves a version pointed at
`http://127.0.0.1:<worker port>` — same hostname as `PUBLIC_SITE_URL`
(`127.0.0.1`), so the cookie's `Domain` attribute matches and persists
correctly, exactly as it would in production between the real site and
its real `api.` subdomain. The committed file on disk is never touched.

## Mocked / never-real, explicitly

- **Email**: `worker/src/lib/email.js` skips the Resend call entirely
  when `RESEND_API_KEY` is unset (true for every environment this suite
  runs in) — no real network request, let alone a real email, is ever
  made.
- **Payment**: QR Ph is a manual-verification-only provider in this
  codebase (`worker/src/lib/paymentGateway.js`) — there is no automated
  gateway to call, real or otherwise. Every "payment proof" uploaded by
  these tests is a synthetic 1x1 PNG
  (`testHelpers.js#ONE_PIXEL_PNG_BASE64`), and every QR "code" configured
  by `e2e/global-setup.js` is the same synthetic image, never a real QR
  Ph code.
- **Refunds**: Airport VIP refunds are explicitly simulated workflow
  records in this codebase, stated in both the route's own code comment
  and the Staff Portal page itself (`worker/src/routes/staffAirportVip.js`)
  — Journey 5 asserts that notice is actually shown.

## Journeys

| File | Journey |
|---|---|
| `01-automated-document-order.spec.js` | Guest orders an automated document (a real BI Forms questionnaire, CDR), pays, uploads a proof. |
| `02-manual-document-order.spec.js` | Guest orders a staff-processed document — no automated questionnaire exists for this type. |
| `03-airport-vip-booking.spec.js` | Guest books Airport VIP assistance; staff verify payment and confirm availability as two separate actions. |
| `04-airport-vip-rescheduling.spec.js` | The 120-hour rescheduling cutoff, through the real Client Portal reschedule form: well before, well after, and right at the boundary. |
| `05-refund-unable-to-accommodate.spec.js` | A full refund walked through its own real workflow (requested → approved → processing → completed), never marking the booking refunded early. |
| `06-multilingual-portal.spec.js` | Locale continuity into the Client Portal, dashboard rendering in all six languages, the in-portal switcher, and a regression check for an untranslated fragment found and fixed during Stage D. |
| `07-catalogue-administration.spec.js` | Create a draft offering, price it, approve it, activate it; confirm it's unpurchasable until then; confirm a catalogue price change never alters an already-placed order's stored price. |

## CI

`.github/workflows/e2e.yml` runs this suite on pushes/PRs to this
branch. It installs Playwright's own Chromium (not this repo's — CI
runners don't have the pre-provisioned browser some local sandboxes do),
writes a throwaway `worker/.dev.vars`, and runs `npx playwright test`
exactly as above. No step in that workflow deploys anything, touches a
remote Cloudflare resource, or requires any secret.
