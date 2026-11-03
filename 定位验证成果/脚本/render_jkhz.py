# -*- coding: utf-8 -*-
"""渲染监控汇总.dxf全图到天地图影像: 线灰色, INSERT按块名着色, 文字标注。"""
import io, os, sys, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import ezdxf
from PIL import Image, ImageDraw, ImageFont
from pyproj import Transformer
from collections import Counter

p = '（ABCDEF、新屋湾、庙下刘、谭沈湾、张家湾、毛家湾）竣工图/（ABCDEF、新屋湾、庙下刘、谭沈湾、张家湾、毛家湾）竣工图/监控汇总.dxf'
doc = ezdxf.readfile(p); msp = doc.modelspace()
to4490 = Transformer.from_crs(4547, 4490, always_xy=True)
C = 20037508.342789244; Z = 17; n2 = 2**Z
TILES = '定位验证成果/叠加图/_tiles'
UA = {'Referer': 'https://www.tianditu.gov.cn/', 'User-Agent': 'Mozilla/5.0'}
import urllib.request
TK = open('天地图key.txt', encoding='utf-8').read().strip()
def fetch(z, x, y):
    fn = os.path.join(TILES, f'img_w_{z}_{x}_{y}.png')
    if os.path.exists(fn) and os.path.getsize(fn) > 2000: return fn
    for s in range(8):
        try:
            d = urllib.request.urlopen(urllib.request.Request(f'https://t{s}.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk={TK}', headers=UA), timeout=20).read()
            if len(d) > 2000 and d[:2] == b'\xff\xd8':
                open(fn, 'wb').write(d); return fn
        except Exception: pass
    return None

# 全部实体范围(模型空间, 排除最北端的孤立"监控"文字)
xs, ys = [], []
for e in msp.query('LINE LWPOLYLINE INSERT'):
    if e.dxftype() == 'LINE':
        xs += [e.dxf.start.x, e.dxf.end.x]; ys += [e.dxf.start.y, e.dxf.end.y]
    elif e.dxftype() == 'LWPOLYLINE':
        for x, y, *_ in e.get_points(): xs.append(x); ys.append(y)
    else:
        xs.append(e.dxf.insert.x); ys.append(e.dxf.insert.y)
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
print(f'实体范围 E {minx:.0f}~{maxx:.0f}, N {miny:.0f}~{maxy:.0f}')

def gpx(e, n):
    lon, lat = to4490.transform(e, n)
    mx = math.radians(lon)*6378137.0; my = math.log(math.tan(math.pi/4+math.radians(lat)/2))*6378137.0
    return (mx+C)/(2*C)*n2*256, (C-my)/(2*C)*n2*256

x0, y0 = gpx(minx-150, maxy+150)   # 左上
x1, y1 = gpx(maxx+150, miny-150)
ix0, iy0, ix1, iy1 = int(x0//256), int(y0//256), int(x1//256), int(y1//256)
W, H = (ix1-ix0+1)*256, (iy1-iy0+1)*256
img = Image.new('RGB', (W, H), (30, 30, 30))
for ix in range(ix0, ix1+1):
    for iy in range(iy0, iy1+1):
        fn = fetch(Z, ix, iy)
        if fn: img.paste(Image.open(fn).convert('RGB'), ((ix-ix0)*256, (iy-iy0)*256))
dr = ImageDraw.Draw(img, 'RGBA')
try: FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
except Exception: FONT = ImageFont.load_default()
def px(e, n):
    gx, gy = gpx(e, n)
    return (gx-ix0*256, gy-iy0*256)
# 线
for e in msp.query('LINE LWPOLYLINE'):
    if e.dxftype() == 'LINE':
        p1 = px(e.dxf.start.x, e.dxf.start.y); p2 = px(e.dxf.end.x, e.dxf.end.y)
        dr.line([p1, p2], fill=(255, 255, 255, 90), width=1)
    else:
        pp = [px(x, y) for x, y, *_ in e.get_points()]
        if len(pp) > 1: dr.line(pp, fill=(255, 255, 255, 90), width=1)
# INSERT按块名着色
names = Counter(e.dxf.name for e in msp.query('INSERT'))
palette = [(255,60,60),(0,200,255),(255,200,0),(0,255,120),(255,0,255),(255,140,0),(0,100,255),(200,255,0)]
colmap = {n: palette[i % len(palette)] for i, n in enumerate(names)}
for e in msp.query('INSERT'):
    x, y = px(e.dxf.insert.x, e.dxf.insert.y)
    c = colmap[e.dxf.name]
    dr.ellipse([x-5, y-5, x+5, y+5], outline=c, width=2)
# 文字
for e in msp.query('TEXT'):
    t = e.dxf.text.strip()
    if t in ('共计12处', '共计14处', '监控', '泵房'):
        x, y = px(e.dxf.insert.x, e.dxf.insert.y)
        dr.text((x+6, y-12), t, font=FONT, fill=(255, 255, 0), stroke_width=2, stroke_fill=(0, 0, 0))
# 图例
ly = 20
for n, c in colmap.items():
    dr.rectangle([20, ly, 42, ly+22], outline=c, width=3)
    dr.text((50, ly), f'{n} ({names[n]})', font=FONT, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))
    ly += 30
img.save('定位验证成果/监控汇总_叠加总览.png')
print('saved 定位验证成果/监控汇总_叠加总览.png', img.size)
print('图例:', dict(names))
