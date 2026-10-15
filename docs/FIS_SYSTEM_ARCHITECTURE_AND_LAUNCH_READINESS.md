# FIS System Architecture & Launch Readiness — Consolidation Audit

**Repository**: `foreign-imm-ph/foreign-immigration-website`
**Branch audited**: `claude/fis-website-planning-r52sii`
**Commit at time of audit**: `4acd660` (confirmed via `git log -1`; working tree clean)
**Nature of this document**: a read-only audit. No application code, schema, catalogue data, pricing, or infrastructure was changed to produce it. Nothing was deployed.

### How to read this report

Every material claim below is labeled:

- **[REPO]** — verified directly from source, migrations, or config in this repository.
- **[CI]** — verified directly from a committed GitHub Actions workflow.
- **[PROD]** — verified directly against the live Cloudflare account via read-only `wrangler`/D1 queries (see "Production verification" below). Nothing was deployed, migrated, or modified to obtain these.
- **[DOC]** — reported by earlier project documentation, cross-checked against the code where possible.
- **[INFERRED]** — a reasonable conclusion from repo evidence, not itself directly observed.
- **[NOT VERIFIED]** — could not be confirmed, and is stated as a limitation, not a fact.

### Production verification performed

A Cloudflare API token was not available in this session's environment at the time this report was first drafted (confirmed by an absent `CLOUDFLARE_API_TOKEN` env var and `wrangler whoami` reporting "not authenticated"). The user then supplied one directly in chat. Per this audit's own security instructions, that token was used narrowly, once, for exactly the read-only checks below — never printed, logged, written to a file, or committed — and the user was advised to rotate it given it was shared via chat rather than a secure secret mechanism. The checks run, all read-only:

- `wrangler whoami` — confirms the token resolves to the account `Foreignimmigrationservices.ph@gmail.com's Account` (`1c557802167a5fab6c7dffd22177ea72`), the same account referenced throughout this project's prior documentation.
- `wrangler deployments list` (in `worker/`) — lists the Worker's actual deployment history.
- `wrangler d1 migrations list fis-backend --remote` and a direct read-only `SELECT name FROM sqlite_master WHERE type='table'` / row-count query against the remote D1 — establishes the real remote schema and real row counts, not just migration-tracking metadata.
- `wrangler r2 bucket list` — confirms which R2 buckets actually exist in the account.
- `wrangler secret list` (in `worker/`) — lists secret *names* bound to the Worker (never values).

Findings from these checks are folded into the relevant parts below and labeled **[PROD]**.

---

## Part I — Executive explanation

**There is one backend, not two.** `https://api.foreignimmigration.ph/staff/enquiries/` is not a separate system that the newer functionality was bolted onto — it is one route inside the same single Cloudflare Worker (`fis-backend`) that also serves every other staff page, every customer-facing API, document ordering, Airport VIP bookings, the BI Forms Library, and the Client Portal. **[REPO]**

What happened to the original enquiries portal: nothing happened to it. It is still there, still the Staff Portal's home page, and still reachable through the exact same navigation bar as every feature added since. **[REPO]**

Where the new functionality lives: in the same repository, same Worker, same database, under new route prefixes (`/staff/instant-services/*`, `/staff/airport-vip/*`, `/staff/bi-forms/*`) added to the same router that already had `/staff/enquiries/*` and `/staff/applications/*`. **[REPO]**

What is already live: this is the single most important finding of this audit, now independently confirmed against the real account, not just inferred from git. **No committed CI workflow ever deploys the Worker.** The only deployment automation that exists deploys the public *static site* to GitHub Pages, and only in response to a push to `main` — **[CI]**. The `main` branch is 54 commits behind this development branch, last updated 2026-09-12 — **[REPO]**. The Worker's actual deployment history shows its **last deployment was 2026-09-12T15:52:34Z** — 14 seconds after `main`'s last commit timestamp (`2026-09-12T15:52:20Z`) — **[PROD]**. A direct read-only query of the remote D1 database confirms this precisely: only the tables from migrations `0001`–`0008` exist remotely (`enquiries`, `clients`, `applications`, `auth_tokens`, `sessions`, `documents`, `payment_requests`/`payment_proofs`, `communications`/consent tables, `audit_log`, `rate_limit_events`); **none of `bi_form_submissions`, any `checkout_*` table, or any `airport_vip_*` table exist in production** — **[PROD]**. The production database currently holds real data: **7 enquiries, 2 clients, 1 staff account** — **[PROD]**, confirming the original enquiries system is genuinely in live use.

What is still development-only, now confirmed rather than inferred: BI Forms Library, Order & Book Online (documents + Airport VIP), catalogue administration, the full Client Portal checkout/booking experience, and all of Phase 4 — **none of this exists in the production database or the deployed Worker today**. **[PROD]** Two pieces of good news for a future deploy: the `RESEND_API_KEY` secret is already set on the live Worker (name confirmed via `wrangler secret list`, value never inspected) — **[PROD]** — and both R2 buckets (`fis-client-files`, created 2026-08-20; `fis-bi-forms-library`, created 2026-10-13) already exist in the account, though `fis-bi-forms-library` postdates the last deploy and so is not yet bound to the live Worker — **[PROD]**.

---

## Part II — Architecture

### A. Technical architecture diagram

```mermaid
flowchart TB
    subgraph GH["GitHub repository: foreign-imm-ph/foreign-immigration-website"]
        direction LR
        SITE_SRC["src/ (Eleventy)\nPublic pages, instant-services/*, portal/*"]
        WORKER_SRC["worker/src/ (single Cloudflare Worker: fis-backend)"]
        MIGR["worker/migrations/\n0001 - 0013, additive only\n(0001-0008 confirmed LIVE; 0009-0013 NOT applied remotely)"]
        BIFORMS["bi-forms-library/\nquestionnaire configs, engine"]
    end

    subgraph CI["GitHub Actions"]
        DEPLOY["deploy.yml\npush to main only\nEleventy build -> GitHub Pages"]
        E2E["e2e.yml\npush/PR to this branch\nPlaywright, local-only, no deploy"]
    end

    subgraph PAGES["GitHub Pages"]
        STATIC["Static site\n(custom domain via CNAME)"]
    end

    subgraph CF["Cloudflare (manual deploy only -- no CI step exists)"]
        DNS["DNS / CDN proxy\nfor foreignimmigration.ph"]
        W["Worker: fis-backend\nsrc/index.js single entry point\nLAST DEPLOYED 2026-09-12T15:52:34Z"]
        D1["D1: fis-backend (ONE database)\nLIVE: 21 tables (migrations 0001-0008)\n7 enquiries, 2 clients, 1 staff account"]
        R2A["R2: fis-client-files\n(exists since 2026-08-20)"]
        R2B["R2: fis-bi-forms-library\n(bucket exists since 2026-10-13,\nbut postdates the last deploy --\nNOT bound to the live Worker yet)"]
        ACCESS["Cloudflare Access\n/staff/* application\n(AUD tag in wrangler.toml)"]
        AI["Workers AI\n(translation only)"]
    end

    EMAIL["Resend (transactional email)\nRESEND_API_KEY secret\n-- CONFIRMED set on the live Worker"]

    SITE_SRC -- "npm run build" --> DEPLOY --> STATIC
    WORKER_SRC -. "wrangler deploy (manual, no CI)" .-> W
    MIGR -. "wrangler d1 migrations apply --remote (manual, no CI)" .-> D1
    STATIC -- "fetch() cross-origin to api.foreignimmigration.ph" --> DNS --> W
    W --> D1
    W --> R2A
    W --> R2B
    W --> AI
    W --> EMAIL
    ACCESS -. "edge-enforced before /staff/* reaches the Worker" .-> W
    BIFORMS -. "static config read by the Worker at runtime" .-> W
    E2E -. "local wrangler dev + local Eleventy only\nnever touches CF" .-> WORKER_SRC
```

### B. Simplified business-owner diagram

```mermaid
flowchart LR
    CUST["A customer"] -->|"browses, orders, books,\nsigns in by email link"| SITE["The FIS website\n(foreignimmigration.ph)"]
    SITE -->|"one shared system\nbehind the scenes"| BACKEND["One FIS backend\n(handles enquiries, orders,\nbookings, payments, the\nClient Portal, and staff tools)"]
    STAFF["FIS staff"] -->|"signs in once"| PORTAL["One Staff Portal\n(api.foreignimmigration.ph/staff/)"]
    PORTAL -->|"same system"| BACKEND
    BACKEND --> DB["One customer/order database"]
    BACKEND --> FILES["Secure file storage\n(documents, payment proofs)"]
```

There is one website customers use, one Staff Portal employees use, and one system underneath both. The open question is not "how many systems do we have" — it is "which parts of this one system have actually been turned on for real customers yet," and the confirmed answer today is: enquiries only. Document ordering, Airport VIP, and the full Client Portal checkout experience are not live.

---

## Part III — Staff Portal map

Every row below is a real route, found by reading `worker/src/routes/staff.js` (the single dispatcher behind everything under `/staff/*`) and the three modules it delegates to (`staffCheckout.js`, `staffAirportVip.js`, `staffBiForms.js`). **[REPO]**

| Page | Route | Purpose | Auth | Dev status | Production status | Navigation |
|---|---|---|---|---|---|---|
| Enquiries (home page) | `/staff/enquiries/` (also the bare `/staff/` root) | View/filter/respond to customer enquiries, convert to an application | Any staff (Cloudflare Access + staff-table allow-list) | Implemented | **[PROD] Live** — remote D1 has 7 real enquiries | Shared top nav, every page |
| Archived Enquiries | `/staff/enquiries/archived/` | View archived enquiries, restore, permanently delete (admin-only for delete) | Any staff (delete: admin) | Implemented | **[PROD] Live** (table exists remotely; archived-row count not separately queried) | Shared top nav |
| Applications | `/staff/applications/` and `/staff/applications/:id` | Manage an in-progress application: status, documents, payments, messages, BI Form assignment, communication-channel consent | Any staff | Implemented | **[PROD] Live** — `applications` table exists remotely | Shared top nav |
| BI Forms | `/staff/bi-forms/` and `/staff/bi-forms/:id` | Review a submitted BI Form questionnaire, request revisions, fill staff-only fields, approve, publish the rendered document | Any staff | Implemented; original-template R2 lookup depends on the `BI_FORMS_LIBRARY` binding | **[PROD] Not deployed** — `bi_form_submissions` does not exist in the remote D1; the R2 bucket exists but postdates the last deploy, so isn't bound | Shared top nav |
| Instant Services Orders | `/staff/instant-services/orders/` and `/:id` | Review document/booking orders, verify or reject payment proofs, set delivery status, create delivery quotations | Any staff | Implemented | **[PROD] Not deployed** — no `checkout_*` table exists in the remote D1 | Shared top nav |
| Instant Services Catalogue | `/staff/instant-services/catalogue/` , `/new`, `/:id` | Create/edit offerings, set prices (with history), approve, activate/pause/archive | **Admin only** for create/edit/status changes | Implemented (Phase 4) | **[PROD] Not deployed** | Shared top nav |
| Instant Services Payment Settings | `/staff/instant-services/payment-settings/` | Configure/enable the QR Ph image and customer instructions | **Admin only** | Implemented | **[PROD] Not deployed**; no migration pre-seeds this, so even once deployed it starts unconfigured | Shared top nav |
| Airport VIP Bookings | `/staff/airport-vip/bookings/` and `/:id` | Review bookings, confirm availability (separate from payment verification), decide reschedule requests, start/progress refunds | Any staff | Implemented | **[PROD] Not deployed** — no `airport_vip_*` table exists in the remote D1 | Shared top nav |

**No separate staff "dashboard" exists.** The root `/staff/` path is an alias for the Enquiries list — that list is the landing page. **[REPO]**

### Administrative consolidation assessment

Staff can move between every one of these functions through one persistent navigation bar, rendered by a single shared layout function (`worker/src/lib/staffHtml.js`'s `staffPage()`), used by every staff page without exception. **[REPO]** There is no fragmentation to fix here — the Staff Portal is already one coherent interface. The only real gap is that, as documented in `docs/OPERATIONAL_READINESS_AUDIT.md` and re-confirmed by this audit, payment verification and refund actions are available to *any* authenticated staff member rather than being role-restricted, while catalogue/pricing changes are admin-only — an inconsistency worth a business decision, not an architectural defect. No change is recommended here beyond what that existing document already flags.

---

## Part IV — Infrastructure map

| Resource | Count / binding | Evidence |
|---|---|---|
| Cloudflare Worker | **One** — `fis-backend`, `worker/wrangler.toml`, `main = src/index.js` | **[REPO]** — only one `wrangler.toml` exists anywhere in the repository |
| D1 database | **One** — binding `DB`, database `fis-backend` | **[REPO]**, cross-checked **[PROD]** — one `[[d1_databases]]` block; 35 tables defined across 13 migrations in source, but only the 21 from migrations 0001-0008 actually exist in the remote database today; every `client_id` foreign key references the same single `clients` table |
| R2 buckets | **Two**, same Worker — `CLIENT_FILES` (`fis-client-files`, customer documents/payment proofs/QR images) and `BI_FORMS_LIBRARY` (`fis-bi-forms-library`, private original templates) | **[REPO]+[PROD]** — both buckets confirmed to exist in the account (`fis-client-files` since 2026-08-20, `fis-bi-forms-library` since 2026-10-13); the latter postdates the Worker's last deployment, so it exists but isn't bound to the live Worker yet |
| Authentication | **Two deliberately separate systems, one Worker**: Cloudflare Access (edge-enforced JWT, staff only, `/staff/*`) and magic-link + session cookie (customers, app-level) | **[REPO]** — `worker/src/lib/staffAuth.js` (Access) vs `worker/src/lib/session.js`/`routes/auth.js` (customers). Whether the real Access application is actively enforcing on the live domain was not separately checked (would require a Zero Trust dashboard check, not a `wrangler` call) — **[NOT VERIFIED]** |
| Transactional email | Resend, via `worker/src/lib/email.js`; `RESEND_API_KEY` must be a real Worker secret | **[PROD]** — `wrangler secret list` confirms `RESEND_API_KEY` is set on the live Worker (name only; the value, and therefore whether it's a currently-valid Resend key, was not and should not be checked by this audit). The code skips the call entirely when no key is present — a deliberate hardening made during Phase 4, not a bug |
| Payment | QR Ph, manual verification only (`worker/src/lib/paymentGateway.js`) — no automated gateway code exists anywhere in this codebase | **[REPO]** |
| Refunds | Simulated workflow records only — explicitly stated in the route's own code comment and in the Staff Portal page text itself | **[REPO]** |
| Workers AI | Translation only (`worker/src/lib/translation.js`) | **[REPO]** |
| GitHub → Cloudflare deploy pipeline for the Worker | **None exists.** | **[CI]** — absence confirmed by reading every workflow file in `.github/workflows/` |
| GitHub → GitHub Pages deploy pipeline for the static site | Exists, triggers only on push to `main` | **[CI]** |

---

## Part V — Development versus production

**A. Live production functionality** — confirmed directly against the real account (**[PROD]**, not inferred): the original enquiries system (`enquiries`, `clients`, `applications`, `auth_tokens`, `sessions`, `documents`, `payment_requests`, communications/consent tables) — real data exists (7 enquiries, 2 clients, 1 staff account) — and the Worker deployment matching it, last shipped 2026-09-12T15:52:34Z, 14 seconds after `main`'s last commit. The static site's deployment path (`deploy.yml`) requires a push to `main`, whose `nav.json` has no Order & Book Online entry and links "Client Portal" only to an informational page.

**B. Development-only functionality** — confirmed, not inferred: BI Forms Library, the entire Order & Book Online catalogue (documents + Airport VIP), catalogue/pricing/approval administration, the localized six-language Client Portal checkout/booking experience, and all of Phase 4. None of their tables exist in the remote D1 (**[PROD]**), and none of their code has been deployed since 2026-09-12.

**C. Partially deployed functionality**: none — the gap is clean and total (migrations 0001–0008 are live, 0009–0013 are not; nothing straddles the line).

**D. No longer unverified**: the original enquiries system's production state, previously listed as unverified, is now confirmed live with real data. **[PROD]**

---

## Part VI — Feature reconciliation

| Feature | Evidence | Status |
|---|---|---|
| Original enquiries backend | `worker/src/routes/staff.js` `listEnquiries` et al.; migration `0001_init.sql` | Present, connected, same Worker — production status unverified |
| Staff Portal | `worker/src/lib/staffHtml.js`, `worker/src/routes/staff*.js` | Present, single coherent interface |
| BI Forms Library | `bi-forms-library/`, migration `0009_bi_form_lifecycle.sql`, `worker/src/routes/staffBiForms.js` / `biFormsCustomer.js` | Present; R2 original-template binding not yet applied to any live Worker per source comment |
| Automated document generation | `worker/src/lib/biFormRaster.js` (resvg-wasm), `bi-forms-library/configs/{CCS-A-CDR-2016,2014-13-002,2014-13-006}/` | Present for exactly 3 forms; code-level only |
| Manual document ordering | `document_manual` offering type, `worker/src/routes/checkoutCustomer.js` | Present |
| Airport VIP bookings | Migration `0011_order_and_book_online.sql`, `worker/src/routes/airportVipCustomer.js` / `staffAirportVip.js` | Present |
| QR Ph payment-proof submission | `worker/src/routes/payments.js`, `worker/src/lib/storage.js` | Present; manual verification by design |
| Staff payment verification | `staffCheckout.verifyOrderPayment`, `staff.js markPaymentPaid` | Present; not role-restricted (flagged, Part VIII) |
| Customer receipts | `worker/src/routes/checkoutCustomer.js` `handleGetOrderReceipt` | Present |
| Client Portal | `src/portal/*.njk`, `src/assets/js/portal-*.js` | Present; exists even on `main` but not nav-linked there |
| Six-language localization | `worker/src/lib/clientLocaleStrings.js`, Phase 4's portal STRINGS tables | Present, re-verified this phase via Playwright (Journey 6) |
| Catalogue administration | `worker/src/routes/staffCheckout.js` | Present |
| Offering approval controls | Migration `0013_offering_approval_register.sql`, `setOfferingStatus()` | Present |
| Dynamic pricing / price history | `checkout_price_components`, `checkout_price_history` tables | Present |
| Refund tracking | `airport_vip_refunds` table, `staffAirportVip.js` | Present; simulated only, by design |
| Rescheduling | `airport_vip_reschedule_requests`, `worker/src/lib/airportVipPolicy.js` | Present; 120-hour boundary unit-tested and e2e-tested |
| Delivery quotations | `checkout_delivery_quotations` table, `staffCheckout.createDeliveryQuotation` | Present |
| Automated worker tests | `worker/test/*.test.js` | 249 passing, 2 skipped, 4 todo — re-confirmed this session |
| Playwright browser tests | `e2e/tests/*.spec.js` | 16 passing across 7 journeys as of commit `b1df54d`; unchanged since (confirmed via `git diff --stat`) |
| CI workflows | `.github/workflows/{deploy,e2e}.yml` | Both present; neither deploys the Worker |

This reconciles cleanly against `docs/PHASE4_FINAL_REPORT.md` — nothing in that report's claims contradicts what this audit independently found in source. The one addition this audit makes is the deployment-pipeline finding, which Phase 4's own reports did not focus on because Phase 4 was an implementation phase, not a deployment audit.

---

## Part VII — Catalogue reconciliation

**Only one migration (`0012_phase4_catalogue_expansion.sql`) has ever inserted a row into `checkout_services`.** **[REPO]** This means the oft-cited "16 catalogue entries" were, in every committed and reproducible sense, never real rows — only documentation (`docs/OFFERING_INVENTORY.md`) plus ad-hoc, never-committed `wrangler d1 execute` test rows from past manual sessions. The 19 rows below are the first real, durable catalogue data this system has ever had.

All 19, read directly from the migration (not from any local test database, which accumulates ephemeral Playwright/manual-testing rows that are never committed):

| ID | Title | Type | Category | Status |
|---|---|---|---|---|
| `svc-cdr` | Certificate of Derogatory Record (CDR) | Automated document | `motions-blacklist` | draft |
| `svc-bi-clearance` | BI Clearance Certificate | Automated document | `exit-clearance` (provisional) | draft |
| `svc-travel-records` | Request for Travel Records | Automated document | `document-verification` (provisional) | draft |
| `svc-ext-reconsideration` | Request for Reconsideration on Updating/Extension of Authorized Stay | Manual document | `extensions-compliance` | draft |
| `svc-acr-icard-cert` | ACR I-Card Certification | Manual document | `acr-icard` | draft |
| `svc-travel-pass` | Travel Pass Application | Manual document | `exit-clearance` | draft |
| `svc-ctc-records` | Certified True Copy (CTC) of Records | Manual document | `document-verification` | draft |
| `svc-ecc-application` | Emigration Clearance Certificate (ECC) Application | Manual document | `exit-clearance` | draft |
| `svc-cgaf-immigrant-visa` | CGAF — Immigrant Visa | Manual document | `visa-applications` | draft |
| `svc-ntsp` | Certificate of Not the Same Person (NTSP) | Manual document | `motions-blacklist` | draft |
| `svc-cpa-request` | Certification of Pending Application | Manual document | `visa-applications` | draft |
| `svc-cgaf-student-visa` | CGAF — Student Visa / Special Study Permit | Manual document | `visa-applications` | draft |
| `svc-cgaf-tvv-extension` | CGAF — Extension of Temporary Visitor's Visa | Manual document | `extensions-compliance` | draft |
| `svc-airport-vip-arrival` | Airport VIP Meet & Assist — Arrival | Bookable service | `airport-vip` | draft |
| `svc-airport-vip-departure` | Airport VIP Meet & Assist — Departure | Bookable service | `airport-vip` | draft |
| `svc-airport-vip-roundtrip` | Airport VIP Meet & Assist — Round Trip | Bookable service | `airport-vip` | draft |
| `svc-status-review` | Immigration Status Review | Fixed-price service | `status-review` | draft — **candidate, not a confirmed FIS product** |
| `svc-lost-passport-record-update` | Philippine Immigration Record Update | Manual document | `lost-passport` | draft — **candidate, not a confirmed FIS product** |
| `svc-property-transfer-doc-review` | Property Transaction Document Review & Readiness Check | Fixed-price service | `property-transfer` | draft — **candidate, not a confirmed FIS product** |

Answers to the specific questions asked:

1. The original 16 were documentation only — no catalogue records existed before this phase. **[REPO]**
2. The 19 above. **[REPO]**
3. Added to the pre-existing catalogue system (`checkout_services` and its related tables, built in an earlier phase) — not a separate system. **[REPO]**
4. Yes — the Staff Portal's Instant Services Catalogue pages list every one of them. **[REPO]**
5. Yes — any admin can move each through `draft → approved → active`, and set/update prices with history, via that same Staff Portal page. **[REPO]**
6. Yes, individually — each offering's status is changed one at a time, never in bulk. **[REPO]**
7. Yes — `document_manual`/`fixed_price_service` offerings are explicitly designed to be purchasable with zero automated BI Form mapping; 13 of the 19 are this type. **[REPO]**
8. **Yes, every one of the 19 is still a draft, `active = 0`**, re-confirmed directly against the migration source and separately against a running local database for this audit. **[REPO]**
9. No — none are active in any reproducible/committed state, and (per Part V) the `checkout_services` table this feature needs doesn't exist in the remote production database at all yet. **[REPO]+[PROD]**
10. No duplicates found; no 19th-vs-16th-entry overlap, since the 16 were never real rows to begin with. **[REPO]**
11. Yes — the public catalogue API (`handleListCatalogue`) only ever returns rows with `active = 1`; a `draft` row additionally 404s on direct lookup by ID, not just omits itself from the list. **[REPO]**
12. Yes — `checkout_services` in the single `fis-backend` D1 database is the only catalogue data store. **[REPO]**

Potentially missing offerings, carried forward from the earlier audit, not expanded here: the 13 "enquiry-first" service categories identified in `docs/OFFERING_INVENTORY.md` were deliberately left out of the catalogue (they remain quotation/enquiry-based), and the three candidate offerings above are explicitly flagged as unconfirmed. No new gaps were found in this audit; expanding the catalogue further is out of this audit's scope by its own instructions.

---

## Part VIII — Operational readiness

Re-verified against `docs/OPERATIONAL_READINESS_AUDIT.md`'s own conclusions; nothing has changed in the relevant source files since that document was written (confirmed via git log on each file).

| Area | Implemented in code | Tested locally | Verified externally | Ready for real customers |
|---|---|---|---|---|
| Transactional email | Yes — 11 templates, Resend wrapper | Yes — mocked in the vitest suite (fixed this phase: no real network call is made even without a key) | **[PROD]** `RESEND_API_KEY` is confirmed set as a secret on the live Worker | Code- and secret-ready; actual deliverability (is the key currently valid?) was not and should not be tested by sending real mail |
| QR Ph payments | Yes — manual-verification-only by design, no automated gateway exists to misuse | Yes — Playwright Journey 1/2/3/7, vitest | **[PROD]** moot today — the `checkout_*` tables this feature needs don't exist in the remote database yet at all | Not reachable in production until migrations 0010-0013 are applied and the Worker redeployed |
| Refunds | Yes — simulated workflow only, explicitly stated in code and in the Staff Portal UI itself | Yes — Playwright Journey 5, vitest | **[PROD]** moot today — `airport_vip_*` tables don't exist remotely | Not reachable in production yet; two open business/access-control questions remain once it is (120-hour re-check at refund time, role-gating) |
| Staff authentication (Cloudflare Access) | Yes, code-level | Dev-only bypass (`DEV_STAFF_BYPASS_EMAIL`), never reachable in a deployed Worker — confirmed by reading the guard itself | Confirmed the Worker itself requires a real Access JWT in production (the dev bypass path is unreachable there); whether the Zero Trust Access *application* is still correctly configured on the dashboard side was not separately checked — **[NOT VERIFIED]** | Already in active use for the live enquiries system, per the real staff/enquiry data found |
| Customer authentication (magic link) | Yes, code-level, session cookie with `Secure`/`SameSite=Lax`/explicit `Domain` | Yes — vitest + every Playwright journey | **[PROD]** `auth_tokens`/`sessions` tables exist remotely and `RESEND_API_KEY` is set, so the mechanism this already depends on for the live enquiries/portal system is in place | Already in active use |
| Cloudflare infrastructure | One Worker, one D1, two R2 buckets, Workers AI | Local-only (`--local` bindings throughout) | **[PROD]** performed this session: confirmed account, deployment history, remote schema, both R2 buckets, and secret names | `BI_FORMS_LIBRARY` binding and migrations 0009-0013 are the two concrete gaps; everything else needed for the ALREADY-LIVE enquiries system is confirmed working |

---

## Part IX — Launch blockers

Evidence-supported, and nothing beyond this:

1. **No automated or recorded path exists to deploy the Worker, and it genuinely has not been redeployed since 2026-09-12.** Confirmed directly: `wrangler deployments list` shows no deployment after that date, and the remote D1 schema stops at migration `0008`. Until someone runs `wrangler deploy` and applies migrations `0009`-`0013` remotely, none of document ordering, Airport VIP, catalogue administration, or the Client Portal checkout experience can reach a real customer — not because the code is wrong, but because it simply isn't there yet. **[PROD]**
2. **The catalogue will be empty of purchasable items on day one of any future deploy.** Order & Book Online would show nothing to order until at least one offering is approved, priced, and activated. By design (draft-first), but still a real precondition. **[REPO]**
3. **QR Ph payment settings are unconfigured by default** — no migration seeds them, so checkout cannot reach a payment step until a staff admin uploads a QR image via the Staff Portal, after deployment. **[REPO]**
4. ~~`RESEND_API_KEY` must exist as a real secret~~ — **resolved, confirmed present.** `wrangler secret list` shows it already set on the live Worker. **[PROD]** (Whether its value is still a currently-valid Resend key was not tested and should not be, short of an authorized live-send test.)
5. **The `BI_FORMS_LIBRARY` R2 bucket exists but is not yet bound to the live Worker** — confirmed: the bucket was created 2026-10-13, after the Worker's last deployment on 2026-09-12. The bucket existing is good news (someone already did the out-of-band population this needs), but the binding itself only takes effect on the next deploy. **[PROD]**

None of these are code defects. All are **sequencing/configuration steps**, not bugs — the kind of thing a deployment runbook (Part XI) exists to walk through, not a reason to write more code.

---

## Part X — Business approvals needed

1. Whether/when to deploy the Worker and merge this branch's static-site changes to `main` at all — nothing here recommends a timeline, only that these are the two gating actions.
2. Which of the 19 draft offerings to actually approve, price, and activate — none are required to go live together.
3. The three candidate offerings (Immigration Status Review, Philippine Immigration Record Update, Property Transaction Document Review) — confirm as real FIS products or archive them.
4. The two ambiguous automated-document category placements (`svc-bi-clearance`, `svc-travel-records`) — confirm or correct before activating either.
5. Airport VIP package prices.
6. Whether payment verification and refund actions should be restricted to admin staff (today, any staff account can do both).
7. Whether the 120-hour Airport VIP policy should be re-checked automatically at refund-creation time, or continue relying on staff judgment as today.
8. ~~Obtaining/confirming a real `RESEND_API_KEY`~~ — already confirmed set. Still open: confirming on the Zero Trust dashboard itself that the Access application + AUD tag are correctly configured for `/staff/*` on the real domain (this audit confirmed the Worker-side config exists and the secret exists, not the dashboard-side Access application).

---

## Part XI — Minimum deployment plan (proposed only — not executed)

1. **Branch**: the Worker can be deployed directly from this branch — `wrangler deploy` does not care which git branch is checked out, only what's on disk. The static site's GitHub Pages pipeline, however, only triggers on `main`, so the site's new pages/nav will not go live without either merging to `main` or adding a deploy trigger for this branch.
2. **Merging to `main`**: necessary only for the static-site GitHub Pages path as currently configured; not technically required to deploy the Worker.
3. **Frontend build**: `npm run build` (Eleventy → `_site/`), already what `deploy.yml` does.
4. **Worker deploy**: `cd worker && wrangler deploy` — a human with real Cloudflare credentials, run manually; applies every binding in `wrangler.toml` including the already-existing-but-not-yet-bound `BI_FORMS_LIBRARY` R2 bucket.
5. **Required bindings**: `DB` (D1), `CLIENT_FILES` + `BI_FORMS_LIBRARY` (R2), `AI` (Workers AI), the `CF_ACCESS_*` and `EMAIL_*`/`PUBLIC_SITE_URL` vars already in `wrangler.toml`. `RESEND_API_KEY` is already set as a secret — confirmed this audit — and needs no action.
6. **Pending migrations, now confirmed exactly**: `0009_bi_form_lifecycle.sql` through `0013_offering_approval_register.sql` — confirmed still pending via a direct read-only query of the remote schema (migrations 0001-0008 are the only ones live). All 13 are additive (no `DROP`/destructive statement found in any of them). Recommend `wrangler d1 migrations list fis-backend --remote` once more immediately before applying, in case anything changes between this audit and the actual deploy.
7. **Protecting existing production data**: nothing in this migration set deletes or renames a column or table, so applying migrations 0009-0013 is safe to the 7 enquiries / 2 clients / 1 staff account already live, confirmed present this audit.
8. **Backups/exports**: recommend a `wrangler d1 export fis-backend --remote` before applying any migration remotely, as routine good practice, not because a specific risk was found.
9. **Configuration differences**: confirmed this audit — the live Worker's secrets (`RESEND_API_KEY`) and both R2 buckets already match what `wrangler.toml` expects; the only gap is that the Worker hasn't been redeployed since the `BI_FORMS_LIBRARY` binding was added to source and since that bucket was created.
10. **Staff access verification**: after deploying, a staff member should sign in through the real Cloudflare Access flow (not the local bypass, which cannot work in a deployed Worker) and confirm they land on `/staff/enquiries/` — this flow is already proven in daily use today, so this step is about confirming it still works post-deploy, not standing it up from scratch.
11. **Customer access verification**: a real magic-link round trip, end to end — the underlying mechanism (`auth_tokens`/`sessions`, `RESEND_API_KEY`) is already live and in use for the existing system, so this is a confirmation step, not new ground.
12. **Payment workflow verification**: configure a real QR Ph image via the Staff Portal, then run one real test order through to the proof-upload step (no real money needs to move to verify this far).
13. **Rollback**: Cloudflare Workers support redeploying a previous version directly (dashboard or `wrangler rollback`); since no migration is destructive, no schema rollback should ever be needed, and a Worker-code rollback is safe to leave newer, unused columns in place.
14. **Explicit owner approval required before**: merging to `main`, running any `wrangler deploy`/`wrangler d1 migrations apply --remote` against production, uploading a real QR Ph image, or activating any catalogue offering.

---

## Part XII — Final recommendation

**Yes, FIS can proceed toward deployment using the existing architecture.** This audit found no architectural defect, no fragmentation, no duplicated backend, and no database inconsistency that would require consolidation work before launch. The system is already one coherent Worker, one database, one Staff Portal with one navigation bar — and, now independently confirmed against the live account, the original enquiries system is genuinely running on that architecture today with real data. What genuinely needs to happen next is not more engineering — it is the deployment sequence in Part XI, now sharpened by direct production evidence into a short, concrete list (redeploy the Worker, apply five specific pending migrations, nothing else is missing), plus the business decisions in Part X. The standalone finding of this audit, confirmed rather than merely inferred, is that **nothing built since the original enquiries system has a confirmed path to production yet** — not because anything is broken, but because the Worker simply hasn't been redeployed since 2026-09-12. That is a process gap to close deliberately, not a reason to keep building.

---

## Verification limitations

- A Cloudflare API token was supplied directly in chat partway through this audit (after this report's first draft had already labeled production claims [NOT VERIFIED]) and was used, once, narrowly, for the read-only checks listed under "Production verification performed" above. It was never printed, logged, written to a file, or committed. The user has been advised to rotate it, since chat is not a secure channel for a credential and this was the second time it was shared that way.
- What remains genuinely unverified even after those checks: whether the Cloudflare Access *application* (the Zero Trust dashboard configuration, as opposed to the Worker-side AUD tag it's checked against) is currently correctly configured; GitHub Pages' actual custom-domain/DNS settings (vs. the `CNAME` file found in source); the actual validity of the `RESEND_API_KEY` secret's value (checking that would mean sending a real email, which this audit does not do); and the contents of the `fis-bi-forms-library` R2 bucket (its existence was confirmed, its contents were not listed).
- The 16/16 Playwright result is cited from the immediately preceding development phase's own run, not re-executed in this session; re-confirmed only by `git diff --stat` showing no relevant file changed since that run. The 249/249 vitest result was re-run fresh, independently, during this audit.

## Final version control state at time of this report

- Commit at start of audit: `4acd660`
- This report introduces no code, schema, or data changes — only this file (and its subsequent revision after production verification) is added.
