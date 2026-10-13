#!/usr/bin/env python3
# Secure reconstruction (2026 audit retrofit): crops the single approved
# customer-visible region from the rendered customer-fields-only page.
# Single-region version of the technique built for 2014-13-006 -- no
# divider needed. Crop boundary read directly from coordinate-map.json's
# customerPreviewCropBox, unchanged from the previously approved values.
import json
import sys

sys.path.insert(0, "/tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/bi-pdf-prototype/pylibs")
from PIL import Image

DIR = "/tmp/claude-0/-home-user-foreign-immigration-website/9b6bb15b-a588-5829-bac7-ca81faaddb89/scratchpad/bi-forms-prototype-2014-13-002"
SCALE = 300 / 72.0

with open(f"{DIR}/coordinate-map.json") as f:
    cmap = json.load(f)

cb = cmap["customerPreviewCropBox"]
page_h = cmap["pageHeightPt"]
page_w = cmap["pageWidthPt"]

src = Image.open(f"{DIR}/customerfields-1.png")

td_top = page_h - cb["yTopPt"]
td_bot = page_h - cb["yBottomPt"]
y0 = int(td_top * SCALE)
y1 = int(td_bot * SCALE)
crop = src.crop((0, y0, src.width, y1))
crop.save(f"{DIR}/customer-canvas.png")

height_pt = (y1 - y0) / SCALE
print(f"canvas size: {crop.width}x{crop.height}px = {page_w}x{height_pt:.2f}pt")
with open(f"{DIR}/canvas-dims.json", "w") as f:
    json.dump({"widthPt": page_w, "heightPt": height_pt}, f)
