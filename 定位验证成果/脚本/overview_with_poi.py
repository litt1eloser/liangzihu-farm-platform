# -*- coding: utf-8 -*-
"""带自然湾POI标注的总览叠加图(复用已缓存瓦片)。"""
import io, os, sys, math, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import geopandas as gpd
from PIL import Image, ImageDraw, ImageFont
from pyproj import Transformer

TK = open('天地图key.txt', encoding='utf-8').read().strip()
TILES = '定位验证成果/叠加图/_tiles'
OUT = '定位验证成果/叠加图'
GPKG = '定位验证成果/既有成果复核/梁子湖竣工图提取成果/09-提取的空间数据/CAD候选几何_坐标参考未知.gpkg'
to3857 = Transformer.from_crs(4490, 3857, always_xy=True)
try:
    FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 22)
    FONT_S = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
except Exception:
    FONT = FONT_S = ImageFont.load_default()

def merc_to_tile(x, y, z):
    n = 2**z
    return (x+20037508.342789244)/(2*20037508.342789244)*n, (20037508.342789244-y)/(2*20037508.342789244)*n

faces = gpd.read_file(GPKG, layer='候选面').set_crs(4547).to_crs(4490)
lines = gpd.read_file(GPKG, layer='候选线').set_crs(4547).to_crs(4490)
minx = min(faces.total_bounds[0], lines.total_bounds[0]); miny = min(faces.total_bounds[1], lines.total_bounds[1])
maxx = max(faces.total_bounds[2], lines.total_bounds[2]); maxy = max(faces.total_bounds[3], lines.total_bounds[3])
Z = 17
pad = 0.004
x0, y1 = to3857.transform(minx-pad, miny-pad); x1, y0 = to3857.transform(maxx+pad, maxy+pad)
tx0, ty0 = merc_to_tile(x0, y0, Z); tx1, ty1 = merc_to_tile(x1, y1, Z)
ix0, iy0, ix1, iy1 = int(tx0), int(ty0), int(tx1), int(ty1)
W, H = (ix1-ix0+1)*256, (iy1-iy0+1)*256
img = Image.new('RGB', (W, H), (30,30,30))
for ix in range(ix0, ix1+1):
    for iy in range(iy0, iy1+1):
        fn = os.path.join(TILES, f'img_w_{Z}_{ix}_{iy}.png')
        if os.path.exists(fn):
            img.paste(Image.open(fn).convert('RGB'), ((ix-ix0)*256, (iy-iy0)*256))
n = 2**Z
def px(lon, lat):
    mx, my = to3857.transform(lon, lat)
    gx, gy = merc_to_tile(mx, my, Z)
    return ((gx-ix0)*256, (gy-iy0)*256)

DRAW_COLORS = {
    '2026.4.16竣工图（庙下流）.dxf': (255,60,60),
    '2026.4.16竣工图（新屋湾、毛家湾）.dxf': (60,220,60),
    '2026.8.10竣工图（张家湾）.dxf': (80,140,255),
    '2026.8.10竣工图（谭湾沈湾）.dxf': (255,200,0),
    'ABCDEFD区竣工图.dxf': (255,0,255),
}
ov = Image.new('RGBA', (W, H), (0,0,0,0)); dr = ImageDraw.Draw(ov)
for df, w, fill in ((faces, 2, True), (lines, 3, False)):
    for _, r in df.iterrows():
        c = DRAW_COLORS.get(r['cad_file'], (255,255,255))
        g = r.geometry
        polys = []
        if g.geom_type == 'Polygon': polys = [list(g.exterior.coords)]
        elif g.geom_type == 'MultiPolygon': polys = [list(p.exterior.coords) for p in g.geoms]
        elif g.geom_type == 'LineString': polys = [list(g.coords)]
        elif g.geom_type == 'MultiLineString': polys = [list(p.coords) for p in g.geoms]
        for poly in polys:
            pts = [px(a, b) for a, b in poly]
            if fill: dr.polygon(pts, outline=c+(255,), fill=c+(50,))
            dr.line(pts, fill=c+(255,), width=w)
img = Image.alpha_composite(img.convert('RGBA'), ov).convert('RGB')
dr2 = ImageDraw.Draw(img)

POIS = [
    ('庙下刘(天地图POI)', 114.62356, 30.254762),
    ('新屋塆(天地图POI)', 114.62434, 30.259569),
    ('潭塆沈村(天地图POI)', 114.628299, 30.255489),
    ('沙湾村村委会(天地图POI)', 114.6298, 30.2561),
    ('铜铁海景区(沙湾村)', 114.619178, 30.256299),
    ('沙湾小学', 114.628906, 30.253779),
]
for name, lon, lat in POIS:
    p = px(lon, lat)
    dr2.ellipse([p[0]-8, p[1]-8, p[0]+8, p[1]+8], outline=(0,255,255), width=4)
    dr2.line([p[0]-14, p[1], p[0]+14, p[1]], fill=(0,255,255), width=2)
    dr2.line([p[0], p[1]-14, p[0], p[1]+14], fill=(0,255,255), width=2)
    dr2.text((p[0]+12, p[1]-14), name, font=FONT_S, fill=(0,255,255), stroke_width=2, stroke_fill=(0,0,0))
# 图例
lx, ly = 20, 20
labels = [('庙下流','2026.4.16竣工图（庙下流）.dxf'),('新屋湾毛家湾','2026.4.16竣工图（新屋湾、毛家湾）.dxf'),
          ('张家湾','2026.8.10竣工图（张家湾）.dxf'),('谭湾沈湾','2026.8.10竣工图（谭湾沈湾）.dxf'),
          ('ABCDEFD区','ABCDEFD区竣工图.dxf')]
dr2.rectangle([lx-8, ly-8, lx+260, ly+len(labels)*30+8], fill=(0,0,0,180))
for i, (lab, key) in enumerate(labels):
    c = DRAW_COLORS[key]
    dr2.rectangle([lx, ly+i*30, lx+22, ly+i*30+22], fill=c)
    dr2.text((lx+30, ly+i*30), lab, font=FONT_S, fill=(255,255,255))
img.save(os.path.join(OUT, '总览_五图叠加_含POI标注_z17.png'))
print('saved 总览_五图叠加_含POI标注_z17.png', img.size)
