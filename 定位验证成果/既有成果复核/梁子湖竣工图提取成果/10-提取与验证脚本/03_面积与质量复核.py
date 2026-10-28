"""孤立复核：PDF标注对比原DXF几何；修正缺标注等级；记录有效性、跨图重叠。"""
from pathlib import Path
import csv,json,math,collections,ezdxf
from shapely.geometry import Polygon,shape
from shapely.ops import unary_union
import fiona
OUT=Path('/mnt/data/梁子湖竣工图提取成果');DATA=OUT/'09-提取的空间数据';DOCS=Path('/mnt/data/_cad_work')
def rcsv(file):return list(csv.DictReader(open(file,encoding='utf-8-sig')))
def write(path,rows):
 if not rows:return
 cols=list(dict.fromkeys(k for row in rows for k in row))
 with open(path,'w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=cols);w.writeheader();w.writerows(rows)
rows=rcsv(OUT/'02-农业空间对象清单.csv')
for r in rows:
 if r['对象类别']=='土地平整施工范围' and not r['文本关联'] and r['可信等级']=='A':
  r['可信等级']='B'
write(OUT/'02-农业空间对象清单.csv',rows)
# change GPKG feature metadata confidence as database is derived and reproducible using source CSV
p=DATA/'CAD候选几何_坐标参考未知.gpkg'
# We avoid changing GPKG in-place: assemble same exact raw coordinate objects via current records by ID, writing new file in one pass.
q=DATA/'临时更新.gpkg'
if q.exists():q.unlink()
byid={r['记录ID']:r for r in rows}
for lyr in fiona.listlayers(p):
 with fiona.open(p,layer=lyr) as src:
  with fiona.open(q,'w',driver='GPKG',layer=lyr,schema=src.schema,crs=None,encoding='UTF-8') as dst:
   for feat in src:
    props=dict(feat['properties']);props['confidence']=byid[props['record_id']]['可信等级']
    dst.write({'geometry':dict(feat['geometry']),'properties':props})
p.unlink();q.rename(p)
check=[]
def append(label,src,area,ref,sourcehandle,mode,note):
 calc=area/666.6666666666666 if '亩' in mode else area
 delta=(calc-ref);err=100*delta/ref if ref else None
 check.append({'图纸':src,'PDF原始标注':label,'比较项目':mode,'PDF标注值':ref,'CAD反算值':round(calc,5),'CAD原值':round(area,4),'差值':round(delta,5),'相对误差%':round(err,4) if err is not None else None,'CAD实体HANDLE':sourcehandle,'对照依据':note,'校核等级':'明确对应' if mode in ('平整范围面积(亩)','道路长度(米)','渠道长度(米)') else '候选比对'})
# Area worksheet cases
src='2026.4.16竣工图（庙下流）.dxf';rl=[r for r in rows if r['来源图纸']==src and r['对象类别']=='土地平整施工范围' and r['几何类型']=='Polygon'];total=sum(float(r['面积_CAD平方单位']) for r in rl)
append('施工面积262.79亩，其中平整田块面积151.45亩',src,total,151.45,'+'.join(r['源实体HANDLE'] for r in rl),'平整范围面积(亩)','25个平整范围有效面面积合计；不是项目总施工面积，面积按1 CAD单位=1m计算')
src='2026.4.16竣工图（新屋湾、毛家湾）.dxf';rl=[r for r in rows if r['来源图纸']==src and r['对象类别']=='土地平整施工范围'];total=sum(float(r['面积_CAD平方单位']) for r in rl)
append('平整田块面积74.13亩与69.92亩（两片区合计144.05亩）',src,total,144.05,'+'.join(r['源实体HANDLE'] for r in rl),'合计面积粗比(亩)','两个原文面积和DXF平整线未完成逐片分配；不能作为严格一对一检验')
# precise map 61.2 candidate on non-semantic layer 0
src='2026.8.10竣工图（张家湾）.dxf'; d=ezdxf.readfile(DOCS/src);e=d.entitydb['B253C'];g=Polygon(list(e.get_points('xy')))
append('施工面积61.2亩',src,g.area,61.2,'B253C','候选施工面积(亩)','源图层0、闭合多段线；与图示面积接近但图层无明确用途，另有相似但不同的轮廓4F56A；需确认边界对应')
# add geom candidate labeled C for uncertainty; direct frame does not indicate which is authoritative
r={'记录ID':src[:-4]+'__B253C','来源图纸':src,'源图层':'0','源实体HANDLE':'B253C','DXF实体类型':'LWPOLYLINE','对象类别':'疑似施工范围','几何类型':'Polygon','语义':'可能与施工面积61.2亩相对应','可信等级':'C','CAD原始坐标系':'未最终确认','CAD绘图单位':'INSUNITS=1(英寸)但被面积/长度核验反证','闭合标志':True,'几何有效':g.is_valid,'顶点数':len(e),'面积_CAD平方单位':round(g.area,5),'长度_CAD单位':'','文本关联':'施工面积：61.2亩（仅同图出现，未建立精确几何关联）','文字HANDLE':'B2873','疑点':'来源图层0；另有近邻轮廓4F56A面积不同；等待人工选认','最小X':round(g.bounds[0],3),'最小Y':round(g.bounds[1],3),'最大X':round(g.bounds[2],3),'最大Y':round(g.bounds[3],3)}
rows.append(r)
# append geometry to geopackage Polygon layer
with fiona.open(p,'a',layer='候选面') as ds:
 from shapely.geometry import mapping
 ds.write({'geometry':mapping(g),'properties':{'record_id':r['记录ID'],'cad_file':r['来源图纸'],'layer_name':r['源图层'],'handle':r['源实体HANDLE'],'class':r['对象类别'],'confidence':r['可信等级'],'area_raw':r['面积_CAD平方单位'],'length_raw':0,'issues':r['疑点'],'label':r['文本关联'][:150],'crs_status':'UNKNOWN'}})
# lengths verified against annotations, signed approximation
for src,handle,ref,label,kind in [
 ('2026.8.10竣工图（谭湾沈湾）.dxf','31D7C',205,'新建农渠三型-1 L=205m','渠道长度(米)'),
 ('2026.8.10竣工图（谭湾沈湾）.dxf','31D93',393,'新建生产路Ⅱ型-11(393m)','道路长度(米)'),
 ('2026.8.10竣工图（张家湾）.dxf','B2515',164,'新建生产路III型-1(164m)','道路长度(米)'),
 ('2026.8.10竣工图（张家湾）.dxf','B2514',285,'新建生产路III型-1(285m)','道路长度(米)'),
 ('2026.8.10竣工图（张家湾）.dxf','B2512',267,'新建生产路Ⅱ型-9(267m)','道路长度(米)'),
 ('2026.8.10竣工图（张家湾）.dxf','B2513',64,'新建生产路Ⅱ型-10(64m)','道路长度(米)')]:
 v=next((float(z['长度_CAD单位']) for z in rows if z['来源图纸']==src and z['源实体HANDLE']==handle),None)
 if v is not None:append(label,src,v,ref,handle,kind,'按命名图层和近似长度对应；未独立复核道路端点图示，记录为数值支持而非现场竣工长度验收')
write(OUT/'02-农业空间对象清单.csv',rows)
write(OUT/'03A-面积尺寸比对.csv',check)
# count and overlap check, only explicitly selected flat polygons; physically adjacent touching allowed
flat={};issues=[]
with fiona.open(p,layer='候选面') as ds:
 for f in ds:
  props=dict(f['properties']);geom=shape(f['geometry']);
  if props['class']=='土地平整施工范围':flat.setdefault(props['cad_file'],[]).append((props['record_id'],geom))
for src,seq in flat.items():
 for i,(id1,g1) in enumerate(seq):
  for id2,g2 in seq[i+1:]:
   if not g1.is_valid or not g2.is_valid:continue
   try:a=g1.intersection(g2).area
   except:continue
   if a>1:issues.append({'图纸1':src,'候选1':id1,'图纸2':src,'候选2':id2,'重叠面积':round(a,3),'问题':'平整范围面内部存在面积重叠；不得直接求和而不注明'})
for a,(src,seq) in enumerate(flat.items()):
 for src2,seq2 in list(flat.items())[a+1:]:
  for id1,g1 in seq:
   for id2,g2 in seq2:
    if not g1.is_valid or not g2.is_valid:continue
    if not g1.bounds[2]>=g2.bounds[0] or not g2.bounds[2]>=g1.bounds[0]:continue
    try:v=g1.intersection(g2).area
    except:continue
    if v>1:issues.append({'图纸1':src,'候选1':id1,'图纸2':src2,'候选2':id2,'重叠面积':round(v,3),'问题':'跨图纸范围重叠；可能是相邻或不同施工期/重复工程，不直接合并'})
write(DATA/'平整范围跨图及内部重叠.csv',issues)
print('AREA_COMPARISONS')
for a in check: print(a['图纸'][:12],a['PDF原始标注'],round(a['CAD反算值'],3),'err',a['相对误差%'])
print('FLAT OVERLAPS',len(issues),'final candidates',len(rows))
print('BRIEF',collections.Counter((x['对象类别'],x['可信等级']) for x in rows))
