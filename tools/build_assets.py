#!/usr/bin/env python3
"""Extract GGPoker UI assets from the installed client into the clone's public folder."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

SRC = Path.home() / "Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/Game/assets"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app/public/assets"
ATLAS_OUT = OUT / "atlas"


def slice_atlas(png: Path, meta: Path, prefix_filter=None, out_dir=ATLAS_OUT):
    img = Image.open(png).convert("RGBA")
    data = json.load(open(meta, encoding="utf-8-sig"))
    frames = data["frames"]
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, info in frames.items():
        f = info["frame"]
        w, h = f["w"], f["h"]
        if w <= 0 or h <= 0:
            continue
        box = (f["x"], f["y"], f["x"] + w, f["y"] + h)
        sprite = img.crop(box)
        if info.get("rotated"):
            sprite = sprite.rotate(-90, expand=True)
        target = out_dir / f"{name}.png"
        sprite.save(target)
        manifest[name] = {
            "w": sprite.width,
            "h": sprite.height,
            "src": info.get("spriteSourceSize", {"x": 0, "y": 0}),
            "source": info.get("sourceSize", {"w": sprite.width, "h": sprite.height}),
        }
    return manifest


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # 1. lobby/side/table UI atlas
    manifest = slice_atlas(SRC / "init_lobby/desktop_assets.png", SRC / "init_lobby/desktop_assets.json")
    (OUT / "atlas_manifest.json").write_text(json.dumps(manifest, indent=0))
    print("atlas frames:", len(manifest))

    # 2. table assets atlas (seat rings, buttons, chips...)
    table_png = ROOT / "research/table_assets.png"
    if table_png.exists():
        shutil.copy(table_png, OUT / "table_assets.png")
    card_png = ROOT / "research/card.png"
    if card_png.exists():
        shutil.copy(card_png, OUT / "card.png")

    # 3. sounds
    snd_out = OUT / "sounds"
    snd_out.mkdir(exist_ok=True)
    for f in (SRC / "sounds").glob("*.mp3"):
        shutil.copy(f, snd_out / f.name)

    # 4. official card back + table backdrop for the room
    cards_out = OUT / "cards"
    cards_out.mkdir(exist_ok=True)
    import zipfile, json as _json
    table_card_png = SRC / "after_lobby/table_card.png"
    table_card_meta = SRC / "after_lobby/table_card.json"
    if table_card_png.exists() and table_card_meta.exists():
        _img = Image.open(table_card_png).convert("RGBA")
        _frames = _json.load(open(table_card_meta, encoding="utf-8-sig"))["frames"]
        for _name, _target in (("card0032", "back_green.png"), ("card0030", "back_red.png")):
            if _name in _frames:
                _f = _frames[_name]["frame"]
                _img.crop((_f["x"], _f["y"], _f["x"] + _f["w"], _f["y"] + _f["h"])).save(cards_out / _target)

    # 5. card atlas metadata
    import zipfile
    with zipfile.ZipFile(SRC / "card/card.zip") as z:
        for n in z.namelist():
            (OUT / n).write_bytes(z.read(n))

    # 5. lobby top menu art
    top_out = OUT / "lobby_top"
    top_out.mkdir(exist_ok=True)
    for lang in ("en",):
        shutil.copy(SRC / f"lobby_top_menu/lobbytop_{lang}.png", top_out / f"lobbytop_{lang}.png")
        shutil.copy(SRC / f"lobby_top_menu/lobbytop_{lang}.json", top_out / f"lobbytop_{lang}.json")
    shutil.copy(SRC / "lobby_top_menu/lobbytop_bg.png", top_out / "lobbytop_bg.png")

    # 6. table backgrounds
    bg_out = OUT / "tables"
    bg_out.mkdir(exist_ok=True)
    shutil.copy(ROOT / "research/table_6ring.png", bg_out / "featured_6ring.png")
    for c in ("Green", "Black", "Red", "Navy"):
        p = ROOT / f"research/table_{c}.png"
        if p.exists():
            shutil.copy(p, bg_out / f"colored_{c.lower()}.png")

    # 7. specific PNG asset folders that are already sliced
    for folder in ("emoticon", "option_page", "game_info", "lobby_top_menu", "ggpass", "discover"):
        s = SRC / folder
        if s.exists():
            d = OUT / "ui" / folder
            d.mkdir(parents=True, exist_ok=True)
            for f in s.glob("*.png"):
                shutil.copy(f, d / f.name)

    print("assets written to", OUT)


if __name__ == "__main__":
    main()
