# -*- coding: utf-8 -*-
"""候选几何 → EPSG:4547 → WebMercator，叠加天地图卫星影像。只写 定位验证成果/ 目录。"""
import io, os, sys, math, time, urllib.request, urllib.parse, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import geopandas as gpd
from PIL import Image, ImageDraw

TK = open('天地图key.txt', encoding='utf-8').read().strip()
GPKG = '定位验证成果/既有成果复核/梁子湖竣工图提取成果/09-提取的空间数据/CAD候选几何_坐标参考未知.gpkg'
OUT = '定位验证成果/叠加图'
TILES = '定位验证成果/叠加图/_tiles'
os.makedirs(OUT, exist_ok=True); os.makedirs(TILES, exist_ok=True)

UA = {'Referer': 'https://www.tianditu.gov.cn/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

def lonlat_to_merc(lon, lat):
    x = math.radians(lon) * 6378137.0
    y = math.log(math.tan(math.pi/4 + math.radians(lat)/2)) * 6378137.0
    return x, y

def merc_to_tile(x, y, z):
    n = 2**z
    tx = (x + 20037508.342789244) / (2*20037508.342789244) * n
    ty = (20037508.342789244 - y) / (2*20037508.342789244) * n
    return tx, ty

def fetch_tile(z, x, y, T='img_w'):
    fn = os.path.join(TILES, f'{T}_{z}_{x}_{y}.png')
    if os.path.exists(fn) and os.path.getsize(fn) > 2000:
        return fn
    for s in range(8):
        url = f'https://t{s}.tianditu.gov.cn/DataServer?T={T}&x={x}&y={y}&l={z}&tk={TK}'
        try:
            req = urllib.request.Request(url, headers=UA)
            data = urllib.request.urlopen(req, timeout=20).read()
            if len(data) > 2000 and data[:2] == b'\xff\xd8':
                open(fn, 'wb').write(data)
                return fn
        except Exception:
            continue
    return None

def render(minlon, minlat, maxlon, maxlat, z, geoms, outfile, draw_labels=None, alpha_fill=60):
    """geoms: list of (list_of_merc_polylines, color, width, fill)"""
    x0, y1 = lonlat_to_merc(minlon, minlat)   # bottom-left merc
    x1, y0 = lonlat_to_merc(maxlon, maxlat)   # top-right merc
    tx0, ty0 = merc_to_tile(x0, y0, z); tx1, ty1 = merc_to_tile(x1, y1, z)
    ix0, iy0, ix1, iy1 = int(tx0), int(ty0), int(tx1), int(ty1)
    W, H = (ix1-ix0+1)*256, (iy1-iy0+1)*256
    img = Image.new('RGB', (W, H), (30, 30, 30))
    got = 0
    for ix in range(ix0, ix1+1):
        for iy in range(iy0, iy1+1):
            fn = fetch_tile(z, ix, iy)
            if fn:
                t = Image.open(fn).convert('RGB')
                img.paste(t, ((ix-ix0)*256, (iy-iy0)*256)); got += 1
    print(f'  tiles {got}/{(ix1-ix0+1)*(iy1-iy0+1)} @z{z}, img {W}x{H}')
    n = 2**z
    def px(mx, my):
        gx = (mx + 20037508.342789244) / (2*20037508.342789244) * n
        gy = (20037508.342789244 - my) / (2*20037508.342789244) * n
        return ((gx-ix0)*256, (gy-iy0)*256)
    ov = Image.new('RGBA', (W, H), (0,0,0,0))
    dr = ImageDraw.Draw(ov)
    for polys, color, width, fill in geoms:
        for poly in polys:
            pts = [px(a, b) for a, b in poly]
            if fill:
                dr.polygon(pts, outline=color+(255,), fill=color+(alpha_fill,))
            dr.line(pts, fill=color+(255,), width=width)
    img = Image.alpha_composite(img.convert('RGBA'), ov).convert('RGB')
    if draw_labels:
        dr2 = ImageDraw.Draw(img)
        for mx, my, txt, col in draw_labels:
            p = px(mx, my)
            dr2.ellipse([p[0]-6, p[1]-6, p[0]+6, p[1]+6], outline=col, width=3)
            dr2.text((p[0]+8, p[1]-8), txt, fill=col, stroke_width=2, stroke_fill=(0,0,0))
    img.save(outfile, quality=92)
    print('  saved', outfile)
    return img.size

# ---- load candidate geometry ----
faces = gpd.read_file(GPKG, layer='候选面').set_crs(4547)
lines = gpd.read_file(GPKG, layer='候选线').set_crs(4547)
faces4490 = faces.to_crs(4490); lines4490 = lines.to_crs(4490)
minx, miny, maxx, maxy = faces4490.total_bounds[0], faces4490.total_bounds[1], faces4490.total_bounds[2], faces4490.total_bounds[3]
b2 = lines4490.total_bounds
minx, miny = min(minx, b2[0]), min(miny, b2[1]); maxx, maxy = max(maxx, b2[2]), max(maxy, b2[3])
print(f'CGCS2000 经纬度总范围: {minx:.6f},{miny:.6f} ~ {maxx:.6f},{maxy:.6f}')

DRAW_COLORS = {
    '2026.4.16竣工图（庙下流）.dxf': (255, 60, 60),
    '2026.4.16竣工图（新屋湾、毛家湾）.dxf': (60, 220, 60),
    '2026.8.10竣工图（张家湾）.dxf': (80, 140, 255),
    '2026.8.10竣工图（谭湾沈湾）.dxf': (255, 200, 0),
    'ABCDEFD区竣工图.dxf': (255, 0, 255),
}
def geom_to_merc_polys(g):
    out = []
    def conv(coords):
        return [lonlat_to_merc(lon, lat) for lon, lat in coords]
    if g.geom_type == 'Polygon':
        out.append(conv(g.exterior.coords))
    elif g.geom_type == 'MultiPolygon':
        for p in g.geoms: out.append(conv(p.exterior.coords))
    elif g.geom_type == 'LineString':
        out.append(conv(g.coords))
    elif g.geom_type == 'MultiLineString':
        for p in g.geoms: out.append(conv(p.coords))
    return out

# ---- overview: all 5 drawings @ z17 ----
geoms = []
for df, kind in ((faces4490, 'F'), (lines4490, 'L')):
    for _, r in df.iterrows():
        c = DRAW_COLORS.get(r['cad_file'], (255,255,255))
        polys = geom_to_merc_polys(r.geometry)
        if polys:
            geoms.append((polys, c, 3 if kind=='L' else 2, kind=='F'))
pad = 0.004
render(minx-pad, miny-pad, maxx+pad, maxy+pad, 17, geoms, os.path.join(OUT, '总览_五图叠加天地图影像_z17.png'))

# ---- per drawing @ z18 ----
for name, color in DRAW_COLORS.items():
    f = faces4490[faces4490['cad_file'] == name]; l = lines4490[lines4490['cad_file'] == name]
    if len(f) == 0 and len(l) == 0: continue
    b = f.total_bounds if len(f) else l.total_bounds
    if len(l): b = [min(b[0], l.total_bounds[0]), min(b[1], l.total_bounds[1]), max(b[2], l.total_bounds[2]), max(b[3], l.total_bounds[3])]
    geoms = []
    for _, r in f.iterrows():
        p = geom_to_merc_polys(r.geometry)
        if p: geoms.append((p, (255,60,60), 2, True))
    for _, r in l.iterrows():
        p = geom_to_merc_polys(r.geometry)
        if p: geoms.append((p, (255,255,0), 3, False))
    pad = 0.0015
    short = name.replace('2026.4.16竣工图（','').replace('2026.8.10竣工图（','').replace('）.dxf','').replace('.dxf','')
    render(b[0]-pad, b[1]-pad, b[2]+pad, b[3]+pad, 18, geoms, os.path.join(OUT, f'{short}_叠加_z18.png'))
print('DONE')
