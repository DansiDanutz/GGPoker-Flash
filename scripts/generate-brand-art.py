from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'app/public'
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'

from functools import lru_cache

@lru_cache(maxsize=1)
def master_icon():
    """Rasterize only our checked-in vector; flatten corners for OS masks."""
    with tempfile.TemporaryDirectory(prefix="dangg-brand-") as tmp:
        raster = Path(tmp) / "master.png"
        subprocess.run(["sips", "-s", "format", "png", str(ROOT / "app/src/assets/brand/openpoker-brand.svg"),
                        "-z", "1024", "1024", "--out", str(raster)], check=True, stdout=subprocess.DEVNULL)
        with Image.open(raster) as src:
            bg = Image.new("RGBA", src.size, "#101827")
            bg.alpha_composite(src.convert("RGBA"))
            return bg

def icon(size):
    return master_icon().resize((size, size), Image.Resampling.LANCZOS)

def poster():
    w,h=852,1846; im=Image.new('RGB',(w,h),'#0b1220'); d=ImageDraw.Draw(im)
    for y in range(h):
        c=int(11+18*y/h); d.line((0,y,w,y),fill=(c,18+int(12*y/h),32+int(18*y/h)))
    ic=icon(360); im.paste(ic,(246,190),ic)
    gold='#e8be69'; cream='#f8edcf'; muted='#b9b4a8'
    f1=ImageFont.truetype(FONT,54); f2=ImageFont.truetype(FONT,30); f3=ImageFont.truetype(FONT,24)
    d.text((w//2,640),'Hi, I’m Dan.',font=f1,fill=cream,anchor='ma')
    d.text((w//2,738),'Let me introduce you to',font=f2,fill=muted,anchor='ma')
    d.text((w//2,790),'OpenPoker',font=ImageFont.truetype(FONT,70),fill=gold,anchor='ma')
    d.line((150,930,702,930),fill=gold,width=3)
    d.text((w//2,1002),'The open-source project',font=f2,fill=cream,anchor='ma')
    d.text((w//2,1050),'behind DanGG.',font=f2,fill=cream,anchor='ma')
    d.text((w//2,1210),'Built by DansiDanutz',font=f3,fill=muted,anchor='ma')
    d.text((w//2,h-120),'OPENPOKER4ALL',font=f3,fill=gold,anchor='mm')
    return im

if __name__ == '__main__':
    icon_targets={'assets/brand/favicon.png':64,'pwa/apple-touch-icon.png':180,'pwa/icon-192.png':192,'pwa/icon-512.png':512,'pwa/icon-maskable-512.png':512,'pwa/spade-192.png':192,'pwa/spade-512.png':512,'pwa/spade-maskable-512.png':512,'pwa/spade-apple-touch.png':180}
    for rel,size in icon_targets.items():
        p=OUT/rel; p.parent.mkdir(parents=True,exist_ok=True); icon(size).save(p)
    poster().save(OUT/'assets/brand/openpoker-intro.png')
    research = ROOT / 'research/brand'
    research.mkdir(parents=True, exist_ok=True)
    icon(1024).convert('RGB').save(research/'AppIcon.png')
    with tempfile.TemporaryDirectory(prefix='openpoker-iconset-') as tmp:
        iconset = Path(tmp) / 'AppIcon.iconset'; iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            icon(size).save(iconset/f'icon_{size}x{size}.png')
            icon(size * 2).save(iconset/f'icon_{size}x{size}@2x.png')
        subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(research/'AppIcon.icns')], check=True)
