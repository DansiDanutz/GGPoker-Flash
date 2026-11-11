#!/usr/bin/env python3
"""Minimal Adobe Texture Format (ATF) decoder for DXT5/BC3 stage3d textures.

Header layout observed in GGPoker assets (16 bytes):
 0..2  'ATF'
 3     version
 4..7  flags
 8..11 body length (big endian)
 12    format code (5 = DXT5)
 13    log2 width
 14    log2 height
 15    mipmap count
 16..   texture data (mip 0 first)
"""
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def _rgb565(c):
    r = ((c >> 11) & 0x1F) * 255 // 31
    g = ((c >> 5) & 0x3F) * 255 // 63
    b = (c & 0x1F) * 255 // 31
    return r, g, b


def decode_dxt5_block(block: bytes):
    a0, a1 = block[0], block[1]
    bits = int.from_bytes(block[2:8], "little")
    alphas = [0] * 16
    palette = [a0, a1]
    if a0 > a1:
        for i in range(2, 8):
            palette.append(((7 - i) * a0 + (i - 1) * a1) // 7)
    else:
        for i in range(2, 6):
            palette.append(((5 - i) * a0 + (i - 1) * a1) // 5)
        palette += [0, 255]
    for i in range(16):
        alphas[i] = palette[(bits >> (3 * i)) & 7]

    c0, c1 = struct.unpack_from("<HH", block, 8)
    idx = int.from_bytes(block[12:16], "little")
    p0 = _rgb565(c0)
    p1 = _rgb565(c1)
    cols = [p0, p1]
    if c0 > c1:
        cols.append(tuple((2 * p0[k] + p1[k]) // 3 for k in range(3)))
        cols.append(tuple((p0[k] + 2 * p1[k]) // 3 for k in range(3)))
    else:
        cols.append(tuple((p0[k] + p1[k]) // 2 for k in range(3)))
        cols.append((0, 0, 0))
    out = []
    for i in range(16):
        r, g, b = cols[(idx >> (2 * i)) & 3]
        out.append((r, g, b, alphas[i]))
    return out


def decode_atf(data: bytes) -> Image.Image:
    assert data[0:3] == b"ATF", "not an ATF file"
    # Adobe ATF header: 'ATF' + 4 flags bytes (last 0xff => version follows)
    pos = 3
    flags = data[pos:pos + 4]
    pos += 4
    if flags[3] == 0xFF:
        pos += 1  # version byte
        pos += 4  # body length (big endian)
    else:
        pos -= 1
    check = data[pos]; pos += 1
    fmt = check & 0x7F
    w = 1 << data[pos]; pos += 1
    h = 1 << data[pos]; pos += 1
    pos += 1  # mip count
    pos += 4  # texture data length (big endian)
    off = pos
    if fmt != 5:
        raise ValueError(f"unsupported ATF format {fmt} ({w}x{h})")
    img = Image.new("RGBA", (w, h))
    px = np.zeros((h, w, 4), dtype=np.uint8)
    bw, bh = (w + 3) // 4, (h + 3) // 4
    for by in range(bh):
        for bx in range(bw):
            block = data[off : off + 16]
            off += 16
            pixels = decode_dxt5_block(block)
            for py in range(4):
                for pxi in range(4):
                    x, y = bx * 4 + pxi, by * 4 + py
                    if x < w and y < h:
                        px[y, x] = pixels[py * 4 + pxi]
    return Image.fromarray(px, "RGBA")


def main():
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".png")
    img = decode_atf(src.read_bytes())
    img.save(dst)
    print(dst, img.size)


if __name__ == "__main__":
    main()
