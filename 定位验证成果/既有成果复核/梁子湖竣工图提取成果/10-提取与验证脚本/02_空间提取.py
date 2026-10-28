"""从DXF原始模型空间提取分层候选几何，不做未确认CRS转换，也不修改源文件。
尽可能保存原始handle，弧段使用ezdxf.path.flattening(0.2)近似用于面积/长度测算。
"""
from pathlib import Path
import ezdxf,math,os,csv,json,re,collections,hashlib
from shapely.geometry import Point,LineString,Polygon, mapping
from shapely.validation import explain_validity
from shapely import wkb
from ezdxf.path import make_path
import fiona
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as PatchPolygon
ROOT=Path('/mnt/data/_cad_work');OUT=Path('/mnt/data/梁子湖竣工图提取成果'); GEO=OUT/'09-提取的空间数据';FIG=OUT/'08-图纸与地图对照图'
REC=[];ERR=[]; QA=[]; GROUP=[]; EXPECT=[]
def save_csv(path,rows,cols=None):
 if not rows:return
 cols=cols or list(dict.fromkeys(k for row in rows for k in row.keys()))
 with open(path,'w',encoding='utf-8-sig',newline='') as fp:
  wr=csv.DictWriter(fp,fieldnames=cols,extrasaction='ignore');wr.writeheader();wr.writerows(rows)
def classify(layer):
 if layer=='平整范围线':return '土地平整施工范围','施工范围','A'
 if layer in ('施工范围线','施工项目范围线','0-0项目范围线','项目范围线','已验收项目范围线'):return '项目施工边界','项目范围','B'
 if ('坑塘清淤' in layer) or ('塘口' in layer):return '塘口清淤施工范围','清淤范围','B'
 if layer in ('水   田','旱   地','水田填充'):return '土地利用图斑','田地候选','C'
 if ('田埂' in layer or '田间道' in layer or '田坎' in layer):return '田埂田间道','田埂道路','B'
 if '生产路' in layer or '碎石路' in layer or '水泥路' in layer or '沥青路' in layer or '道路' in layer or '修复3.5m田间道' in layer:return '道路','道路','B'
 if ('渠' in layer or '沟' in layer or '排水' in layer or '新建农渠' in layer) and not layer.startswith('0') and ('标注' not in layer):return '沟渠','沟渠','B'
 if layer in ('2-5 泵站','2-5泵站','2-5泵站标注层','3泵站','02GH 泵站'):return '泵站候选','设施','C'
 if layer=='6-2水闸':return '水闸候选','设施','C'
 if ('蓄水池' in layer or '检查井' in layer or '原有机井' in layer):return '水利设施候选','设施','C'
 return None,None,None
def geom_from(e):
 typ=e.dxftype()
 if typ in ('LWPOLYLINE','POLYLINE'):
  closed=e.closed if typ=='LWPOLYLINE' else e.is_closed
  # skip 3d elevation complexities, retaining unprojected XY
  points=[(float(v.x),float(v.y)) for v in make_path(e).flattening(distance=.15,segments=12)]
  if not points:return None,False,0
  # detect geometric closure, allow 1mm tolerance if CAD flag not set
  snapped=len(points)>2 and math.dist(points[0],points[-1])<.001
  close=closed or snapped
  if close and len(set(points))>=3:
   return Polygon(points),bool(closed),len(points)
  if len(points)>=2:return LineString(points),bool(closed),len(points)
 elif typ=='LINE':return LineString([(e.dxf.start.x,e.dxf.start.y),(e.dxf.end.x,e.dxf.end.y)]),False,2
 elif typ=='INSERT':return Point(float(e.dxf.insert.x),float(e.dxf.insert.y)),False,1
 return None,False,0
for fp in sorted(ROOT.glob('*.dxf')):
 print('EXTRACT',fp.name,flush=True)
 d=ezdxf.readfile(fp);m=d.modelspace(); recs=[]
 tx=[]
 for e in m.query('TEXT MTEXT'):
  raw=e.dxf.text if e.dxftype()=='TEXT' else e.text
  xx,yy=e.dxf.insert.x,e.dxf.insert.y
  if math.isfinite(xx) and math.isfinite(yy): tx.append((raw,float(xx),float(yy),e.dxf.handle,e.dxf.layer))
 selected_classes=collections.Counter();all_sem=collections.Counter()
 for e in m:
  layer=e.dxf.get('layer','0')
  kind,usage,defaultlevel=classify(layer)
  if not kind:continue
  dt=e.dxftype();all_sem[(kind,dt)]+=1
  if dt not in ('LWPOLYLINE','POLYLINE','LINE','INSERT'):continue
  try:g,closed,nvert=geom_from(e)
  except Exception as ee:ERR.append({'图纸':fp.name,'源HANDLE':e.dxf.handle,'异常':str(ee)[:200]});continue
  if g is None or g.is_empty:continue
  minx,miny,maxx,maxy=g.bounds
  # legend/drawing anomalies: exclude any XY far away; retain record in anomaly table
  spatial=(550000<minx<575000 and 3300000<miny<3390000 and 550000<maxx<575000 and 3300000<maxy<3390000)
  if not spatial:
   ERR.append({'图纸':fp.name,'源HANDLE':e.dxf.handle,'图层':layer,'异常':'坐标离群或图块坐标异常','X':minx,'Y':miny,'类别':kind});continue
  if g.geom_type=='Polygon':
   if g.area<20:continue
   if kind in ('项目施工边界','土地平整施工范围','塘口清淤施工范围') and g.area<80:continue
  if g.geom_type=='LineString' and g.length<25:continue
  if g.geom_type=='Point':
   # block position not verified. Retain just candidates on real spatial location.
   if kind not in ('泵站候选','水闸候选','水利设施候选'):continue
  valid=g.is_valid
  issues=[]
  if g.geom_type=='Polygon' and not valid:issues.append('面自相交或无效：'+explain_validity(g)[:100]);defaultlevel='C'
  if g.geom_type=='LineString' and kind in ('土地平整施工范围','项目施工边界','塘口清淤施工范围'):
   defaultlevel='C';issues.append('疑似非边界线；不可按面计算')
  # source unconfirmed XY plane; level is semantic/geometric certainty, not georeferencing grade
  matches=[]
  if g.geom_type=='Polygon' and kind=='土地平整施工范围':
   for t,x,y,h,la in tx:
    if re.search(r'平\s*[-－]\s*\d+',t) and g.contains(Point(x,y)):
     matches.append((t[:70],h))
  elif g.geom_type=='Polygon' and kind=='项目施工边界':
   for t,x,y,h,la in tx:
    if '施工面积' in t and g.contains(Point(x,y)):matches.append((t[:70],h))
  if len(matches)==1 and kind=='土地平整施工范围' and valid:defaultlevel='A'
  elif len(matches)>1: issues.append('边界内包含多条相关文字，未强制归属')
  if not matches and kind=='土地平整施工范围':issues.append('未找到一对一田块/平整文字编号；仅按图层确认施工平整范围')
  rid=fp.stem+'__'+e.dxf.handle
  r={'记录ID':rid,'来源图纸':fp.name,'源图层':layer,'源实体HANDLE':e.dxf.handle,'DXF实体类型':dt,'对象类别':kind,'几何类型':g.geom_type,'语义':usage,'可信等级':defaultlevel,'CAD原始坐标系':'未最终确认','CAD绘图单位':'未声明' if d.header.get('$INSUNITS')==0 else str(d.header.get('$INSUNITS')),'闭合标志':closed,'几何有效':valid,'顶点数':nvert,'面积_CAD平方单位':round(g.area,5) if g.geom_type=='Polygon' else None,'长度_CAD单位':round(g.length,5) if g.geom_type=='LineString' else None,'文本关联':' / '.join(a[0] for a in matches[:4]),'文字HANDLE':'|'.join(a[1] for a in matches[:4]),'疑点':'；'.join(issues),'最小X':round(minx,3),'最小Y':round(miny,3),'最大X':round(maxx,3),'最大Y':round(maxy,3),'wkbhex':g.wkb_hex}
  recs.append((r,g)); selected_classes[(kind,g.geom_type,defaultlevel)]+=1
  if issues:QA.append({k:v for k,v in r.items() if k!='wkbhex'})
 # count duplicates within same file, using normalized WKB round? cheap exact equals via hashed WKB
 seen={}
 for r,g in recs:
  sig=(r['对象类别'],g.wkb_hex)
  if sig in seen:
   r['疑点']+='；与'+seen[sig]+'完全重复';r['可信等级']='C';QA.append({k:v for k,v in r.items() if k!='wkbhex'})
  else:seen[sig]=r['记录ID']
 REC.extend(recs)
 # group area sums and figure
 flats=[(r,g) for r,g in recs if r['对象类别']=='土地平整施工范围' and g.geom_type=='Polygon']
 areas=[round(g.area,2) for _,g in flats]; Group={'图纸':fp.name,'平整范围闭合面数':len(flats),'平整范围面积合计(㎡假设)':round(sum(areas),2),'折合亩(㎡假设)':round(sum(areas)/666.6666667,3),'等级A数量':sum(r['可信等级']=='A' for r,g in recs),'等级B数量':sum(r['可信等级']=='B' for r,g in recs),'等级C数量':sum(r['可信等级']=='C' for r,g in recs)}
 GROUP.append(Group)
 print('CANDIDATES',len(recs),Group, 'types',selected_classes,flush=True)
 # draw simple source geometry; do not claim satellite overlay
 fig,ax=plt.subplots(figsize=(10.0,7.0))
 show=[(r,g) for r,g in recs if g.geom_type in ('Polygon','LineString') and r['对象类别'] not in ('田埂田间道','土地利用图斑')]
 colors={'土地平整施工范围':'#dd8c13','项目施工边界':'#ae4ac9','塘口清淤施工范围':'#18a4b8','道路':'#c84d46','沟渠':'#377ed3','水利设施候选':'#559999'}
 for r,g in show:
  c=colors.get(r['对象类别'],'#999999')
  if g.geom_type=='Polygon':
   if not g.is_valid:continue
   x,y=g.exterior.xy;ax.fill(x,y,facecolor=c,alpha=.22);ax.plot(x,y,color=c,lw=.85)
  else:
   x,y=g.xy;ax.plot(x,y,color=c,lw=1.1)
 ax.set_aspect('equal');ax.ticklabel_format(useOffset=False,style='plain');ax.tick_params(labelsize=8)
 ax.set_xlabel('CAD X (unknown CRS)');ax.set_ylabel('CAD Y (unknown CRS)');ax.grid(alpha=.15)
 ax.set_title(fp.stem,fontsize=11)
 from matplotlib.lines import Line2D
 labels=['土地平整施工范围','项目施工边界','塘口清淤施工范围','道路','沟渠']
 ax.legend([Line2D([0],[0],color=colors[x],lw=3) for x in labels],labels,fontsize=8,loc='best')
 fig.savefig(FIG/(fp.stem+'_CAD候选空间图.png'),dpi=170,bbox_inches='tight');plt.close(fig)
# GPkg vector file all CAD local geometries; no srs
filepath=GEO/'CAD候选几何_坐标参考未知.gpkg'
if filepath.exists():filepath.unlink()
for geo_type,layer in [('Polygon','候选面'),('LineString','候选线'),('Point','候选点')]:
 subset=[(r,g) for r,g in REC if g.geom_type==geo_type]
 if not subset:continue
 schema={'geometry':geo_type,'properties':{'record_id':'str:120','cad_file':'str:180','layer_name':'str:160','handle':'str:40','class':'str:80','confidence':'str:2','area_raw':'float','length_raw':'float','issues':'str:254','label':'str:150','crs_status':'str:30'}}
 with fiona.open(filepath,mode='w',driver='GPKG',layer=layer,schema=schema,crs=None,encoding='UTF-8') as ds:
  for r,g in subset:
   ds.write({'geometry':mapping(g),'properties':{'record_id':r['记录ID'],'cad_file':r['来源图纸'],'layer_name':r['源图层'],'handle':r['源实体HANDLE'],'class':r['对象类别'],'confidence':r['可信等级'],'area_raw':r['面积_CAD平方单位'] or 0,'length_raw':r['长度_CAD单位'] or 0,'issues':r['疑点'][:254],'label':r['文本关联'][:150],'crs_status':'UNKNOWN'}})
# all full raw geometries in GeoPackage, no WGS84; CSV metadata compact
save_csv(OUT/'02-农业空间对象清单.csv',[{k:v for k,v in r.items() if k!='wkbhex'} for r,g in REC])
save_csv(OUT/'06-可疑对象与待核实清单.csv',QA+ERR)
save_csv(GEO/'各图分级与面积统计.csv',GROUP)
( GEO/'候选几何摘要.json').write_text(json.dumps({'total':len(REC),'byClass':dict(collections.Counter(r['对象类别'] for r,g in REC)),'byConfidence':dict(collections.Counter(r['可信等级'] for r,g in REC)),'byGeometry':dict(collections.Counter(g.geom_type for r,g in REC)),'byDrawing':GROUP,'errors':len(ERR)},ensure_ascii=False,indent=2),encoding='utf8')
print('TOTAL',len(REC),'WRITTEN',filepath,flush=True)
