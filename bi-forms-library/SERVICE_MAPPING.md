# Service-to-BI-Form Mapping (proposal — needs your confirmation)

Phase 2, decision E. Maps the three validated forms onto the existing
16 public `service_slug` values (`worker/src/routes/enquiries.js`
`SERVICE_SLUGS`, plus the `other` catch-all) — no new public service
category is proposed, per instruction. This is a business-classification
judgment, not a technical one; my confidence varies per row and is
stated explicitly rather than guessed past.

| BI Form ID | Official Name | Proposed `service_slug` | Client Portal assignment workflow | Provisional Instant Checkout eligibility | Ambiguity needing your approval |
|---|---|---|---|---|---|
| `CCS-A-CDR-2016` | Request for Certified True Copy of Derogatory Records | **`motions-blacklist`** ("Immigration Motions, Blacklist & Derogatory Record Assistance") | Staff reviews an enquiry/application already under this service, assigns the form via the new "BI Forms" card on the application page (Stage 3); customer completes the questionnaire in the portal (Stage 5, not yet built) | Config already carries `checkoutEligible: null` with an explicit "not yet decided" note — unclassified, not pre-approved | **None** — the form's own name is literally "derogatory records," matching this category's stated scope exactly. High confidence. |
| `2014-13-002` | Request for BI Clearance Certificate | **Ambiguous — needs your choice.** Two reasonable candidates: **`motions-blacklist`** (same CCS-family document type as CDR — both are clearance/derogatory-record certificates from BI's Certification and Clearance Section) or **`exit-clearance`** ("Exit Clearance & Departure Requirements" — a clearance certificate is also commonly requested for travel/exit purposes) | Same workflow pattern as above, once you pick the slug | Config has no `checkoutEligible` value set at all (never classified) | **Yes.** A general "BI Clearance Certificate" doesn't map as cleanly as CDR does — it could reasonably sit under either candidate above, or even `extensions-compliance` as a third option. I'd rather you choose than have me guess a business categorization. |
| `2014-13-006` | Application Form for Request for Travel Records | **Ambiguous — needs your choice.** Three reasonable candidates: **`legal-support`** (the form's own Court/Legal Purposes section suggests this use case explicitly), **`document-verification`** ("identifying the appropriate process to verify a Philippine visa or immigration document" — travel records are official BI records being retrieved/verified), or **`exit-clearance`** (travel/departure-adjacent) | Same workflow pattern, once you pick the slug | `bi-forms-library/IMPLEMENTATION_ROADMAP.md` already named this a "Tier 1, Instant checkout candidate, Low complexity" form in its narrative — but its `coordinate-map.json` has no `checkoutEligible` value set, so that's a narrative note, not an approved config state | **Yes, the most ambiguous of the three.** This form serves several different underlying purposes (proving travel history for a visa renewal, a legal matter, a general record request) that could each suggest a different category. |

## What's already enforced regardless of which slugs you pick

- **No activation flag is set to true anywhere** — not in any
  coordinate-map.json, not in any new config this phase introduced.
  Confirmed by direct inspection (see the `checkoutEligible` values
  above): nothing claims approval it doesn't have.
- **Instant Checkout itself is unbuilt** — no payment gateway exists
  (confirmed in the original Phase 2 plan's inspection), so even a
  `checkoutEligible: true` value today would have nothing to activate
  against. These three forms are not assumed eligible by anything built
  in Stages 1–4.
- Once you confirm a `service_slug` per form, the actual mapping lives
  in a small, explicit config (not yet created — this is a proposal
  pending your answer), separate from `checkoutEligible`, so confirming
  a category is not the same action as approving checkout.
