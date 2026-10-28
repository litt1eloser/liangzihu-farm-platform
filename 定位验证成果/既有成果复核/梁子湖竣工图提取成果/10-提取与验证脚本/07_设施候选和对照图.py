"""设施图块候选仅单独存储在非生产、无坐标参考空间包；制作PDF/CAD并列图（不是配准叠图）。"""
from pathlib import Path
import csv,fiona
from shapely.geometry import Point,shape,mapping
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
# 允许Linux无系统字体缓存发现时正确渲染中文；不随成果分发字体文件
font_path='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if Path(font_path).exists():
 font_manager.fontManager.addfont(font_path)
 plt.rcParams['font.family']=font_manager.FontProperties(fname=font_path).get_name()
 plt.rcParams['axes.unicode_minus']=False
from matplotlib.lines import Line2D
from PIL import Image,ImageOps,ImageDraw
from collections import defaultdict
P=Path('/mnt/data/梁子湖竣工图提取成果');D=P/'09-提取的空间数据';IMG=P/'08-图纸与地图对照图'
plt.rcParams['axes.unicode_minus']=False
rec=list(csv.DictReader(open(D/'设施图块与插入位置待核实.csv',encoding='utf-8-sig')))
p=D/'设施图块位置候选_未核实.gpkg'
if p.exists():p.unlink()
schema={'geometry':'Point','properties':{'source':'str:150','handle':'str:40','cad_layer':'str:100','block_name':'str:100','grade':'str:2','warn':'str:180'}}
with fiona.open(p,'w',driver='GPKG',layer='插入点候选',schema=schema,crs=None,encoding='UTF-8') as dst:
 for x in rec:
  if x['插入点落在主体范围']!='True':continue
  xx,yy=float(x['插入X原值']),float(x['插入Y原值'])
  dst.write({'geometry':mapping(Point(xx,yy)),'properties':{'source':x['来源图纸'],'handle':x['源HANDLE'],'cad_layer':x['源图层'],'block_name':x['块名称'],'grade':'C','warn':'未经现场核实；同一设施可能有多个块'}})
geo=defaultdict(list)
with fiona.open(D/'CAD候选几何_坐标参考未知.gpkg',layer='候选面') as f:
 for ft in f:geo[ft['properties']['cad_file']].append((dict(ft['properties']),shape(ft['geometry'])))
with fiona.open(D/'CAD候选几何_坐标参考未知.gpkg',layer='候选线') as f:
 for ft in f:geo[ft['properties']['cad_file']].append((dict(ft['properties']),shape(ft['geometry'])))
colors={'土地平整施工范围':'#de8c17','项目施工边界':'#a737ad','疑似施工范围':'#ee8f29','塘口清淤施工范围':'#168fa3','道路':'#be373a','沟渠':'#3277ce','田埂田间道':'#929292','土地利用图斑':'#b9cdb9'}
for fn,records in geo.items():
 fig,ax=plt.subplots(figsize=(9.4,6.4))
 for r,g in records:
  typ=r['class'];col=colors.get(typ,'#777777')
  if g.geom_type=='Polygon':
   xx,yy=g.exterior.xy
   if g.is_valid:ax.fill(xx,yy,color=col,alpha=.28)
   ax.plot(xx,yy,color=col,lw=.8)
  elif g.geom_type=='LineString':
   xx,yy=g.xy;ax.plot(xx,yy,color=col,lw=1.0)
 ax.set_aspect('equal');ax.grid(alpha=.12);ax.ticklabel_format(style='plain',useOffset=False)
 ax.tick_params(labelsize=7);ax.set_title(fn.replace('.dxf','')+' — CAD候选图形（未配准）',fontsize=12)
 ax.set_xlabel('CAD原始X（投影未核实）');ax.set_ylabel('CAD原始Y（投影未核实）')
 labs=['土地平整施工范围','项目施工边界','塘口清淤施工范围','道路','沟渠']
 ax.legend([Line2D([0],[0],color=colors[k],lw=3) for k in labs],labs,fontsize=8,loc='upper left')
 fig.tight_layout();op=IMG/(fn.replace('.dxf','')+'_CAD候选空间图.png');fig.savefig(op,dpi=160,bbox_inches='tight');plt.close(fig)
 ori=IMG/(fn.replace('.dxf','')+'_横向正向预览.png')
 if not ori.exists():continue
 pdf=Image.open(ori).convert('RGB');cad=Image.open(op).convert('RGB')
 # Keep images comparable size but separate: intentionally NOT georeferenced overlay
 width=1150;height=740
 out=Image.new('RGB',(width*2,height+48),'white')
 for i,im in enumerate((pdf,cad)):
  resized=ImageOps.contain(im,(width-20,height-10));out.paste(resized,(i*width+(width-resized.width)//2,50+(height-resized.height)//2))
 dr=ImageDraw.Draw(out)
 dr.text((20,10),'LEFT: original PDF sheet   |   RIGHT: extracted CAD candidates (NOT registered to satellite)',fill='#222222')
 out.save(IMG/(fn.replace('.dxf','')+'_PDF_CAD并列核验.png'),optimize=True)
print('facility gpk count',sum(x['插入点落在主体范围']=='True' for x in rec),'map comparisons',len(geo))
