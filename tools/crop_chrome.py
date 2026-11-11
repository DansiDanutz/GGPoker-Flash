#!/usr/bin/env python3
"""Crop the GGPoker window chrome from a 1200x961 screenshot of the running client."""
import sys
from pathlib import Path
from PIL import Image

CROPS = {
    "tab_home": (0, 103, 141, 153),
    "tab_aof": (141, 103, 276, 153),
    "tab_rush": (276, 103, 410, 153),
    "tab_holdem": (410, 103, 545, 153),
    "tab_plo": (545, 103, 680, 153),
    "tab_short": (680, 103, 815, 153),
    "tab_spin": (815, 103, 949, 153),
    "tab_battle": (949, 103, 1084, 153),
    "promo": (0, 153, 845, 296),
    "jackpot": (750, 42, 1074, 93),
}

def main():
    src = Image.open(sys.argv[1]).convert("RGB")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "app/public/assets/chrome")
    out.mkdir(parents=True, exist_ok=True)
    for name, box in CROPS.items():
        src.crop(box).save(out / f"{name}.png")
    print("chrome ->", out)

if __name__ == "__main__":
    main()
