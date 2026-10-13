# Local Proof of Concept — Cloudflare Browser Rendering as a Production Path

**Scope respected:** nothing enabled, no Cloudflare resource created, no deployment. This tested the *rendering approach* entirely locally, using this sandbox's pre-installed Chromium via Playwright — the same browser engine family Cloudflare's Browser Rendering (now documented as "Browser Run") runs server-side behind a Workers binding. Cost/limits come from Cloudflare's current public documentation, cited below, not from any live account.

## What was built

`build_html.py` generates an HTML page that reproduces one approved region (CDR's identity/address block) using:
- A background image of the **blank** region (pre-rendered once, offline — exactly how today's pipeline already works, no new step).
- Absolutely-positioned `<div>`s for each character, reusing the *exact same coordinates* already in `coordinate-map.json` (just converted from PDF points to CSS pixels), centered via CSS flexbox instead of pdf-lib's manual width-measurement centering.
- A rotated, semi-transparent watermark `<div>` matching the approved text/opacity.

`render.js` opens that HTML in headless Chromium and times each step, using the same approach Browser Rendering exposes via Puppeteer/Playwright over a Workers binding.

## Result: screenshot route — accurate, production-viable

The rendered screenshot (`poc-screenshot.png`) is visually indistinguishable from the pdf-lib-generated version: every character correctly centered in its box, correct grouping for Other Name/DOB/Gender, watermark legible and positioned correctly. This confirms the *technique* (HTML/CSS + headless browser → image → embed via pdf-lib, same as today) works, independent of which renderer produces the image.

**Recommended integration point:** use Browser Rendering only for the "render the filled region to an image" step, then feed that image into the **same, already-proven pdf-lib embedding/watermark/metadata code** used for all three forms today. This changes the least: only the rendering backend swaps (local `pdftoppm`/Playwright → Cloudflare Browser Rendering), the rest of the pipeline is unchanged and already validated three times over.

## Result: direct PDF export route — a real quirk, not a blocker

Chromium's native `page.pdf()` (what a naive "render straight to PDF" approach would use) did **not** behave as expected: requested a 612×469pt single page, got a 458.88×352.08pt page split across **3 pages**. This is a genuine integration detail (CSS pixel vs. PDF point unit handling, print pagination) that would need deliberate tuning — `@page` CSS sizing, explicit scale factor, disabling auto-pagination — not an unsolvable problem, but not a "just works" default either. **Recommendation: avoid the direct-PDF-export route; use the screenshot route instead**, which had no such issue and reuses proven code.

## Performance (measured locally, single run, cold browser)

| Step | Time |
|---|---|
| Browser launch | 1.52s |
| Page navigation | 0.71s |
| Screenshot | 1.02s |
| Total (screenshot route, cold) | ~3.3s |

Browser launch is the dominant cost. Cloudflare's Browser Rendering supports keeping a session warm (`keep_alive`, up to 10 minutes of inactivity before teardown) — reusing one browser across multiple sequential form generations within that window would amortize the ~1.5s launch cost across many renders, bringing the effective per-render time much closer to the ~1.7s navigation+screenshot cost alone.

## Cost and limits (Cloudflare's current published documentation)

| | Workers Free | Workers Paid |
|---|---|---|
| Browser hours | 10 minutes/day | 10 hours/month included, then $0.09/hour |
| Concurrent browsers | 3/account | 10/account included (averaged monthly), then $2.00/each |
| New browser instances | 1 per 20 seconds | 3 per second |
| Inactivity timeout | 60s (extendable to 10 min via `keep_alive`) | same |

At the measured ~2–3s per render, 10 included monthly hours (Workers Paid) covers roughly **12,000–18,000 form-preview generations per month** before any overage charge — almost certainly well beyond FIS's realistic volume for a document-preparation feature. **Likely cost: $0 beyond the existing Workers Paid plan**, unless volume grows far past what a single-office immigration consultancy would generate.

(Cloudflare's docs show some inconsistency between the current production limits page and newer preview-doc versions for paid concurrency — 120 vs. 200 per account were both seen — noted here as a documentation caveat, not something that changes this assessment; FIS's likely volume is nowhere near either ceiling.)

## Comparison with the WASM/pre-rendered-template alternative (per your instruction, not implemented)

| | Browser Rendering | WASM image library (e.g. resvg/photon family) |
|---|---|---|
| New dependency | None — native Cloudflare platform capability, same binding model already used for other Workers features | A new WASM package to vet, bundle, and maintain |
| Authoring model | Ordinary HTML/CSS — same skill already used for the Eleventy site; centering/fitting handled by CSS flexbox | Re-implements font-fit/centering logic in that library's own API, similar to today's manual pdf-lib math |
| Fidelity (this POC) | Confirmed visually accurate for a real region | Not tested locally (would need the library installed to test) |
| Per-render latency | ~2–3s cold, likely ~1–2s warm with session reuse | Likely faster (no browser process), but unverified here |
| Cost model | Usage-based, essentially free at FIS's likely volume (see above) | No Cloudflare product cost, but engineering cost to integrate/maintain a new dependency |
| Known rough edge found | Direct PDF export mis-paginates — avoidable by using the screenshot route | None found (not tested) |

## Recommendation

**Browser Rendering (screenshot route) is the recommended production path** — it reuses the most existing code, needs no new dependency, and comfortably fits FIS's likely cost/volume profile per Cloudflare's own published numbers. It is not "unsuitable" — the one real rough edge found (direct PDF export) has a known workaround (use the screenshot route, which already works and was tested here). The WASM alternative remains a reasonable fallback if, during actual implementation, Browser Rendering's concurrency/latency turns out not to fit a specific production pattern — but that hasn't been demonstrated here, so adopting it now would be premature.

**Not done without your separate approval:** enabling the Browser Rendering binding, writing Worker-side integration code, or any Cloudflare resource/configuration change. This report is a recommendation backed by a local test, nothing more.

Sources:
- [Browser Run limits](https://developers.cloudflare.com/browser-rendering/platform/limits/)
- [Browser Run pricing](https://developers.cloudflare.com/browser-rendering/platform/pricing/)
