#!/usr/bin/env python3
"""Crop game-tab art from the 1200px GGPoker lobby reference."""
import sys
from pathlib import Path
from PIL import Image

TABS = {
    "tab_home": (0, 103, 141, 153),
    "tab_aof": (141, 103, 276, 153),
    "tab_rush": (276, 103, 410, 153),
    "tab_holdem": (410, 103, 545, 153),
    "tab_plo": (545, 103, 680, 153),
    "tab_short": (680, 103, 815, 153),
    "tab_spin": (815, 103, 949, 153),
    "tab_battle": (949, 103, 1084, 153),
}

def main():
    src = Image.open(sys.argv[1]).convert("RGB")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "app/public/assets/chrome")
    out.mkdir(parents=True, exist_ok=True)
    for name, box in TABS.items():
        src.crop(box).save(out / f"{name}.png")
    print("tabs ->", out)

if __name__ == "__main__":
    main()
