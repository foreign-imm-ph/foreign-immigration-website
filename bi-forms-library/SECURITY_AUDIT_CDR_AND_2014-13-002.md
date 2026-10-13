# Security Audit — Confidentiality of CCS-A-CDR-2016 and 2014-13-002 Customer Previews

**Method:** not a string search this time. I took the actual, already-delivered `customer-preview.pdf` for each form, used pdf-lib to restore MediaBox/CropBox/BleedBox/TrimBox/ArtBox to the full original page size (exactly what opening the file in any PDF editor and dragging the crop back out would do), and **rendered the result** to see precisely what becomes visible. Scripts: `expand_mediabox.js`; outputs: `cdr-expanded-1.png`, `form2-expanded-1.png` (both delivered alongside this report).

## Finding: no applicant or FIS data is recoverable — confirmed by direct rendering, not assumed

In both expanded renders, the "hidden" sections (Landline, Mobile, "Documents to be certified"/Purpose on CDR, Purpose on 2014-13-002, the Date/Signature lines, the CCS Window, the entire Claim Stub) appear **completely blank**. No fictional data I entered for the staff preview — the mobile numbers, the Purpose text — appears anywhere. This matches and strengthens the earlier stream-decompression check: it's not just that the *text strings* aren't present, the *rendered boxes are empty*, which is the more direct and conclusive test.

The reason this holds is architectural, not incidental: both `generate.js` scripts build the customer document by loading a **second, independent, fresh copy** of the blank template and calling only the customer-field population function on it — `populateFisFields` (CDR) / the staff-only field functions (2014-13-002) are simply never invoked on that object. There is no data to recover because it was never written to that file in the first place.

## Finding that IS a real, worth-fixing gap: the form's own static structure is recoverable

What the expanded renders **do** reveal is the original blank form's own labels and box grids for the excluded sections — "Contact Number(s) in the Philippines," "Documents to be certified:"/"Purpose:," the CCS Window's own heading and RECEIVED/RELEASED labels, the full Claim Stub layout. None of this is applicant-specific or secret (it's the publicly-reproducible blank template, identical to what anyone can already see in `original.pdf`), but it is more than the approved customer-visible region was supposed to contain, and it technically contradicts a strict reading of "must not be recoverable" if that's held to include the form's own layout, not just entered data.

## The more important finding: this safety is a *convention*, not an enforced guarantee

The MediaBox/CropBox technique only controls what's *displayed*. The full content stream — including whatever a future version of this code might accidentally draw before building the customer copy — physically remains in the file, invisible only because nothing currently writes to it. This worked correctly for both forms because the generation code happens to discipline itself to use a fresh, selectively-populated copy every time. But:

- Nothing in the file format or the crop technique itself would catch a future mistake — e.g. a form where someone refactors `generate.js` and accidentally builds the customer PDF from the *staff*-populated object instead of a fresh one. The bug would be silent: the visible preview would look identical (correctly cropped), while the full applicant+staff data sat recoverably in the file.
- This is exactly the class of risk you flagged, and it's real, even though neither shipped prototype currently exhibits it.

By contrast, the 2014-13-006 customer PDF (built this session) has no such dependency: it's constructed via `PDFDocument.create()` as a brand-new file containing only an embedded image of the two approved regions plus overlay text. There is no code path by which unapproved content could ever end up in that file, because the object literally never touches `original.pdf` or anything derived from it.

## Recommendation: retrofit CDR and 2014-13-002 to the same construction-guaranteed technique

No new technique needs to be invented — apply the same pipeline already built and verified for 2014-13-006, simplified for a single contiguous region (no divider/compositing step needed, just one crop):

1. Build the customer-fields-only document exactly as today (fresh copy, only customer fields drawn) — unchanged.
2. Render it, crop the one approved region, and embed that crop as an image into a **new** `PDFDocument.create()` object (instead of using `setCropBox`/`setMediaBox` on a copy of `original.pdf`).
3. Draw the watermark as vector text on top, same as now.
4. Apply the adopted metadata-minimization standard (not yet applied to either, since both predate that standard).

This removes the "recoverable blank-template structure" finding entirely (there's nothing to expand back to, since the file never contained it) and converts the safety property from "true because the code currently behaves correctly" to "true because the file cannot physically contain anything else" — matching 2014-13-006's guarantee.

**Not done without your approval:** this would regenerate both files's binary content (same visible appearance, same data, same approved crop boundary/field ownership — only the underlying construction method changes) and touches two already-committed, already-approved prototypes. Flagging it here as the audit's recommendation; awaiting your decision on whether to apply it now, later, or not at all.

## Scope confirmation

No approved customer-visible boundary or field-ownership decision was changed for any form during this audit. No files were committed. No live website, Worker, D1, R2, or deployment changes were made — this audit worked entirely on already-delivered local copies of the two prototypes' output files.
