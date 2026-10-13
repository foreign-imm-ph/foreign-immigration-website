#!/usr/bin/env python3
# Pixel-level parity check between a freshly generated render and a
# committed golden reference image. Used instead of (not merely alongside)
# a loose whole-image similarity score: PDF generation here is fully
# deterministic (vector text drawn at fixed coordinates, rasterized by the
# same Poppler build), so a real regression should show as an exact,
# reproducible pixel difference, not a fuzzy "looks different" score.
#
# Usage: compare_png.py <golden_png> <candidate_png> <out_json_path>
import json
import sys

golden_path, candidate_path, out_path = sys.argv[1:4]

from PIL import Image, ImageChops

golden = Image.open(golden_path).convert("RGB")
candidate = Image.open(candidate_path).convert("RGB")

result = {"sameSize": golden.size == candidate.size, "goldenSize": golden.size, "candidateSize": candidate.size}

if not result["sameSize"]:
    result.update({"diffPixels": None, "totalPixels": None, "diffRatio": None, "bbox": None})
else:
    diff = ImageChops.difference(golden, candidate)
    bbox = diff.getbbox()
    total = golden.size[0] * golden.size[1]
    if bbox is None:
        diff_count = 0
    else:
        # Count pixels with any non-zero channel difference, restricted to
        # the bounding box of change for speed.
        region = diff.crop(bbox)
        px = region.load()
        w, h = region.size
        diff_count = 0
        for y in range(h):
            for x in range(w):
                if px[x, y] != (0, 0, 0):
                    diff_count += 1
    result.update({
        "diffPixels": diff_count,
        "totalPixels": total,
        "diffRatio": diff_count / total if total else None,
        "bbox": bbox,
    })

with open(out_path, "w") as f:
    json.dump(result, f, indent=2)
print(json.dumps(result))
