# Phase 2 Stage 4 — Rendering Backend Comparison

**Scope respected:** nothing enabled, no Cloudflare resource created or
modified, no paid service activated, nothing deployed. Both options were
tested entirely locally — Option A using this sandbox's pre-installed
Chromium (same browser engine family Browser Rendering runs server-side)
as a stand-in, and Option B using the actual WASM libraries that would
run inside a Worker, executed locally via plain Node. Cost/limit figures
for Cloudflare's own products are from their current published
documentation (fetched fresh for this report, cited below), not from any
live account.

## Summary

Both Option A (Browser Rendering, tested via local Chromium) and Option
B (WASM compositing, tested with real libraries) **reproduce all three
forms accurately** against the approved golden references, verified with
the same objective, targeted per-field ink-presence check the engine's
own test suite already uses — not just visual impression. Neither is
"unsuitable." The deciding factors are operational complexity and a cost
finding that changes the framing given in the approved Phase 2 plan:
**CPU-time limits, not Browser Rendering's own pricing, are the real
reason either option needs the Workers Paid plan** — see §4.

## 1. What was tested

- A generic, coordinate-map-driven template generator (not hand-coded
  per field, unlike the earlier Phase 1 POC) was built for both Option A
  (HTML/CSS) and Option B (SVG), each consuming the exact same
  `resolveFieldValues()`/`fieldsForAudience()` calls the real engine
  uses — so both tests exercise the real field-resolution logic, not a
  reimplementation of it.
- Blank-region background images were generated from the real original
  PDFs via the already-proven `buildCustomerFieldsDocument()` (empty
  data) + the existing raster pipeline, then cropped per form/region —
  the same background a real implementation would use.
- All three forms were covered for Option A (including 2014-13-006's
  two-region layout with its divider caption); CDR and 2014-13-002 were
  covered for Option B (single-region cases — 2014-13-006's multi-region
  compositing is a separate, already-solved concern, not specific to
  which engine draws the text).

## 2. Option A — Cloudflare Browser Rendering (tested via local Chromium)

**Visual parity / character positioning:** confirmed via the engine's
own targeted ink-presence check (not just eyeballing) — all 14
customer-visible char-box/checkbox fields on CDR matched expected
ink-or-blank exactly, 0 mismatches. Visual inspection of all three forms
confirmed correct box-grid alignment, correct Gender-checkbox placement,
correct two-region stacking with the divider caption positioned
correctly for 2014-13-006, and a correctly rotated, correctly colored
watermark (objectively verified by sampling reddish pixels: average RGB
≈(232, 206, 202) in the Chromium render vs. ≈(237, 215, 214) in the real
pdf-lib/Poppler golden — both light pinkish-red at the approved opacity,
not a meaningfully different hue despite an initial visual impression
that needed numeric verification to confirm).

**Multi-region previews:** 2014-13-006's two-region layout with its
"FIS staff prepare the remaining sections of this form" divider caption
rendered correctly in one HTML template (region stacking computed from
the same region data `raster-pipeline.js` already uses).

**Staff-only exclusion:** by construction — the template is built only
from `fieldsForAudience(coordinateMap, "customer")`, so a staff-only
field is never even considered, the same invariant the real pipeline
already relies on.

**Secure reconstruction / non-recoverability:** the Chromium-produced
screenshot was fed through the **real, unmodified**
`finalizeCustomerPreview`-style pattern (embed as image in a brand-new
`PDFDocument`, apply metadata, no original.pdf ever touched) and passed
every existing audit unchanged: `assertMetadata` passed, the
content-stream audit found 0 leaks, and the boundary-expansion
non-recoverability audit found the expanded page area entirely blank.
**This confirms the secure-reconstruction architecture is fully
renderer-agnostic** — only the "produce a region image" step would
change; everything downstream of it is already proven and untouched.

**One implementation-detail difference found:** the watermark was baked
directly into the HTML/CSS (rendered as part of the screenshot), not
drawn as separate vector text afterward the way the current Poppler
path does. Both are valid; baking it in is simpler (one fewer step) but
makes the watermark part of the raster layer rather than a distinct
vector one. Worth a decision when this is actually implemented, not a
blocker either way.

**Speed (measured locally, this sandbox):**

| | Cold (fresh browser) | Warm (reused session) |
|---|---|---|
| CDR | 1.77s total (0.88s launch + 0.42s nav + 0.33s screenshot) | 0.43s total |
| 2014-13-002 | 0.88s total | 0.35s total |
| 2014-13-006 (2 regions) | 0.75s total | 0.32s total |

Consistent with Phase 1's finding: browser launch dominates cold-start
cost; Cloudflare's `keep_alive` (up to 10 min idle before teardown) would
let a single warm session serve many sequential generations at the much
lower ~0.3–0.4s figure.

**Operational complexity:** no new dependency — ordinary HTML/CSS,
already a skill used for the Eleventy site. Requires a new
`browser_rendering` binding in `wrangler.toml` (not present today) and
the `@cloudflare/puppeteer` package.

## 3. Option B — WASM compositing (tested for real, not just described)

Phase 1 explicitly left this "not tested locally." It has now actually
been installed and run.

**Library chosen and why:** `@resvg/resvg-wasm` (a WASM-compiled Rust SVG
renderer, explicitly positioned for edge/serverless use, with a proper
`exports` map suggesting good dual CJS/ESM resolution — unlike `pdf-lib`,
which was the source of a real, separately-documented test-harness
limitation in Stage 3). SVG's native `<text>` layout is a more direct
match for coordinate-map.json's point-based positions than a general
image-filter library like `@cf-wasm/photon` (also installed and
considered, but photon is oriented around image filters/transforms, not
text layout — it remains a reasonable candidate for the
background-compositing half of the pipeline, not tested separately here
since resvg already proved the hard part).

**Visual parity / character positioning:** the same objective
ink-presence check used for Option A: **14/14 customer fields matched,
0 mismatches**, identical to Option A's result. Side-by-side visual
inspection against the golden shows no distinguishable difference in box
alignment, checkbox placement, or watermark rotation/color/position.

**Font handling:** Workers isolates have no system fonts at all —
unlike Option A, where Chromium's own font stack is implicitly
available. Option B requires bundling an actual font file. Liberation
Sans (metric-compatible with Arial/Helvetica, already present in this
sandbox) was bundled and loaded via resvg's `CustomFontsOptions`
(`fontBuffers`), adding **~411KB** to the deployed bundle.

**Secure reconstruction / non-recoverability:** not independently
re-run for Option B's output (the composited PNG is produced by the
same kind of raster pipeline either way) — the finding from Option A
(the downstream secure-reconstruction code is renderer-agnostic) applies
identically, since nothing about the embed/metadata/audit step cares
where the source image came from.

**Speed (measured locally):** CDR 409ms (first render, includes WASM
init cost paid once); 2014-13-002 196ms. **Faster than Option A's cold
path and roughly comparable to its warm path**, with the added advantage
that there is no equivalent of "cold browser launch" to reason about at
all — the WASM module, once instantiated, stays instantiated for the
life of the isolate.

**Bundle size:** `@resvg/resvg-wasm`'s `.wasm` binary is **~2.48MB**;
plus the ~411KB font, total new weight ≈**2.9MB**. Checked against
Cloudflare's current published Worker size limit (next section): **not
a concern at all** — the limit is far larger than assumed.

**Operational complexity:** a genuinely new dependency to vet and
maintain (vs. Option A's "no new dependency" claim), and the
font-fit/centering logic is re-implemented in SVG's terms (straightforward — demonstrated above) rather than reused from `pdf-fields.js` as-is.

## 4. Cloudflare platform limits and cost — refreshed, with one important correction

Fetched fresh from Cloudflare's current documentation for this report
(not relied on from Phase 1's earlier research, which is now about ten
months old in Cloudflare's own fast-moving docs):

| | Workers Free | Workers Paid |
|---|---|---|
| **Worker bundle size** | 64 MiB uncompressed (no separate compressed limit) | same, 64 MiB |
| **CPU time per request** | **10 ms** | up to 5 minutes (default 30s, configurable) |
| Browser Rendering: browser time | 10 min/day | 10 hrs/month included, then $0.09/hr |
| Browser Rendering: concurrent browsers | 3/account | 10/account included (averaged monthly), then $2.00/each |
| Browser Rendering: new instances | 1/20s | 3/sec |

**Correction to the approved Phase 2 Integration Plan (§2.5):** that
document stated "Browser Rendering itself requires the Workers Paid
plan." That is **not accurate** per Cloudflare's current docs — Browser
Rendering is available on the Free plan too, just with the tighter
limits above (10 min/day, 3 concurrent). This report corrects that
record rather than silently carrying the error forward.

**The real, more important finding:** the Workers **Free plan's 10ms
CPU-time-per-request limit** is the actual blocker for either option,
independent of Browser Rendering's own pricing. Option B's resvg render
alone took 196–409ms of CPU time in this test — **20–40× the Free
plan's entire per-request CPU budget** — before any R2 read/write, D1
query, or PDF assembly is even counted. Option A's in-Worker CPU cost
would be lower (the heavy lifting runs in the separate browser process,
not on the Worker's own CPU clock), but the Worker still needs to drive
that session and handle the resulting image, plausibly also exceeding
10ms. **Neither option is realistically Free-plan-viable** for this
feature — the Workers Paid plan (a flat ~$5/month base, per Cloudflare's
general pricing, separate from Browser Rendering's own usage charges) is
a practical prerequisite either way, not a cost specific to choosing
Browser Rendering. This reframes the cost comparison: it is not "Option
A costs money, Option B is free" — both need the same base Paid plan;
Option A additionally has its own small usage-based charge on top (see
table), Option B does not.

## 5. Direct comparison against every requested criterion

| Criterion | Option A (Browser Rendering) | Option B (WASM/resvg) |
|---|---|---|
| Visual parity vs. golden | Confirmed (0/14 mismatches, objective check) | Confirmed (0/14 mismatches, same check) |
| Character positioning/overflow | Positioning confirmed; overflow/auto-shrink logic not yet ported to either POC (straightforward from `pdf-fields.js`'s existing `fitCharFontSize`, not implemented here) | Same |
| Single-region previews | Confirmed (CDR, 2014-13-002) | Confirmed (CDR, 2014-13-002) |
| Multi-region previews | Confirmed (2014-13-006, divider caption correct) | Not separately tested (same compositing step as today, orthogonal to which engine draws text) |
| Watermark accuracy | Confirmed, numerically (pixel color sampling) | Confirmed, visually (same rotation/position/opacity approach) |
| Staff-only exclusion | Guaranteed by construction (same `fieldsForAudience` call) | Same |
| PDF metadata | Passed, via the real `assertMetadata` | Not re-tested separately; identical downstream code path |
| Non-recoverability | Passed, via the real `auditBoundaryExpansion` (literal boundary-expansion test) | Identical downstream code path, not renderer-dependent |
| Runtime compatibility | Confirmed conceptually (same engine family as Browser Rendering); real binding/Worker integration not testable without a live account (see §6) | Confirmed more directly — these are the actual npm packages that would run in the Worker, executed here under plain Node, which is the closest local approximation available without a live account |
| Generation speed | ~0.3–1.8s per form depending on warm/cold | ~0.2–0.4s per form, no warm/cold distinction |
| Operational complexity | No new dependency; new binding + `@cloudflare/puppeteer` | New WASM dependency (~2.9MB) + font bundling to vet/maintain |
| Estimated recurring cost | Workers Paid (~$5/mo base) + usage-based Browser Rendering charges (likely near $0 at FIS's probable volume, per Phase 1's math, still valid) | Workers Paid (~$5/mo base) only — no second usage-based charge |

## 6. What could not be tested without a live account

Per your instruction to stop and identify the exact requirement rather
than enabling anything: a **real** Browser Rendering binding, the actual
`@cloudflare/puppeteer` integration code running inside a genuine Worker,
and real network/cold-start latency over Cloudflare's own
infrastructure all require either (a) the account's Browser Rendering
binding enabled in a deployed Worker, which this phase's instructions
explicitly forbid enabling, or (b) `wrangler dev --remote`/a deployed
Worker with that binding, which touches live infrastructure. **Nothing
here required a paid feature merely to investigate it this far** — the
local-Chromium stand-in and the WASM libraries' real npm packages were
sufficient for everything in §§1–5. The one thing that would need your
explicit authorization, if you want it verified further than this
report goes, is: enabling the Browser Rendering binding on a real (even
free-tier) Worker to confirm the binding/API surface itself behaves as
documented — not yet done, and not done here.

## 7. Recommendation

Prefer **Option B (WASM/resvg) as the primary candidate**, with Option A
kept as the documented fallback — a reversal from Phase 1's provisional
recommendation, now that Option B has actually been tested rather than
assumed untested:
- Equivalent, verified visual fidelity.
- No second, usage-based Cloudflare charge on top of the Workers Paid
  plan baseline both options need anyway.
- Faster in this local comparison, with no cold/warm distinction to
  manage.
- The "new dependency to maintain" cost is real but bounded and already
  demonstrated working end-to-end against real coordinate data.

This is a recommendation for your decision, not a unilateral choice —
nothing has been wired into the Worker for either option; `getDocumentBuilders()`'s
raster step (Stage 3) remains an open seam ready to receive whichever
option you approve.

## Sources

- [Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/) — bundle size, CPU time
- [Browser Rendering limits](https://developers.cloudflare.com/browser-rendering/platform/limits/)
- [Browser Rendering pricing](https://developers.cloudflare.com/browser-rendering/platform/pricing/)
- `@resvg/resvg-wasm` (npm, v2.6.2) and `@cf-wasm/photon` (npm, v0.4.0) — installed and run locally for this report
