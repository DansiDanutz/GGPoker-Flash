#!/usr/bin/env python3
"""Generate 20 original 256x256 JPEG preset avatars for OpenPoker / DanGG.

100% procedural original artwork (zero third-party sprites or reference crops).
Categories match app/src/components/mypage/ProfilePane.tsx:
  gg-01..06: Poker Players
  gg-07..13: Ocean Characters
  gg-14..20: Lucky Charms
"""
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

SIZE = 256
SS = 4  # 4x supersampling for crisp anti-aliased edges
W = SIZE * SS

AVATARS = [
    # Poker Players (01-06)
    ("gg-01", "poker", "spade",    ((18, 22, 34), (48, 36, 18)), (236, 185, 72),  (220, 178, 146), (34, 38, 48),  "sunglasses"),
    ("gg-02", "poker", "heart",    ((32, 14, 22), (82, 24, 38)), (242, 92, 108),  (204, 152, 118), (44, 26, 30),  "fedora"),
    ("gg-03", "poker", "diamond",  ((12, 30, 34), (20, 68, 74)), (92, 220, 212),  (232, 194, 162), (28, 42, 52),  "visor"),
    ("gg-04", "poker", "club",     ((14, 30, 20), (26, 74, 46)), (116, 224, 142), (178, 126, 92),  (22, 34, 26),  "collar"),
    ("gg-05", "poker", "spade",    ((26, 18, 38), (68, 42, 96)), (244, 198, 90),  (226, 184, 152), (48, 32, 64),  "crown"),
    ("gg-06", "poker", "heart",    ((36, 18, 28), (94, 38, 62)), (246, 176, 198), (236, 198, 172), (56, 24, 38),  "earrings"),
    # Ocean Characters (07-13)
    ("gg-07", "ocean", "shark",    ((8, 24, 44),  (16, 68, 108)), (112, 214, 255), (186, 228, 248), (18, 52, 86),  ""),
    ("gg-08", "ocean", "whale",    ((10, 20, 52), (24, 54, 122)), (148, 198, 255), (210, 232, 255), (24, 46, 98),  ""),
    ("gg-09", "ocean", "octopus",  ((22, 16, 48), (64, 34, 108)), (214, 146, 255), (242, 194, 255), (56, 26, 90),  ""),
    ("gg-10", "ocean", "turtle",   ((8, 34, 34),  (18, 86, 78)),  (102, 238, 198), (184, 248, 226), (14, 64, 58),  ""),
    ("gg-11", "ocean", "trident",  ((12, 28, 46), (26, 78, 114)), (245, 202, 94),  (252, 230, 158), (20, 58, 92),  ""),
    ("gg-12", "ocean", "fish",     ((8, 30, 48),  (18, 88, 128)), (255, 174, 82),  (255, 218, 154), (16, 62, 96),  ""),
    ("gg-13", "ocean", "anchor",   ((10, 22, 38), (28, 56, 86)),  (228, 196, 116), (246, 228, 174), (20, 42, 68),  ""),
    # Lucky Charms (14-20)
    ("gg-14", "lucky", "clover",   ((10, 32, 20), (22, 88, 48)),  (108, 238, 134), (194, 252, 204), (18, 66, 36),  ""),
    ("gg-15", "lucky", "horseshoe",((34, 24, 10), (88, 60, 18)),  (248, 204, 86),  (255, 234, 162), (64, 42, 12),  ""),
    ("gg-16", "lucky", "die",      ((36, 14, 18), (94, 26, 34)),  (252, 244, 232), (244, 188, 92),  (72, 20, 28),  ""),
    ("gg-17", "lucky", "star",     ((22, 18, 44), (62, 46, 112)), (252, 214, 96),  (255, 240, 178), (44, 34, 86),  ""),
    ("gg-18", "lucky", "crown",    ((34, 20, 14), (92, 54, 20)),  (252, 202, 74),  (255, 232, 150), (68, 38, 14),  ""),
    ("gg-19", "lucky", "gem",      ((12, 24, 42), (30, 68, 114)), (118, 224, 255), (214, 246, 255), (22, 52, 92),  ""),
    ("gg-20", "lucky", "chip",     ((30, 14, 24), (82, 28, 48)),  (246, 194, 78),  (252, 232, 164), (64, 22, 38),  ""),
]


def radial_bg(c_outer, c_inner):
    img = Image.new("RGB", (W, W), c_outer)
    px = img.load()
    cx = cy = W / 2.0
    max_r = W * 0.62
    # Downscale-compute gradient smoothly then resize for speed & zero banding
    gw = 256
    g = Image.new("RGB", (gw, gw))
    gpx = g.load()
    gc = gw / 2.0
    gr = gw * 0.62
    for y in range(gw):
        dy = (y - gc * 0.88) / gr
        for x in range(gw):
            dx = (x - gc) / gr
            t = min(1.0, math.sqrt(dx * dx + dy * dy))
            t = t * t * (3 - 2 * t)
            r = int(c_inner[0] * (1 - t) + c_outer[0] * t)
            grn = int(c_inner[1] * (1 - t) + c_outer[1] * t)
            b = int(c_inner[2] * (1 - t) + c_outer[2] * t)
            gpx[x, y] = (r, grn, b)
    return g.resize((W, W), Image.Resampling.BICUBIC)


def draw_ring(draw, accent):
    m = int(W * 0.045)
    draw.ellipse([m, m, W - m, W - m], outline=accent, width=int(W * 0.018))
    m2 = int(W * 0.075)
    soft = tuple(max(0, min(255, int(c * 0.65))) for c in accent)
    draw.ellipse([m2, m2, W - m2, W - m2], outline=soft, width=int(W * 0.006))


def draw_suit_pip(draw, kind, cx, cy, r, color):
    if kind == "diamond":
        pts = [(cx, cy - r), (cx + r * 0.78, cy), (cx, cy + r), (cx - r * 0.78, cy)]
        draw.polygon(pts, fill=color)
    elif kind == "heart":
        draw.ellipse([cx - r * 0.85, cy - r * 0.78, cx + r * 0.05, cy + r * 0.12], fill=color)
        draw.ellipse([cx - r * 0.05, cy - r * 0.78, cx + r * 0.85, cy + r * 0.12], fill=color)
        draw.polygon([(cx - r * 0.80, cy - r * 0.15), (cx + r * 0.80, cy - r * 0.15), (cx, cy + r * 0.95)], fill=color)
    elif kind == "spade":
        draw.polygon([(cx, cy - r * 0.95), (cx + r * 0.82, cy + r * 0.05), (cx - r * 0.82, cy + r * 0.05)], fill=color)
        draw.ellipse([cx - r * 0.82, cy - r * 0.20, cx + r * 0.04, cy + r * 0.56], fill=color)
        draw.ellipse([cx - r * 0.04, cy - r * 0.20, cx + r * 0.82, cy + r * 0.56], fill=color)
        draw.polygon([(cx, cy + r * 0.25), (cx + r * 0.34, cy + r * 0.92), (cx - r * 0.34, cy + r * 0.92)], fill=color)
    elif kind == "club":
        cr = r * 0.44
        draw.ellipse([cx - cr, cy - r * 0.86, cx + cr, cy - r * 0.86 + 2 * cr], fill=color)
        draw.ellipse([cx - r * 0.82, cy - cr * 0.45, cx - r * 0.82 + 2 * cr, cy - cr * 0.45 + 2 * cr], fill=color)
        draw.ellipse([cx + r * 0.82 - 2 * cr, cy - cr * 0.45, cx + r * 0.82, cy - cr * 0.45 + 2 * cr], fill=color)
        draw.polygon([(cx, cy + r * 0.18), (cx + r * 0.34, cy + r * 0.92), (cx - r * 0.34, cy + r * 0.92)], fill=color)


def draw_poker_player(draw, motif, accent, skin, coat, style):
    cx = W * 0.5
    # Shoulders / jacket
    draw.pieslice([W * 0.12, W * 0.58, W * 0.88, W * 1.24], 180, 360, fill=coat)
    # Lapels & shirt V
    draw.polygon([(cx - W * 0.12, W * 0.62), (cx + W * 0.12, W * 0.62), (cx, W * 0.88)], fill=(238, 240, 244))
    draw.polygon([(cx - W * 0.04, W * 0.66), (cx + W * 0.04, W * 0.66), (cx, W * 0.86)], fill=accent)
    # Neck
    draw.rounded_rectangle([cx - W * 0.07, W * 0.48, cx + W * 0.07, W * 0.66], radius=W * 0.03, fill=skin)
    # Head
    draw.ellipse([cx - W * 0.165, W * 0.21, cx + W * 0.165, W * 0.56], fill=skin)
    # Hair / headgear
    hair = tuple(max(12, c - 14) for c in coat)
    if style == "fedora":
        draw.pieslice([cx - W * 0.175, W * 0.17, cx + W * 0.175, W * 0.38], 180, 360, fill=hair)
        draw.rounded_rectangle([cx - W * 0.25, W * 0.255, cx + W * 0.25, W * 0.295], radius=W * 0.02, fill=hair)
        draw.rectangle([cx - W * 0.16, W * 0.235, cx + W * 0.16, W * 0.258], fill=accent)
    elif style == "crown":
        draw.pieslice([cx - W * 0.17, W * 0.19, cx + W * 0.17, W * 0.39], 180, 360, fill=hair)
        pts = [
            (cx - W * 0.13, W * 0.24), (cx - W * 0.15, W * 0.13), (cx - W * 0.06, W * 0.19),
            (cx, W * 0.11), (cx + W * 0.06, W * 0.19), (cx + W * 0.15, W * 0.13), (cx + W * 0.13, W * 0.24),
        ]
        draw.polygon(pts, fill=accent)
    elif style == "visor":
        draw.pieslice([cx - W * 0.175, W * 0.19, cx + W * 0.175, W * 0.38], 180, 360, fill=hair)
        draw.rounded_rectangle([cx - W * 0.22, W * 0.26, cx + W * 0.22, W * 0.305], radius=W * 0.02, fill=accent)
    elif style == "earrings":
        draw.pieslice([cx - W * 0.195, W * 0.17, cx + W * 0.195, W * 0.52], 170, 370, fill=hair)
        draw.ellipse([cx - W * 0.15, W * 0.23, cx + W * 0.15, W * 0.55], fill=skin)
        draw.pieslice([cx - W * 0.16, W * 0.19, cx + W * 0.16, W * 0.34], 180, 360, fill=hair)
        draw.ellipse([cx - W * 0.185, W * 0.42, cx - W * 0.145, W * 0.47], fill=accent)
        draw.ellipse([cx + W * 0.145, W * 0.42, cx + W * 0.185, W * 0.47], fill=accent)
    else:
        draw.pieslice([cx - W * 0.175, W * 0.185, cx + W * 0.175, W * 0.38], 180, 360, fill=hair)

    # Eyes / Sunglasses
    if style == "sunglasses":
        draw.rounded_rectangle([cx - W * 0.135, W * 0.34, cx - W * 0.015, W * 0.41], radius=W * 0.022, fill=(16, 18, 24), outline=accent, width=int(W * 0.008))
        draw.rounded_rectangle([cx + W * 0.015, W * 0.34, cx + W * 0.135, W * 0.41], radius=W * 0.022, fill=(16, 18, 24), outline=accent, width=int(W * 0.008))
        draw.line([(cx - W * 0.015, W * 0.365), (cx + W * 0.015, W * 0.365)], fill=accent, width=int(W * 0.01))
    else:
        draw.ellipse([cx - W * 0.085, W * 0.355, cx - W * 0.045, W * 0.395], fill=(24, 24, 30))
        draw.ellipse([cx + W * 0.045, W * 0.355, cx + W * 0.085, W * 0.395], fill=(24, 24, 30))
    # Subtle smile
    draw.arc([cx - W * 0.055, W * 0.43, cx + W * 0.055, W * 0.49], 15, 165, fill=(92, 54, 48), width=int(W * 0.012))

    # Corner suit medallion
    bx, by, br = W * 0.77, W * 0.77, W * 0.115
    draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(14, 16, 24), outline=accent, width=int(W * 0.012))
    draw_suit_pip(draw, motif, bx, by, br * 0.56, accent)


def draw_ocean(draw, motif, accent, light, deep):
    cx, cy = W * 0.5, W * 0.5
    # Subtle water wave rings
    for r in (0.37, 0.29):
        draw.ellipse([cx - W * r, cy - W * r, cx + W * r, cy + W * r], outline=deep, width=int(W * 0.009))
    if motif == "shark":
        # Stylized shark fin + wave
        draw.polygon([(cx - W * 0.16, cy + W * 0.16), (cx + W * 0.02, cy - W * 0.28), (cx + W * 0.14, cy - W * 0.14), (cx + W * 0.10, cy + W * 0.16)], fill=accent)
        draw.polygon([(cx - W * 0.04, cy + W * 0.14), (cx + W * 0.02, cy - W * 0.22), (cx + W * 0.09, cy + W * 0.14)], fill=light)
        draw.arc([cx - W * 0.34, cy + W * 0.08, cx + W * 0.34, cy + W * 0.34], 190, 350, fill=light, width=int(W * 0.028))
    elif motif == "whale":
        # Stylized whale tail fluke rising from water
        draw.polygon([(cx - W * 0.055, cy + W * 0.24), (cx + W * 0.055, cy + W * 0.24), (cx + W * 0.028, cy - W * 0.04), (cx - W * 0.028, cy - W * 0.04)], fill=accent)
        draw.pieslice([cx - W * 0.34, cy - W * 0.28, cx + W * 0.02, cy + W * 0.08], 145, 315, fill=accent)
        draw.pieslice([cx - W * 0.02, cy - W * 0.28, cx + W * 0.34, cy + W * 0.08], 225, 395, fill=light)
        draw.arc([cx - W * 0.30, cy + W * 0.14, cx + W * 0.30, cy + W * 0.32], 195, 345, fill=light, width=int(W * 0.024))
    elif motif == "octopus":
        draw.ellipse([cx - W * 0.19, cy - W * 0.27, cx + W * 0.19, cy + W * 0.08], fill=accent)
        draw.ellipse([cx - W * 0.09, cy - W * 0.12, cx - W * 0.03, cy - W * 0.05], fill=(20, 14, 40))
        draw.ellipse([cx + W * 0.03, cy - W * 0.12, cx + W * 0.09, cy - W * 0.05], fill=(20, 14, 40))
        for dx in (-0.22, -0.11, 0.0, 0.11, 0.22):
            draw.arc([cx + W * (dx - 0.07), cy - W * 0.02, cx + W * (dx + 0.07), cy + W * 0.30], 0, 180, fill=light if abs(dx) > 0.1 else accent, width=int(W * 0.032))
    elif motif == "turtle":
        # Shell + flippers + head
        for (fx, fy, rx, ry) in [(-0.22, -0.08, 0.10, 0.05), (0.22, -0.08, 0.10, 0.05), (-0.18, 0.18, 0.08, 0.05), (0.18, 0.18, 0.08, 0.05)]:
            draw.ellipse([cx + W * (fx - rx), cy + W * (fy - ry), cx + W * (fx + rx), cy + W * (fy + ry)], fill=light)
        draw.ellipse([cx - W * 0.07, cy - W * 0.31, cx + W * 0.07, cy - W * 0.16], fill=light)
        draw.ellipse([cx - W * 0.18, cy - W * 0.19, cx + W * 0.18, cy + W * 0.23], fill=accent, outline=deep, width=int(W * 0.015))
        draw.polygon([(cx, cy - W * 0.10), (cx + W * 0.09, cy), (cx, cy + W * 0.12), (cx - W * 0.09, cy)], fill=deep)
    elif motif == "trident":
        lw = int(W * 0.030)
        draw.line([(cx, cy - W * 0.28), (cx, cy + W * 0.30)], fill=accent, width=lw)
        draw.line([(cx - W * 0.18, cy - W * 0.22), (cx - W * 0.18, cy + W * 0.02)], fill=accent, width=lw)
        draw.line([(cx + W * 0.18, cy - W * 0.22), (cx + W * 0.18, cy + W * 0.02)], fill=accent, width=lw)
        draw.line([(cx - W * 0.18, cy + W * 0.02), (cx + W * 0.18, cy + W * 0.02)], fill=accent, width=lw)
        for tx, ty in [(cx, cy - W * 0.32), (cx - W * 0.18, cy - W * 0.26), (cx + W * 0.18, cy - W * 0.26)]:
            draw.polygon([(tx, ty), (tx - W * 0.045, ty + W * 0.09), (tx + W * 0.045, ty + W * 0.09)], fill=light)
    elif motif == "fish":
        draw.ellipse([cx - W * 0.24, cy - W * 0.16, cx + W * 0.16, cy + W * 0.16], fill=accent)
        draw.polygon([(cx + W * 0.10, cy), (cx + W * 0.30, cy - W * 0.16), (cx + W * 0.30, cy + W * 0.16)], fill=light)
        draw.ellipse([cx - W * 0.15, cy - W * 0.05, cx - W * 0.09, cy + W * 0.01], fill=(18, 22, 32))
        draw.arc([cx - W * 0.08, cy - W * 0.12, cx + W * 0.06, cy + W * 0.12], 250, 110, fill=light, width=int(W * 0.022))
    elif motif == "anchor":
        lw = int(W * 0.032)
        draw.ellipse([cx - W * 0.075, cy - W * 0.31, cx + W * 0.075, cy - W * 0.16], outline=light, width=int(W * 0.022))
        draw.line([(cx, cy - W * 0.16), (cx, cy + W * 0.25)], fill=accent, width=lw)
        draw.line([(cx - W * 0.16, cy - W * 0.07), (cx + W * 0.16, cy - W * 0.07)], fill=accent, width=lw)
        draw.arc([cx - W * 0.24, cy - W * 0.06, cx + W * 0.24, cy + W * 0.27], 15, 165, fill=accent, width=lw)


def draw_lucky(draw, motif, accent, light, deep):
    cx, cy = W * 0.5, W * 0.5
    if motif == "clover":
        r = W * 0.125
        for dx, dy in [(-0.11, -0.11), (0.11, -0.11), (-0.11, 0.09), (0.11, 0.09)]:
            draw.ellipse([cx + W * dx - r, cy + W * dy - r, cx + W * dx + r, cy + W * dy + r], fill=accent)
        draw.ellipse([cx - W * 0.06, cy - W * 0.07, cx + W * 0.06, cy + W * 0.05], fill=light)
        draw.line([(cx, cy + W * 0.08), (cx + W * 0.04, cy + W * 0.31)], fill=light, width=int(W * 0.032))
    elif motif == "horseshoe":
        draw.arc([cx - W * 0.23, cy - W * 0.24, cx + W * 0.23, cy + W * 0.24], 340, 200, fill=accent, width=int(W * 0.072))
        draw.rounded_rectangle([cx - W * 0.255, cy - W * 0.14, cx - W * 0.145, cy - W * 0.04], radius=W * 0.02, fill=light)
        draw.rounded_rectangle([cx + W * 0.145, cy - W * 0.14, cx + W * 0.255, cy - W * 0.04], radius=W * 0.02, fill=light)
    elif motif == "die":
        draw.rounded_rectangle([cx - W * 0.23, cy - W * 0.23, cx + W * 0.23, cy + W * 0.23], radius=W * 0.06, fill=accent, outline=light, width=int(W * 0.018))
        pr = W * 0.038
        for dx, dy in [(-0.11, -0.11), (0.11, -0.11), (0, 0), (-0.11, 0.11), (0.11, 0.11)]:
            draw.ellipse([cx + W * dx - pr, cy + W * dy - pr, cx + W * dx + pr, cy + W * dy + pr], fill=(42, 16, 22))
    elif motif == "star":
        pts = []
        for i in range(10):
            ang = math.radians(-90 + i * 36)
            rad = W * (0.31 if i % 2 == 0 else 0.13)
            pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
        draw.polygon(pts, fill=accent)
        pts2 = [(cx + (x - cx) * 0.55, cy + (y - cy) * 0.55) for x, y in pts]
        draw.polygon(pts2, fill=light)
    elif motif == "crown":
        pts = [
            (cx - W * 0.27, cy + W * 0.16), (cx - W * 0.31, cy - W * 0.14),
            (cx - W * 0.12, cy + W * 0.01), (cx, cy - W * 0.24),
            (cx + W * 0.12, cy + W * 0.01), (cx + W * 0.31, cy - W * 0.14),
            (cx + W * 0.27, cy + W * 0.16),
        ]
        draw.polygon(pts, fill=accent)
        draw.rounded_rectangle([cx - W * 0.28, cy + W * 0.15, cx + W * 0.28, cy + W * 0.24], radius=W * 0.03, fill=light)
    elif motif == "gem":
        draw.polygon([(cx - W * 0.18, cy - W * 0.22), (cx + W * 0.18, cy - W * 0.22), (cx + W * 0.30, cy - W * 0.04), (cx, cy + W * 0.29), (cx - W * 0.30, cy - W * 0.04)], fill=accent)
        draw.polygon([(cx - W * 0.14, cy - W * 0.22), (cx + W * 0.14, cy - W * 0.22), (cx + W * 0.10, cy - W * 0.04), (cx - W * 0.10, cy - W * 0.04)], fill=light)
        draw.polygon([(cx - W * 0.10, cy - W * 0.04), (cx + W * 0.10, cy - W * 0.04), (cx, cy + W * 0.29)], fill=light)
    elif motif == "chip":
        draw.ellipse([cx - W * 0.29, cy - W * 0.29, cx + W * 0.29, cy + W * 0.29], fill=accent)
        for i in range(8):
            ang = math.radians(i * 45)
            x1, y1 = cx + math.cos(ang) * W * 0.21, cy + math.sin(ang) * W * 0.21
            x2, y2 = cx + math.cos(ang) * W * 0.29, cy + math.sin(ang) * W * 0.29
            draw.line([(x1, y1), (x2, y2)], fill=deep, width=int(W * 0.052))
        draw.ellipse([cx - W * 0.20, cy - W * 0.20, cx + W * 0.20, cy + W * 0.20], fill=deep, outline=light, width=int(W * 0.016))
        draw_suit_pip(draw, "spade", cx, cy, W * 0.10, light)


def render_avatar(spec):
    aid, cat, motif, bg, accent, c2, c3, style = spec
    base = radial_bg(bg[0], bg[1])
    fg = base.copy()
    draw = ImageDraw.Draw(fg)
    if cat == "poker":
        draw_poker_player(draw, motif, accent, c2, c3, style)
        # Clip character bust cleanly inside the circular medallion
        mask = Image.new("L", (W, W), 0)
        md = ImageDraw.Draw(mask)
        m = int(W * 0.052)
        md.ellipse([m, m, W - m, W - m], fill=255)
        img = Image.composite(fg, base, mask)
        draw = ImageDraw.Draw(img)
        draw_ring(draw, accent)
        # Draw corner suit badge crisply over ring
        bx, by, br = W * 0.77, W * 0.77, W * 0.115
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(14, 16, 24), outline=accent, width=int(W * 0.012))
        draw_suit_pip(draw, motif, bx, by, br * 0.56, accent)
        return img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    elif cat == "ocean":
        draw_ocean(draw, motif, accent, c2, c3)
    else:
        draw_lucky(draw, motif, accent, c2, c3)
    draw_ring(draw, accent)
    return fg.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main():
    out_dir = sys.argv[1]
    contact_out = sys.argv[2] if len(sys.argv) > 2 else None
    os.makedirs(out_dir, exist_ok=True)
    rendered = []
    for spec in AVATARS:
        im = render_avatar(spec)
        path = os.path.join(out_dir, f"{spec[0]}.jpg")
        im.save(path, "JPEG", quality=92, optimize=True, progressive=False)
        rendered.append((spec[0], im))
    print(f"Generated {len(rendered)} original 256x256 JPEG avatars in {out_dir}")
    if contact_out:
        cols, rows = 5, 4
        pad = 12
        sheet = Image.new("RGB", (cols * (SIZE + pad) + pad, rows * (SIZE + pad) + pad), (12, 15, 22))
        for idx, (_, im) in enumerate(rendered):
            r, c = divmod(idx, cols)
            sheet.paste(im, (pad + c * (SIZE + pad), pad + r * (SIZE + pad)))
        sheet.save(contact_out, "PNG")
        print(f"Saved contact sheet to {contact_out}")


if __name__ == "__main__":
    main()
