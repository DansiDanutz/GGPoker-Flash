#!/usr/bin/env python3
"""Generate labelled contact sheets from the sliced atlas for visual identification."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ATLAS = ROOT / "app/public/assets/atlas"
MAN = json.load(open(ROOT / "app/public/assets/atlas_manifest.json"))

prefix = sys.argv[1] if len(sys.argv) > 1 else "lobby"
minw = int(sys.argv[2]) if len(sys.argv) > 2 else 1
maxw = int(sys.argv[3]) if len(sys.argv) > 3 else 9999
cell = 130
cols = 10
names = [n for n in sorted(MAN) if n.startswith(prefix) and minw <= MAN[n]["w"] <= maxw]
print("frames:", len(names))
out_dir = ROOT / "research/sheets"
out_dir.mkdir(parents=True, exist_ok=True)
for page in range(0, len(names), 100):
    chunk = names[page:page + 100]
    rows = (len(chunk) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (24, 24, 24, 255))
    d = ImageDraw.Draw(sheet)
    for i, n in enumerate(chunk):
        im = Image.open(ATLAS / f"{n}.png").convert("RGBA")
        if im.width > cell - 8 or im.height > cell - 24:
            im.thumbnail((cell - 8, cell - 24))
        x = (i % cols) * cell
        y = (i // cols) * cell
        sheet.alpha_composite(im, (x + (cell - im.width) // 2, y + 4 + (cell - 24 - im.height) // 2))
        d.text((x + 4, y + cell - 18), n.replace(prefix, "#"), fill=(255, 230, 120, 255))
    path = out_dir / f"{prefix}_{page//100:03d}.png"
    sheet.save(path)
    print(path)
