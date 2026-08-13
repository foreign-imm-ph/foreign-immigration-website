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
- `src/services/legal-support-for-foreign-nationals.njk` — states FIS is
  not a law firm, does not provide criminal defence representation, and
  cannot influence courts or government authorities.

## Standing items carried over from Phase 1

- `src/privacy-notice.njk`, `src/terms-of-use.njk`, `src/accessibility.njk`
  remain drafts pending owner/legal review (each carries an on-page notice
  to this effect).
- Data Protection Officer details, NPC registration status, and document
  retention periods remain undetermined and are not referenced anywhere
  on the site.

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
