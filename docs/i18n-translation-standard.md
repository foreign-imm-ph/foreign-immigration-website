# Phase 2 translation standard

This is the formal quality bar every Phase 2 page translation must meet
before a locale is marked `"active"` in `src/_data/site.json`. It applies
on top of, not instead of, `docs/i18n-glossary.md`.

## Required for every translated sentence

1. **Not literal by default.** Translate meaning, not words. A fluent,
   natural sentence in the target language that preserves the English
   sentence's meaning is correct even where its word order, sentence
   count, or grammatical structure differs substantially from the English
   source.
2. **Contextual review**, considering which of the following domains the
   sentence belongs to, since several ordinary English words (processing,
   status, clearance, transfer, title, registration, compliance) mean
   different things depending on domain:
   - Philippine immigration and visa procedure
   - Philippine government administration generally
   - property-transfer processing (BIR / Registry of Deeds / eCAR / ONETT)
   - corporate / global mobility
   - legal-adjacent services (Legal Support page, detention/proceedings
     content)
   - the specific client action the sentence is describing
3. **Preserve, exactly:**
   - the meaning of the English source
   - the commercial intent (what FIS is offering, and to whom)
   - the level of certainty/hedging in the English source (if the English
     says "may," "can help identify," or "where applicable," the
     translation must carry the same qualification — never firm it up
     into "will" or "guarantees")
   - the scope of the English source (do not narrow or broaden what FIS is
     claiming to do)
4. **Professional register** appropriate to an immigration/property/
   business-services consultancy, natural to a native speaker of that
   language — not a tone that reads as machine-translated or as an
   English sentence with words swapped one-for-one.

## Never do this in translation

- Invent a legal concept, visa classification, or government process that
  does not exist in the English source.
- Invent a translated name for a government agency, form, permit,
  certificate, or statute — see `docs/i18n-glossary.md` for the
  official-terminology pairing pattern.
- Broaden FIS's claimed authority (e.g. implying legal representation, tax
  advice, notarization authority, or government authority the English
  source does not claim).
- Introduce a guarantee, procedural or outcome-based, that the English
  source does not make.
- Remove a material qualification present in the English source ("in most
  cases," "where applicable," "subject to Bureau of Immigration
  requirements," etc.).
- Strengthen careful English wording into a firmer legal claim just
  because the natural target-language phrasing would otherwise sound more
  confident — the correct fix is a more careful natural sentence, not a
  more confident one.

## Process

1. Translate the full page in its own locale file directly (never through
   the `t` chrome dictionary — see `docs/i18n-translations-dictionary.md`
   for why).
2. Check every official term/acronym against `docs/i18n-glossary.md`.
3. Re-read the translated page against the English source specifically
   for scope creep — every claim, qualification, and hedge should have a
   traceable counterpart.
4. Build locally (`npm run build`) and inspect the rendered output before
   requesting the locale be flipped to `"active"`.
5. A locale should only move from `"sample"` to `"active"` in
   `site.json` once every page under that locale's directory has been
   through this process — not partially, since once active a locale's
   pages become indexable, linked from navigation, and included in
   hreflang/sitemap output.
