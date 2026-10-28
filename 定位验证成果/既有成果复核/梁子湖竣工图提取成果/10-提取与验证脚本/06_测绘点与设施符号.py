"""补充原始测绘点/高程候选和设施图块，全部保持CAD原坐标和源HANDLE；不推导设备真实位置。"""
from pathlib import Path
import csv,json,collections,math,ezdxf,fiona
from shapely.geometry import Point,mapping
ROOT=Path('/mnt/data/_cad_work');OUT=Path('/mnt/data/梁子湖竣工图提取成果');DATA=OUT/'09-提取的空间数据'
def csvout(path,items):
 if not items:return
 cols=list(dict.fromkeys(k for r in items for k in r))
 with open(path,'w',newline='',encoding='utf-8-sig') as f:
  w=csv.DictWriter(f,fieldnames=cols);w.writeheader();w.writerows(items)
source_pts=[];fac=[];tot=collections.Counter();h=DATA/'CAD原始测绘点_坐标与高程未确认.gpkg'
if h.exists():h.unlink()
wschema={'geometry':'3D Point','properties':{'cad_file':'str:180','handle':'str:40','layer_name':'str:100','cad_z':'float','z_valid':'str:15','crs_status':'str:30'}}
with fiona.open(h,'w',layer='原始测绘点',driver='GPKG',schema=wschema,crs=None,encoding='UTF-8') as ds:
 for path in sorted(ROOT.glob('*.dxf')):
  print('POINTS',path.name,flush=True)
  doc=ezdxf.readfile(path)
  for ent in doc.modelspace():
   t=ent.dxftype();layer=ent.dxf.get('layer','0')
   if t=='POINT':
    v=ent.dxf.location;x,y,z=float(v.x),float(v.y),float(v.z)
    if not all(math.isfinite(z0) for z0 in [x,y,z]):continue
    if not (550000<x<575000 and 3300000<y<3390000):continue
    # do not classify as verified elevations just because Z is nonzero
    level='候选高程' if -100<=z<=500 else 'Z超常待核实'
    if layer not in ('DM','ZDH','GUOZDH','DMTZ'):level='用途未识别'
    r={'来源图纸':path.name,'CAD图层':layer,'源实体HANDLE':ent.dxf.handle,'原始X':round(x,6),'原始Y':round(y,6),'原始Z':round(z,6),'Z审核状态':level,'坐标参考':'未确认','垂直高程基准':'仅图签写1985，单点未核实'}
    source_pts.append(r);tot[(path.name,layer)]+=1
    ds.write({'geometry':mapping(Point(x,y,z)),'properties':{'cad_file':path.name,'handle':ent.dxf.handle,'layer_name':layer,'cad_z':z,'z_valid':level,'crs_status':'UNKNOWN'}})
   elif t=='INSERT':
    blk=ent.dxf.get('name','');full=f'{blk} {layer}'
    if not any(w in full for w in ('水闸','泵站','涵','检查井','机井','蓄水池','沉沙','沉砂','井')):continue
    ix,iy,iz=(float(v) for v in ent.dxf.insert)
    plausible=550000<ix<575000 and 3300000<iy<3390000
    fac.append({'来源图纸':path.name,'源图层':layer,'源HANDLE':ent.dxf.handle,'块名称':blk,'插入X原值':round(ix,5),'插入Y原值':round(iy,5),'插入Z原值':round(iz,5),'缩放X':ent.dxf.xscale,'缩放Y':ent.dxf.yscale,'旋转角度':ent.dxf.rotation,'插入点落在主体范围':plausible,'状态':'仅图块符号候选；尚未取得现场点位核验' if plausible else '插入点异常，不可作为设施GIS位置'})
csvout(DATA/'CAD原始测绘点与高程候选.csv',source_pts)
csvout(DATA/'设施图块与插入位置待核实.csv',fac)
stat={'total_survey_point_candidates':len(source_pts),'total_facility_block_instances':len(fac),'by_point_layer':{f'{k[0]} | {k[1]}':n for k,n in tot.items()},'facility_spatial_inlier':sum(x['插入点落在主体范围'] for x in fac),'facility_spatial_outlier':sum(not x['插入点落在主体范围'] for x in fac),'z_min':min(x['原始Z'] for x in source_pts),'z_max':max(x['原始Z'] for x in source_pts)}
(DATA/'点与设施符号统计.json').write_text(json.dumps(stat,ensure_ascii=False,indent=2),encoding='utf8')
print(stat,flush=True)
