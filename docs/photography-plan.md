# Photography Plan

Real licensed photography has not been sourced for this build — this
environment's network access blocks fetching from image hosts (Unsplash,
Pexels, stock libraries, etc.), the same restriction that blocked direct
`.gov.ph` access during research. Every `{{ mediaPanel(...) }}` component
in the templates renders a considered abstract placeholder (brand-toned
gradient + a large, faint version of the page's own icon) rather than a
fake, generated, or scraped photo, sized and composed exactly as the real
photograph should be.

Priority tiers, as approved:

- **Priority (source first):** Homepage hero, Airport VIP Meet & Assist.
- **Strong candidate:** Work & Employment Visas, Corporate & Global
  Mobility, Residency & Long-Term Status, Visa & Immigration Applications.
- **Optional / light treatment:** Family & Spousal Visas, Lost Passport &
  Travel Document Assistance, Visa & Immigration Document Verification.
- **No photography:** Motions/Blacklist, Legal Support, ACR I-Card,
  Exit Clearance — these stay text-forward by design (sensitivity, or
  procedural pages better served by process steps than imagery).

Avoid throughout: laptop-pointing stock cliches, passport-stamp montages,
staged handshakes, posed airport scenes, generic "global business"
photography, and anything requiring identifiable staff (consistent with
the no-staff-photos policy). Prefer editorial, candid framing — hands,
documents, partial/over-the-shoulder shots, considered place photography
— over posed portraits.

| Page | Brief | Composition | Search terms |
|---|---|---|---|
| Homepage hero | Editorial shot suggesting arrival/transition — quiet airport concourse in warm evening light, or a considered Metro Manila skyline/aerial with soft haze. No person centre-frame. | Landscape, right half of hero, negative space for text overlay | "quiet airport terminal warm light", "Manila skyline golden hour editorial" |
| Airport VIP Meet & Assist | Genuine commercial-aviation context — jet bridge, arrivals concourse, or airside apron with a real airliner, warm light, no visible faces or airline branding needing clearance. Highest-priority page after the hero. | Full-width or image/text split; consider two images (arrival + departure) | "jet bridge golden hour editorial", "airport arrivals concourse warm light" |
| Work & Employment Visas | Understated Philippine workplace/office context — Manila business-district skyline from an office interior, or a quiet office scene without posed people. | Landscape, full-width band | "Makati BGC office skyline interior" |
| Corporate & Global Mobility | Genuine Philippine business-district exterior/interior (BGC, Makati, Ortigas) — not generic "diverse team meeting" stock. | Landscape, full-width band | "BGC Manila skyline dusk", "Makati CBD editorial" |
| Residency & Long-Term Status | Settling-in, domestic life-stage image — home interior, quiet neighbourhood, or coastal/provincial scene depending on target segment. | Landscape, image/text split | "Philippines residential neighbourhood quiet street" |
| Visa & Immigration Applications | Documentary-style image of hands organising travel documents at a desk, tightly cropped, no visible face. | Portrait/square, image/text split | "passport documents desk overhead editorial" |
| Family & Spousal Visas | Restrained, non-cheesy — hands over a table with documents, family photo out of focus. Optional; keep small/intimate if used. | Square/portrait, small | "hands documents table soft focus editorial" |
| Lost Passport & Travel Document Assistance | Single calm passport/travel-document image, not staged distress. Optional. | Small, embedded | "passport travel documents soft light editorial" |
| Visa & Immigration Document Verification | One considered frame of a seal/stamp being applied — avoid a "montage of many stamps." Optional. | Small, square | "official document seal single stamp macro editorial" |

## Technical requirements once real assets are sourced

- Descriptive, non-redundant alt text (replace the placeholder's
  `aria-hidden="true"`).
- Responsive `srcset`/`sizes` at 3+ breakpoints, WebP with fallback.
- Lazy-load everything below the fold; hero image eager/preloaded only.
- ~200KB compressed budget per image (hero slightly higher).
- Confirm commercial licence for every sourced photograph before use.
