# UI-string dictionaries (`src/_translations/`)

These five JSON files (`en.json` is authoritative) hold **short,
unambiguous chrome strings only** — the skip-link, primary navigation
labels, footer legal links and copyright line, the header/footer
institutional-credential line, and the language-switcher's accessible
label.

They deliberately do **not** hold page body copy (headlines, paragraphs,
FAQs, service lists). That content is hand-authored directly in each
locale's own template file (e.g. `src/zh-cn/index.njk`), so a translator
always works with complete sentences in full context rather than isolated
fragments — see `docs/i18n-glossary.md` for the terminology policy that
governs that page-level content in Phase 2.

## How lookups work

`.eleventy.js` registers a Nunjucks filter, `t`, used as:

```njk
{{ "nav.home" | t(lang) }}
```

It looks up the dot-path key in the target locale's dictionary; if missing,
it falls back to `en.json` and logs a build-time warning (visible in
`npm run build` output) so a missing key is never silent and never renders
as `"undefined"`.

## Adding a key

Add it to `en.json` first (this is the fallback every other locale relies
on), then add the equivalent to each of the other four files. A key present
in `en.json` but missing elsewhere will still build correctly — it just
falls back to English with a build-time warning — but should be filled in
before that locale is marked `"active"` in `src/_data/site.json`.

## Institutional-name policy (Bureau of Immigration)

Translated copy never abbreviates "Bureau of Immigration" to an invented
shorthand like "BI" — that reads as an official abbreviation when it is
only FIS's own informal English shorthand (the existing English copy uses
"BI" as pre-existing house style; that is not extended to other languages).
The convention used here:

- The **first substantive mention** in a page's own running prose (e.g. the
  homepage hero lede) states a natural translated description together with
  the official English institutional name in parentheses, e.g.
  `菲律宾移民局（Bureau of Immigration）`.
- Persistent **chrome** mentions — the header credential strip and the
  footer accreditation line, which appear on every page regardless of
  which page a visitor lands on first — use a natural shortened
  local-language reference instead, e.g. `移民局认证咨询机构`, never "BI"
  and never an invented official abbreviation.

## Locale activation (`site.json.locales[code].status`)

Each locale in `src/_data/site.json` carries a `status` of `"active"` or
`"sample"`. Only `"active"` locales are looped into the language switcher,
the `<head>` hreflang block, and the sitemap's hreflang alternates (via the
`activeLocales` Nunjucks filter in `.eleventy.js`); a `"sample"` locale's
own pages are additionally marked `<meta name="robots" content="noindex,
nofollow">` and excluded from the sitemap's `<url>` listing entirely.

A `"sample"` locale's pages are still built and reachable by typing their
URL directly (e.g. `/zh-cn/`) — this is the deliberate route for reviewing
work in progress before launch. **To launch a locale, change its `status`
to `"active"` in `site.json` — nothing else needs to change.** The
switcher, hreflang set, sitemap and robots meta all update automatically
from that one flag.
