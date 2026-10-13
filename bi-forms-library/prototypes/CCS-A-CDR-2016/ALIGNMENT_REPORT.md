# BI Form Automation Prototype - Alignment Report

**Form:** CCS-A-CDR-2016, Request for Certified True Copy of Derogatory Records
**Data used:** 100% fictional (Jonathan Michael Smith, Australian citizen) - see `sample-data.json`
**Status:** Best achievable result reached after two inspect-and-correct passes. Zero overflow issues on the final run.

This is an isolated scratchpad prototype only. Nothing in the FIS repository, website, database, or Cloudflare resources was touched.

## What was fixed during inspection (requirement 9)

1. **Other Name(s)/Alias(es) rows 1 and 2 - coordinate bug.** The first-pass coordinate map had a spurious extra column divider for these two rows, picked up from the pixel shape of the printed "1"/"2" row-number labels rather than an actual box border (confirmed by inspecting the raw pixel pattern - it was a numeral-shaped blob, not a full-height grid line). This pushed the "N" of "N/A" to print to the left of the real first box, colliding with the "1"/"2" label. Fixed by removing the false divider from `coordinate-map.json`; "N/A" now sits correctly inside the box grid in both previews.
2. **Customer preview crop boundary.** The initial crop cut through the middle of the "Contact Number(s) in the Philippines" heading rather than excluding it. Re-measured the pixel position of that heading text against the Passport Number box's bottom border and moved the crop boundary to 466.5pt - just below the Passport Number field and above the heading - so the cropped preview now ends exactly where requirement 6 specifies, with no trace of the Philippine contact-number section.
3. **Watermark clipping.** The watermark was sized and centered against the full original page (612x936pt) before the customer preview's crop was applied, so most of the text ran off both edges of the much shorter cropped page. Rewrote the watermark logic to auto-shrink the font until its rotated footprint fits the actual visible crop area, and to center it within that area. It now reads in full: "PREVIEW ONLY | FOR BI APPLICATION PREPARATION THROUGH FIS."
4. **Minor copy fix.** Removed an em dash from the staff-preview footer stamp (replaced with a hyphen), consistent with the project's general content-style preference, even though that rule was issued in a different context.

## Fields requiring no adjustment

Every character-box field (Last/First/Middle Name, Date of Birth, Place of Birth, Citizenship, full address block, Passport Number, Landline, Mobile), both Gender checkboxes, and the free-text Documents/Purpose lines rendered correctly on the very first pass: one character per box, centered both ways, legible black text at the largest size that fits each box.

## Deliberate design decisions (not defects - flagged for your review)

- **Date and Signature lines left blank in both previews.** A wet-ink signature can't be meaningfully auto-filled, and auto-filling today's date could be misleading before the applicant actually signs. If you'd like the Date line auto-filled (e.g., at generation time), that's a small, easy change - just say so.
- **Landline/Mobile marked as FIS-owned fields.** I populated Landline with "N/A" and Mobile with a fictional PH number, reasoning that FIS, as the filing representative, would supply its own reachable contact number here. This wasn't explicitly specified field-by-field in your brief - it's my own interpretation of "FIS-controlled fields should be populated only where appropriate." Worth confirming this is the behavior you want before any real integration.
- **"PROTOTYPE - FICTIONAL DATA - NOT FOR FILING" stamp on the staff preview.** This is an addition beyond your literal spec, added so the file can't be mistaken for a real filing if it's ever seen out of context. It's a single small, light-grey line and easy to remove if you don't want it.

## Untouched by design

The Certification and Clearance Section (CCS) Window and the entire Claim Stub ("To be filled out by Authorized BI Personnel Only") are confirmed completely blank in the staff preview - no customer or FIS data was ever written into them.

## Files delivered

- `staff-preview.pdf` / `staff-preview.png` - full original form, all applicant + FIS fields filled, BI-only sections untouched.
- `customer-preview.pdf` / `customer-preview.png` - cropped to the applicant-controlled portion only (ends immediately after Passport Number), with the required preview watermark.
- `coordinate-map.json` - the reusable, form-specific coordinate map (requirement 4), corrected as described above.
- `overflow-report.json` - currently empty; the sample data fit every field with no truncation.
