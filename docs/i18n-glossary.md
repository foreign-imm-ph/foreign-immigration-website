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
- zh-Hant: 移民局 / 菲律賓移民局, first mention with English gloss. Always
  prefix 菲律賓 at the establishing mention (short "移民局" is fine
  thereafter) — zh-Hant readers span multiple jurisdictions with their own
  immigration authorities (Taiwan's 內政部移民署, Hong Kong's 入境事務處,
  Macau's, Mainland China's 國家移民管理局), none of which is named "移民局"
  exactly, but the generic term alone is more likely to be misread as
  "some immigration authority" without a jurisdiction unless qualified —
  zh-CN's single-country audience carries less of this ambiguity than
  zh-Hant's multi-jurisdiction one.
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
- zh-Hant: 菲律賓外交部(Department of Foreign Affairs), always with the
  菲律賓 prefix. "外交部" bare is the generic Chinese pattern name for
  "ministry of foreign affairs" used by both Taiwan (中華民國外交部) and
  Mainland China (外交部) — without the country qualifier a reader could
  momentarily read it as one of those two, not the Philippines'.
- ja: フィリピン外務省(Department of Foreign Affairs), always with the
  フィリピン prefix — bare "外務省" is Japan's own Ministry of Foreign
  Affairs' exact name.
- vi: Bộ Ngoại giao Philippines (Department of Foreign Affairs), always
  with the Philippines qualifier — bare "Bộ Ngoại giao" is Vietnam's own
  Ministry of Foreign Affairs' exact name.

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
- zh-Hant: 菲律賓稅務局(Bureau of Internal Revenue, BIR), always with the
  菲律賓 prefix, "BIR" alone thereafter. This is the highest-collision term
  in the glossary for zh-Hant: Taiwan's tax bureaus are commonly named
  "國稅局," and Hong Kong's Inland Revenue Department is officially "稅務局"
  — the exact string this entry would otherwise use bare. "稅務局" (rather
  than "國稅局") was chosen specifically because it reads as a generic
  "tax bureau" everywhere rather than borrowing Taiwan's "國稅局" framing,
  and the mandatory 菲律賓 prefix at the establishing mention removes any
  reading of it as Hong Kong's own department.
- ja: フィリピン国税庁(Bureau of Internal Revenue, BIR), always with the
  フィリピン prefix, "BIR" alone thereafter — bare "国税庁" is Japan's own
  National Tax Agency's exact name, the same class of collision as BIR in
  zh-Hant.
- vi: Cục Thuế Nội địa Philippines (Bureau of Internal Revenue, BIR),
  always with the Philippines qualifier, "BIR" alone thereafter. Vietnam's
  own tax authority is officially named Tổng cục Thuế (General Department
  of Taxation), a different name, so this is precautionary rather than a
  direct collision — but the Philippines qualifier is kept anyway since
  "Cục Thuế" bare reads as a generic "tax department" a reader could
  otherwise place in Vietnam.

### Registry of Deeds
**Handling rule:** Official land-records office. Same pairing pattern.
Property-transfer content should make clear this is a *government* office,
not a private registry.
**Per-locale guidance:** Translate the function ("land title registry
office") + "(Registry of Deeds)" on first mention.
- zh-Hant: 土地登記機關(Registry of Deeds) — a descriptive phrase, not an
  invented official name. Deliberately avoids both Taiwan's "地政事務所"
  and Hong Kong's "土地註冊處" (Land Registry's own official Chinese name)
  so the phrase reads as a plain description of the office's function
  rather than borrowing either jurisdiction's specific institution name.
  Keep "Registry of Deeds" visible in English at the establishing mention.
- ja: 不動産登記機関(Registry of Deeds) — a descriptive phrase, avoiding
  both "登記所" (the old colloquial name for Japan's own registration
  offices) and "法務局" (the Legal Affairs Bureau, Japan's current official
  name for the body that handles real-estate registration today).
- vi: cơ quan đăng ký quyền sở hữu bất động sản (Registry of Deeds) — a
  descriptive phrase, deliberately avoiding "Văn phòng đăng ký đất đai,"
  which is the actual, specific name of Vietnam's own real local land
  registration offices (under each province's Sở Tài nguyên và Môi
  trường). Using that exact Vietnamese office name for a Philippine
  institution would misidentify the jurisdiction; the plain descriptive
  phrase plus "(Registry of Deeds)" in English avoids the collision
  entirely.

### Department of Labor and Employment (DOLE) / PEZA / BOI
**Handling rule:** Relevant on work-visa and corporate/global-mobility
pages. Same official-name pairing pattern as the agencies above. This
entry was not previously documented per-locale; adding zh-Hant guidance
now as part of the Traditional Chinese rollout.
**Per-locale guidance:**
- zh-Hant: 菲律賓勞動部(Department of Labor and Employment, DOLE), always
  with the 菲律賓 prefix — "勞動部" bare is Taiwan's own ministry's exact
  official name. "DOLE" alone thereafter, matching the BIR/acronym
  pattern. PEZA and BOI are Philippine-specific enough that a natural
  description + English name + acronym carries no comparable collision
  risk: 菲律賓經濟區署(Philippine Economic Zone Authority, PEZA) and
  菲律賓投資署(Board of Investments, BOI), acronym alone thereafter.
- ja: フィリピン労働雇用省(Department of Labor and Employment, DOLE),
  フィリピン prefix throughout for consistency with the other agencies
  above (Japan's own ministry, 厚生労働省, has a different name, so this is
  precautionary rather than a direct collision). "DOLE" alone thereafter.
  PEZA as フィリピン経済区庁(Philippine Economic Zone Authority, PEZA) and
  BOI as 投資委員会(Board of Investments, BOI), acronym alone thereafter.
- vi: Bộ Lao động và Việc làm Philippines (Department of Labor and
  Employment, DOLE), Philippines qualifier throughout — Vietnam's own
  ministry is officially Bộ Lao động - Thương binh và Xã hội, a
  differently-worded name, so this is precautionary rather than a direct
  collision. "DOLE" alone thereafter. PEZA as Cơ quan Khu kinh tế
  Philippines (Philippine Economic Zone Authority, PEZA) and BOI as Ủy
  ban Đầu tư Philippines (Board of Investments, BOI), acronym alone
  thereafter.

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

zh-Hant treatment for all four: kept exactly as above (ACR I-Card, 13(a),
9(g), eCAR, ONETT stay in Latin script/original form in every mention),
each glossed once per page in natural Traditional Chinese — e.g. 13(a) as
"13(a) 婚姻移民簽證(13(a) Immigrant Visa by Marriage)" and ACR I-Card as
"外國人在菲律賓的登記身份證(ACR I-Card)" — never renumbered, never
translated into a Chinese-only label that drops the identifier a client
would need to match against their actual document.

ja treatment for all four: kept in Latin script/original form in every
mention, each glossed once per page in natural Japanese — e.g. ACR I-Card
as "外国人登録証明カード(ACR I-Card)", 13(a) as
"13(a) 婚姻に基づく移民ビザ(13(a) Immigrant Visa by Marriage)", eCAR as
"電子登記承認証明書(eCAR)", ONETT as "一回限りの取引(ONETT)" — the
identifier itself is never renumbered, transliterated into katakana, or
dropped in favor of a Japanese-only label.

vi treatment for all four (plus 9(g), also relevant on work-visa pages):
kept in Latin script/original form in every mention, each glossed once
per page in natural Vietnamese — e.g. ACR I-Card as "thẻ đăng ký công dân
nước ngoài (ACR I-Card)", 13(a) as "thị thực diện hôn nhân 13(a) (13(a)
Immigrant Visa by Marriage)", 9(g) as "thị thực lao động diện 9(g) (9(g)
Pre-Arranged Employment Visa)", eCAR as "giấy chứng nhận đăng ký điện tử
(eCAR)", ONETT as "giao dịch một lần (ONETT)" — never renumbered, never
transliterated, never dropped in favor of a Vietnamese-only label.

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

---

## zh-Hant cross-regional vocabulary decisions

Traditional Chinese is read natively across Taiwan, Hong Kong, Macau, and
by overseas and Traditional-script-literate Mainland readers, several of
whom use different everyday words for the same everyday concept. Naturalness
still comes first (see `docs/i18n-translation-standard.md`); these are the
recurring words where a single consistent site-wide choice was made because
an equally natural, broadly-understood alternative existed:

- **identity documents:** 身份 (not 身分). Both are the same word, same
  pronunciation, pure orthographic variants — Hong Kong and Mainland usage
  both write 身份; only Taiwan's own government paperwork prefers 身分, and
  身份 remains completely natural and common in Taiwan as well, so it is
  the broader-reaching choice with zero naturalness cost.
- **registration (property/status filings):** 登記, not 註冊. 登記 is
  Taiwan's and Mainland's natural word for a formal government filing
  (地政登記, 不動產登記) and is entirely intelligible in Hong Kong too, even
  though Hong Kong's Land Registry is itself officially named 土地註冊處.
  註冊 is reserved for account/membership-style sign-up, which this site
  does not describe.
- **personal data (privacy content):** 個人資料, not 個人信息/個人數據.
  This is the term used in Taiwan's and Hong Kong's own data-protection
  statutes and reads naturally everywhere, including to Mainland readers.
- **contact (verb/CTA):** 聯絡, not 聯繫. Both are natural; 聯絡 was picked
  and used consistently for every "Contact us" / "get in touch" instance.
- **Client Portal:** 客戶專區 throughout (nav, page title, CTAs), rather
  than a literal "portal" rendering. 專區 ("dedicated area/zone") is a
  well-established, natural Traditional Chinese web-UI term across regions
  and reads as native UI copy rather than a translated technical term.
- **process/procedure:** deliberately not fixed to one word — 手續, 流程,
  and 程序 are all natural and broadly understood; the choice on each page
  follows whichever fits that sentence, consistent with the existing rule
  against single fixed mappings for context-dependent terms.

---

## ja register and vocabulary decisions

Target register: professional business Japanese for a consulting/services
site — courteous and direct, not government-bureaucratic and not
over-formal keigo. です/ます base register throughout; polite request
forms (〜いただけます, 〜ください) used naturally, not stacked into
excessive double honorifics. CTAs are short and direct (e.g. お問い合わせ,
サービスを見る) rather than full ceremonial sentences.

**Persistent-nav length constraint:** the top nav's desktop/mobile
breakpoint is frozen at 1200px (see header architecture notes elsewhere in
this repo) and is not to be redesigned for any one locale. Japanese
full-width characters are wider per character than the Latin, Hangul or
mixed-width strings the six nav slots were originally sized for, so a nav
label that reads naturally in body prose can still overflow the frozen
breakpoint purely on character count. Two nav labels were shortened for
this reason alone (not a translation-quality judgment): クライアントポータル
(10 characters) to 顧客ポータル (6 characters) for "client portal," and
お問い合わせ to the equally standard, un-okurigana'd お問合せ for "contact" —
both are ordinary, attested short forms on Japanese corporate sites, not
invented abbreviations. Because ko/zh-CN/zh-Hant all use one identical
term in both the nav and the body copy (never a shorter nav-only variant),
顧客ポータル was substituted for every body-copy occurrence of the term as
well, so ja keeps that same one-term-everywhere discipline rather than
having the nav and body disagree.

- **visa:** ビザ throughout (katakana) — the standard, universally
  understood Japanese term; no reason to avoid it.
- **immigration status:** 在留資格 for the formal legal-standing concept
  (holding a valid visa / being in status). This is the same term Japan's
  own immigration law uses for its own system, but it is a generic
  descriptive compound (visa/period-of-stay status), not a proper
  institution name, so using it for the Philippine system is natural and
  carries no collision risk the way a ministry or bureau name would.
- **residency / long-term status:** 長期在留資格.
- **compliance:** コンプライアンス (katakana) for the general business
  concept (corporate/global mobility pages); 遵守 / 順守 as a verb for
  "keeping one's status/requirements in order" in ordinary immigration
  sentences — not fixed to one word, per the general "compliance" rule
  above.
- **corporate mobility / global mobility:** rendered descriptively as
  "企業の海外赴任者対応" (corporate support for internationally-assigned
  staff) rather than a katakana "グローバル・モビリティ" jargon term, so it
  reads as an immigration/relocation service, not generic HR buzzwords.
- **property transfer:** 不動産譲渡 as the main service name (transfer of
  real property); 名義変更 (change of registered title/name) for the
  specific transfer action; 登記 for "registration" (a generic, universal
  Japanese legal-filing word — not exclusive to Japan's own system, so no
  collision risk the way an institution name would carry).
- **client portal:** 顧客ポータル (kanji + katakana) throughout, used
  identically in the persistent nav and in every body-copy mention — see
  the persistent-nav length constraint note above for why this is shorter
  than the katakana-only クライアントポータル a first draft used.
- **enquiry / contact:** お問い合わせ in body copy and CTA links; お問合せ
  specifically in the persistent nav slot only, for the same
  character-budget reason (see above) — the two spellings are the same
  word with/without okurigana, not different terms.
- **katakana discipline:** katakana used where it is the natural,
  expected term (ビザ, コンプライアンス, ポータル), not avoided for
  ideological consistency — but not reached for by default either;
  descriptive Japanese is preferred wherever it reads more naturally than
  a borrowed term (corporate mobility, property transfer above).

---

## vi register and vocabulary decisions

Target register: polished professional Vietnamese for a reputable
immigration consultancy — respectful, direct, commercially credible; not
government-bureaucratic, not archaic, not internet-casual. Pronoun use is
kept light: "Quý khách" is used where direct address genuinely reads
better in a sentence, but most sentences use subject-omitted or
impersonal Vietnamese constructions rather than repeating "Quý khách" in
every line, matching how a professional Vietnamese services site actually
reads (heavy repetition of any second-person address term reads as stiff,
translated prose in Vietnamese). CTAs are short, direct verb phrases
("Gửi yêu cầu tư vấn," "Xem dịch vụ") rather than full ceremonial
sentences. Headings use natural Vietnamese sentence-style capitalization
(only the first word and proper nouns/identifiers capitalized), not a
mechanical copy of English Title Case.

- **visa:** thị thực throughout, as the correct formal/professional
  register term for a consultancy site (as opposed to the casual loanword
  "visa," which is extremely common in everyday spoken Vietnamese but
  reads less professionally in formal service copy). "Visa" itself is
  used only where it appears inside an official English classification
  name that must stay verbatim (e.g. "9(g) Pre-Arranged Employment
  Visa").
- **immigration (institutional sense):** di trú, matching the
  already-established "Cục Di trú" (Bureau of Immigration) and the site's
  existing accreditation chrome ("Đơn vị được Cục Di trú công nhận"). Not
  fixed to "xuất nhập cảnh" (entry-exit administration) except where a
  sentence is specifically about the entry/exit/border-control function
  itself, per the general context-dependent handling of "immigration"
  elsewhere in this glossary.
- **immigration status:** tình trạng cư trú for the general legal-standing
  concept (holding a valid visa / being in status); tình trạng thị thực
  specifically when a sentence is narrowly about visa validity itself.
  Not fixed to one string across every context, consistent with the
  general "immigration status" handling rule above.
- **residency / long-term status:** cư trú dài hạn, not thường trú dài
  hạn. "Thường trú" carries a strong permanent/naturalization-track
  connotation in Vietnamese (household-registration permanent residence),
  which would overstate what this service actually is (a long-term
  Philippine visa/status category, not permanent residency or a path to
  citizenship) — "cư trú dài hạn" (long-term residency) states the
  concept accurately without that implication.
- **compliance:** tuân thủ quy định (di trú) for the ongoing
  immigration-status-maintenance sense; tuân thủ alone or "tuân thủ quy
  định" for the general corporate/regulatory sense on corporate-mobility
  pages — not fixed to a single string, per the general "compliance" rule
  above.
- **corporate / global mobility:** hỗ trợ di chuyển nhân sự doanh nghiệp
  (corporate personnel mobility support), a descriptive phrase rather
  than a transliterated "global mobility" HR-jargon term, so it reads as
  an immigration/relocation service rather than generic HR buzzwords.
- **property transfer:** chuyển nhượng bất động sản as the main service
  name; sang tên for the specific transfer/re-titling action; đăng ký for
  "registration" (a generic, universal Vietnamese legal-filing word, not
  exclusive to any one Vietnamese institution, so no collision risk).
  Property title is rendered descriptively as giấy chứng nhận quyền sở
  hữu bất động sản rather than the Vietnam-specific colloquial "sổ đỏ" /
  "sổ hồng" (the actual popular names of Vietnam's own land-title
  certificates under Vietnamese land law), which would misleadingly
  suggest the Philippine system uses Vietnam's own title instruments.
- **client portal:** Cổng thông tin khách hàng in body copy and page
  titles; see the persistent-nav length note below for why the nav slot
  specifically uses a shorter form.
- **enquiry / contact:** yêu cầu tư vấn for "enquiry" as a noun
  (consultation request, matching the site's existing CTA "Gửi yêu cầu tư
  vấn"); liên hệ for "contact" as a verb/CTA and nav label.
- **legal support / urgent assistance:** hỗ trợ pháp lý / hỗ trợ khẩn cấp.
  For the urgent-assistance messaging specifically, all four required
  concepts (arrest, detention, criminal proceedings, immigration
  proceedings) are stated explicitly and separately — bị bắt (arrest), bị
  giam giữ (detention), tố tụng hình sự (criminal proceedings), thủ tục
  tố tụng di trú (immigration proceedings) — never collapsed into a
  single vaguer phrase.
- **Vietnamese-specific loanword discipline:** English/Latin-script terms
  are kept only where they are an official institutional name, an
  official identifier, an acronym, or where the English term is genuinely
  the standard one in professional Vietnamese usage (e.g. "visa" appears
  only inside verbatim official classification names, never as loose
  prose vocabulary, per the "thị thực" decision above). The site is not
  artificially English-heavy, and Vietnamese vocabulary is not avoided
  merely to look modern.

**Persistent-nav length constraint:** the top nav's desktop/mobile
breakpoint is frozen at 1200px and is not to be redesigned for any one
locale (see the ja section above, where two Japanese nav labels needed
shortening for the same reason). Vietnamese words can run longer than
their Chinese, Korean or Japanese equivalents because Vietnamese is
written with full Latin letters rather than compact CJK characters, so
nav-slot width was checked specifically for Vietnamese during QA.

At 1200px, adding the Vietnamese self-name "Tiếng Việt" to the closed
language-switcher toggle (the same untouchable per-locale name string as
日本語 or 한국어, and just as immovable — no shorter form of a language's
own name is available) left the six nav links needing to share several
fewer pixels than any CJK/Hangul locale ever required, since "Tiếng
Việt" alone is wider than English, Chinese, Korean or Japanese's own
name string.

An initial pass shortened the accreditation nav label to Công nhận and
the client-portal nav label to Cá nhân to make the row fit. A subsequent
pre-activation review flagged Cá nhân as too ambiguous standing alone in
a nav bar — it reads as "Personal"/"Individual" rather than clearly
signalling a client area, which is a real naturalness problem, not a
stylistic quibble. That review also re-examined Công nhận on its own
merits (independent of the space question) and concluded it is
grammatically verb-flavoured on its own — natural inside the sentence it
was drawn from ("Đơn vị được Cục Di trú công nhận"), but not the noun a
reader expects a standalone nav item to be — whereas Chứng nhận is the
standard, unambiguous noun for "accreditation/certification" and reads
correctly as a nav label.

Every alternative that keeps the literal words "khách hàng" ("client")
was measured and does not fit at 1200px regardless of the accreditation
label chosen: Cổng khách hàng (the body-copy term itself) overflows by
~58px even paired with the shortest accreditation label tried; Khu vực
khách hàng and Tài khoản khách hàng overflow further still; even bare
Khách hàng overflows by ~19px. Tài khoản ("Account") — clearer than Cá
nhân and a step short of the full "khách hàng" phrasing — still overflows
by 4px next to Công nhận and by 15px next to the correct Chứng nhận, so
it does not clear the bar either.

The combination that both fits exactly at 1200px and resolves the
ambiguity complaint reverts accreditation to the correct noun and changes
only the client-portal nav word:
- **accreditation nav label:** Chứng nhận (reverted from the first pass's
  Công nhận, per the naturalness finding above). This matches the page's
  own H1, body copy and title, which always used Chứng nhận — nav and
  body are now fully consistent again.
- **client portal nav label:** Hồ sơ ("file"/"case record"), nav slot
  only. This is the ordinary Vietnamese word a client uses for "my case/
  file" with any professional services provider (hồ sơ của tôi), so it
  reads as pointing to a substantive client area tied to what the portal
  actually contains (applications, documents) rather than a vague
  "Personal" section, while being short enough to fit alongside the full
  Chứng nhận. The page itself, its title, and every body-copy "track your
  transaction" mention keep the fuller Cổng khách hàng (itself already
  shortened once from an initial Cổng thông tin khách hàng first draft)
  — nav and body intentionally diverge here because no phrasing
  containing "khách hàng" fits the nav row, so the nav uses the
  Bureau-of-Immigration-style "chrome may reference the full form
  already established elsewhere on the site" pattern documented above
  for institutional names, rather than forcing one identical string into
  both places.
