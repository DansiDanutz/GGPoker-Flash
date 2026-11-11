#!/usr/bin/env python3
"""Build the table-room layers from the decoded AIR table texture.

- room_dark.png: full room with the baked-in table darkened so our own felt is the only table.
- room_floor.png: a floor strip used below the felt.
Requires app/public/assets/tables/featured_6ring.png (decoded from the client ATF).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
TABLES = ROOT / "app/public/assets/tables"
SRC = TABLES / "featured_6ring.png"


def main():
    im = Image.open(SRC).convert("RGBA")
    W, H = im.size

    # floor strip (below the table rail)
    crop = im.crop((0, 690, W, 760)).resize((1200, 220), Image.LANCZOS)
    crop = ImageEnhance.Brightness(crop).enhance(0.55).filter(ImageFilter.GaussianBlur(1.2))
    crop.save(TABLES / "room_floor.png")

    # full room, table region suppressed
    bg = Image.new("RGBA", (W, H), (12, 10, 8, 255))
    bg.alpha_composite(im)
    arr = np.array(bg).astype(np.float32)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).ellipse([40, 110, 984, 650], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(90))
    m = np.array(mask).astype(np.float32) / 255.0
    arr[:, :, :3] *= (1.0 - 0.92 * m)[:, :, None]
    arr[:, :, :3] *= 0.62
    Image.fromarray(arr.astype(np.uint8), "RGBA").convert("RGB").save(TABLES / "room_dark.png")
    print("room layers written")


if __name__ == "__main__":
    main()
