# Stage 1 — Form Analysis: BI FORM 2014-13-006, "Application Form for Request for Travel Records"

**Status: analysis only. No coordinate mapping or PDF generation has started.** Retrieved directly from `fis-bi-forms-library/originals/2014-13-006.pdf` (etag confirmed unchanged since the committed inventory). Single page, 612x936pt, Microsoft Word 2010 producer, same era as 2014-13-002.

**This form is structurally different from both completed prototypes — not a minor variant.** The roadmap's "Low complexity, near-identical to 2014-13-002" estimate was wrong; flagging that now rather than carrying it forward. Key structural differences: Passport Number sits on the same row as Date of Birth/Gender (not its own row at the end of the identity block), there are **two separate "Contact Number(s) in the Philippines" blocks** plus a "Requesting Foundation/Agency/Embassy/Others" field between them, a conditional "If for Court/Legal Purposes" box, and a dedicated Arrival/Departure Date + Flight Number section that CDR and 2014-13-002 simply don't have.

## 1–2. Fields identified and classified

**Customer-supplied, unambiguous** (identical reasoning to the prior two forms): Last Name, First/Given Name, Middle Name, Other Name(s)/Alias(es) 1 & 2, Date of Birth, Gender, Passport Number, Place of Birth, Citizenship/Nationality, House/Unit/Street/Subdivision, Barangay/Municipality/City, Province/Zip Code.

**Customer-supplied, unambiguous, and new to this form:** Arrival Date, Departure Date, and both Flight Numbers. Only the traveling subject knows their own travel dates and flights — this is the actual data BI needs to locate the requested travel records, so it isn't optional or staff-authored the way Purpose was on the other two forms. This section needs to be customer-visible.

**BI-only, unambiguous:** "DO NOT FILL OUT THIS PORTION" (containing "NO RECORD ON FILE [For ICTS & CCS only]" and "NOTE [For Records Section only]"), the Certification and Clearance Section (CCS) Window, and the entire Travel Records Claim Stub — all explicitly BI-internal, same pattern as the prior two forms.

**Wet-ink:** Signature over Printed Name, and the Date next to it.

**Flagged as ambiguous — four items, none assumed:**

1. **First "Contact Number(s) in the Philippines" (Landline/Mobile), the subject's own.** Same field type you resolved as staff-only on both prior forms. I'm not carrying that decision over automatically, per your instruction, but noting the precedent for context.
2. **"Requesting Foundation/Agency/Embassy/Others" plus its own second "Contact Number(s) in the Philippines" block.** This field type doesn't appear on either completed prototype. Two readings seem equally plausible: (a) the client names an external institution they're requesting through (customer-supplied), or (b) FIS itself is the "Agency," since FIS is the filing facilitator (staff-supplied, same reasoning that made Mobile/Landline FIS's own number on the other forms). This is the single biggest open question on this form.
3. **"If for Court/Legal Purposes" box** (Name of Court, Branch/Place, Contact Number(s)). Visually boxed off, read as conditional/optional. If it applies at all, the content (which court, which branch) can only come from the client — likely customer-supplied with "N/A" as a valid default, similar to how Other Name(s) handles "not applicable." Flagging the conditional handling for your confirmation rather than assuming.
4. **The "Contact Number" written directly on the signature line itself** (next to Date, before the actual Signature). A third, separate contact-number field, free-text rather than boxed. Unclear whether this duplicates the subject's own number, or belongs to whoever actually signs (which could be a representative, not the subject).

## 3–4. Customer-visible region — cannot be a single crop boundary on this form

See `annotated-preview.png`. Unlike CDR and 2014-13-002, the unambiguous customer-visible content does **not** end in one place and stop — it's interrupted by the four ambiguous items above, then resumes for the Arrival/Departure/Flight section, which is both unambiguous and essential. Concretely:

- 🟩 Green: identity + address block (header through Province/Zip Code)
- 🟨 Yellow (×3 distinct regions): the two Contact Number blocks + Requesting Agency field, and the Court/Legal box — sandwiched between the two green regions
- 🟩 Green again: Arrival/Departure Date + Flight Number — must be visible to the customer regardless of how the yellow regions resolve
- ⬜ Grey: Signature/Date line (plus flag 4, the line's own Contact Number)
- 🟥 Red: everything from "DO NOT FILL OUT THIS PORTION" to the end of the page

**This is exactly the scenario the approved Forms Library visibility policy's multi-region support (spec section 7.2) was designed for** — a single top-of-page crop cannot express "show this, hide that, show the next part" on one page. If the three yellow regions resolve to staff-only, the customer-visible artifact for this form will need **two separate regions** (identity/address block, and Arrival/Departure/Flight), not one. If any yellow region resolves to customer-visible instead, it would merge into a single, larger contiguous region. Either way, the exact boundary still needs fresh pixel measurement in Stage 2, same as both prior forms — nothing here is copied from CDR or 2014-13-002's numbers.

## 5. Signature / supporting-document / off-form instructions

- Wet-ink signature + date — same in-person completion notice as the prior two forms.
- "[Use the back page if necessary]" — boilerplate from the original paper form; this PDF is a single page with no actual back side to reference, so there's nothing to build for it. Worth a brief Client Portal note only if staff want to tell clients how to provide additional space (e.g. an attachment), otherwise safe to disregard.
- No photograph requirement (confirmed visually — no photo box on this form, unlike CCS-A-NTSP-2016).
- Depending on how flag 3 (Court/Legal box) resolves, may need an off-form instruction explaining when that section applies.

## 6. Ambiguity / reproduction flags

- The four field-ownership flags above.
- Reproduction: "This document may be reproduced and is NOT FOR SALE" — confirmed clean, matches the committed inventory.
- No validity concerns beyond the general Rev-0/2014 currency caution already noted in the roadmap.

## Awaiting your approval

Stopping here per your instructions. Please resolve the four flagged ambiguities (or tell me which, if any, you want held open pending further information) so I know which region(s) to measure for the customer-visible crop — this directly determines whether Stage 2 builds one customer-visible region or two.
