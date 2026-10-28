# -*- coding: utf-8 -*-
"""为每个GCP生成无CAD叠加的原始影像测量切片(修正版: 全程全局像素坐标,不混用物理米)。
切片中心对CAD点加确定性随机物理偏移(±60m),消除'目标必在中心'的暗示。
元数据记录切片左上角的全局瓦片像素坐标与物理米/像素,供像素→坐标反算。"""
import io, os, sys, math, json, random, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from PIL import Image
from pyproj import Transformer

TK = open('天地图key.txt', encoding='utf-8').read().strip()
TILES = '定位验证成果/叠加图/_tiles'
OUT = '定位验证成果/独立测量切片'
os.makedirs(OUT, exist_ok=True)
UA = {'Referer': 'https://www.tianditu.gov.cn/', 'User-Agent': 'Mozilla/5.0'}
to4490 = Transformer.from_crs(4547, 4490, always_xy=True)
Z = 18
C = 20037508.342789244
N = 2**Z
GMPP = 2*C/(N*256)          # 每全局像素对应的WebMercator米数(赤道基准,0.5972)
LAT = 30.2555
PMPP = GMPP*math.cos(math.radians(LAT))  # 物理米/像素 ≈0.5157, 仅用于距离标注
SIZE = 640

def fetch(z, x, y):
    fn = os.path.join(TILES, f'img_w_{z}_{x}_{y}.png')
    if os.path.exists(fn) and os.path.getsize(fn) > 2000:
        return fn
    for s in range(8):
        try:
            d = urllib.request.urlopen(urllib.request.Request(
                f'https://t{s}.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk={TK}',
                headers=UA), timeout=20).read()
            if len(d) > 2000 and d[:2] == b'\xff\xd8':
                open(fn, 'wb').write(d); return fn
        except Exception:
            pass
    return None

def cad_to_gpx(e, n):
    lon, lat = to4490.transform(e, n)
    mx = math.radians(lon)*6378137.0
    my = math.log(math.tan(math.pi/4+math.radians(lat)/2))*6378137.0
    return (mx+C)/(2*C)*N*256, (C-my)/(2*C)*N*256  # 全局像素

GCPS = [
    ('MXL-G1', '庙下流', 560392.847, 3348712.935, '村道与环湖沥青路T型交叉口中心', '对应点'),
    ('MXL-G2', '庙下流', 560480.012, 3348028.967, '湖汊堤顶路急弯内角顶点', '对应点'),
    ('MXL-G3', '庙下流', 559672.528, 3347896.251, '环湖路西段与田间道接入口中心', '对应点'),
    ('MXL-G4', '庙下流', 559684.529, 3348187.329, '湾内道路十字交叉口中心', '检查点'),
    ('XWM-G1', '新屋湾毛家湾', 560443.263, 3348737.827, '新屋塆东侧沥青路弯角顶点', '对应点'),
    ('XWM-G2', '新屋湾毛家湾', 558594.664, 3349032.021, '大塘堤埂T型交汇角顶点', '对应点'),
    ('XWM-G3', '新屋湾毛家湾', 558884.178, 3348416.735, '道路Y型岔口中心(铜铁海方向)', '检查点'),
    ('ZJW-G1', '张家湾', 559464.843, 3348029.498, '田间道与塘角交点', '对应点'),
    ('ZJW-G2', '张家湾', 559796.328, 3347888.434, '项目区东南角环湖路岔口中心', '对应点'),
    ('ZJW-G3R', '张家湾', 559639.823, 3347923.864, '施工范围SW角:环湖路北缘接入口', '对应点'),
    ('ZJW-G4', '张家湾', 559683.262, 3348180.362, '湾内道路十字交叉口中心(与MXL-G4同路口)', '对应点'),
    ('ZJW-G5', '张家湾', 559756.943, 3348158.968, '施工范围NE角:村南田角', '检查点'),
    ('TSW-G1', '谭湾沈湾', 560360.035, 3348183.538, '生产路南端塘堤转角顶点', '对应点'),
    ('TSW-G2', '谭湾沈湾', 560234.414, 3348660.817, '农渠北端与沥青路交汇口中心', '对应点'),
    ('TSW-G3R', '谭湾沈湾', 560176.700, 3348462.700, '农渠与生产路交汇点(村东路缘)', '检查点'),
    ('ABC-G1', 'ABCDEFD区', 558596.315, 3349035.436, '大塘堤埂T型交汇角顶点', '对应点'),
    ('ABC-G2', 'ABCDEFD区', 558682.931, 3349318.013, '鱼塘堤埂Y型交汇顶点', '对应点'),
    ('ABC-G3', 'ABCDEFD区', 560397.776, 3348774.517, '庙下刘湾口村道与沥青路T型交叉口中心', '对应点'),
    ('ABC-G4', 'ABCDEFD区', 560241.621, 3349313.347, '平整区东缘路与塘埂交点', '检查点'),
]

rng = random.Random(20261028)
meta = {}
for pid, sheet, e, n, feat, role in GCPS:
    cx, cy = cad_to_gpx(e, n)
    dx, dy = rng.uniform(-60, 60), rng.uniform(-60, 60)  # 物理米
    ox = cx + dx/PMPP - SIZE/2   # 切片左上全局像素
    oy = cy - dy/PMPP - SIZE/2
    ix0, iy0 = int(ox//256), int(oy//256)
    ix1, iy1 = int((ox+SIZE)//256), int((oy+SIZE)//256)
    W, H = (ix1-ix0+1)*256, (iy1-iy0+1)*256
    img = Image.new('RGB', (W, H), (40, 40, 40))
    ok = True
    for ix in range(ix0, ix1+1):
        for iy in range(iy0, iy1+1):
            fn = fetch(Z, ix, iy)
            if fn:
                img.paste(Image.open(fn).convert('RGB'), ((ix-ix0)*256, (iy-iy0)*256))
            else:
                ok = False
    px0, py0 = ox - ix0*256, oy - iy0*256
    img = img.crop((int(px0), int(py0), int(px0)+SIZE, int(py0)+SIZE))
    img.save(os.path.join(OUT, f'{pid}.png'))
    meta[pid] = {'sheet': sheet, 'cad_e': e, 'cad_n': n, 'feature': feat, 'role': role,
                 'gpx_left': ix0*256 + int(px0), 'gpy_top': iy0*256 + int(py0),
                 'gmpp': GMPP, 'pmpp': PMPP, 'size': SIZE, 'zoom': Z,
                 'offset_dx': round(dx, 1), 'offset_dy': round(dy, 1), 'tiles_ok': ok}
json.dump(meta, open(os.path.join(OUT, '切片元数据.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(meta)} 张无标注切片已生成(修正版)')
# 自检: 每个CAD点落在切片内的位置(应=320∓偏移px)
for pid, v in meta.items():
    cx, cy = cad_to_gpx(v['cad_e'], v['cad_n'])
    print(f"  {pid}: CAD在切片内({cx-v['gpx_left']:.1f},{cy-v['gpy_top']:.1f}) 期望({320-v['offset_dx']/PMPP:.1f},{320+v['offset_dy']/PMPP:.1f}) ok={v['tiles_ok']}")
