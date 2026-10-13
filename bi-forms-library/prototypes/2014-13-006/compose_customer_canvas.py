#!/usr/bin/env python3
# Crops the two approved customer-visible regions from the rendered
# customer-fields-only page and composites them onto one new canvas with a
# visible divider between them, so nothing from the excluded staff-only
# strip is ever present in the output -- not cropped, not covered, absent.
import json
import sys

sys.path.insert(0, "/tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/bi-pdf-prototype/pylibs")
from PIL import Image, ImageDraw, ImageFont

DIR = "/tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/bi-forms-prototype-2014-13-006"
SCALE = 300 / 72.0

with open(f"{DIR}/coordinate-map.json") as f:
    cmap = json.load(f)

regions = cmap["customerVisibleRegions"]["regions"]
page_h = cmap["pageHeightPt"]
page_w = cmap["pageWidthPt"]

src = Image.open(f"{DIR}/customerfields-1.png")

crops = []
for r in regions:
    # bottom-up pt -> top-down px
    td_top = page_h - r["yTopPt"]
    td_bot = page_h - r["yBottomPt"]
    y0 = int(td_top * SCALE)
    y1 = int(td_bot * SCALE)
    crop = src.crop((0, y0, src.width, y1))
    crops.append((r, crop))

divider_pt = 22
divider_px = int(divider_pt * SCALE)
total_h_px = sum(c.height for _, c in crops) + divider_px * (len(crops) - 1)
canvas = Image.new("RGB", (src.width, total_h_px), "white")

y = 0
for i, (r, crop) in enumerate(crops):
    canvas.paste(crop, (0, y))
    y += crop.height
    if i < len(crops) - 1:
        draw = ImageDraw.Draw(canvas)
        mid = y + divider_px // 2
        draw.line([(40, mid), (src.width - 40, mid)], fill=(190, 190, 190), width=2)
        y += divider_px

canvas.save(f"{DIR}/customer-canvas.png")
total_h_pt = total_h_px / SCALE
print(f"canvas size: {canvas.width}x{canvas.height}px = {page_w}x{total_h_pt:.2f}pt")
with open(f"{DIR}/canvas-dims.json", "w") as f:
    json.dump({"widthPt": page_w, "heightPt": total_h_pt, "dividerPt": divider_pt,
               "regionHeightsPt": [page_h - r["yBottomPt"] - (page_h - r["yTopPt"]) for r in regions]}, f)
