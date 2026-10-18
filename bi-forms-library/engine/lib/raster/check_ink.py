#!/usr/bin/env python3
# Targeted per-field check: does each expected field actually have ink
# somewhere inside its own box (not just "the whole image looks similar"),
# and does each field that should be BLANK actually stay blank? This is the
# "character positioning / missing fields" regression check requested
# alongside whole-image pixel diffing, which can miss a field that's wrong
# but happens not to move the overall diff percentage much.
#
# Usage: check_ink.py <png_path> <scale_px_per_pt> <boxes_json_path> <out_json_path>
# boxes_json: [{"key":"lastName","xLeftPt":36,"xRightPt":576.12,"yBottomPt":842.64,"yTopPt":856.32,"expectInk":true}, ...]
import json
import sys

png_path, scale, boxes_path, out_path = sys.argv[1:5]
scale = float(scale)

from PIL import Image

img = Image.open(png_path).convert("L")
W, H = img.size
px = img.load()

with open(boxes_path) as f:
    boxes = json.load(f)

DARK = 150  # character ink is solid black; box-grid lines are mid-grey (~166) and must not register as "ink"

results = []
for b in boxes:
    # page-space pt -> top-down px (PNG renders are rasterized from the
    # PDF's top-down view at the given DPI/scale)
    page_h_pt = b.get("pageHeightPt")
    x0 = int(b["xLeftPt"] * scale)
    x1 = int(b["xRightPt"] * scale)
    y0 = int((page_h_pt - b["yTopPt"]) * scale)
    y1 = int((page_h_pt - b["yBottomPt"]) * scale)
    # Inset a couple of points before clamping: a field's own declared edge
    # sometimes coincides with a heavier-weight border (e.g. the outer
    # rounded-rectangle some staff-only boxes are enclosed in, drawn bolder
    # than an ordinary internal comb divider) that renders well under the
    # "mid-grey" ~166 a plain grid line normally does -- dark enough to
    # register as content ink at this threshold even though no value was
    # ever drawn there. Character ink is always centered within its own
    # cell with margin from the edges (drawCharInBox/fitCharFontSize), so
    # this inset still reliably catches real content while excluding the
    # box's own border.
    inset = max(1, round(2 * scale))
    x0, x1 = x0 + inset, x1 - inset
    y0, y1 = y0 + inset, y1 - inset
    x0, x1 = max(0, x0), min(W, x1)
    y0, y1 = max(0, y0), min(H, y1)
    dark_count = 0
    total = 0
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            total += 1
            if px[x, y] < DARK:
                dark_count += 1
    has_ink = dark_count > 2  # a couple of stray dark pixels (grid-line antialiasing) shouldn't count
    results.append({"key": b["key"], "hasInk": has_ink, "darkPixelSample": dark_count, "expectInk": b.get("expectInk", True)})

with open(out_path, "w") as f:
    json.dump(results, f, indent=2)

mismatches = [r for r in results if r["hasInk"] != r["expectInk"]]
print(f"checked {len(results)} fields, {len(mismatches)} mismatch(es)")
