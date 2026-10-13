#!/usr/bin/env python3
# Confirms that, after expanding a customer-preview PDF's page boundaries
# back to the full original page size, the area outside the original
# (small) embedded canvas is entirely blank -- i.e. there is genuinely
# nothing to recover, not just nothing visible within the old crop.
#
# Usage: check_blank_margin.py <png_path> <scale_px_per_pt> <canvas_height_pt> <out_json_path>
import json
import sys

png_path, scale, canvas_height_pt, out_path = sys.argv[1:5]
scale = float(scale)
canvas_height_pt = float(canvas_height_pt)

from PIL import Image

img = Image.open(png_path).convert("L")
W, H = img.size
px = img.load()

canvas_height_px = int(canvas_height_pt * scale)
margin_bottom_px = H - canvas_height_px  # the embedded canvas sits at the bottom (y=0 in PDF space)

non_white = 0
sampled = 0
for y in range(0, max(0, margin_bottom_px), 3):
    for x in range(0, W, 3):
        sampled += 1
        if px[x, y] < 250:
            non_white += 1

result = {
    "marginPx": margin_bottom_px,
    "sampled": sampled,
    "nonWhitePixels": non_white,
    "blank": non_white == 0,
}
with open(out_path, "w") as f:
    json.dump(result, f, indent=2)
print(json.dumps(result))
