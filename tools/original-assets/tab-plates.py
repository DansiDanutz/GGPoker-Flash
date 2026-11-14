#!/usr/bin/env python3
"""Re-letter three of Dan's header game-tab plates with DanGG product names.

The plates (app/public/assets/chrome/tab_*.png, 330x100) are Dan's own artwork. This keeps each
plate's frame, background and icon, clears the old lettering by repainting that area with the
plate's own background (a per-row blend of the clean columns on either side), and sets the new
name in two lines of Avenir Next Heavy Italic with the red slash accent the other plates use.
Re-running is safe: it clears and re-letters the same area.

Run from the repo root (needs Pillow):  python3 tools/original-assets/tab-plates.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

CHROME = Path(__file__).resolve().parents[2] / "app/public/assets/chrome"
FONT = ("/System/Library/Fonts/Avenir Next.ttc", 9)  # Heavy Italic
CREAM = (244, 228, 204, 255)
RED = (179, 38, 53, 255)
SHADOW = (0, 0, 0, 150)
SCALE = 4  # supersampling for clean edges
TEXT_RIGHT = 306  # last x the lettering may reach (the frame's inner edge is at ~326)
CLEAR_RIGHT = 321  # right clean column of the plate interior
CLEAR_TOP, CLEAR_BOTTOM = 4, 95
LINE_TOPS = (20, 52)  # cap tops of the two lines, matching the existing two-line plates
CAP_HEIGHT = 26
STRETCH = 1.16  # horizontal widening, closer to the extended lettering of the other plates
CANVAS_W = 260  # width of the lettering layer before widening

# plate key -> (first x right of the icon ring, line 1, line 2)
PLATES = {
    "spin": (106, "JACKPOT", "SNG"),
    "battle": (114, "BATTLE", "ROYALE"),
    "rush": (120, "FAST", "FOLD"),
}


def clear_lettering(im: Image.Image, x0: int) -> Image.Image:
    """Repaint x0..CLEAR_RIGHT with a per-row blend of the clean columns at its two edges."""
    out = im.copy()
    px = out.load()
    span = CLEAR_RIGHT - x0
    for y in range(CLEAR_TOP, CLEAR_BOTTOM + 1):
        left, right = im.getpixel((x0 - 1, y)), im.getpixel((CLEAR_RIGHT, y))
        for x in range(x0, CLEAR_RIGHT):
            t = (x - x0) / span
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(left, right))
    return out


def font_for_cap_height(cap: int) -> ImageFont.FreeTypeFont:
    size = cap * SCALE
    while True:
        font = ImageFont.truetype(FONT[0], size, index=FONT[1])
        top, bottom = font.getbbox("H")[1], font.getbbox("H")[3]
        if bottom - top <= cap * SCALE:
            return font
        size -= 1


def lettering(x0: int, lines: tuple[str, str]) -> Image.Image:
    """Transparent 330x100 layer with the two lines, their shadow and the red slash."""
    width = TEXT_RIGHT - (x0 + 8)
    cap = CAP_HEIGHT
    font = font_for_cap_height(cap)
    while max(font.getlength(line) for line in lines) * STRETCH > width * SCALE - 22 * SCALE:
        cap -= 1
        font = font_for_cap_height(cap)
    big = Image.new("RGBA", (CANVAS_W * SCALE, 100 * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)
    h_top = font.getbbox("H")[1]
    for line, top in zip(lines, LINE_TOPS):
        y = top * SCALE - h_top + (CAP_HEIGHT - cap) * SCALE // 2
        draw.text((0, y), line, font=font, fill=CREAM)
    # The accent: a short red parallelogram just right of the first line's cap top.
    sx, sy = font.getlength(lines[0]) + 4 * SCALE, LINE_TOPS[0] * SCALE
    w, h, slant = 12 * SCALE, 4 * SCALE, 3 * SCALE
    draw.polygon([(sx + slant, sy), (sx + w + slant, sy), (sx + w, sy + h), (sx, sy + h)], fill=RED)
    text_layer = big.resize((round(CANVAS_W * STRETCH), 100), Image.LANCZOS)
    text = Image.new("RGBA", (330, 100), (0, 0, 0, 0))
    text.alpha_composite(text_layer.crop((0, 0, 330 - (x0 + 8), 100)), (x0 + 8, 0))
    alpha = text.getchannel("A").filter(ImageFilter.GaussianBlur(1.2))
    shadow = Image.new("RGBA", text.size, SHADOW)
    shadow.putalpha(alpha.point(lambda a: a * SHADOW[3] // 255))
    layer = Image.new("RGBA", text.size, (0, 0, 0, 0))
    layer.alpha_composite(shadow, (1, 2))
    layer.alpha_composite(text)
    return layer


def main() -> None:
    for key, (x0, *lines) in PLATES.items():
        for suffix in ("", "_active"):
            path = CHROME / f"tab_{key}{suffix}.png"
            plate = Image.open(path).convert("RGBA")
            assert plate.size == (330, 100), f"{path.name} is {plate.size}, expected 330x100"
            result = clear_lettering(plate, x0)
            result.alpha_composite(lettering(x0, tuple(lines)))
            result.save(path, optimize=True)
            print(f"wrote {path.relative_to(CHROME.parents[3])}")


if __name__ == "__main__":
    main()
