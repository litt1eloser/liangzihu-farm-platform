# -*- coding: utf-8 -*-
"""导出EPSG:4547测试GeoPackage:
- 图层 候选面/候选线: 既有386条候选几何,赋EPSG:4547,保留CAD原始坐标范围、handle、分类、A/B/C等级、来源图纸
- 图层 隔离_设施点未确认: 设施INSERT候选(含离群点),不进入候选层
- 图层 隔离_异常几何: 自交/无效面等
只写测试GPKG,不碰生产数据库。"""
import io, os, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import geopandas as gpd
from shapely.validation import explain_validity

SRC = '定位验证成果/既有成果复核/梁子湖竣工图提取成果/09-提取的空间数据'
OUT = '定位验证成果/GIS测试数据'
os.makedirs(OUT, exist_ok=True)
GPKG = os.path.join(OUT, '梁子湖竣工图候选几何_EPSG4547_测试.gpkg')
if os.path.exists(GPKG):
    os.remove(GPKG)

total = 0
for layer in ('候选面', '候选线'):
    g = gpd.read_file(os.path.join(SRC, 'CAD候选几何_坐标参考未知.gpkg'), layer=layer)
    g = g.set_crs(4547)
    bad = ~g.geometry.is_valid
    if bad.any():
        iso = g[bad].copy()
        iso['validity'] = iso.geometry.apply(lambda x: explain_validity(x))
        iso.to_file(GPKG, layer=f'隔离_异常几何_{layer}', driver='GPKG')
        print(f'{layer}: 隔离无效几何 {bad.sum()} 条 -> 隔离_异常几何_{layer}')
        for _, r in iso.iterrows():
            print(f'   {r["record_id"]} handle={r["handle"]}: {r["validity"]}')
        g = g[~bad]
    g.to_file(GPKG, layer=layer, driver='GPKG')
    total += len(g)
    print(f'{layer}: {len(g)} 条已写入 (CRS=EPSG:4547)')

# 设施点: 既有"设施图块位置候选_未核实.gpkg"
fac_path = os.path.join(SRC, '设施图块位置候选_未核实.gpkg')
if os.path.exists(fac_path):
    import fiona
    for lyr in fiona.listlayers(fac_path):
        f = gpd.read_file(fac_path, layer=lyr).set_crs(4547, allow_override=True)
        f.to_file(GPKG, layer=f'隔离_设施未确认_{lyr}', driver='GPKG')
        print(f'设施层 {lyr}: {len(f)} 条 -> 隔离_设施未确认_{lyr}')

print('总计候选几何', total, '条; 输出:', GPKG)
# 复核: 读回验证
import fiona
print('GPKG图层:', fiona.listlayers(GPKG))
chk = gpd.read_file(GPKG, layer='候选面')
print('候选面 CRS:', chk.crs, '条数:', len(chk), '范围:', [round(v, 1) for v in chk.total_bounds])
