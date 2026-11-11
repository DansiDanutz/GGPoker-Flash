#!/usr/bin/env python3
"""Generate the DanGG.ro wordmark and the personalised Flipout banner from the
client's original artwork plus the supplied portrait (with a Vision person mask)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CHROME = ROOT / "app/public/assets/chrome"
BRAND = ROOT / "research/brand"
OUT_BRAND = ROOT / "app/public/assets/brand"
OUT_BRAND.mkdir(parents=True, exist_ok=True)


def make_logo():
    # The "GG.RO" part of the original wordmark, preserved separately so the
    # generator can be re-run without corrupting its own output.
    gg = Image.open(BRAND / "ggro.png").convert("RGBA")
    font_path = "/System/Library/Fonts/SFNSRounded.ttf"
    font = None
    for size in range(24, 52):
        f = ImageFont.truetype(font_path, size)
        try:
            f.set_variation_by_name("Bold")
        except Exception:
            pass
        bb = f.getbbox("Dan")
        if 24 <= bb[3] - bb[1] <= 27:
            font = (f, bb)
            break
    if not font:
        f = ImageFont.truetype(font_path, 36)
        font = (f, f.getbbox("Dan"))
    f, bb = font
    text_w = bb[2] - bb[0]
    gap = 5
    canvas = Image.new("RGBA", (216, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.text((-bb[0], 45 - bb[3]), "Dan", font=f, fill=(255, 255, 255, 255))
    canvas.alpha_composite(gg, (text_w + gap, 0))
    canvas.save(CHROME / "logo.png")
    canvas.save(OUT_BRAND / "logo.png")
    print("logo:", text_w + gap + gg.width, "px content")


def warm_grade(img: Image.Image) -> Image.Image:
    a = np.array(img).astype(np.float32)
    a[:, :, 0] *= 1.10
    a[:, :, 1] *= 1.01
    a[:, :, 2] *= 0.86
    a[:, :, :3] = np.clip(a[:, :, :3], 0, 255)
    out = Image.fromarray(a.astype(np.uint8), "RGBA")
    warm = Image.new("RGBA", out.size, (255, 170, 80, 0))
    overlay = Image.new("RGBA", out.size, (255, 165, 70, 26))
    return Image.alpha_composite(out, overlay)


def load_cutout() -> Image.Image:
    img = Image.open(BRAND / "dan.jpg").convert("RGBA")
    mask = Image.open(BRAND / "mask.png").convert("L").resize(img.size, Image.LANCZOS)
    m = np.array(mask).astype(np.float32)
    # kill low-confidence background haze, keep a soft edge band
    m = np.clip((m - 26.0) / (236.0 - 26.0), 0, 1)
    a = (m * 255).astype(np.uint8)
    alpha = Image.fromarray(a, "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    img.putalpha(alpha)
    return warm_grade(img)


def make_promo():
    base = Image.open(BRAND / "promo_original.png").convert("RGB")
    W, H = base.size

    # ---- left panel: heavily blurred original artwork keeps the golden texture ----
    left = base.crop((0, 0, 340, H)).filter(ImageFilter.GaussianBlur(28))
    left = ImageEnhance.Brightness(left).enhance(0.72)
    left = ImageEnhance.Color(left).enhance(0.95)
    # warm highlight + darkening towards the bottom-left
    ov = Image.new("RGBA", (340, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    od.ellipse([-60, -40, 260, 180], fill=(255, 172, 76, 55))
    ov = ov.filter(ImageFilter.GaussianBlur(36))
    left = Image.alpha_composite(left.convert("RGBA"), ov).convert("RGB")
    panel = base.copy()
    panel.paste(left, (0, 0))

    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    for x in range(W):
        if x <= 235:
            v = 255
        elif x >= 330:
            v = 0
        else:
            v = int(255 * (1 - (x - 235) / 95))
        md.line([(x, 0), (x, H)], fill=v)
    composed = Image.composite(panel, base, mask).convert("RGBA")

    # ---- portrait ----
    person = load_cutout()
    scale = 222 / person.height
    person = person.resize((int(person.width * scale), 222), Image.LANCZOS)
    px, py = 20, -16

    w, h = person.size
    arr = np.array(person).astype(np.float32)
    alpha = arr[:, :, 3] / 255.0
    yy = np.arange(h)[:, None]
    visible = max(1, H - py)
    fade_start = int(visible * 0.94)
    bottom = np.clip(1.0 - (yy - fade_start) / max(1, visible - fade_start), 0, 1)
    bottom[yy >= visible] = 0
    xx = np.arange(w)[None, :]
    side = np.clip(np.minimum(xx, w - 1 - xx) / (w * 0.055), 0, 1)
    arr[:, :, 3] = alpha * bottom * side * 255
    person = Image.fromarray(arr.astype(np.uint8), "RGBA")

    # drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh = Image.new("RGBA", person.size, (0, 0, 0, 0))
    sh.putalpha(person.split()[3].point(lambda v: int(v * 0.5)))
    shadow.alpha_composite(sh, (px + 5, py + 7))
    shadow = shadow.filter(ImageFilter.GaussianBlur(7))
    composed = Image.alpha_composite(composed, shadow)

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.alpha_composite(person, (px, py))
    composed = Image.alpha_composite(composed, layer)

    # subtle top/bottom vignette to seat the portrait in the banner
    vig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    vd = ImageDraw.Draw(vig)
    vd.rectangle([0, 0, 320, 8], fill=(0, 0, 0, 40))
    for yy in range(H - 22, H):
        a = int(120 * ((yy - (H - 22)) / 22))
        vd.line([(0, yy), (320, yy)], fill=(10, 6, 3, a))
    composed = Image.alpha_composite(composed, vig)

    composed.convert("RGB").save(CHROME / "promo.png")
    composed.convert("RGB").save(OUT_BRAND / "promo.png")
    print("promo saved", composed.size)


if __name__ == "__main__":
    make_logo()
    make_promo()
