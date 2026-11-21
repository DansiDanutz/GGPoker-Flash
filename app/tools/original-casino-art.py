"""Render DanGG's seven game illustrations. Inputs: geometry and colours below only."""
from pathlib import Path
from math import cos, sin, pi
from PIL import Image, ImageDraw, ImageColor

OUT = Path(__file__).resolve().parents[1] / "public/assets/ui/casino-games"
W, H = 1200, 502
PALETTES = {
    "holdem": ("#103b38", "#36d5ad"), "blackjack": ("#183958", "#62c4fb"),
    "baccarat": ("#42263c", "#f18aaf"), "sicbo": ("#482e24", "#ffae68"),
    "roulette": ("#392d52", "#b99aff"), "crash": ("#123845", "#73e4eb"),
    "dragontiger": ("#473825", "#efc56f")}
INK, IVORY = "#13232c", "#fff1cf"


def polar(x, y, r, a):
    return x + r*cos(a), y + r*sin(a)


def piece(kind, value, color, angle):
    # Independent paper-cut pieces; rotate on a transparent margin.
    tile = Image.new("RGBA", (270, 302))
    d = ImageDraw.Draw(tile)
    box = (44, 39, 226, 263) if kind == "card" else (46, 62, 224, 240)
    d.rounded_rectangle(box, 20, fill=IVORY, outline=INK, width=6)
    d.rounded_rectangle(tuple(v + (8 if i < 2 else -8) for i,v in enumerate(box)), 14, outline=color, width=4)
    spots = {1:[(0,0)],2:[(-1,-1),(1,1)],3:[(-1,-1),(0,0),(1,1)],4:[(-1,-1),(1,-1),(-1,1),(1,1)],5:[(-1,-1),(1,-1),(0,0),(-1,1),(1,1)]}
    for a,b in spots[value]:
        x,y=135+40*a,151+43*b
        if kind == "card": d.polygon([(x,y-18),(x+13,y),(x,y+18),(x-13,y)], fill=color)
        else: d.ellipse((x-12,y-12,x+12,y+12),fill=color)
    return tile.rotate(angle,Image.Resampling.BICUBIC,expand=True)


def render(game, low, accent):
    bg, glow = map(ImageColor.getrgb,(low,accent))
    im=Image.new("RGB",(W,H)); pix=im.load()
    for y in range(H):
        for x in range(W):
            light=max(0,1-((x-800)/740)**2-((y-210)/530)**2)*0.22
            pix[x,y]=tuple(round(c*(0.52+0.48*x/W)+light*v) for c,v in zip(bg,glow))
    d=ImageDraw.Draw(im); cx,cy=795,238
    faint=tuple(round(.83*c+.17*v) for c,v in zip(bg,glow))
    for r in (166,195,249,313): d.ellipse((cx-r,cy-r,cx+r,cy+r),outline=faint,width=2)
    for i in range(48):
        a=i*pi/24
        d.line([polar(cx,cy,200,a),polar(cx,cy,208+(i%4==0)*8,a)],fill=faint,width=3)
    if game in ("holdem","blackjack","baccarat","sicbo"):
        kind="die" if game=="sicbo" else "card"
        layout={"holdem":[(-75,14,2),(0,0,3),(75,-14,1)],"blackjack":[(-65,14,1),(54,-13,4)],
                "baccarat":[(-105,-14,3),(100,14,2)],"sicbo":[(-115,17,3),(0,-9,5),(110,-22,2)]}[game]
        for i,(dx,angle,value) in enumerate(layout):
            t=piece(kind,value,low if i%2==0 else "#bc553f",angle)
            im.paste(t,(cx+dx-t.width//2,cy-t.height//2+12*(i%2)),t)
    elif game=="roulette":
        for i in range(18):
            d.pieslice((cx-147,cy-147,cx+147,cy+147),i*20,(i+1)*20,fill=(accent if i%2 else low),outline=IVORY,width=3)
        d.ellipse((cx-89,cy-89,cx+89,cy+89),fill=INK,outline=IVORY,width=6)
        for i in range(4): d.line([(cx,cy),polar(cx,cy,67,pi*.25+i*pi*.5)],fill=IVORY,width=7)
        d.ellipse((cx-15,cy-15,cx+15,cy+15),fill=accent)
        d.ellipse((cx+67,cy-115,cx+88,cy-94),fill=IVORY)
    elif game=="crash":
        for dy in (0,24,48): d.line([(cx-222,cy+120+dy),(cx-90,cy+65+dy),(cx-16,cy+8+dy)],fill=accent,width=5)
        for pts,col in [([(-100,80),(135,-125),(63,68),(18,37),(-35,114)],IVORY),
                        ([(-100,80),(135,-125),(18,37)],accent), ([(18,37),(63,68),(45,16)],low)]:
            d.polygon([(cx+x,cy+y) for x,y in pts],fill=col)
    else:
        # Facing angular dragon and tiger profiles, cut as two independent silhouettes.
        for pts,col in [([(-178,96),(-118,37),(-157,-51),(-96,-24),(-114,-114),(-50,-70),(-16,-81),(23,-32),(-19,-16),(2,11),(-56,14),(-101,99)],accent),
                        ([(37,80),(64,22),(33,-6),(62,-33),(67,-90),(98,-73),(139,-95),(152,-60),(175,-21),(161,52),(111,89)],IVORY)]:
            d.polygon([(cx+x,cy+y) for x,y in pts],fill=col)
        for pts in [[(72,-67),(91,-43),(86,-71)],[(117,-65),(122,-35),(136,-68)],[(129,2),(148,15),(157,-7)],[(-70,-43),(-42,-35),(-52,-45)]]:
            d.polygon([(cx+x,cy+y) for x,y in pts],fill=INK)
    im.save(OUT / f"casino-{game}.webp",quality=90,method=6)


if __name__=="__main__":
    for key,colors in PALETTES.items(): render(key,*colors)
