# -*- coding: utf-8 -*-
"""生成独立对照图: 原始影像切片上同时标出CAD位置(红十字)与影像实测位置(蓝圈),标注实测误差。"""
import io, os, sys, json, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from PIL import Image, ImageDraw, ImageFont
from pyproj import Transformer
import csv

meta = json.load(open('定位验证成果/独立测量切片/切片元数据.json', encoding='utf-8'))
picks = json.load(open('定位验证成果/独立测量切片/判读像素.json', encoding='utf-8'))
C = 20037508.342789244
to4490 = Transformer.from_crs(4547, 4490, always_xy=True)
OUT = '定位验证成果/GCP对照_独立测量'
os.makedirs(OUT, exist_ok=True)
try:
    FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 16)
except Exception:
    FONT = ImageFont.load_default()

errs = {}
with open('定位验证成果/03-独立测量误差表.csv', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        errs[r['点ID']] = float(r['距离误差_m'])

for pid, (px, py) in picks.items():
    v = meta[pid]
    img = Image.open(f'定位验证成果/独立测量切片/{pid}.png').convert('RGB')
    lon, lat = to4490.transform(v['cad_e'], v['cad_n'])
    mx = math.radians(lon)*6378137.0
    my = math.log(math.tan(math.pi/4+math.radians(lat)/2))*6378137.0
    n2 = 2 ** v['zoom']
    cpx = (mx+C)/(2*C)*n2*256 - v['gpx_left']
    cpy = (C-my)/(2*C)*n2*256 - v['gpy_top']
    dr = ImageDraw.Draw(img)
    dr.line([cpx-14, cpy, cpx+14, cpy], fill=(255, 30, 30), width=2)
    dr.line([cpx, cpy-14, cpx, cpy+14], fill=(255, 30, 30), width=2)
    dr.ellipse([px-9, py-9, px+9, py+9], outline=(0, 120, 255), width=3)
    dr.line([cpx, cpy, px, py], fill=(255, 255, 255), width=1)
    dr.rectangle([4, 4, 430, 52], fill=(0, 0, 0))
    dr.text((10, 8), f'{pid} {v["sheet"]} {v["role"]}', font=FONT, fill=(255, 255, 255))
    dr.text((10, 30), f'红十字=CAD位置 蓝圈=影像实测 误差={errs[pid]:.2f}m', font=FONT, fill=(255, 255, 0))
    img.save(os.path.join(OUT, f'{pid}_对照.png'))
print(f'{len(picks)} 张独立对照图已生成 → {OUT}')
