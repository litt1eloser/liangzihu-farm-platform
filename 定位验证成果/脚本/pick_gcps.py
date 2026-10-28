# -*- coding: utf-8 -*-
"""为每份图自动选取分布较开的GCP候选点(施工边界/平整范围角点),输出坐标表。"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import geopandas as gpd
from shapely.geometry import Point

GPKG = '定位验证成果/既有成果复核/梁子湖竣工图提取成果/09-提取的空间数据/CAD候选几何_坐标参考未知.gpkg'
faces = gpd.read_file(GPKG, layer='候选面').set_crs(4547)
lines = gpd.read_file(GPKG, layer='候选线').set_crs(4547)

out = {}
for name in sorted(set(faces['cad_file']) | set(lines['cad_file'])):
    f = faces[faces['cad_file'] == name]
    l = lines[lines['cad_file'] == name]
    # 候选源: 施工边界与平整范围面; 线状道路沟渠端点
    pts = []
    for _, r in f.iterrows():
        if r['class'] in ('项目施工边界', '土地平整施工范围'):
            g = r.geometry
            polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
            for p in polys:
                pts.extend([(x, y, r['class'], r['handle']) for x, y in list(p.exterior.coords)])
    for _, r in l.iterrows():
        if r['class'] in ('道路', '沟渠'):
            g = r.geometry
            ls = [g] if g.geom_type == 'LineString' else list(g.geoms)
            for p in ls:
                c = list(p.coords)
                pts.append((c[0][0], c[0][1], r['class'] + '端点', r['handle']))
                pts.append((c[-1][0], c[-1][1], r['class'] + '端点', r['handle']))
    if not pts:
        continue
    # 以质心为中心取四个象限中离中心最远且互不相同的点
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    quads = {}
    for x, y, cls, h in pts:
        q = (0 if x >= cx else 1) + (0 if y >= cy else 2)  # NE,SE?,...
        d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
        if q not in quads or d > quads[q][2]:
            quads[q] = (x, y, d, cls, h)
    sel = sorted(quads.values(), key=lambda t: -t[2])[:6]
    # 保证相互间距>=100m, 最多取5
    final = []
    for x, y, d, cls, h in sorted(quads.values(), key=lambda t: -t[2]):
        if all(((x - a) ** 2 + (y - b) ** 2) ** 0.5 >= 100 for a, b, _, _, _ in final):
            final.append((x, y, d, cls, h))
        if len(final) >= 5:
            break
    out[name] = [{'cad_x': round(x, 3), 'cad_y': round(y, 3), 'src': cls, 'handle': h} for x, y, d, cls, h in final]
    print(name)
    for i, (x, y, d, cls, h) in enumerate(final):
        print(f'  GCP-{i+1}: ({x:.3f}, {y:.3f})  {cls} handle={h}')
json.dump(out, open('定位验证成果/GCP候选点.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('saved 定位验证成果/GCP候选点.json')
