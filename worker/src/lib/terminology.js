// Deterministic terminology protection for the translation pipeline
// (worker/src/lib/translation.js). Phase 1 testing found the model
// sometimes drifted on two categories of term: a specific Vietnamese word
// (passport) mistranslated into an unrelated document concept, and
// Philippine government agency names substituted with the equivalent
// domestic institution in the client's own country. Both are protected
// here by swapping the term for an opaque placeholder BEFORE the text ever
// reaches the model, then restoring the authoritative form afterward — the
// model is never asked to decide what a protected term means or becomes.
//
// The authoritative target-language forms below are taken directly from
// docs/i18n-glossary.md (the site's own existing, already-approved
// terminology reference for zh-Hant/ja/vi, and partially zh-CN/ko) wherever
// it documents a term. Where the glossary only covers zh-Hant/ja/vi/ko for
// one agency (Bureau of Immigration) but not the others, the zh-CN and ko
// forms below are derived the same way the glossary derives every other
// locale's form: a natural description of the office's function or the
// agency's name, with an explicit "Philippines"/菲律賓/필리핀 qualifier,
// choosing a phrase that does not collide with that country's own
// like-named domestic institution (documented per-term below, mirroring
// the glossary's own stated reasoning).
//
// Deliberately NOT protected here despite appearing in a broader
// candidate list: "visa", "visa extension", "immigration status", and
// "reference number". docs/i18n-glossary.md explicitly documents these as
// context-dependent terms requiring per-sentence judgment, not fixed-form
// official designations — forcing one rigid string into every sentence
// would contradict the site's own established translation philosophy and
// risks worse, not better, output. Nothing in Phase 1 testing found these
// four terms actually drifting, unlike the two categories protected below.
// Free-form data (passport numbers, FIS reference codes, dates, amounts)
// is also left to the model, which Phase 1 testing found reliable for
// these — placeholder protection here is reserved for fixed vocabulary,
// not arbitrary per-message data.

const OPEN = "⟦"; // ⟦ — a bracket essentially never used in ordinary prose
const CLOSE = "⟧"; // ⟧
// No "g" flag: used only for a stateless existence check in restoreTerms,
// and a global regex's mutable lastIndex would otherwise leak state across
// calls and cause an intermittent false negative on a later invocation.
const PLACEHOLDER_PATTERN = /⟦FIS_[A-Za-z0-9]+_\d+⟧/;

// Each entry:
//   english: the form(s) recognized in an English source (outbound) or
//     appearing verbatim inside non-English text (inbound) — codes/acronyms
//     are never localized, so the same strings serve both roles.
//   inboundVariants[lang]: that language's own natural term(s) for the
//     concept, recognized in inbound (client-language) text and restored to
//     the plain English form on the way to English.
//   outboundForm[lang]: the authoritative string restored into outbound
//     (English-to-client-language) translations.
const PROTECTED_TERMS = [
  {
    id: "BUREAU_OF_IMMIGRATION",
    english: ["Bureau of Immigration"],
    inboundVariants: {
      "zh-CN": ["菲律宾移民局", "移民局"],
      "zh-Hant": ["菲律賓移民局", "移民局"],
      ko: ["필리핀 이민국", "이민국"],
      ja: ["フィリピン移民局", "移民局"],
      vi: ["Cục Di trú Philippines", "Cục Di trú"],
    },
    outboundForm: {
      "zh-CN": "菲律宾移民局（Bureau of Immigration）",
      "zh-Hant": "菲律賓移民局（Bureau of Immigration）",
      ko: "필리핀 이민국(Bureau of Immigration)",
      ja: "フィリピン移民局（Bureau of Immigration）",
      vi: "Cục Di trú Philippines (Bureau of Immigration)",
    },
  },
  {
    // Same collision class as Bureau of Immigration (Taiwan/China/Japan/
    // Vietnam each have their own like-named foreign-affairs ministry) —
    // already documented in the glossary as a comparable risk, added here
    // per the instruction to inspect existing material for other
    // high-risk terms, not invented from nothing.
    id: "DEPARTMENT_OF_FOREIGN_AFFAIRS",
    english: ["Department of Foreign Affairs"],
    inboundVariants: {
      "zh-CN": ["菲律宾外交部"],
      "zh-Hant": ["菲律賓外交部"],
      ko: ["필리핀 외교부"],
      ja: ["フィリピン外務省"],
      vi: ["Bộ Ngoại giao Philippines"],
    },
    outboundForm: {
      "zh-CN": "菲律宾外交部（Department of Foreign Affairs）",
      "zh-Hant": "菲律賓外交部（Department of Foreign Affairs）",
      ko: "필리핀 외교부(Department of Foreign Affairs)",
      ja: "フィリピン外務省（Department of Foreign Affairs）",
      vi: "Bộ Ngoại giao Philippines (Department of Foreign Affairs)",
    },
  },
  {
    id: "BUREAU_OF_INTERNAL_REVENUE",
    english: ["Bureau of Internal Revenue"],
    inboundVariants: {
      "zh-CN": ["菲律宾税务局"],
      "zh-Hant": ["菲律賓稅務局"],
      ko: ["필리핀 국세청"],
      ja: ["フィリピン国税庁"],
      vi: ["Cục Thuế Nội địa Philippines"],
    },
    outboundForm: {
      "zh-CN": "菲律宾税务局（Bureau of Internal Revenue, BIR）",
      "zh-Hant": "菲律賓稅務局（Bureau of Internal Revenue, BIR）",
      ko: "필리핀 국세청(Bureau of Internal Revenue, BIR)",
      ja: "フィリピン国税庁（Bureau of Internal Revenue, BIR）",
      vi: "Cục Thuế Nội địa Philippines (Bureau of Internal Revenue, BIR)",
    },
  },
  {
    id: "BIR_ACRONYM",
    english: ["BIR"],
    inboundVariants: {},
    outboundForm: { "zh-CN": "BIR", "zh-Hant": "BIR", ko: "BIR", ja: "BIR", vi: "BIR" },
  },
  {
    id: "DEPARTMENT_OF_LABOR_AND_EMPLOYMENT",
    english: ["Department of Labor and Employment"],
    inboundVariants: {
      "zh-CN": ["菲律宾劳动部"],
      "zh-Hant": ["菲律賓勞動部"],
      ko: ["필리핀 고용노동부"],
      ja: ["フィリピン労働雇用省"],
      vi: ["Bộ Lao động và Việc làm Philippines"],
    },
    outboundForm: {
      "zh-CN": "菲律宾劳动部（Department of Labor and Employment, DOLE）",
      "zh-Hant": "菲律賓勞動部（Department of Labor and Employment, DOLE）",
      ko: "필리핀 고용노동부(Department of Labor and Employment, DOLE)",
      ja: "フィリピン労働雇用省（Department of Labor and Employment, DOLE）",
      vi: "Bộ Lao động và Việc làm Philippines (Department of Labor and Employment, DOLE)",
    },
  },
  {
    id: "DOLE_ACRONYM",
    english: ["DOLE"],
    inboundVariants: {},
    outboundForm: { "zh-CN": "DOLE", "zh-Hant": "DOLE", ko: "DOLE", ja: "DOLE", vi: "DOLE" },
  },
  {
    id: "REGISTRY_OF_DEEDS",
    english: ["Registry of Deeds"],
    inboundVariants: {
      "zh-CN": ["土地登记机关"],
      "zh-Hant": ["土地登記機關"],
      ko: ["토지 등록 기관"],
      ja: ["不動産登記機関"],
      vi: ["cơ quan đăng ký quyền sở hữu bất động sản"],
    },
    outboundForm: {
      "zh-CN": "土地登记机关（Registry of Deeds）",
      "zh-Hant": "土地登記機關（Registry of Deeds）",
      ko: "토지 등록 기관(Registry of Deeds)",
      ja: "不動産登記機関（Registry of Deeds）",
      vi: "cơ quan đăng ký quyền sở hữu bất động sản (Registry of Deeds)",
    },
  },
  {
    id: "PEZA_FULL",
    english: ["Philippine Economic Zone Authority"],
    inboundVariants: {
      "zh-CN": ["菲律宾经济区署"],
      "zh-Hant": ["菲律賓經濟區署"],
      ko: ["필리핀 경제구역청"],
      ja: ["フィリピン経済区庁"],
      vi: ["Cơ quan Khu kinh tế Philippines"],
    },
    outboundForm: {
      "zh-CN": "菲律宾经济区署（Philippine Economic Zone Authority, PEZA）",
      "zh-Hant": "菲律賓經濟區署（Philippine Economic Zone Authority, PEZA）",
      ko: "필리핀 경제구역청(Philippine Economic Zone Authority, PEZA)",
      ja: "フィリピン経済区庁（Philippine Economic Zone Authority, PEZA）",
      vi: "Cơ quan Khu kinh tế Philippines (Philippine Economic Zone Authority, PEZA)",
    },
  },
  {
    id: "PEZA_ACRONYM",
    english: ["PEZA"],
    inboundVariants: {},
    outboundForm: { "zh-CN": "PEZA", "zh-Hant": "PEZA", ko: "PEZA", ja: "PEZA", vi: "PEZA" },
  },
  {
    id: "BOI_FULL",
    english: ["Board of Investments"],
    inboundVariants: {
      "zh-CN": ["菲律宾投资署"],
      "zh-Hant": ["菲律賓投資署"],
      ko: ["필리핀 투자청"],
      ja: ["投資委員会"],
      vi: ["Ủy ban Đầu tư Philippines"],
    },
    outboundForm: {
      "zh-CN": "菲律宾投资署（Board of Investments, BOI）",
      "zh-Hant": "菲律賓投資署（Board of Investments, BOI）",
      ko: "필리핀 투자청(Board of Investments, BOI)",
      ja: "投資委員会（Board of Investments, BOI）",
      vi: "Ủy ban Đầu tư Philippines (Board of Investments, BOI)",
    },
  },
  {
    id: "BOI_ACRONYM",
    english: ["BOI"],
    inboundVariants: {},
    outboundForm: { "zh-CN": "BOI", "zh-Hant": "BOI", ko: "BOI", ja: "BOI", vi: "BOI" },
  },
  // Official acronyms/classifications the glossary says must never be
  // translated, transliterated, or renumbered in any language.
  ...["ACR I-Card", "9(g)", "13(a)", "eCAR", "ONETT"].map((code) => ({
    id: "CODE_" + code.replace(/[^A-Za-z0-9]/g, "_").toUpperCase(),
    english: [code],
    inboundVariants: {},
    outboundForm: { "zh-CN": code, "zh-Hant": code, ko: code, ja: code, vi: code },
  })),
  {
    // The specific, tested failure: Vietnamese "hộ chiếu" (passport) drifting
    // toward a household-registration concept. Protecting the word itself —
    // in both the English form (outbound, and inbound text that already
    // contains the English word) and every target language's own natural
    // term (inbound) — makes the correct concept a deterministic lookup
    // instead of a per-call model decision.
    id: "PASSPORT_NUMBER",
    english: ["passport number"],
    inboundVariants: {
      "zh-CN": ["护照号码", "护照号"],
      "zh-Hant": ["護照號碼", "護照號"],
      ko: ["여권 번호", "여권번호"],
      ja: ["パスポート番号", "旅券番号"],
      vi: ["số hộ chiếu"],
    },
    outboundForm: {
      "zh-CN": "护照号码",
      "zh-Hant": "護照號碼",
      ko: "여권 번호",
      ja: "パスポート番号",
      vi: "số hộ chiếu",
    },
  },
  {
    id: "PASSPORT",
    english: ["passport"],
    inboundVariants: {
      "zh-CN": ["护照"],
      "zh-Hant": ["護照"],
      ko: ["여권"],
      ja: ["パスポート", "旅券"],
      vi: ["hộ chiếu"],
    },
    outboundForm: {
      "zh-CN": "护照",
      "zh-Hant": "護照",
      ko: "여권",
      ja: "パスポート",
      vi: "hộ chiếu",
    },
  },
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Builds a regex source for one pattern that tolerates the first character
// being upper- or lower-case (sentence-initial capitalization — e.g. a
// message starting "Hộ chiếu ..." or "Passport number ...") while leaving
// the rest of the pattern exactly as written. A no-op for patterns whose
// first character has no case (CJK/Hangul) or is already the only casing
// that occurs (all-caps acronyms keep matching only that exact acronym,
// deliberately not loosened further, so e.g. "DOLE" is never matched
// against the common English word "dole").
function patternRegexSource(pattern) {
  const first = pattern[0];
  const upper = first.toUpperCase();
  const lower = first.toLowerCase();
  const rest = escapeRegExp(pattern.slice(1));
  if (upper === lower) return escapeRegExp(pattern);
  return `[${escapeRegExp(upper)}${escapeRegExp(lower)}]${rest}`;
}

// Every (pattern, termId) pair relevant to one direction/language,
// longest pattern first so e.g. "passport number"/"护照号码" is matched
// and replaced whole before the shorter "passport"/"护照" pattern would
// otherwise consume part of it.
function buildPatternList(direction, language) {
  const pairs = [];
  for (const term of PROTECTED_TERMS) {
    for (const p of term.english) pairs.push({ pattern: p, id: term.id });
    if (direction === "inbound") {
      const variants = term.inboundVariants[language] || [];
      for (const p of variants) pairs.push({ pattern: p, id: term.id });
    }
  }
  pairs.sort((a, b) => b.pattern.length - a.pattern.length);
  return pairs;
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Replaces every occurrence of a protected term with a fresh, collision-
// resistant placeholder, longest patterns first so overlapping terms never
// leave a partial match behind. Returns the placeholder-substituted text
// plus the lookup needed to restore it afterward.
export function protectTerms(text, { direction, language }) {
  const patterns = buildPatternList(direction, language);
  if (!patterns.length) return { text, placeholders: [] };

  const salt = randomSalt();
  const placeholders = []; // { placeholder, id }
  let counter = 0;
  let result = text;

  for (const { pattern, id } of patterns) {
    if (!pattern) continue;
    const re = new RegExp(patternRegexSource(pattern), "g");
    result = result.replace(re, () => {
      const placeholder = `${OPEN}FIS_${salt}_${counter}${CLOSE}`;
      placeholders.push({ placeholder, id });
      counter += 1;
      return placeholder;
    });
  }

  return { text: result, placeholders };
}

// Restores every placeholder to its authoritative form for the given
// direction/language. Throws if any placeholder-shaped token remains
// unresolved (e.g. the model altered or dropped one) — callers must treat
// that as a translation failure, never send partial output, per the
// no-silent-partial-output requirement.
export function restoreTerms(text, placeholders, { direction, language }) {
  let result = text;

  for (const { placeholder, id } of placeholders) {
    // Checked before replacing, not just after: if the model dropped or
    // corrupted a placeholder beyond recognition, the text may no longer
    // contain anything bracket-shaped at all, which the catch-all check
    // below would miss entirely. Missing here is exactly as much a
    // failure as a stray unresolved placeholder — either way the model
    // didn't faithfully carry the protected term through.
    if (!result.includes(placeholder)) {
      throw new Error("missing_terminology_placeholder");
    }
    const term = PROTECTED_TERMS.find((t) => t.id === id);
    const restored = direction === "inbound" ? term.english[0] : term.outboundForm[language];
    // Split/join rather than a regex — a placeholder contains regex
    // metacharacter-free content (hex + digits) but this avoids ever
    // constructing a RegExp from data derived at request time.
    result = result.split(placeholder).join(restored);
  }

  if (PLACEHOLDER_PATTERN.test(result)) {
    throw new Error("unresolved_terminology_placeholder");
  }

  return result;
}
