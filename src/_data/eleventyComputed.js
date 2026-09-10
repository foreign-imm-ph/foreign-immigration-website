// Two small computed values, merged into every page's data automatically:
//
// - lang: the page's locale code (falls back to "en" — a safety net only;
//   every existing English page already sets `lang: en` explicitly in its
//   own front matter, and every new locale directory sets it via directory
//   data, so this default should rarely actually be exercised).
//
// - translationKey: the page's URL with any locale prefix stripped, e.g.
//   "/zh-cn/services/property-transfer-and-documentation-support/" becomes
//   "/services/property-transfer-and-documentation-support/" — the same
//   value an English page's own translationKey already is. This is the
//   join key the language switcher, hreflang block and sitemap alternates
//   all use (via the `equivalentUrl` filter in .eleventy.js) to find a
//   page's equivalent in another locale without needing a hand-maintained
//   mapping file — as long as a translated page's file lives at the same
//   relative path under its locale directory as the English original, it
//   is automatically discovered as that page's translation.
module.exports = {
  lang: (data) => data.lang || "en",
  translationKey: (data) => {
    const url = data.page.url;
    const locales = (data.site && data.site.locales) || {};
    for (const code in locales) {
      const prefix = locales[code].prefix;
      if (code !== "en" && prefix && url.indexOf(prefix) === 0) {
        return "/" + url.slice(prefix.length);
      }
    }
    return url;
  },
};
