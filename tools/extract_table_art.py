#!/usr/bin/env python3
"""Crop named sprites from the client's table atlases.

Reactions: REA reaction-history-render.json ranks emoticon0000/0001/0002 as the closest
native frames to DanGG reactions 1/2/3 (Angry, Listening, Laughing); trimmed frames are
restored to their 55x56 source box. Take Seat: PlayerTakeSeat3D base, glow and arrow
(REA take-seat-art.json, player_cell0000/0003/0021), cropped from the decoded
table_assets_1.atf (research/table_assets.png from setup step 1) like the REA original.
"""
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

REACTIONS = (
    ("emoticon0000", "reactions/1.png"),
    ("emoticon0001", "reactions/2.png"),
    ("emoticon0002", "reactions/3.png"),
)
TAKE_SEAT = (
    ("player_cell0000", "table/native-take-seat-base.png"),
    ("player_cell0003", "table/native-take-seat-glow.png"),
    ("player_cell0021", "table/native-take-seat-arrow.png"),
)


def crop(atlas: Image.Image, info: dict) -> Image.Image:
    """The frame, rotated back if packed sideways and padded to its untrimmed source size."""
    f = info["frame"]
    sprite = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
    if info.get("rotated"):
        sprite = sprite.rotate(-90, expand=True)
    source = info.get("sourceSize")
    if not info.get("trimmed") or not source:
        return sprite
    offset = info.get("spriteSourceSize", {"x": 0, "y": 0})
    canvas = Image.new("RGBA", (source["w"], source["h"]), (0, 0, 0, 0))
    canvas.paste(sprite, (offset["x"], offset["y"]))
    return canvas


def save_sprites(atlas: Image.Image, frames: dict, sprites, out_dir: Path) -> list:
    written = []
    for name, target in sprites:
        if name not in frames:
            print(f"missing frame {name}", file=sys.stderr)
            continue
        path = out_dir / target
        path.parent.mkdir(parents=True, exist_ok=True)
        crop(atlas, frames[name]).save(path)
        written.append(path)
    return written


def extract(src_dir: Path, out_dir: Path, table_png: Path) -> list:
    written = []
    png = src_dir / "after_lobby/desktop_table_assets.png"
    meta = src_dir / "after_lobby/desktop_table_assets.json"
    if png.exists() and meta.exists():
        frames = json.load(open(meta, encoding="utf-8-sig"))["frames"]
        written += save_sprites(Image.open(png).convert("RGBA"), frames, REACTIONS, out_dir)
    else:
        print("desktop_table_assets not found; reaction art skipped", file=sys.stderr)
    table_zip = src_dir / "table_assets/table_assets_1.zip"
    if table_png.exists() and table_zip.exists():
        with zipfile.ZipFile(table_zip) as z:
            frames = json.loads(z.read("table_assets_1.json").decode("utf-8-sig"))["frames"]
        # The player_cell entries carry the whole cell as sourceSize; crop the frame alone.
        frames = {k: {**v, "trimmed": False} for k, v in frames.items()}
        written += save_sprites(Image.open(table_png).convert("RGBA"), frames, TAKE_SEAT, out_dir)
    else:
        print("decoded table_assets_1 not found; take-seat art skipped", file=sys.stderr)
    return written


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/Game/assets"
    root = Path(__file__).resolve().parent.parent
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "app/public/assets"
    table_png = Path(sys.argv[3]) if len(sys.argv) > 3 else root / "research/table_assets.png"
    for p in extract(src, out, table_png):
        print("wrote", p)
