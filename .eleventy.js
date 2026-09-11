// Locale UI-string dictionaries. These are small, hand-maintained lookup
// tables for short, unambiguous chrome strings only (nav labels, footer,
// language-selector labels, buttons) — never full page copy. Full page
// content is written directly, per locale, in its own template file, so
// translators always have complete sentence/paragraph context rather than
// working from isolated dictionary fragments. See
// docs/i18n-translations-dictionary.md and docs/i18n-glossary.md.
const translations = {
  en: require("./src/_translations/en.json"),
  "zh-CN": require("./src/_translations/zh-CN.json"),
  "zh-Hant": require("./src/_translations/zh-Hant.json"),
  ja: require("./src/_translations/ja.json"),
  ko: require("./src/_translations/ko.json"),
  vi: require("./src/_translations/vi.json"),
};

function getByPath(obj, keyPath) {
  return keyPath
    .split(".")
    .reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), obj);
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/CNAME": "CNAME" });

  eleventyConfig.addFilter("absoluteUrl", function (url, base) {
    try {
      return new URL(url, base).toString();
    } catch (e) {
      return url;
    }
  });

  // UI-string lookup used by chrome (nav/footer/language-switcher): looks up
  // `key` in the target locale's dictionary, falls back to the English
  // dictionary (and warns at build time) if the key is missing there, and
  // never returns undefined/"undefined" to the template.
  eleventyConfig.addFilter("t", function (key, lang) {
    const targetLang = lang || "en";
    const dict = translations[targetLang] || translations.en;
    const value = getByPath(dict, key);
    if (value !== undefined) return value;

    const fallback = getByPath(translations.en, key);
    if (fallback !== undefined) {
      console.warn(`[i18n] Missing "${key}" for locale "${targetLang}" — falling back to English.`);
      return fallback;
    }

    console.warn(`[i18n] Missing "${key}" for locale "${targetLang}" and no English fallback exists.`);
    return "";
  });

  // Given the full page collection, a translationKey (an English-rooted path
  // such as "/services/property-transfer-and-documentation-support/" or "/"),
  // and a target locale code, returns the URL of that locale's equivalent
  // page if it has been built, or null if no such page exists yet. Used by
  // both the language switcher (which falls back to the target locale's
  // homepage when this returns null) and the hreflang/sitemap generators
  // (which only ever emit alternates for pages that genuinely exist).
  eleventyConfig.addFilter("equivalentUrl", function (collection, translationKey, targetLang) {
    if (!Array.isArray(collection)) return null;
    const match = collection.find(
      (item) => item.data && item.data.lang === targetLang && item.data.translationKey === translationKey
    );
    return match ? match.url : null;
  });

  // Locale launch gate: returns only the locales marked "active" in
  // site.json, as an array of {code, ...locale}. This is the single switch
  // that controls public exposure — the language switcher, the hreflang
  // block, and the sitemap alternates all loop over this filter's output
  // rather than the raw site.locales object, so a locale stays fully built
  // (reachable by direct URL for review) but invisible to navigation, SEO
  // metadata and search engines until its status in site.json is flipped
  // from "sample" to "active". English is always "active".
  eleventyConfig.addFilter("activeLocales", function (locales) {
    return Object.keys(locales || {})
      .filter((code) => locales[code].status === "active")
      .map((code) => Object.assign({ code: code }, locales[code]));
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "11ty.js"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
