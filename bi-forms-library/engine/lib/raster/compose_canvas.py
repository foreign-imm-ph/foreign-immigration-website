#!/usr/bin/env python3
# Generic region-crop-and-composite step, generalized from the per-form
# compose_customer_canvas.py scripts (which were identical except for a
# hardcoded directory path and, for 2014-13-006, a divider loop that this
# version always includes -- it just runs zero times for a single region).
#
# Usage: compose_canvas.py <srcs_json_path> <page_height_pt> <scale_px_per_pt>
#        <divider_pt> <regions_json_path> <out_png_path> <out_dims_json_path>
#
# srcs_json_path contains: {"0": "/path/to/page0.png", "1": "/path/to/page1.png", ...}
# -- one rasterized PNG per real PDF page a region references (every form
# mapped before BOC04.QF.001 is single-page, so this is always just {"0": ...}).
#
# regions_json_path contains: [{"xLeftPt":0,"xRightPt":612,"yBottomPt":...,"yTopPt":...,"page":0}, ...]
# ("page" is optional per region; omitted = page 0, same default as every
# other optional page property across this engine.)
import json
import sys

srcs_path, page_h_pt, scale, divider_pt, regions_path, out_png, out_dims = sys.argv[1:8]
page_h_pt = float(page_h_pt)
scale = float(scale)
divider_pt = float(divider_pt)

with open(regions_path) as f:
    regions = json.load(f)
with open(srcs_path) as f:
    srcs_by_page = json.load(f)

from PIL import Image, ImageDraw

srcs = {page: Image.open(p) for page, p in srcs_by_page.items()}
page_w_pt = regions[0]["xRightPt"] - regions[0]["xLeftPt"]

crops = []
region_pages = []
for r in regions:
    page_key = str(r.get("page", 0))
    src = srcs[page_key]
    region_pages.append(int(page_key))
    td_top = page_h_pt - r["yTopPt"]
    td_bot = page_h_pt - r["yBottomPt"]
    y0 = int(td_top * scale)
    y1 = int(td_bot * scale)
    crops.append(src.crop((0, y0, src.width, y1)))

canvas_width = crops[0].width
divider_px = int(divider_pt * scale) if len(crops) > 1 else 0
total_h_px = sum(c.height for c in crops) + divider_px * max(0, len(crops) - 1)
canvas = Image.new("RGB", (canvas_width, total_h_px), "white")

y = 0
for i, crop in enumerate(crops):
    canvas.paste(crop, (0, y))
    y += crop.height
    if i < len(crops) - 1:
        draw = ImageDraw.Draw(canvas)
        mid = y + divider_px // 2
        draw.line([(40, mid), (canvas_width - 40, mid)], fill=(190, 190, 190), width=2)
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
        "regionPages": region_pages,
    }, f)

print(f"canvas: {canvas.width}x{canvas.height}px = {page_w_pt}x{total_h_pt:.2f}pt, {len(crops)} region(s), pages {sorted(set(region_pages))}")
