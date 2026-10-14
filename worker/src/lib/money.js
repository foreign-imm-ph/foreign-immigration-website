// Integer-centavo money helpers for Instant Services. Every amount in
// this feature is stored and computed as an integer number of centavos
// (1 PHP = 100 centavos) -- never a floating-point peso amount -- so
// summing fee components can never drift by a fraction of a centavo the
// way repeated float addition can. Display-only conversion to a peso
// string happens at the edges (API response shaping, UI), never in the
// stored or computed values themselves.
//
// PHP-only today, by instruction -- "design for potential future
// multicurrency support without implementing multicurrency payment
// processing now". The one place that acknowledges this: every stored
// amount's column name says `_php_centavos` explicitly rather than a
// generic `_centavos`, so a future second currency is an additive column,
// not a silent reinterpretation of an existing one.

// Numeric (not display-string) conversion -- the one place centavos
// become a peso float, for writing into the existing payment_requests
// table's `amount_php REAL` column (0001_init.sql, predates this
// feature's integer-centavo convention and is reused as-is rather than
// altered).
export function centavosToPhp(centavos) {
  return Math.round(Number(centavos) || 0) / 100;
}

export function centavosToPhpString(centavos) {
  const n = Number(centavos) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  const pesos = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}${pesos.toLocaleString("en-US")}.${cents}`;
}

export function sumCentavos(components) {
  return components.reduce((sum, c) => sum + (Number(c.amount_php_centavos) || 0), 0);
}

export function isValidCentavos(value) {
  return Number.isInteger(value) && value >= 0;
}

// Parses a staff-typed peso amount (e.g. "5,000.00" or "5000") back into
// integer centavos for storage -- the one place a human-entered peso
// string is converted TO the stored representation (the reverse of
// centavosToPhpString above). Returns null for anything that isn't a
// valid non-negative amount, so callers can reject it outright rather
// than silently storing a wrong price.
export function phpStringToCentavos(str) {
  const cleaned = String(str ?? "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
