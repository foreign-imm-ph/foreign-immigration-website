// Phone-number normalization for the future SMS/WhatsApp mobile field
// (clients.mobile_e164) — completely separate from the existing free-form
// `phone` column, which this module never reads or writes.
//
// Uses libphonenumber-js (the standard, well-maintained JS port of Google's
// libphonenumber), not hand-rolled country-code parsing, per the explicit
// instruction to prefer an established library over fragile custom logic.
// The "/min" build is used deliberately: it ships a compact metadata subset
// sufficient for parsing/validating any country's numbers, keeping the
// Worker bundle small.
import { parsePhoneNumberFromString } from "libphonenumber-js/min";

// country is an explicit ISO 3166-1 alpha-2 code (e.g. "AU", "PH") or
// omitted/null. Never guessed — if the input isn't already an unambiguous
// full international number (leading "+") and no country is given, this
// returns { valid: false, e164: null } rather than picking a country.
// Never throws: a malformed or unparseable input is just "not valid",
// exactly like any other rejected form input.
export function normalizePhoneNumber(rawInput, country = null) {
  const input = typeof rawInput === "string" ? rawInput.trim() : "";
  if (!input) return { valid: false, e164: null };

  if (!input.startsWith("+") && !country) {
    // Ambiguous: a local-format number with no declared country context.
    // Refusing to guess is the whole point of this check.
    return { valid: false, e164: null };
  }

  let parsed;
  try {
    parsed = parsePhoneNumberFromString(input, country || undefined);
  } catch {
    return { valid: false, e164: null };
  }

  if (!parsed || !parsed.isValid()) return { valid: false, e164: null };
  return { valid: true, e164: parsed.number };
}

// Countries offered in the portal's mobile-number country selector — kept
// to a short, deliberate list (FIS's actual client base) rather than every
// ISO country, per "add the smallest usable mechanism." Not used to
// restrict what normalizePhoneNumber can parse (any ISO code works there);
// this is purely the UI's/API's allowlist for what a client can select.
export const SUPPORTED_MOBILE_COUNTRIES = ["PH", "AU", "US", "GB", "CN", "KR", "JP", "VN", "SG", "CA"];

export function isSupportedMobileCountry(code) {
  return SUPPORTED_MOBILE_COUNTRIES.includes(code);
}
