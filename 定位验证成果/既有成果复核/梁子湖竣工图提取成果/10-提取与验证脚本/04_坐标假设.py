"""测试候选投影；明确仅诊断，不把推测WGS84写入GIS几何。"""
import csv,json,collections,math
from pathlib import Path
from pyproj import CRS,Transformer
import fiona
from shapely.geometry import shape
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
# 允许Linux无系统字体缓存发现时正确渲染中文；不随成果分发字体文件
font_path='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if Path(font_path).exists():
 font_manager.fontManager.addfont(font_path)
 plt.rcParams['font.family']=font_manager.FontProperties(fname=font_path).get_name()
 plt.rcParams['axes.unicode_minus']=False
P=Path('/mnt/data/梁子湖竣工图提取成果');G=P/'09-提取的空间数据'
feat=collections.defaultdict(list)
for layer in fiona.listlayers(G/'CAD候选几何_坐标参考未知.gpkg'):
 with fiona.open(G/'CAD候选几何_坐标参考未知.gpkg',layer=layer) as fs:
  for f in fs:
   pr=dict(f['properties']); g=shape(f['geometry'])
   if pr['class'] in ('土地平整施工范围','疑似施工范围') and g.geom_type=='Polygon' and g.is_valid: weight=8
   elif pr['class'] in ('项目施工边界',) and g.geom_type=='Polygon':weight=4
   else: weight=1
   # use 20% / 80% median centroid for robustness
   feat[pr['cad_file']].append((g.centroid.x,g.centroid.y,weight,pr['class']))
mapsets={'庙下流':'2026.4.16竣工图（庙下流）.dxf','新屋湾、毛家湾':'2026.4.16竣工图（新屋湾、毛家湾）.dxf','张家湾':'2026.8.10竣工图（张家湾）.dxf','谭湾沈湾':'2026.8.10竣工图（谭湾沈湾）.dxf','ABCDEF分区':'ABCDEFD区竣工图.dxf'}
rows=[]
def wtmean(a,ix):return sum(z[ix]*z[2] for z in a)/sum(z[2] for z in a)
for name,fn in mapsets.items():
 a=feat.get(fn,[])
 if not a:continue
 x,y=wtmean(a,0),wtmean(a,1)
 for code,axis in [('EPSG:4547','CAD X东/Y北'),('EPSG:4548','CAD X东/Y北'),('EPSG:4546','CAD X东/Y北'),('EPSG:4547','CAD X北/Y东')]:
  try:
   trans=Transformer.from_crs(4547 if code=='EPSG:4547' else int(code.split(':')[1]),4326,always_xy=True)
   lon,lat=trans.transform(x,y) if axis=='CAD X东/Y北' else trans.transform(y,x)
   rows.append({'图纸':fn,'区域':name,'候选坐标系统':code,'轴顺序':axis,'源CAD中心X':round(x,3),'源CAD中心Y':round(y,3),'候选经度':round(lon,7) if math.isfinite(lon) else None,'候选纬度':round(lat,7) if math.isfinite(lat) else None,'标记':'仅假设计算，未经过道路/控制点地物配准','初步判断':'位置与鄂州相容，但未经验证' if code=='EPSG:4547' and axis=='CAD X东/Y北' else '不符合梁子湖区域'} )
  except:pass
with (G/'坐标解释候选试验.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
# Diagram is geometric hypothesis points, not verified map
fig,ax=plt.subplots(figsize=(9,5.5));plt.rcParams['axes.unicode_minus']=False
r=[v for v in rows if v['候选坐标系统']=='EPSG:4547' and v['轴顺序']=='CAD X东/Y北']
for item in r:
 ax.scatter(item['候选经度'],item['候选纬度'],s=65)
 ax.annotate(item['区域'],(item['候选经度'],item['候选纬度']),xytext=(5,6),textcoords='offset points',fontsize=9)
ax.set_title('EPSG:4547 候选投影结果（尚未定位核验）')
ax.set_xlabel('候选经度 / °E');ax.set_ylabel('候选纬度 / °N');ax.ticklabel_format(useOffset=False);ax.grid(alpha=.22)
fig.savefig(P/'08-图纸与地图对照图'/'五图4547候选投影位置_未核验.png',dpi=160,bbox_inches='tight');plt.close(fig)
print('Hypothetical centroids:')
for v in r:print(v['区域'],v['候选经度'],v['候选纬度'])
