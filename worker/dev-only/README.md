# dev-only/ — local preview helpers, never used in production

Everything in this directory exists only to make Instant Services
inspectable on a developer's own machine via `wrangler dev --local` and
`npx eleventy --serve`. None of it is referenced by any production code
path, none of it runs automatically, and nothing here is ever applied with
wrangler's `--remote` flag.

- **`seed-demo-instant-services.sql`** — creates two clearly-labeled
  `[DEMO]` catalogue services (illustrative prices, not real FIS pricing)
  and one demo admin staff account. Apply with:
  `npx wrangler d1 execute fis-backend --local --file=dev-only/seed-demo-instant-services.sql`
- **`unseed-demo-instant-services.sql`** — removes everything the seed
  script creates, plus any orders/applications generated while exercising
  them locally.
- **`get-dev-verification-link.js`** — since real transactional email never
  sends from a local `wrangler dev` session, this re-issues and prints a
  working verification link for a given email, reading/writing the LOCAL
  D1 database only. Usage: `node dev-only/get-dev-verification-link.js you@example.test`.
- **`demo-qr-placeholder.png`** — a clearly-labeled "DEMONSTRATION ONLY —
  NOT A REAL PAYMENT METHOD" image (not a valid QR code pattern at all) to
  upload via the Staff Portal's QR Ph settings page during local preview.

See the branch's preview setup guide for the full walkthrough.

## The `DEV_STAFF_BYPASS_EMAIL` mechanism (`lib/staffAuth.js`)

Local `wrangler dev` has no real Cloudflare Access tenant in front of it,
so `/staff/*` is otherwise permanently unreachable outside a real
deployment. Setting `DEV_STAFF_BYPASS_EMAIL=<email>` in a local `.dev.vars`
file (gitignored, read only by `wrangler dev`, never by a deployed Worker)
resolves that email directly against the `staff` table with no Access JWT
at all. It has no effect unless that exact variable is present, and it can
only come from a file that is never committed and never deployed — do not
ever add `DEV_STAFF_BYPASS_EMAIL` to `wrangler.toml` or a dashboard
environment.
