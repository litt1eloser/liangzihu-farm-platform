# -*- coding: utf-8 -*-
"""渲染每个GCP候选点的天地图z18对照切片: CAD位置画十字丝。"""
import io, os, sys, math, json, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from PIL import Image, ImageDraw
from pyproj import Transformer

TK = open('天地图key.txt', encoding='utf-8').read().strip()
TILES = '定位验证成果/叠加图/_tiles'
OUT = '定位验证成果/GCP对照'
os.makedirs(OUT, exist_ok=True)
UA = {'Referer': 'https://www.tianditu.gov.cn/', 'User-Agent': 'Mozilla/5.0'}
to4490 = Transformer.from_crs(4547, 4490, always_xy=True)
HALF = 150.0  # 半径150m
Z = 18
MPP = 156543.03392 * math.cos(math.radians(30.2555)) / 2**Z  # ~0.5156 m/px

def lonlat_to_merc(lon, lat):
    return math.radians(lon)*6378137.0, math.log(math.tan(math.pi/4+math.radians(lat)/2))*6378137.0

def merc_to_tile(x, y, z):
    n = 2**z
    return (x+20037508.342789244)/(2*20037508.342789244)*n, (20037508.342789244-y)/(2*20037508.342789244)*n

def fetch(z, x, y):
    fn = os.path.join(TILES, f'img_w_{z}_{x}_{y}.png')
    if os.path.exists(fn) and os.path.getsize(fn) > 2000:
        return fn
    for s in range(8):
        try:
            url = f'https://t{s}.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk={TK}'
            d = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20).read()
            if len(d) > 2000 and d[:2] == b'\xff\xd8':
                open(fn, 'wb').write(d); return fn
        except Exception:
            pass
    return None

gcps = json.load(open('定位验证成果/GCP候选点.json', encoding='utf-8'))
for name, pts in gcps.items():
    short = name.replace('2026.4.16竣工图（','').replace('2026.8.10竣工图（','').replace('）.dxf','').replace('.dxf','')
    for i, g in enumerate(pts, 1):
        lon, lat = to4490.transform(g['cad_x'], g['cad_y'])
        g['lon'], g['lat'] = round(lon, 8), round(lat, 8)
        mx, my = lonlat_to_merc(lon, lat)
        tx, ty = merc_to_tile(mx, my, Z)
        half_px = HALF / MPP
        cx, cy = tx*256, ty*256  # global pixel
        ix0, iy0 = int((cx-half_px)//256), int((cy-half_px)//256)
        ix1, iy1 = int((cx+half_px)//256), int((cy+half_px)//256)
        W, H = (ix1-ix0+1)*256, (iy1-iy0+1)*256
        img = Image.new('RGB', (W, H), (40, 40, 40))
        for ix in range(ix0, ix1+1):
            for iy in range(iy0, iy1+1):
                fn = fetch(Z, ix, iy)
                if fn:
                    img.paste(Image.open(fn).convert('RGB'), ((ix-ix0)*256, (iy-iy0)*256))
        px, py = cx - ix0*256, cy - iy0*256
        dr = ImageDraw.Draw(img)
        # 十字丝(20px) + 5m误差圆
        dr.line([px-30, py, px+30, py], fill=(255,0,0), width=2)
        dr.line([px, py-30, px, py+30], fill=(255,0,0), width=2)
        r5 = 5/MPP
        dr.ellipse([px-r5, py-r5, px+r5, py+r5], outline=(255,255,0), width=2)
        dr.text((px+34, py-30), f'{short} GCP-{i}', fill=(255,255,0), stroke_width=2, stroke_fill=(0,0,0))
        dr.text((px+34, py-12), f'E{g["cad_x"]:.2f} N{g["cad_y"]:.2f}', fill=(255,255,0), stroke_width=2, stroke_fill=(0,0,0))
        # 50m比例尺
        x0, y0 = 20, H-30
        dr.line([x0, y0, x0+50/MPP, y0], fill=(255,255,255), width=4)
        dr.text((x0, y0-18), '50m', fill=(255,255,255), stroke_width=2, stroke_fill=(0,0,0))
        # 裁成以点为中心的正方形
        L = int(half_px*2)
        img = img.crop((int(px-half_px), int(py-half_px), int(px+half_px), int(py+half_px)))
        img.save(os.path.join(OUT, f'{short}_GCP{i}.png'))
json.dump(gcps, open('定位验证成果/GCP候选点.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('done,', sum(len(v) for v in gcps.values()), 'GCP crops')
