# Phase 2 terminology glossary

This is a **reference for translators and maintainers**, not a
find-and-replace dictionary. It is not wired into the build in any way —
Eleventy never reads this file, and nothing here is auto-injected into
page copy. Every sentence in a translated page is still written in full
context by a translator (or reviewed by one), per the architecture
documented in `docs/i18n-translations-dictionary.md`. This file exists so
that terminology stays consistent across dozens of pages and multiple
translators/sessions over time, without ever tempting anyone into literal
string substitution.

**How to use each entry below:** "Handling rule" says whether the term is
an official designation that must stay recognisable, or an ordinary word
that needs contextual judgment. "Per-locale guidance" gives natural
reference phrasing and, critically, the traps to avoid — it is guidance on
how to *think about* the term in that language, not a string to paste in.

General principle used throughout: on a page's first substantive mention of
an official body, name, or classification, pair a natural translated
description with the official English term in parentheses; acronyms that
appear on real government documents (eCAR, ONETT, ACR I-Card, 13(a)) stay
in Latin script always, never transliterated, so a client can match the
term against their actual paperwork.

---

## Government agencies

### Bureau of Immigration
**Handling rule:** Official Philippine agency name. Never invent a
translated agency name. Pair a natural description with "(Bureau of
Immigration)" in parentheses on first substantive mention in a page's
prose; persistent chrome (header/footer credential lines) may use a
shortened natural reference without the parenthetical once the full form
has been established elsewhere on the site — never abbreviate to an
invented short form like "BI" in any non-English language.
**Per-locale guidance:**
- zh-CN: 移民局 / 菲律宾移民局, first mention with English gloss.
- ja: 移民局 / フィリピン移民局, first mention with English gloss.
- ko: 이민국 / 필리핀 이민국, first mention with English gloss.
- vi: Cục Di trú / Cục Di trú Philippines, first mention with English gloss.

### Department of Foreign Affairs (DFA)
**Handling rule:** Official agency; same pairing pattern as Bureau of
Immigration. Distinct agency — do not conflate with Bureau of Immigration
in translation even though both are sometimes loosely described as
"immigration-related" in casual English.
**Per-locale guidance:** Translate as "[country] foreign affairs
department/ministry" naturally, with "(Department of Foreign Affairs)" on
first mention. Do not borrow each language's own domestic ministry name as
a stand-in — describe what the Philippine DFA is, don't localize it into a
familiar local institution.

### Bureau of Internal Revenue (BIR)
**Handling rule:** Official Philippine tax authority; relevant mainly on
property-transfer and tax-adjacent pages. Same pairing pattern. Never
translate "BIR" itself — it is a document-facing acronym clients will see
on real forms and receipts, so it stays in Latin script exactly like eCAR
and ONETT below.
**Per-locale guidance:** Natural phrase for "tax authority/revenue
bureau" + "(Bureau of Internal Revenue, BIR)" on first mention; "BIR" alone
thereafter is acceptable and expected, since it is the actual acronym used
on the documents themselves — this is different from "BI," which is not an
acronym clients encounter on real paperwork.

### Registry of Deeds
**Handling rule:** Official land-records office. Same pairing pattern.
Property-transfer content should make clear this is a *government* office,
not a private registry.
**Per-locale guidance:** Translate the function ("land title registry
office") + "(Registry of Deeds)" on first mention.

---

## Official acronyms and classifications (never transliterated)

These stay in Latin script in every language, in every mention, because
they are what a client will see on actual government forms and
certificates. Provide a natural contextual gloss the first time each
appears on a page; do not re-explain on every subsequent mention within
the same page.

- **ACR I-Card** — Alien Certificate of Registration Identity Card. Gloss
  once per page as "foreign national's Philippine registration ID card
  (ACR I-Card)," phrased naturally per language; never translate the name
  itself.
- **13(a)** — a specific Philippine visa/status classification (marriage
  to a Philippine citizen). Never renumber, relabel, or describe generic
  "spousal visa" language as if it were interchangeable with 13(a) itself —
  13(a) is the specific classification name and must appear verbatim
  wherever the English source uses it.
- **eCAR** — Electronic Certificate Authorizing Registration (BIR
  document required for property transfer). Gloss once per page in
  context; never transliterate.
- **ONETT** — One-Time Transaction (a BIR classification relevant to
  property transfer). Gloss once per page in context; never transliterate.

---

## Immigration / status terms (context-dependent — judge per sentence)

### visa application / visa extension
**Handling rule:** Ordinary process terms, but "application" and
"extension" each have a specific procedural meaning here (a formal filing
with the Bureau of Immigration) — do not use a generic everyday word for
"apply" that would also fit "apply for a library card." Distinguish clearly
between filing a *new* application versus *extending* an existing status;
these are procedurally different and must not collapse into one verb in
translation.
**Per-locale guidance:** Use each language's standard formal-immigration
register for "apply/application" and "extend/extension," consistent with
how a Philippine visa consultancy would phrase it, not a literal dictionary
lookup of the English words in isolation.

### immigration status
**Handling rule:** Refers to a person's formal legal standing under
Philippine immigration law (e.g. holding a valid visa, being out of
status). Do not soften into vague language like "situation" — "status" here
is a specific, checkable, documented state.
**Per-locale guidance:** Use each language's standard legal/administrative
term for "status" in an immigration context, not a colloquial synonym.

### downgrading
**Handling rule:** A specific Bureau of Immigration procedural action
(formally reducing/changing a visa classification, e.g. after a change in
circumstances). This is a term of art, not "made worse" or "reduced" in a
general sense — mistranslating it as a vague negative outcome could
misstate what actually happens procedurally.
**Per-locale guidance:** Translate as the specific administrative action
of changing/reclassifying a visa status downward, with enough surrounding
sentence context that the reader understands it is a formal BI process, not
a punishment or an automatic consequence.

### clearance
**Handling rule:** Highly context-dependent — this single English word
covers several unrelated FIS services: exit clearance (permission to
leave the Philippines after a long stay), a derogatory-record/blacklist
clearance, and general administrative clearance. **Never pick one fixed
translation for "clearance" and reuse it everywhere** — translate per the
specific service being described on that page.
**Per-locale guidance:** Confirm which of the above "clearance" refers to
before translating the sentence; use the natural term for that specific
kind of clearance in each language rather than a single catch-all word.

### compliance
**Handling rule:** Refers to an ongoing obligation to meet Philippine
immigration reporting/status requirements (e.g. annual report, staying
within permitted activities) — not general "compliance" in a corporate or
regulatory-audit sense unless the sentence is specifically about corporate
mobility compliance obligations. Read the surrounding sentence to tell
which sense applies.
**Per-locale guidance:** Use the natural immigration-context term for
"keeping one's status in good standing" rather than a generic corporate
"compliance" loanword, unless the sentence is genuinely about a company's
regulatory obligations (corporate/global mobility pages).

---

## Legal-adjacent / high-stakes terms (extra care required)

### detention / immigration proceedings
**Handling rule:** These appear in the site's most sensitive content (the
urgent-assistance messaging for clients who are arrested or detained).
Translate precisely and conservatively — do not soften ("held") or
sensationalize ("imprisoned") beyond what the English source states. Do
not imply FIS provides criminal defense representation, bail guarantees,
or release guarantees; the English source is careful never to claim this,
and translation must preserve that same careful scope exactly, including
any qualifying language the English uses.
**Per-locale guidance:** Use each language's standard, neutral legal
register for "detention" and "proceedings." This content should be
reviewed with particular care in Phase 2 given the stakes for the reader.

### property transfer / title / registration
**Handling rule:** "Title" here means a Philippine land title (a specific
legal document/status), not a job title or a chapter title — context should
make this obvious, but translators should not default to a generic
"title" word without checking. "Registration" on property pages refers to
registering a transfer/title with the Registry of Deeds specifically, not
general-purpose "sign-up" registration (which appears in unrelated ACR
I-Card contexts). "Transfer" itself should not be conflated with
"extension" (immigration) or "downgrading" — these are unrelated FIS
service categories that happen to share vague-sounding English verbs.
**Per-locale guidance:** Use property/real-estate legal register per
language for "title" and "registration"; do not reuse the same word chosen
for immigration "status" registration/reporting concepts elsewhere on the
site.

### documentary requirements / processing
**Handling rule:** "Processing" is used broadly across the whole site
(visa processing, property processing, document processing) — always
translate per the specific process being described in that sentence, never
as one fixed noun bolted onto every service name. "Documentary
requirements" means the specific list of documents/forms needed for a
given transaction — keep it distinct from "compliance" (an ongoing
obligation) and "registration" (a specific filing act).
**Per-locale guidance:** Translate "processing" as the concrete action
being performed (filing, submitting, following up, registering) rather
than a single abstract loanword repeated everywhere.

---

## Corporate / global mobility terminology

**Handling rule:** Refers to FIS's service supporting companies moving
employees into the Philippines (work visas, compliance, relocation
logistics) — not general "corporate mobility" in an HR-strategy or social
mobility sense. Avoid a literal transliteration of "global mobility" that
would read as generic HR jargon disconnected from immigration; the
translation should stay legible as an immigration/relocation-support
service, not a corporate buzzword.
**Per-locale guidance:** Favor natural phrasing around "supporting
companies with employees relocating to/working in the Philippines" over a
compressed jargon term, unless the target language already has a
well-established, natural equivalent term in professional HR/immigration
usage.

---

## Work / employment visa terminology

**Handling rule:** Covers the 9(g) Pre-Arranged Employment Visa and
related work-authorization concepts. Like 13(a), specific classification
labels (e.g. "9(g)") must appear verbatim, never renumbered or
paraphrased. Distinguish "work visa" (the immigration document) from
"work permit" (a related but distinct labor-side concept in some
jurisdictions) — do not use them interchangeably unless the English source
does.
**Per-locale guidance:** Use each language's standard term for a
foreign-national work visa; keep official classification codes (9(g), 13a,
etc.) untranslated and unchanged wherever the English source states them.
