# FIS Instant Checkout — Frontend & Technical Audit

Scope respected: this is an audit and design recommendation only. Nothing
was implemented, deployed, or changed on live infrastructure. Every
claim below was verified directly against the actual source files and a
locally built, locally rendered copy of the site (desktop 1440×900 and
mobile 390×844 viewports, captured with Playwright/Chromium against the
real built HTML/CSS — not imagined). Screenshots are delivered alongside
this report, not embedded in the markdown (binary images don't render in
a `.md` file in this repo's tooling); see the caption list in each
section referencing the delivered PNGs.

---

## A. Verified current website design and architecture

### Stack

- **Frontend:** static site generator **Eleventy (`@11ty/eleventy` 3.1.6)**, Nunjucks templates, no client-side framework. Vanilla JS only, loaded via `<script defer>`.
- **Backend:** Cloudflare Worker (`worker/`) — D1 (SQLite), R2 (file storage), Resend (email), Workers AI (translation only). Plain regex-routed JSON API (`worker/src/index.js`), no router library.
- These are two **separate deployables** — the Worker has no awareness of Eleventy's build, and the static site talks to the Worker only via `fetch()` (`src/assets/js/portal-config.js`'s `PORTAL_API_BASE`).

### Homepage (`src/index.njk`)

Verified section-by-section, top to bottom:

1. **First-visit language gateway** (`partials/language-gateway.njk`) — a native `<dialog>`, shown via JS (`language-gateway.js`) only on first visit to the English root homepage. Offers all 6 locales as large buttons, plus "Continue in English." No-JS-safe (inert markup if JS fails).
2. **Urgent banner** (`partials/urgent-banner.njk`) — a thin, full-width dark bar: "Arrested, Detained, or Facing Criminal or Immigration Proceedings?" + a gold "Request Urgent Assistance" button. Always visible, every page.
3. **Hero** — eyebrow ("Philippine Immigration Consultancy") → H1 ("Philippine immigration, handled.") → lede paragraph → logo visual → two CTAs (`btn-primary` "Send an Enquiry" → `/contact/`, `btn-secondary` "Explore Our Services" → `/services/`) → an accreditation badge card (shield icon + "Bureau of Immigration Accredited Consultancy — No. CA-202623557").
4. **"Core Immigration Services"** — section intro + a 3-column card grid (`.card-grid--3up`), 6 cards: Visa & Immigration Applications, Work & Employment Visas, Extensions & Compliance, Residency & Long-Term Status, Family & Spousal Visas, Corporate & Global Mobility. Each card: icon, H3, one-line description, "Learn more →" link. No pricing, no secondary CTA.
5. **Feature split (photo, dark green)** — "Airport VIP Meet & Assist," one CTA (`btn-on-dark`).
6. **"Specialised Services"** on a white (`section--muted`) background — 4-column card grid (`.card-grid--4up`), 8 cards, same card anatomy as above.
7. **Feature split (photo, compact)** — "Property Transfer & Documentation Support," **two** CTAs side by side (`btn-on-dark` "Learn More" + `btn-outline-on-dart` "Make an Enquiry") — this is the one place on the whole site with two stacked CTAs on a single feature block, a useful precedent for checkout ("Learn More" + "Start Now").
8. **CTA banner (full-width dark)** — "Not Sure What You Need...?" + "Tell Us Your Situation" → `/contact/?service=other`.
9. **Client Portal preview** — section intro + a 5-icon feature row (Applications, Documents, Messages, Payments, Profile) + one CTA, "Open the Client Portal →" `/client-portal/`.

No page on the entire site — homepage, services index, or any service detail page — displays a price, a "buy now," or any self-service purchase path. Every single CTA resolves to either `/contact/` (a staff-mediated enquiry form) or `/client-portal/` → `/portal/login/` (which itself requires having already contacted staff — see §B).

### Header & navigation (`partials/header.njk`)

- Logo (SVG) + a small accreditation credential line, left-aligned.
- Primary nav (`nav.json`): **Home, About, Services, Accreditation, Client Portal, Contact** — exactly 6 items, plus the language switcher as a 7th slot.
- **Mobile nav is pure CSS** — a hidden checkbox (`#nav-toggle`) + `<label>` hamburger, no JavaScript at all for the toggle. Collapses at **≤1199px** (not a typical 768px phone breakpoint — the desktop row's own width is what decides the cutoff, confirmed by the CSS comment: "Threshold matches the 1200px desktop-header breakpoint... so the collapsed menu takes over at exactly the point the full desktop row stops fitting").
- **Language switcher** (`partials/language-switcher.njk`) — native `<details>/<summary>`, no JS, nested inside `.site-nav` so it collapses into the same mobile menu. Screenshot-verified: opens a simple dropdown list of the 6 native-script language names.

### Service pages (`src/services/*.njk`, 17 files + index)

Verified anatomy (`visa-and-immigration-applications.njk` read in full): icon → `.tag` ("Core Service") → H1 → lede → intro paragraph → `.context-note` cross-sell box → feature photo → "How We Can Assist" bullet list → second `.context-note` → "One process, one point of contact" callout → "Common Situations We Handle" → **"How the Process Works"** numbered `.step-list` (5 steps, each a small card with a number badge, H3, one line) → "What We May Need From You" bullet list → a third `.context-note` ("Need More Hands-On Support?") → `.service-cta` block (H2 + paragraph + single primary button, `?service=<slug>` deep-linking into the contact form) → "Related Services" link list.

This is a **mature, consistent template** every one of the 17 service pages follows — the `.step-list` and `.service-cta` components are exactly the right shape to carry eligibility/pricing/checkout content without inventing new visual language.

### Footer (`partials/footer.njk`)

Two-tone: a dark-green brand panel (logo + accreditation line) above a near-black legal panel (email `mailto:` link, Privacy Notice / Terms of Use / Accessibility links, copyright). No secondary nav, no social links, no newsletter signup. Simple and consistent across all 6 locales.

### Brand tokens (`src/assets/css/style.css`, verified exact values)

| Token | Value | Use |
|---|---|---|
| `--color-green` | `#0D3D25` | Primary brand color — headings, primary buttons, card accents, footer/feature-split backgrounds |
| `--color-gold` | `#C3963B` | Accent — eyebrow text, hover states, `btn-on-dark` |
| `--color-gold-text` | `#816327` | Darkened gold, used where text/focus needs 4.5:1+ contrast |
| `--color-offwhite` | `#F7F4EF` | Page background |
| `--color-charcoal` | `#242824` | Body text |
| `--color-grey` | `#626862` | Secondary/muted text |
| `--color-white` | `#FFFFFF` | Card backgrounds |
| `--color-green-tint` | `#EEF2EE` | Layered section backgrounds |
| `--radius` | `2px` | Universal — sharp, minimal rounding, applied to buttons/cards/inputs alike |
| `--max-width` | `1120px` | Content wrap |
| `--font-serif` | Georgia stack | Headings (en/vi); **overridden to `--font-sans` for zh-CN/ja/ko** (a verified, deliberate rule — CJK Mincho/SimSun fallback was judged off-brand) |
| `--font-sans` | System stack + PingFang/Hiragino/Meiryo/Malgun/Apple SD Gothic/Noto Sans SC·JP·KR | Body text, and headings for CJK locales |

**Buttons** (all `.btn`, `padding: 0.8rem 1.6rem`, `border-radius: 2px`):
- `.btn-primary` — solid green, white text (main conversion action)
- `.btn-secondary` — transparent, green outline/text (secondary action, light backgrounds)
- `.btn-on-dark` — solid gold, charcoal text (primary action on the dark-green feature-split/CTA-banner backgrounds)
- `.btn-outline-on-dark` — transparent, off-white outline (secondary action on dark backgrounds)

**Cards** (`.card`): white background, 1px hairline border, **3px solid green top border that turns gold on hover** — a distinctive, consistently-applied brand signature worth preserving in any new card type.

### Responsive design (verified via rendered screenshots at both viewports)

- Grid-based hero with **three** distinct compositions at mobile (stacked), tablet 640–959px (two-column action row), and desktop ≥960px (two-column, logo right) — all via CSS Grid `grid-template-areas`, not JS.
- `card-grid--3up`/`--4up` collapse to a single column on mobile (screenshot-confirmed).
- `clamp()` used extensively for fluid type/spacing rather than fixed breakpoint jumps.
- `@media (prefers-reduced-motion: reduce)` is explicitly handled.

### Accessibility patterns (verified in source)

- Skip link (`.skip-link`, keyboard-focusable, hidden otherwise).
- Visible focus rings everywhere (`:focus-visible`), with a **separate, lighter-colored ring rule for dark backgrounds** (`.btn-primary:focus-visible`, `.feature-split--dark a:focus-visible`, etc.) — a real, deliberate contrast fix, not an oversight.
- Honeypot field (`.hp-field`, visually hidden, `tabindex="-1"`) on the contact form for bot mitigation without a CAPTCHA.
- Every disclosure widget (language switcher, FAQ-style components) uses **native** `<details>/<summary>` or `<dialog>` — no custom ARIA widget reinvention, which means Instant Checkout's own interactive bits (an accordion fee breakdown, a FAQ) should follow the same native-element convention.
- `aria-current="page"` on the active nav link; `aria-live="polite"` on every async form-status message (`#enquiry-form-status`, `#portal-login-status`, etc.) — a pattern Instant Checkout's own form statuses should reuse verbatim.

### Six-language localization architecture (verified)

- **`src/_data/site.json`** declares 6 canonical locales (`en`, `zh-CN`, `zh-Hant`, `ko`, `ja`, `vi`), each with a `label`/`nativeLabel`/`prefix`/`status`. All 6 are currently `"active"`.
- **Full page-per-locale duplication**, not a dictionary-driven CMS: `src/ja/`, `src/ko/`, `src/vi/`, `src/zh-cn/`, `src/zh-hant/` each contain their own complete `.njk` copy of every marketing page (confirmed: `src/zh-cn/services/*.njk` mirrors `src/services/*.njk` file-for-file). English is the canonical source; other locales are fully translated, standalone files.
- A Nunjucks **`t` filter** + `src/_translations/<lang>.json` dictionaries cover only short, repeated **chrome** strings (nav labels, footer links, skip link) — confirmed by direct inspection of `en.json` (6 keys total: skipLink, nav.*, languageSwitcher.label, header.credential, footer.*).
- `hreflang` alternates and `og:locale` are computed automatically per page (`layouts/base.njk`), gated so an incomplete/`"sample"`-status locale is never linked to or indexed, only reachable by direct URL.
- The authenticated Worker side has its **own, separate** canonical-language constant (`worker/src/lib/translation.js` `CANONICAL_LANGUAGES`) and its own deterministic string dictionary (`worker/src/lib/clientLocaleStrings.js`) — this is the exact pattern Stage 5.4 already proved out for the BI-form questionnaire's own UI chrome, and is the one to extend for checkout, not the Eleventy per-locale-file pattern (checkout is an authenticated/dynamic flow, not a static marketing page).

### Existing Client Portal & customer onboarding (verified)

- **`/client-portal/`** is a static **marketing** page — 5 feature cards (no self-service anything) + "Get Started: Send us an enquiry and our team will guide you through the next steps for your Client Portal access" + two CTAs: "Send an Enquiry" (primary) and "Sign In to Client Portal" (secondary, for existing clients only).
- **`/portal/login/`** — a single email field, "Send Sign-In Link" (magic link). Its own context note: *"Don't have Client Portal access yet? Send us an enquiry first and our team will set up your account."*
- **Verified in `worker/src/routes/auth.js`:** `handleRequestMagicLink` looks up `getClientByEmail` and does **nothing** if no matching client row exists (while still returning the same generic "if that email is registered..." response, correctly avoiding account enumeration). **There is no self-service account-creation endpoint anywhere in the Worker today.** A `clients` row is only ever created by `createClient` (`worker/src/lib/db.js`), called exclusively from `worker/src/routes/staff.js:842` when staff converts an enquiry.
- Once inside, `/portal/` (`src/portal/index.njk` + `portal-app.js`) is a **single-page app**: tab-switching between "Applications & Services" and "Profile," in-page list→detail navigation (no real routing/URLs for sub-views). Stage 5.4 added a "BI Forms" section to the application-detail view using exactly this same in-page pattern.

### Existing payment-related UI and backend capabilities (verified — important finding)

**There is no payment gateway integration anywhere in this codebase.** Confirmed by direct reading of `worker/src/routes/payments.js` and its own header comment: *"No gateway anywhere in this file. A client action can only ever move a payment_request from 'pending' to 'submitted' — never to 'paid'. Only a staff action... can mark something paid."*

The actual flow today:
1. Staff manually creates a `payment_request` row (amount, description) tied to an existing application.
2. The customer sees it in the portal's Payments tab, alongside **one single shared static QR Ph image** (`config/qr-ph.png` in R2 — one image for the whole business, not per-transaction) for manual bank/e-wallet transfer.
3. The customer uploads a screenshot/photo as proof of payment (`handleUploadPaymentProof` — this only ever sets status to `submitted`).
4. A staff member manually verifies the proof and marks the row `paid`.

`payment_requests.gateway_provider`/`gateway_reference` columns exist in the schema (`migrations/0001_init.sql`) but are explicitly commented **"reserved, unused in V1."** `applications.service_slug` is a free-text column validated only against a hardcoded `Set` in `enquiries.js` — **there is no service/price/catalog table in D1 at all.**

---

## B. Existing customer journey and discoverability weaknesses

1. **Every path terminates in a human, not a transaction.** A visitor who finds exactly the service they want has no way to go from "I want this" to "I'm done" without: submitting a generic enquiry → waiting for staff review → staff creating an application → (if relevant) staff assigning a BI form → staff requesting payment manually → staff creating portal access. This is appropriate for complex/bespoke immigration matters, but it is friction for a simple, well-defined, fixed-process document request (exactly what the 3 already-migrated BI forms are).
2. **Zero price transparency anywhere.** Not on the homepage, not on any of the 17 service pages, not in the contact form. A cost-conscious visitor — likely the majority of the target audience for a simple document request — cannot self-qualify before committing to an enquiry.
3. **The 3 BI forms Stage 5 just built a complete customer workflow for are entirely undiscoverable.** Nothing on the public site mentions them by name, links to them, or indicates that a fast, fixed-process, self-service path exists for a BI Clearance Certificate, a Certified True Copy of Derogatory Records, or a Travel Records request — despite the full questionnaire → document upload → staff review → PDF generation pipeline already existing and working.
4. **The contact form's 17-option service dropdown** assumes the visitor can already classify their own situation. The one escape hatch ("Tell Us Your Situation" / service=`other`) is good UX but still funnels into the same generic, non-instant form.
5. **No service/price/eligibility data model exists in D1** — today "what services exist" lives only as hardcoded strings in two unrelated places (the Nunjucks service pages and `enquiries.js`'s `SERVICE_SLUGS` Set), which is fine for a lead-gen site but cannot support a scalable, database-driven checkout catalog without new schema.
6. **Guest/account friction is backwards for a fast-document use case:** today, portal access is a *reward* for having already gone through staff triage. For Instant Checkout, account creation needs to happen *automatically and invisibly* as a side effect of paying, not as a prerequisite gate the customer must clear first.

---

## C. Recommended Instant Checkout placement

**Recommendation: implement all five of the following in combination**, not one in isolation — each one is the discovery path for a different kind of visitor, and given how much is reusable (§G), the combined cost is small relative to building any one of them well in isolation.

1. **A new homepage section**, inserted directly after the hero and **before** "Core Immigration Services" — i.e., the first thing a visitor sees after the hero's brand message, not competing with it. A slim, visually distinct band (not a full `.section`-height block) presenting 2–3 checkout-eligible services as compact cards with a visible price and a "Start Now" button, plus a "View All Instant Checkout Services →" link to the catalog page (#3). Keeps the hero's primary message intact while making the fast path the *second* thing anyone sees, on every single page load.
2. **A new, visually distinct primary-nav entry** — "Instant Checkout" (or "Quick Services," see §D wording options), styled as a filled pill/button rather than a plain text link (precedent: none exists today, but the existing `.btn-primary`/`.btn-on-dark` treatments give the exact visual language to borrow), so it reads as an action, not a page, in the nav bar. Collapses into the existing mobile `.nav-toggle` menu with no new mechanism needed.
3. **A dedicated catalog/landing page** (`/instant-checkout/`, mirrored per locale like every other page) — the hub every other entry point links to. Reuses `.card-grid` exactly as the existing Services index does, one card per eligible service/form, each showing name, one-line eligibility description, price, and "Start Now." This is the page that scales as more forms are onboarded — adding a form to the catalog never requires a new page or new code (see §F).
4. **Inline badges on existing service cards** (homepage + `/services/`) for any card whose category has an eligible form — a small "Instant Checkout Available" ribbon/tag (reusing `.tag--available`'s existing green-accent treatment, already defined in CSS and already used for exactly this "available now" semantic) plus a secondary small CTA alongside the existing "Learn more →" link. Lets a visitor who's already browsing by category discover it in place, with no extra click.
5. **A prominent CTA block on the relevant service-detail page(s)**, inserted near the top (immediately after the lede, before "How We Can Assist") using the existing `.service-cta` component — "Need a [Form Name]? Get it done today for ₱[price]" + "Start Instant Checkout" primary button — with the existing "Discuss Your Application" enquiry CTA retained further down the page for anyone whose situation doesn't fit the fixed/fast path.

**First-time customer journey (minimal friction), concretely:**
Visitor lands anywhere on the site (homepage, a Google search result landing on a service page, or a direct nav click) → sees one of the five entry points above within one click of wherever they landed → lands on the catalog page or goes straight to the specific service's checkout CTA → sees eligibility + transparent price breakdown (§D step 4) → proceeds as a **guest** with just an email address (no separate signup — identity/account creation happens invisibly, see §F) → completes the existing multilingual questionnaire (already built, Stage 5.4) in their own language → uploads required documents (existing upload infra) → reviews a summary → pays → immediately receives a receipt email that **is also their Client Portal magic-link sign-in**, so "guest checkout" and "portal account" are the same action, not two.

---

## D. Recommended frontend UX and visual design

### Wording (brand-consistent, no false urgency or guarantees)

- Nav entry: **"Instant Checkout"** (clear, matches the feature's own name; alternative if testing shows confusion: **"Quick Services"**).
- Homepage section eyebrow: *"Available Now, Online"* / H2: **"Instant Checkout — Get Your Document Started Today"**.
- Card badge: **"Instant Checkout Available"** (reuses the existing `.tag--available` green treatment).
- Primary CTA verb: **"Start Now"** on cards/catalog, **"Start Instant Checkout"** on service-detail pages, **"Proceed to Payment"** at the final checkout step (never "Buy Now" — this is a government-document preparation service, not retail, and the wording should stay consistent with the rest of the site's professional register).
- Trust line near every price: *"FIS prepares and submits your document for Bureau of Immigration processing. Government filing fees, if any, are separate and disclosed before payment."* — accurate, not a guarantee of outcome, and explicitly **not** implying FIS *is* the government (directly answers the "no unsupported guarantees, no false government affiliation" constraint).

### The 10-step flow, each step's design

1. **Service discovery** — the 5 entry points in §C, all reusing existing `.card`, `.tag`, `.feature-split`, and nav visual language. No new design system.
2. **Service selection** (catalog page) — `.card-grid`, one card per eligible form: name, one-sentence eligibility ("For BI-accredited clients requesting..."), price, "Start Now." Mirrors `/services/` exactly.
3. **Eligibility & requirements** — a new first checkout screen, reusing `.step-list`'s numbered-card visual language for "What you'll need" (ID, specific documents) and a plain-language eligibility statement ("This form is for..."/"This is not the right form if..."), with a clear "This doesn't match my situation" link back to the regular `/contact/` enquiry path — so Instant Checkout never traps someone in the wrong flow.
4. **Transparent pricing/fee breakdown** — a simple two-line receipt-style table *before* any payment screen: "Service fee: ₱X,XXX" / "Government filing fee (if applicable): ₱Y" / **Total: ₱Z**, styled like the existing bilingual payment-description treatment already built in the portal (`portal-app.js`'s payment rendering), not a new pattern.
5. **Multilingual guided questionnaire** — **reuse `src/assets/js/portal-bi-form.js` and the entire Stage 5.4 engine as-is.** No new renderer. The only change needed is which entry point creates the `bi_form_submissions` row the renderer already knows how to edit.
6. **Supporting-document upload** — **reuse** the existing upload component/pattern from `portal-bi-form.js` (already wired to `/api/bi-forms/:id/documents`) exactly as built.
7. **Review & confirmation** — a read-only rendering of the submitted answers (the same `renderAnswers`-style pattern already in `staffBiForms.js`'s staff view, adapted for a customer-facing summary) with an "Edit" link back into the questionnaire and an explicit "Confirm and Continue to Payment" button — a deliberate, separate step so nothing is paid for sight-unseen.
8. **Payment** — gateway-hosted or embedded widget (provider TBD, §F/§J), styled to sit inside the same `.wrap`/`.section` page chrome as everywhere else, not an external-feeling redirect if avoidable.
9. **Receipt & order confirmation** — an on-page confirmation (reuse `.service-cta`'s "What Happens Next?" pattern already used on `/contact/`) + an email receipt (reuse `lib/email.js`'s existing send pattern) that doubles as the portal sign-in link.
10. **Client Portal access & tracking** — the customer lands in the **existing** `/portal/` application-detail view, where their new BI-form submission already appears via Stage 5.4's "BI Forms" section, with the identical status/progress/history UI every other client sees. No new tracking UI needed.

### Progress indicator

A simple, numbered horizontal stepper (1 Select → 2 Details → 3 Documents → 4 Review → 5 Pay), styled with the brand green/gold (active step gold, completed green, upcoming grey) — same visual vocabulary as `.step-list`'s existing numbered badges, just laid out horizontally. Collapses to a compact "Step 3 of 5" text label under 600px (mirrors how the site already collapses other multi-column layouts at that breakpoint).

---

## E. Desktop and mobile wireframes (text)

### Homepage — new section (desktop, ~1120px content width)

```
┌─────────────────────────────── .wrap ───────────────────────────────┐
│  AVAILABLE NOW, ONLINE                                               │
│  Instant Checkout — Get Your Document Started Today                  │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ [icon]       │  │ [icon]       │  │ [icon]       │               │
│  │ BI Clearance │  │ CTC Derog.   │  │ Travel       │               │
│  │ Certificate  │  │ Records      │  │ Records      │               │
│  │ From ₱X,XXX  │  │ From ₱X,XXX  │  │ From ₱X,XXX  │               │
│  │ [Start Now]  │  │ [Start Now]  │  │ [Start Now]  │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                       │
│              View All Instant Checkout Services →                   │
└───────────────────────────────────────────────────────────────────┘
```

Mobile: identical card markup, single column (same collapse rule `.card-grid` already uses).

### Catalog page (`/instant-checkout/`) — desktop

```
┌─────────────────────────────── .wrap ───────────────────────────────┐
│  TAG: Instant Checkout                                                │
│  H1: Instant Checkout Services                                       │
│  One line: Select a service below to begin — no enquiry needed.      │
│                                                                       │
│  [ card ]  [ card ]  [ card ]      ← .card-grid--3up, as /services/  │
│                                                                       │
│  ┌─ context-note ───────────────────────────────────────────────┐   │
│  │ Don't see what you need? Send us an enquiry instead →        │   │
│  └───────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### Checkout flow screen (e.g. step 4, pricing) — desktop

```
┌──────────────────────── .wrap, max-width ~720px ─────────────────────┐
│   ① Select ─ ② Details ─ ③ Documents ─ ●④ Review ─ ⑤ Pay             │
│                                                                        │
│   H2: Review Your Order                                               │
│                                                                        │
│   BI Clearance Certificate (CCS-A-CDR-2016)                           │
│   ───────────────────────────────────────────                        │
│   Service fee                                   ₱X,XXX                │
│   Government filing fee (if applicable)         ₱   Y                 │
│   ───────────────────────────────────────────                        │
│   Total                                         ₱Z,ZZZ                │
│                                                                        │
│   [context-note: FIS prepares and submits your document for BI        │
│    processing. Government filing fees, if any, are disclosed above.]  │
│                                                                        │
│   [ Back ]                              [ Confirm and Continue → ]    │
└────────────────────────────────────────────────────────────────────┘
```

### Mobile checkout screen (390px)

```
┌──────────────────┐
│ Step 4 of 5       │   ← compact stepper label, not full horizontal row
│ Review            │
│                    │
│ BI Clearance Cert. │
│ ────────────────── │
│ Service fee ₱X,XXX │
│ Gov't fee    ₱  Y  │
│ ────────────────── │
│ Total      ₱Z,ZZZ  │
│                    │
│ [context-note]     │
│                    │
│ [Confirm & Pay →]  │  ← full-width button, mobile convention already
│ [ Back ]           │     used by .enquiry-form-actions on this site
└────────────────────┘
```

---

## F. Checkout backend and payment requirements

### Already implemented — reusable as-is

| Capability | Where | Status |
|---|---|---|
| Multilingual questionnaire renderer (text/date/select/yesno/repeatable-group, `showIf` conditionals) | `src/assets/js/portal-bi-form.js` | Complete, tested, browser-verified (Stage 5.4) |
| Customer-facing draft/submit/document API | `worker/src/routes/biFormsCustomer.js` | Complete, tested |
| Document upload/download (validated, byte-sniffed, 15MB cap) | `worker/src/lib/storage.js` | Complete, tested |
| PDF generation (staff doc + secure customer preview) | `bi-forms-library/engine/`, `worker/src/lib/biFormRaster.js` | Complete, verified against real workerd (Stage 5.3) |
| Staff review/approve/publish workflow | `worker/src/routes/staffBiForms.js` | Complete, tested |
| Client record creation | `createClient()`, `worker/src/lib/db.js` | Exists, currently staff-only caller |
| Session/magic-link issuance | `worker/src/lib/session.js`, `routes/auth.js` | Exists, currently requires a pre-existing client |
| Email sending (receipts can reuse this) | `worker/src/lib/email.js` (`sendMagicLink`) | Exists, pattern reusable for a new "order confirmation" template |
| `intake_path` column already distinguishing `staff_assigned` vs a future `instant_checkout` | `bi_form_submissions.intake_path` (migration 0009) | Column exists, unused — ready |

### Genuinely missing — must be built

1. **Customer-initiated application (and client) creation.** Today `createClient`/application creation is only ever called from staff-authenticated code. Needs a new, public, rate-limited endpoint that: validates an email, creates (or reuses) a `clients` row, creates an `applications` row with `service_slug` set from the catalog entry, and creates the `bi_form_submissions` row with `intake_path = 'instant_checkout'` — all before any document touches the `documents` table, which satisfies the existing `documents.application_id NOT NULL` constraint by construction (the application always exists first in this flow; this is **not** a schema change, just a sequencing requirement already compatible with the current schema).
2. **A service/pricing catalog**, which does not exist in any form today. New D1 table, e.g.:
   ```sql
   CREATE TABLE checkout_services (
     id TEXT PRIMARY KEY,
     service_slug TEXT NOT NULL,        -- reuses existing SERVICE_SLUGS values
     bi_form_id TEXT NOT NULL,          -- 'CCS-A-CDR-2016' etc., matches the Forms Library registry
     name TEXT NOT NULL,                -- per-locale names via the same translation pattern as clientLocaleStrings.js
     price_php REAL NOT NULL,
     active INTEGER NOT NULL DEFAULT 0  -- the activation flag — stays 0 until you approve
   );
   ```
   This is what makes the catalog **scalable** (per your §4 requirement) — onboarding a new checkout-eligible form becomes a row insert, not a new page or new route.
3. **A real payment gateway integration.** Nothing today processes a card, e-wallet, or automated bank payment — confirmed in §A. This needs: a provider choice (§J — explicitly not decided by me), a hosted-checkout or embedded-widget integration, and a **webhook endpoint with signature verification** that is the *only* thing allowed to move a payment from pending to paid (mirroring the existing fail-closed pattern where today only a staff action can do that).
4. **Order/payment status tracking** tied to the new flow — either extending `payment_requests` (which already has the right shape: amount, description, status, reserved gateway columns) to allow a customer-initiated row, or a parallel `checkout_orders` table if you want Instant Checkout's state machine kept fully separate from staff-manual payment requests. Recommend **reusing `payment_requests`** with its existing `gateway_provider`/`gateway_reference` columns finally populated — less schema surface, and the Client Portal's existing Payments tab already knows how to render this table.
5. **A feature flag.** A single `env` var (e.g. `INSTANT_CHECKOUT_ENABLED`, consistent with how `CF_ACCESS_*` and other config already live in `wrangler.toml` `[vars]`) gating the new public routes — defaults to unset/false, exactly per your "prepare but do not activate" instruction.
6. **Guest identity / portal-account linking.** Recommend: Instant Checkout never shows a "create a password" step at all — an email address plus the existing magic-link mechanism *is* the account. The receipt email **is** the sign-in link. This is the least-friction option that remains secure (no new credential to leak or forget), and it requires no new auth mechanism — only the new public client-creation endpoint in (1).
7. **Staff processing after checkout** — needs **no new code.** Once the application + BI-form submission exist, Stage 3/5's existing staff review UI already lists it, assigns/reviews/approves/publishes it identically to a staff-assigned form. The only cosmetic addition worth considering (not required): showing `intake_path` on the staff list view so staff can see at a glance which submissions came from checkout vs. manual assignment.
8. **Customer confirmation, receipt, notifications** — reuse `lib/email.js`'s send pattern for a new template; reuse the existing bilingual-description rendering pattern already built for payments in `portal-app.js` for the receipt's price breakdown.

---

## G. Reusable components and exact implementation files

**Extend, do not duplicate:**

| Existing file | What it already does | How Instant Checkout extends it |
|---|---|---|
| `src/assets/js/portal-bi-form.js` | Full multilingual questionnaire renderer | Used as-is once a submission exists; no changes needed to the renderer itself |
| `worker/src/routes/biFormsCustomer.js` | Draft/submit/document API | Used as-is; only the *creation* of the first row is new |
| `worker/src/lib/db.js` (`createClient`) | Client record creation | Called from a new public route instead of only `staff.js` |
| `worker/src/lib/session.js` | Magic-link session issuance | Called immediately after checkout's client creation, for the "receipt = sign-in link" flow |
| `worker/src/lib/email.js` | Transactional email sending | New template, same send mechanism |
| `src/assets/css/style.css` (`.card`, `.card-grid`, `.btn*`, `.service-cta`, `.step-list`, `.context-note`, `.tag--available`) | Entire visual language | Reused directly; a handful of new, narrowly-scoped classes (e.g. `.checkout-stepper`, `.checkout-price-table`) follow the same token system |
| `src/_includes/partials/icons.njk` | Hand-authored line-icon macro | 2–3 new icons needed (checkout/cart, price tag, receipt) in the same two-tone green/gold line style — no third-party icon library to introduce |
| `worker/src/lib/clientLocaleStrings.js` pattern | Deterministic, reviewed 6-language dictionaries | New dictionary file (or additions to this one) for checkout-specific chrome, exactly like Stage 5.4's `portal-bi-form.js` `STRINGS` object |

**New files genuinely required:**

- `src/instant-checkout.njk` + one per-locale copy (`src/ja/instant-checkout.njk`, etc.) — the catalog landing page, following the existing per-locale-file convention.
- A small Nunjucks include for the service-detail CTA block (so it's written once, included from whichever service pages have an eligible form).
- `worker/src/routes/checkout.js` — new public routes: create checkout order (client + application + submission), get pricing/catalog, initiate payment, payment webhook.
- `worker/migrations/00XX_checkout_catalog.sql` — the new catalog table (and, if you choose not to reuse `payment_requests`, a new orders table).
- `worker/src/lib/paymentGateway.js` — provider SDK wrapper + webhook signature verification (provider TBD, §J).
- `src/assets/js/instant-checkout.js` — the new flow's own frontend module, following the exact file-per-feature convention `portal-bi-form.js` already set (not folded into `portal-app.js`, which is about the existing portal, not the public-facing checkout funnel).

---

## H. Conversion, accessibility and multilingual recommendations

- **Price transparency is the single highest-leverage conversion change** — nothing on the site shows a number today; adding one, even "From ₱X,XXX," at every entry point (card, catalog, service-detail CTA) materially lowers the information barrier to starting.
- **Reuse `.tag--available`** verbatim for the "Instant Checkout Available" badge — it's already defined, already green/brand-consistent, and already semantically "this is ready now" elsewhere in the codebase's intent, just unused on any card today.
- **Mobile-first is already the site's default posture** (confirmed: every component's base CSS is the mobile layout, with `@media (min-width: ...)` progressively enhancing upward) — Instant Checkout's own components should keep writing CSS the same direction, not mobile-as-an-afterthought.
- **Progress indicators and `aria-live` status messages** — reuse the exact `aria-live="polite"` pattern already on every async form status (`#enquiry-form-status`, `#portal-login-status`) for checkout's own "Saving...", "Processing payment...", error states.
- **Multilingual coverage**: all 6 FIS languages, using the **Worker-side deterministic-dictionary pattern** (`clientLocaleStrings.js`/`portal-bi-form.js`'s `STRINGS`), not the Eleventy per-locale-page pattern — checkout is a dynamic, authenticated-adjacent flow, not static marketing content, so it belongs with the pattern Stage 5.4 already proved rather than 6 duplicated static pages. The **catalog landing page itself** (static marketing content) *should* follow the Eleventy per-locale-file convention, matching every other marketing page.
- **No dark patterns** — confirmed design avoids: no countdown timers, no "X people viewing this," no pre-selected add-ons, no password/account wall before pricing is shown, explicit "This doesn't match my situation" exit back to the normal enquiry path at the eligibility step.
- **Trust language**: reuse the accreditation badge (already a proven, legitimate trust signal on the homepage hero) on the catalog and checkout pages too; the fee-breakdown's fixed disclaimer line (§D) keeps FIS's role accurate without implying government affiliation or outcome guarantees.

---

## I. Prioritized, accelerated implementation plan

Ordered for the fastest path to a working, secure, demonstrable flow — frontend and backend can proceed in parallel once (1)–(2) land, since the questionnaire/document/staff layers already exist.

1. **Catalog schema + data** — new `checkout_services` table/migration, seeded with the 3 already-migrated forms (prices and final `service_slug` categorization for 2014-13-002/006 need your decision, §J) — `active: 0` until approved.
2. **Customer-initiated application creation endpoint** (`worker/src/routes/checkout.js`) — client+application+submission creation, feature-flag gated, fully testable without a payment gateway attached yet (can be verified end-to-end using the exact same synthetic-data test conventions Stage 5.5 established).
3. **Catalog landing page + homepage section + nav entry + service-card badges** — pure frontend, no backend dependency beyond (1)'s data, can be built and visually reviewed immediately.
4. **Eligibility/requirements + review/confirmation screens** — new, small UI; wraps the *existing* questionnaire/upload components from (5)/(6) in §D, not a rebuild.
5. **Payment gateway integration** — the one piece with a real external dependency and an approval gate (§J); can be stubbed/mocked for the rest of the flow to be fully demonstrable before this lands.
6. **Receipt/confirmation email + automatic portal sign-in** — reuses existing email + session code almost unchanged.
7. **End-to-end test suite** — extend the Stage 5.5 conventions (synthetic data, ownership isolation, invalid-transition checks) to the new checkout-specific routes and the full guest-to-published-document journey.
8. **Review checkpoint with you** before setting `active: 1` on any catalog row or enabling the feature flag in a live environment.

---

## J. Decisions genuinely requiring your approval before activation

1. **Payment gateway/provider choice.** Not decided here. For the Philippine market, PayMongo (native GCash/Maya/card/QR Ph support, the most commonly used PH-first gateway) is the natural default to evaluate first, but this is your call, not an engineering one — it affects fees, settlement, and compliance obligations.
2. **Pricing for each checkout-eligible form.** No price exists anywhere today; real figures are a business decision.
3. **Final `service_slug` categorization for 2014-13-002 and 2014-13-006** — still open from the Stage 1–4 `SERVICE_MAPPING.md` proposal (CDR's `motions-blacklist` mapping is already provisionally accepted; the other two remain genuinely ambiguous between 2–3 reasonable categories each).
4. **Exact initial catalog scope** — recommend launching with only the 3 already-validated, fully-tested forms, expanding via the batch-onboarding process already estimated in the Stage 5 report (~0.5–1.5 days/form), rather than waiting to launch with a larger catalog.
5. **Guest-checkout confirmation** — this report recommends email-only guest checkout with the receipt doubling as portal sign-in (no password); confirming this is the intended security/UX tradeoff before it's built.
6. **Whether "Instant Checkout" (vs. "Quick Services" or another name) tests well** — a wording call, not a technical one.
7. **Activation itself** — per your instruction, nothing above is to be deployed, enabled, or made live without your explicit go-ahead once built.

---

## Screenshots delivered with this report

Captured from a local Eleventy build served and rendered in real Chromium (Playwright), both desktop (1440×900) and mobile (390×844) viewports:

- `homepage-desktop-abovefold.png` / `homepage-mobile-abovefold.png` — hero + urgent banner, both viewports
- `homepage-desktop.png` / `homepage-mobile.png` — full homepage, both viewports
- `homepage-mobile-nav-open.png` — the CSS-only mobile menu, expanded
- `language-gateway-desktop.png` / `language-gateway-mobile.png` — the first-visit language modal
- `services-index-desktop.png` / `services-index-mobile.png` — the services catalog page (core + specialised grids)
- `service-detail-desktop.png` / `service-detail-mobile.png` — a representative service page
- `client-portal-desktop.png` / `client-portal-mobile.png` — the Client Portal marketing page
- `contact-desktop.png` / `contact-mobile.png` — the enquiry form

Visual inspection was fully possible; nothing in this report is inferred from source alone where a screenshot could verify it.
