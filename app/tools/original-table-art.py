"""Create the C5 table UI set from original procedural geometry.

The renderer deliberately uses only Pillow primitives and local font glyphs; it
does not read the historical source artwork. Existing files supply dimensions
only, so the installer layout remains stable while the pixels are replaced.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/table/ui"
NAMES = """alarm amount-bubble badge-allin badge-break badge-offline badge-sitout badge-waitbb badge-winner btn-call-down btn-call-sm btn-call btn-fold-down btn-fold-sm btn-fold btn-raise-down btn-raise-sm btn-raise cb-disabled cb-off cb-on chip-preset-on chip-preset countdown-panel fx-comet fx-divider fx-flare-left fx-flare-right ic-addchips ic-break ic-edit ic-gear ic-history ic-minus ic-plus ic-rabbit ic-runit ic-sitout-bb ic-sitout-hand ic-straddle label-gold label-green label-purple label-red level-tag mk-bb mk-bounty mk-dead mk-dealer mk-sb mk-straddle plate-name-active plate-name pot-pill ring-amber ring-gold ring-red seg-on seg-track slider-fill slider-thumb slider-track sw-off sw-on-gold sw-on timebank""".split()
# Stable source dimensions keep regeneration independent of existing output.
DIMENSIONS = {"alarm":(202,256),"amount-bubble":(392,212),"badge-allin":(184,192),"badge-break":(186,192),"badge-offline":(186,192),"badge-sitout":(186,192),"badge-waitbb":(190,192),"badge-winner":(192,190),"btn-call-down":(360,152),"btn-call-sm":(360,130),"btn-call":(360,152),"btn-fold-down":(360,148),"btn-fold-sm":(360,130),"btn-fold":(360,148),"btn-raise-down":(360,152),"btn-raise-sm":(360,130),"btn-raise":(360,154),"cb-disabled":(248,256),"cb-off":(248,256),"cb-on":(248,256),"chip-preset-on":(320,138),"chip-preset":(320,142),"countdown-panel":(256,106),"fx-comet":(640,170),"fx-divider":(640,44),"fx-flare-left":(396,204),"fx-flare-right":(396,204),"ic-addchips":(254,256),"ic-break":(250,256),"ic-edit":(212,220),"ic-gear":(250,256),"ic-history":(254,256),"ic-minus":(280,288),"ic-plus":(280,288),"ic-rabbit":(250,256),"ic-runit":(250,256),"ic-sitout-bb":(254,256),"ic-sitout-hand":(254,256),"ic-straddle":(250,256),"label-gold":(300,152),"label-green":(300,152),"label-purple":(300,152),"label-red":(304,152),"level-tag":(260,156),"mk-bb":(152,160),"mk-bounty":(156,160),"mk-dead":(156,160),"mk-dealer":(150,160),"mk-sb":(154,160),"mk-straddle":(154,160),"plate-name-active":(480,176),"plate-name":(480,170),"pot-pill":(480,126),"ring-amber":(254,256),"ring-gold":(254,256),"ring-red":(250,256),"seg-on":(240,172),"seg-track":(320,78),"slider-fill":(62,480),"slider-thumb":(316,332),"slider-track":(60,480),"sw-off":(320,168),"sw-on-gold":(320,166),"sw-on":(320,166),"timebank":(248,256)}
TRANSPARENT = set("alarm amount-bubble countdown-panel fx-comet fx-divider fx-flare-left fx-flare-right ic-addchips ic-break ic-edit ic-gear ic-history ic-minus ic-plus ic-rabbit ic-runit ic-sitout-bb ic-sitout-hand ic-straddle ring-amber ring-gold ring-red slider-fill slider-thumb slider-track timebank".split())

GOLD = (218, 171, 72, 255)
INK = (24, 22, 25, 255)
MUTED = (104, 88, 67, 255)
WHITE = (245, 239, 220, 255)

def font(size):
    p = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
    return ImageFont.truetype(p, max(10, size)) if Path(p).exists() else ImageFont.load_default()

def canvas(size, overlay=False):
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # restrained charcoal-to-amber field, fully procedural
    if not overlay:
        d.rounded_rectangle((1, 1, size[0]-2, size[1]-2), radius=max(3, min(size)//9), fill=(27, 24, 28, 242), outline=(112, 79, 40, 230), width=max(1, min(size)//80))
    return im, d

def badge(im, label, hue=GOLD):
    d = ImageDraw.Draw(im); w, h = im.size
    d.ellipse((w*.12, h*.10, w*.88, h*.88), fill=(39, 34, 35, 250), outline=hue, width=max(2, min(w,h)//18))
    d.ellipse((w*.20, h*.18, w*.80, h*.78), outline=(247, 211, 117, 180), width=max(1, min(w,h)//45))
    f=font(int(min(w,h)*.20)); box=d.textbbox((0,0),label,font=f); d.text(((w-box[2])/2,(h-box[3])/2-2),label,font=f,fill=WHITE)

def icon(im, kind):
    d=ImageDraw.Draw(im); w,h=im.size; c=(w/2,h/2)
    stroke=max(2,min(w,h)//12)
    if kind in ('minus','plus'):
        d.rounded_rectangle((w*.18,h*.38,w*.82,h*.62), radius=stroke, fill=GOLD)
        if kind=='plus': d.rounded_rectangle((w*.38,h*.18,w*.62,h*.82), radius=stroke, fill=GOLD)
    elif kind == 'gear':
        d.ellipse((w*.27,h*.27,w*.73,h*.73), outline=GOLD, width=stroke); d.ellipse((w*.44,h*.44,w*.56,h*.56), fill=GOLD)
        for i in range(8):
            import math
            x=c[0]+math.cos(i*math.pi/4)*w*.37; y=c[1]+math.sin(i*math.pi/4)*h*.37
            d.line((c[0]+math.cos(i*math.pi/4)*w*.28,c[1]+math.sin(i*math.pi/4)*h*.28,x,y), fill=GOLD, width=stroke)
    elif kind == 'history':
        d.arc((w*.2,h*.18,w*.8,h*.82), 35, 330, fill=GOLD, width=stroke); d.polygon([(w*.18,h*.28),(w*.36,h*.22),(w*.27,h*.42)], fill=GOLD); d.line((w*.5,h*.5,w*.5,h*.31), fill=WHITE, width=stroke); d.line((w*.5,h*.5,w*.67,h*.59), fill=WHITE, width=stroke)
    elif kind == 'edit':
        d.line((w*.25,h*.75,w*.7,h*.3), fill=GOLD, width=stroke*2); d.polygon([(w*.7,h*.3),(w*.82,h*.18),(w*.83,h*.36)], fill=WHITE); d.line((w*.2,h*.82,w*.4,h*.78), fill=GOLD, width=stroke)
    elif kind == 'break':
        d.line((w*.28,h*.78,w*.72,h*.22), fill=GOLD, width=stroke); d.line((w*.28,h*.22,w*.72,h*.78), fill=GOLD, width=stroke)
    elif kind == 'straddle':
        d.polygon([(w*.5,h*.15),(w*.82,h*.5),(w*.5,h*.85),(w*.18,h*.5)], outline=GOLD, fill=(65,45,30,255)); d.line((w*.3,h*.5,w*.7,h*.5), fill=WHITE, width=stroke)
    elif kind == 'rabbit':
        d.ellipse((w*.27,h*.4,w*.73,h*.78), outline=GOLD, width=stroke); d.ellipse((w*.3,h*.12,w*.45,h*.48), outline=GOLD, width=stroke); d.ellipse((w*.55,h*.12,w*.7,h*.48), outline=GOLD, width=stroke)
    elif kind == 'runit':
        d.polygon([(w*.25,h*.2),(w*.78,h*.5),(w*.25,h*.8)], fill=GOLD); d.arc((w*.2,h*.12,w*.85,h*.88), 30, 300, fill=WHITE, width=max(1,stroke//2))
    elif kind in ('addchips','sitout-bb','sitout-hand'):
        d.ellipse((w*.2,h*.3,w*.8,h*.7), outline=GOLD, width=stroke); d.line((w*.5,h*.22,w*.5,h*.78), fill=WHITE, width=stroke); d.line((w*.28,h*.5,w*.72,h*.5), fill=WHITE, width=stroke)
    else:
        d.rounded_rectangle((w*.22,h*.22,w*.78,h*.78), radius=stroke, fill=(52,42,32,255), outline=GOLD, width=stroke)
        d.ellipse((w*.38,h*.38,w*.62,h*.62), fill=GOLD)

def render(name, size):
    im,d=canvas(size, name.rsplit('.',1)[0] in TRANSPARENT); w,h=size
    stem=name.rsplit('.',1)[0]
    if stem.startswith('badge-'):
        badge(im, {'badge-allin':'A','badge-break':'B','badge-offline':'O','badge-sitout':'S','badge-waitbb':'W','badge-winner':'★'}[stem])
    elif stem.startswith('mk-'):
        d.ellipse((w*.08,h*.06,w*.92,h*.94), fill=(41,31,24,255), outline=GOLD, width=max(2,w//28)); d.ellipse((w*.2,h*.18,w*.8,h*.82), outline=(248,220,140,220), width=max(1,w//45)); f=font(int(h*.2)); t=stem[3:].upper(); box=d.textbbox((0,0),t,font=f); d.text(((w-box[2])/2,(h-box[3])/2),t,font=f,fill=WHITE)
    elif stem.startswith('ic-'):
        icon(im,stem[3:])
    elif stem.startswith('cb-'):
        disabled = stem == 'cb-disabled'; d.rounded_rectangle((w*.12,h*.18,w*.88,h*.82),radius=h//7,fill=(54,47,42,220),outline=(112,102,91,255) if disabled else GOLD,width=max(2,h//20))
        if stem == 'cb-on':
            d.line((w*.26,h*.51,w*.43,h*.68),fill=(122,220,137,255),width=max(3,h//14)); d.line((w*.43,h*.68,w*.76,h*.31),fill=(122,220,137,255),width=max(3,h//14))
        elif stem == 'cb-disabled':
            d.line((w*.28,h*.5,w*.72,h*.5),fill=(125,115,105,220),width=max(2,h//15))
        else:
            d.ellipse((w*.42,h*.42,w*.58,h*.58),outline=GOLD,width=max(2,h//24))
    elif stem.startswith('btn-'):
        active='down' not in stem; col=(95,67,35,255) if active else (55,45,40,255); d.rounded_rectangle((w*.03,h*.12,w*.97,h*.88),radius=h//5,fill=col,outline=GOLD,width=max(2,h//18)); d.line((w*.12,h*.28,w*.88,h*.28),fill=(255,230,155,150),width=max(1,h//30))
    elif stem.startswith('label-') or stem in ('level-tag','plate-name','plate-name-active','pot-pill'):
        col={'label-gold':(134,92,31,255),'label-green':(46,105,72,255),'label-purple':(86,57,112,255),'label-red':(123,48,43,255)}.get(stem,(55,45,39,255)); d.rounded_rectangle((w*.03,h*.16,w*.97,h*.84),radius=h//5,fill=col,outline=GOLD,width=max(2,h//20)); d.line((w*.12,h*.29,w*.88,h*.29),fill=(255,230,155,160),width=max(1,h//35))
    elif stem.startswith('ring-'):
        d.ellipse((w*.08,h*.06,w*.92,h*.94),outline={'ring-gold':GOLD,'ring-amber':(240,150,48,255),'ring-red':(220,67,56,255)}[stem],width=max(4,w//16)); d.ellipse((w*.25,h*.22,w*.75,h*.78),outline=(242,220,158,100),width=max(1,w//35))
    elif stem.startswith('fx-'):
        if stem=='fx-divider': d.line((w*.03,h/2,w*.97,h/2),fill=GOLD,width=max(2,h//6))
        else:
            for i in range(7): d.line((w*.15+i*w*.1,h*.78,w*.5,h*.18),fill=(GOLD[0],GOLD[1],GOLD[2],180-i*18),width=max(1,h//15))
    elif stem == 'slider-track':
        d.rounded_rectangle((w*.28,h*.04,w*.72,h*.96),radius=w//4,fill=(44,38,34,220),outline=(180,135,61,220),width=max(1,w//10))
    elif stem == 'slider-fill':
        d.rounded_rectangle((w*.22,h*.54,w*.78,h*.96),radius=w//5,fill=GOLD)
    elif stem == 'slider-thumb':
        d.ellipse((w*.18,h*.22,w*.82,h*.78),fill=(58,45,34,255),outline=GOLD,width=max(2,w//14)); d.polygon([(w*.5,h*.32),(w*.68,h*.5),(w*.5,h*.68),(w*.32,h*.5)],fill=WHITE)
    elif stem == 'seg-on':
        # Dark selected-option text needs a light face across the entire label.
        d.rounded_rectangle((0,0,w-1,h-1), radius=h//8, fill=(243,207,107,255))
    elif stem.startswith('sw-') or stem.startswith('seg-') or stem.startswith('chip-preset'):
        d.rounded_rectangle((w*.06,h*.22,w*.94,h*.78),radius=h//3,fill=(65,54,43,255),outline=GOLD,width=max(2,h//16)); on='on' in stem; d.ellipse(((w*.62 if on else w*.22),h*.28,(w*.78 if on else w*.38),h*.72),fill=GOLD if on else MUTED); d.line((w*.16,h*.5,w*.84,h*.5),fill=(255,230,155,100),width=max(1,h//35))
    else:
        d.rounded_rectangle((w*.08,h*.18,w*.92,h*.82),radius=h//5,fill=(52,42,35,255),outline=GOLD,width=max(2,h//18)); d.line((w*.18,h*.52,w*.82,h*.52),fill=(248,210,115,220),width=max(1,h//18))
    return im

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for stem in NAMES:
        path=OUT/(stem+'.webp')
        if not path.exists(): raise FileNotFoundError(path)
        size=DIMENSIONS[stem]
        render(stem+'.webp', size).save(path, 'WEBP', lossless=True, method=6)
    print(f"generated {len(NAMES)} original procedural table assets")

if __name__ == '__main__': main()
