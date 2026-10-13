#!/usr/bin/env python3
# Generic region-crop-and-composite step, generalized from the per-form
# compose_customer_canvas.py scripts (which were identical except for a
# hardcoded directory path and, for 2014-13-006, a divider loop that this
# version always includes -- it just runs zero times for a single region).
#
# Usage: compose_canvas.py <source_png> <page_height_pt> <scale_px_per_pt>
#        <divider_pt> <regions_json_path> <out_png_path> <out_dims_json_path>
#
# regions_json_path contains: [{"xLeftPt":0,"xRightPt":612,"yBottomPt":...,"yTopPt":...}, ...]
import json
import sys

src_png, page_h_pt, scale, divider_pt, regions_path, out_png, out_dims = sys.argv[1:8]
page_h_pt = float(page_h_pt)
scale = float(scale)
divider_pt = float(divider_pt)

with open(regions_path) as f:
    regions = json.load(f)

from PIL import Image, ImageDraw

src = Image.open(src_png)
page_w_pt = regions[0]["xRightPt"] - regions[0]["xLeftPt"]

crops = []
for r in regions:
    td_top = page_h_pt - r["yTopPt"]
    td_bot = page_h_pt - r["yBottomPt"]
    y0 = int(td_top * scale)
    y1 = int(td_bot * scale)
    crops.append(src.crop((0, y0, src.width, y1)))

divider_px = int(divider_pt * scale) if len(crops) > 1 else 0
total_h_px = sum(c.height for c in crops) + divider_px * max(0, len(crops) - 1)
canvas = Image.new("RGB", (src.width, total_h_px), "white")

y = 0
for i, crop in enumerate(crops):
    canvas.paste(crop, (0, y))
    y += crop.height
    if i < len(crops) - 1:
        draw = ImageDraw.Draw(canvas)
        mid = y + divider_px // 2
        draw.line([(40, mid), (src.width - 40, mid)], fill=(190, 190, 190), width=2)
        y += divider_px

canvas.save(out_png)
total_h_pt = total_h_px / scale
with open(out_dims, "w") as f:
    json.dump({
        "widthPt": page_w_pt,
        "heightPt": total_h_pt,
        "dividerPt": divider_pt if len(crops) > 1 else 0,
        "regionHeightsPt": [r["yTopPt"] - r["yBottomPt"] for r in regions],
        "regionCount": len(crops),
    }, f)

print(f"canvas: {canvas.width}x{canvas.height}px = {page_w_pt}x{total_h_pt:.2f}pt, {len(crops)} region(s)")
