# Content Review Notes

Tracking content that must not be treated as final, legally binding, or
authoritative until reviewed by the owner and, where noted, by qualified
Philippine legal counsel. Nothing listed here should be relied upon as-is
by staff, clients, or in a dispute.

## Owner-supplied policy requiring final Terms/consumer-law review

**Airport VIP Meet & Assist — booking changes policy**
(`src/services/airport-vip-meet-and-assist.njk`)

> "Airport VIP Meet & Assist fees are non-refundable. A confirmed booking
> may be transferred once to another flight for the same named passenger,
> provided that notice is received at least 72 hours before the originally
> scheduled service, subject to availability and any applicable airport or
> operational restrictions."

Status: **OWNER-SUPPLIED POLICY — REQUIRES FINAL TERMS/CONSUMER-LAW REVIEW.**
This text is presented on the service page as ordinary prose, not inside a
visible disclaimer box — per Phase 1.2 instructions, the on-page callout
that previously flagged this passage as pending review was removed, since
publicly rendering internal review status was itself identified as a
problem. The review requirement is tracked **only** here from Phase 1.2
onward. Before this policy is relied upon as binding, it should be
reviewed against Philippine consumer protection and refund-disclosure
requirements (e.g. DTI rules on cancellation/refund terms) and, if
confirmed, incorporated into the Terms of Use page formally.

## Legal-risk-sensitive service pages (drafted per owner-supplied wording)

The following pages contain carefully hedged language about outcomes,
representation, and government processes. As of Phase 1.2 this language is
integrated into normal prose or a restrained `.context-note` rather than a
heavy bordered disclaimer box (an explicit owner instruction, to avoid the
site reading as a list of reasons the firm cannot help) — but the
underlying substance is unchanged and should not be loosened, paraphrased
away, or have qualifiers removed without legal sign-off:

- `src/services/immigration-status-review-and-regularisation.njk` —
  restrained note that outcomes and processing requirements are
  determined by the relevant Philippine authorities, and FIS's role is
  assessment/explanation/assistance within the scope permitted.
- `src/services/immigration-motions-blacklist-and-derogatory-record-assistance.njk` —
  restrained note that the appropriate procedural option depends on the
  specific record/order/proceeding; no lifting, clearance, favourable
  decision or fixed processing time is promised.
- `src/services/legal-support-for-foreign-nationals.njk` — as of Phase
  1.3, the standalone "not a law firm" disclaimer paragraph was removed
  per explicit owner instruction; the same substance (FIS coordinates,
  independent counsel represents clients in court) is now carried in the
  main body copy ("independent Philippine legal counsel, who advise and
  represent clients directly in the relevant criminal or judicial
  proceedings"). If this ever reads as ambiguous about FIS's role in a
  future review, restore a narrow clarifying clause rather than a full
  disclaimer paragraph.
- `src/services/immigration-status-review-and-regularisation.njk` — as of
  Phase 1.3, remote handling is now stated as a lead benefit rather than
  a caveat, closing with: "We handle the review and coordination remotely
  wherever the applicable process permits. If any later step requires
  your personal attendance, we'll tell you in advance and guide you
  through exactly what is required." This is deliberately worded to avoid
  promising universal remote handling — see the verification-pending item
  below regarding detention/enforcement claims, which this page does
  **not** make.

## Standing items carried over from Phase 1

- `src/privacy-notice.njk`, `src/terms-of-use.njk`, `src/accessibility.njk`
  remain drafts pending owner/legal review (each carries an on-page notice
  to this effect).
- Data Protection Officer details, NPC registration status, and document
  retention periods remain undetermined and are not referenced anywhere
  on the site.

## Deliberately omitted pending authoritative verification (Phase 1.3)

Per the owner's explicit instruction, none of the following appear
anywhere on the site. Each was identified during research but withheld
because it either requires primary-source/legal verification or was
sourced only from third-party commentary, not an official government
statement:

- **Circumstances in which the Bureau of Immigration may lawfully detain
  an overstaying foreign national, and/or retain or confiscate a
  passport or travel document.** This is the single most consequential
  omission — research surfaced only secondary/anecdotal sources for
  passport-retention practice specifically, not an official BI policy
  statement. `src/services/immigration-status-review-and-regularisation.njk`
  and `src/services/legal-support-for-foreign-nationals.njk` reference
  general risk (fines, complications, immigration consequences) only,
  never detention or passport retention specifically. Do not add this
  without a verified legal/official basis.
- **Any specific fee, threshold, deadline, or eligibility period** —
  including the ACR I-Card 59-day tourist threshold, overstay fine
  amounts, SWP/PWP duration limits, extension filing windows, and ECC-A/
  ECC-B thresholds. All were found via search-engine-synthesised
  secondary sources during planning research and are intentionally
  written around at the category level in `acr-i-card-assistance.njk`,
  `exit-clearance-and-departure.njk`, `work-and-employment-visas.njk`,
  `extensions-and-compliance.njk`, and `immigration-status-review-and-regularisation.njk`.
  Qualitative risk language (e.g. "can result in fines, additional
  requirements, and delays") is used instead and does not require the
  same verification bar — see the owner's clarification on this
  distinction.
- **Current SRRV (retirement visa) age threshold** — conflicting figures
  found (traditional 50, a reported change to 40). Not stated anywhere;
  `residency-and-long-term-status.njk`'s retirement section names the
  programme and the Philippine Retirement Authority as its administrator
  without citing an age.
- **Current Executive Order 408 Balikbayan visa-free-privilege country
  list** — not published anywhere on the site.

Before any of the above is added to the live site, verify against the
primary Philippine government source (immigration.gov.ph, PRA, DOJ, or
equivalent) or confirmed current FIS operational knowledge — not a
third-party immigration-services website.

## Client-facing terminology (Phase 1.2)

Established as the standing vocabulary for the Client Portal and any
future backend work — do not introduce "matter" / "My Matters" /
"Manage your matter" into client-facing copy:

- **Reference** — the identifier for an application or service request
  (e.g. "Reference FIS-2026-00124"), not "Matter Number."
- **Applications & Services** — the umbrella concept for a client's
  immigration applications and service requests collectively.
- Portal navigation concepts: Applications & Services, Documents,
  Messages, Payments, Profile.
