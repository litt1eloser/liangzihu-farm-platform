# -*- coding: utf-8 -*-
"""独立影像测量→误差计算(修正版: 全局像素→WebMercator→EPSG:4547)。
像素判读为人工在无标注切片上完成(判读像素.json,一次锁定不回调)。"""
import io, os, sys, json, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from pyproj import Transformer

meta = json.load(open('定位验证成果/独立测量切片/切片元数据.json', encoding='utf-8'))
picks = json.load(open('定位验证成果/独立测量切片/判读像素.json', encoding='utf-8'))
C = 20037508.342789244
to4490 = Transformer.from_crs(3857, 4490, always_xy=True)
to4547 = Transformer.from_crs(3857, 4547, always_xy=True)

rows = []
for pid, (px, py) in picks.items():
    v = meta[pid]
    n2 = 2 ** v['zoom']
    mx = (v['gpx_left'] + px) / (n2 * 256) * 2 * C - C
    my = C - (v['gpy_top'] + py) / (n2 * 256) * 2 * C
    lon, lat = to4490.transform(mx, my)
    ie, in_ = to4547.transform(mx, my)
    dE = ie - v['cad_e']; dN = in_ - v['cad_n']
    dist = math.hypot(dE, dN)
    rows.append({'点ID': pid, '图纸': v['sheet'], '角色': v['role'], '地物': v['feature'],
                 'CAD_E': v['cad_e'], 'CAD_N': v['cad_n'],
                 '影像E': round(ie, 2), '影像N': round(in_, 2),
                 '影像经度': round(lon, 8), '影像纬度': round(lat, 8),
                 'dE_m': round(dE, 2), 'dN_m': round(dN, 2), '距离误差_m': round(dist, 2)})

import csv, statistics
with open('定位验证成果/03-独立测量误差表.csv', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)

print(f"{'点ID':<9}{'图纸':<9}{'角色':<5}{'dE':>7}{'dN':>7}{'距离':>7}")
for r in rows:
    print(f"{r['点ID']:<9}{r['图纸']:<9}{r['角色']:<5}{r['dE_m']:>7.2f}{r['dN_m']:>7.2f}{r['距离误差_m']:>7.2f}")

def stats(rs, name):
    ds = [r['距离误差_m'] for r in rs]
    rmse = math.sqrt(sum(d*d for d in ds)/len(ds))
    mE = statistics.mean(r['dE_m'] for r in rs); mN = statistics.mean(r['dN_m'] for r in rs)
    print(f'{name}: n={len(ds)} RMSE={rmse:.2f}m max={max(ds):.2f}m mean_dE={mE:+.2f} mean_dN={mN:+.2f}')
print()
stats(rows, '全部19点')
stats([r for r in rows if r['角色']=='对应点'], '对应点(n=14)')
stats([r for r in rows if r['角色']=='检查点'], '独立检查点(n=5)')
for s in sorted(set(r['图纸'] for r in rows)):
    stats([r for r in rows if r['图纸']==s], s)
print()
for a, b, lab in [('XWM-G2','ABC-G1','大塘堤埂T角(两图)'), ('MXL-G4','ZJW-G4','湾内十字路口(两图)')]:
    ra = next(r for r in rows if r['点ID']==a); rb = next(r for r in rows if r['点ID']==b)
    dcad = math.hypot(ra['CAD_E']-rb['CAD_E'], ra['CAD_N']-rb['CAD_N'])
    dimg = math.hypot(ra['影像E']-rb['影像E'], ra['影像N']-rb['影像N'])
    print(f'{lab}: CAD间距={dcad:.2f}m, 影像实测间距={dimg:.2f}m, 两者差={abs(dcad-dimg):.2f}m')
