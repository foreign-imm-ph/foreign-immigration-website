# Phase 4 Final Report — Catalogue Expansion, Multilingual Client Portal, Operational Readiness & Automated Testing

## A. Repository / branch information

- Repository: `foreign-imm-ph/foreign-immigration-website`
- Branch: `claude/fis-website-planning-r52sii`
- Starting commit: `bf35a57`
- Final commit: `b1df54d0f8c091f0115c27e941beae13658fec5d`
- Five commits this phase, each pushed immediately after its own test run was green:

| Commit | Stage |
|---|---|
| `ec5e17b` | A+B: comprehensive offering discovery + real catalogue expansion |
| `0edef4e` | C: product-approval register + pricing controls |
| `9b5a5b8` | D: six-language Client Portal localization |
| `454531b` | E: operational integration readiness audit |
| `b1df54d` | F: committed Playwright suite (7 journeys) |

No merge into `main`. No force-push. No existing work overwritten — every stage read and built on the commit before it.

## B. Offering inventory (Stage A+B)

`docs/OFFERING_INVENTORY.md` was re-read and extended (new Section F/G), not replaced. Discovery re-examined all 16 previously confirmed categories plus the Forms Library registry (20 PDFs, nothing new) and the 13 "enquiry-first" categories. Three additional candidate offerings were identified from already-published site content and flagged, not assumed:

- Immigration Status Review (`svc-status-review`)
- Philippine Immigration Record Update (`svc-lost-passport-record-update`)
- Property Transaction Document Review & Readiness Check (`svc-property-transfer-doc-review`)

**Summary: 19 real offerings now exist as durable, committed, draft catalogue rows** (migration `0012_phase4_catalogue_expansion.sql`) — 3 automated documents, 10 manually-fulfilled documents, 3 Airport VIP packages, 3 of the new candidates. No arbitrary target number was imposed; this reflects what the discovery pass actually found. **Every one of the 19 is `offering_status = 'draft'`, `active = 0`** — confirmed again in this report's own final regression pass (Section I).

A real gap found during discovery: the oft-cited "16 catalogue entries" and "3 validated BI Forms" from earlier phases had **no committed migration seeding them** — they existed only as the inventory document, plus a handful of ad-hoc `wrangler d1 execute` rows from past manual-testing sessions that were never committed. Migration `0012` is the first time this catalogue became real, durable, reproducible data.

## C. Catalogue backend implementation (Stage B+C)

- Extended `offering_type` with `fixed_price_service` (Category C), reusing `document_manual`'s exact no-questionnaire flow rather than building a parallel one — the only four places `offering_type` branches on behavior (`checkout.js`, `checkoutCustomer.js`, `instant-services-apply.js`, `instant-services-catalogue.js`) were identified by grep before touching any of them.
- Extended `offering_status` with exactly one new value, `approved` (plus two append-only columns, `approved_by_staff_email`/`approved_at`), after explicitly rejecting the directive's longer suggested state list — "ready for activation" is a computed condition (approved + a real price), not a stored one.
- `setOfferingStatus()` now enforces two independent gates before `active`: business approval (`approved_at IS NOT NULL`) and a real approved price (`hasApprovedPrice()`, pre-existing). Both gates are regression-tested (`worker/test/staffCheckout.test.js`).
- The Staff Portal's catalogue pages show the current approval state, who approved it and when, and expose the new `approved` status as one more button alongside the existing lifecycle — no parallel admin UI was built.

## D. Dynamic pricing

Pre-existing dynamic pricing/price-history architecture (built in an earlier phase) was reused unchanged. No hardcoded prices were introduced anywhere in this phase's new offerings — every one of the 19 draft rows has **no price components at all** until a staff member sets one, which is itself a structural non-purchasability guarantee independent of the approval gate. Journey 7 (`e2e/tests/07-catalogue-administration.spec.js`) proves end to end, against the real Staff Portal UI, that: an unapproved/unpriced offering is refused activation by the server (not merely hidden in the UI); an already-placed order's stored price snapshot is immutable against a later catalogue price change; and price history accumulates correctly.

## E. Client Portal localization (Stage D)

All six languages (English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Vietnamese) now cover the full previously-English-only Client Portal: login, magic-link verification, dashboard, application list and detail, BI Forms section, document requests, messages, payments, profile, and the Airport VIP booking/rescheduling section.

- **Locale continuity**: the portal reads the SAME `fisPreferredLocale` localStorage key the public site already writes (`language-gateway.js`) — no second mechanism.
- **Backend sync**: `client.preferred_communication_language` (the pre-existing column the backend's own status-label localization already depended on) is synced via a minimal `PATCH /api/profile` whenever the detected/switched language doesn't match the stored one — verified live, not just by code reading: Journey 6's "locale continuity" tests assert the DB column directly, and the dashboard's own status badge (backend-rendered) was confirmed to render in the selected language, not just the static shell chrome.
- **In-portal switcher**: a visible `<select>` in the portal header, added to `index.njk`.
- **Policy wording**: the Airport VIP "Eligible for rescheduling, subject to availability" wording, the 120-hour threshold, and every other mandated qualification were translated faithfully in all six languages, reusing (not re-authoring) the already-reviewed wording from `instant-services-apply.js`. No new legal-review workstream was opened.
- **One real bug found and fixed in this same stage**: the BI Forms section's empty-state text stayed in English because `portal-app.js`'s wrapper omitted a 4th `lang` argument that the pre-existing `portal-bi-form.js` functions already accepted. Fixed; confirmed by Journey 6's regression test.

Live-verified with real Playwright sessions (not just code review) across Japanese, Simplified Chinese, Korean at the time, and now all six languages via Journey 6 in the committed suite.

## F. Operational integration readiness (Stage E)

Full findings in `docs/OPERATIONAL_READINESS_AUDIT.md`. Summary:

| Integration | Verdict |
|---|---|
| Transactional email (Resend) | Configured, not meaningfully tested — and the test suite's one real gap (a genuine outbound call to Resend's live API on every test run, since no `RESEND_API_KEY` is configured anywhere in this repo) was fixed: `lib/email.js` now skips the call entirely when no key is present, and the vitest suite additionally mocks the endpoint. |
| QR Ph payment workflow | Locally tested — manual-verification-only by design; no automated gateway code exists to misuse. |
| Airport VIP refunds | Locally tested, with two flagged (not fixed) open questions: whether the 120-hour policy should be re-checked at refund-creation time rather than trusted to staff judgment, and whether refund/payment-verification actions should be role-restricted. Both are business/access-control decisions, not something this phase changes unilaterally. |
| Cloudflare infrastructure | Reviewed from committed local config only. No remote Cloudflare API call was made this phase (see Section G). |

## G. Cloudflare API token handling (§12)

A Cloudflare API token was pasted directly into chat by the user mid-session. It was never printed, logged, written to a file, committed, or included in any test fixture. It was used once, narrowly, as a shell-session environment variable, for a read-only `wrangler whoami` identity check — nothing broader. Because this environment's shell does not persist exported environment variables between separate tool-call invocations, re-using it again later in the phase would have meant re-typing the raw secret into command text on every call; that tradeoff was explicitly declined in favor of a local-only configuration review for the rest of the operational-readiness audit (Section F). The user was told at the time that pasting a secret into chat isn't the secure channel this phase's own rules call for, and that rotating it afterward would be reasonable. **No remote Cloudflare resource was accessed, queried, or modified at any point in this phase.**

## H. Cloudflare Free-plan resource discipline (§13)

GitHub-first, local-first throughout: every D1 query, R2 read/write, and Worker invocation this phase used `--local` bindings or Miniflare's isolated local D1/R2, never the real account. No remote migration was run. No file was uploaded to a live R2 bucket. No preview environment was created. No Cloudflare plan change, billable feature, or paid resource was touched or proposed. The one piece of CI added (`.github/workflows/e2e.yml`) runs entirely on GitHub's own compute and consumes no Cloudflare quota.

## I. Automated browser testing (Stage F)

- **Framework**: Playwright (`@playwright/test@^1.56.1`), newly introduced and committed.
- **Files**: `playwright.config.js`, `e2e/global-setup.js`, `e2e/fixtures/testHelpers.js`, `e2e/tests/01`–`07-*.spec.js`, `worker/scripts/make-e2e-wrangler-toml.js`, `e2e/README.md`.
- **Command**: `npx playwright test` (from repo root); `npm run test:e2e` is also wired up.
- **Results**: 16 tests across all 7 required journeys, **all passing**, run together in one sequential pass (~4.6 minutes) against both local servers, confirmed with no cross-test interference.
- **CI**: `.github/workflows/e2e.yml`, triggered on push/PR to this branch; installs its own Chromium, writes a throwaway local-only `.dev.vars`, runs the same command. No secret required; nothing deployed.
- **Limitations honestly stated**: the exact mathematical 120-hour rescheduling boundary is proven at the unit level (`worker/test/airportVipPolicy.test.js`, deterministic, no wall-clock dependency) rather than to the millisecond inside the live browser journey, which instead proves the real request path honors a ±2-minute window around that boundary (explained in both the test file and `e2e/README.md`). This environment's `wrangler dev` was found to rewrite same-origin Origin headers when a `routes` entry is configured, which would otherwise have broken every Staff Portal form submission in this suite for reasons unrelated to the app's own CSRF logic; worked around with a generated, gitignored wrangler config used only for test runs (`worker/scripts/make-e2e-wrangler-toml.js`), never affecting the real committed config or a real deploy.

## J. Public site / Client Portal consistency (§15) and final regression pass (Stage G)

Performed and recorded in this report, not left implicit:

- Full worker `vitest` suite re-run after every stage's code changes: **249 passed, 2 skipped, 4 todo**, every time, no regression at any point.
- Full Playwright suite re-run together at the end: **16 passed**.
- Draft-first discipline re-verified directly against D1 at the end of the phase: **all 19 real Phase-4 catalogue rows are still `draft`/`active = 0`** — nothing was accidentally activated by any of this phase's own code, tests, or manual verification sessions.
- Brand tokens (`#0D3D25` forest green, `#C3963B` gold, `#F7F4EF` cream) unchanged — the only CSS added this phase is the portal language-switcher's styling, itself using the existing forest-green token for its border.
- No new promotional sections, repetitive CTAs, or marketplace-style clutter were added anywhere on the public site.
- Airport VIP's business rules (full refund if FIS can't accommodate; ≥120h notice eligible for rescheduling subject to availability; <120h not eligible; customer-initiated cancellation always non-refundable; non-attendance non-refundable; mandatory consumer-rights qualification) were preserved verbatim and are now additionally proven, end to end, by Journeys 3–5 of the committed test suite — not just carried over by inspection.

## K. Final version control state

- **Final commit hash**: `b1df54d0f8c091f0115c27e941beae13658fec5d`
- **Branch**: `claude/fis-website-planning-r52sii`, pushed, tracking `origin`
- **Changed/added files this phase**: 1 new D1 migration pair (`0012`, `0013`), catalogue/pricing library and route changes, Client Portal shell/login/verify rewrites (i18n), two new documentation files (`docs/OFFERING_INVENTORY.md` extended, `docs/OPERATIONAL_READINESS_AUDIT.md` new), a full `e2e/` Playwright suite, one new GitHub Actions workflow, and this report.
- **Test results at HEAD**: worker `vitest` 249/249 passing (2 skipped, 4 todo); Playwright `e2e` 16/16 passing across all 7 journeys.
- **Known limitations**: see Section I's limitations paragraph, and the two flagged-but-unresolved refund-workflow questions in Section F / `docs/OPERATIONAL_READINESS_AUDIT.md`.

## Remaining business/technical decisions for the business to confirm

| # | Item | Where discussed |
|---|---|---|
| 1 | Should any of the 19 new draft offerings actually be approved, priced, and activated? None are purchasable today — every one requires an explicit staff approval + price before it can ever reach a customer. | `docs/OFFERING_INVENTORY.md` §F/G |
| 2 | Are the 3 "candidate" offerings (Immigration Status Review, Philippine Immigration Record Update, Property Transaction Document Review) genuinely FIS offerings, or should they be archived instead? | `docs/OFFERING_INVENTORY.md` §F |
| 3 | Should the two automated-document candidates provisionally mapped to existing BI Form configs be re-confirmed as the correct mapping before approval? | migration `0012`'s `notices_text` fields |
| 4 | Should Airport VIP refund creation re-derive/require one of the policy's named eligibility outcomes automatically, or continue relying on staff judgment (as today)? | `docs/OPERATIONAL_READINESS_AUDIT.md` §C |
| 5 | Should payment verification and refund actions be restricted to a subset of staff (e.g. admin-only), rather than any authenticated staff account as today? | `docs/OPERATIONAL_READINESS_AUDIT.md` §C |
| 6 | When the business is ready to send real transactional email, `RESEND_API_KEY` needs to be set as a real Worker secret (`wrangler secret put`) — nothing in this phase sends, or is configured to send, a real email. | `docs/OPERATIONAL_READINESS_AUDIT.md` §A |
| 7 | Remote, read-only verification that committed Cloudflare config (Access AUD tag, `fis-bi-forms-library` bucket contents) actually matches the live account was not performed this phase and remains available on request, ideally with any credential supplied through this environment's own secret mechanism rather than pasted into chat. | `docs/OPERATIONAL_READINESS_AUDIT.md` §D |
