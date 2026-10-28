import os,csv,json,re,hashlib,collections,math,traceback
from pathlib import Path
import fitz,ezdxf
from ezdxf import bbox
ROOT=Path('/mnt/data/_cad_work');OUT=Path('/mnt/data/梁子湖竣工图提取成果')
DXFS=sorted(ROOT.glob('*.dxf'));PDFS=sorted(ROOT.glob('*.pdf'))
files=[];layers=[];types=[];blocks=[];texts={};entityinfo={}
def dump(name,rows):
 if not rows:return
 with (OUT/name).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=sorted({k for x in rows for k in x.keys()}));w.writeheader();w.writerows(rows)
def xy_bounds(ents):
 xs=[];ys=[]
 for e in ents:
  dt=e.dxftype()
  try:
   if dt=='LINE': pts=[e.dxf.start,e.dxf.end]
   elif dt=='LWPOLYLINE':pts=[(p[0],p[1]) for p in e.get_points('xy')]
   elif dt=='POLYLINE':pts=[v.dxf.location for v in e.vertices]
   elif dt=='POINT':pts=[e.dxf.location]
   elif dt in ('CIRCLE','ARC'):c=e.dxf.center;r=e.dxf.radius;pts=[(c.x-r,c.y-r),(c.x+r,c.y+r)]
   elif dt=='INSERT':pts=[e.dxf.insert]
   else:continue
   for p in pts:
    if all(math.isfinite(v) for v in p[:2]): xs.append(p[0]);ys.append(p[1])
  except:pass
 if not xs:return None
 return [min(xs),min(ys),max(xs),max(ys)]
for pdf in PDFS:
 d=fitz.open(pdf);pages=[]
 for ix,page in enumerate(d):
  txt=page.get_text('text')
  pages.append({'page':ix+1,'size':list(page.rect),'text_length':len(txt),'text_excerpt':txt[:2500]})
 (OUT/'09-提取的空间数据'/f'{pdf.stem}_pdf文本.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2),encoding='utf8')
 files.append({'文件':pdf.name,'格式':'PDF','字节数':pdf.stat().st_size,'sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'PDF页数':len(d),'PDF首页文本字数':pages[0]['text_length'] if pages else 0})
 print('PDF',pdf.name,len(d),[x['text_length'] for x in pages],flush=True)
for fp in DXFS:
 print('Loading DXF',fp.name,flush=True)
 doc=ezdxf.readfile(fp);msp=doc.modelspace();cat=collections.Counter(e.dxftype() for e in msp)
 bb=xy_bounds(e for e in msp if e.dxftype() not in ('TEXT','MTEXT','DIMENSION','LEADER','MULTILEADER'))
 er=collections.Counter(); layer_cat=collections.defaultdict(collections.Counter);tlist=[]
 for e in msp:
  dt=e.dxftype();la=e.dxf.get('layer','0');layer_cat[la][dt]+=1
  if dt in ('TEXT','MTEXT','ATTRIB'):
   text=e.dxf.text if dt!='MTEXT' else e.text
   if text.strip():tlist.append({'layer':la,'text':text,'handle':e.dxf.handle,'pos':str(e.dxf.insert) if e.dxf.hasattr('insert') else ''})
 for key,c in cat.items():types.append({'图纸':fp.name,'空间':'MODEL','实体类型':key,'数量':c})
 for layout in doc.layouts:
  if layout.name!='Model':
   for key,c in collections.Counter(e.dxftype() for e in layout).items():types.append({'图纸':fp.name,'空间':layout.name,'实体类型':key,'数量':c})
 for la in doc.layers:
  co=layer_cat.get(la.dxf.name,{});
  layers.append({'图纸':fp.name,'图层':la.dxf.name,'颜色':la.dxf.color,'真彩色':la.dxf.get('true_color'),'关闭':la.is_off(),'冻结':la.is_frozen(),'锁定':la.is_locked(),'合计模型实体':sum(co.values()),**{f'N_{k}':v for k,v in co.items()}})
 insert_counts=collections.Counter(e.dxf.name for e in msp.query('INSERT'))
 for blk in doc.blocks:
  if blk.name.startswith('*'): continue
  bc=collections.Counter(e.dxftype() for e in blk)
  blocks.append({'图纸':fp.name,'块名':blk.name,'实体数量':sum(bc.values()),'参照数':insert_counts[blk.name],'嵌套INSERT数':bc['INSERT'],'外参标记':blk.block.is_xref if hasattr(blk,'block') else '', '类型统计':json.dumps(bc,ensure_ascii=False)})
 files.append({'文件':fp.name,'格式':'DXF','字节数':fp.stat().st_size,'sha256':hashlib.sha256(fp.read_bytes()).hexdigest(), 'DXF版本':doc.dxfversion,'INSUNITS':doc.header.get('$INSUNITS'),'MEASUREMENT':doc.header.get('$MEASUREMENT'),'LUNITS':doc.header.get('$LUNITS'),'模型实体总数':sum(cat.values()),'图层数':len(doc.layers),'布局空间':','.join(l.name for l in doc.layouts),'块定义数':len(doc.blocks),'未展开主体bbox':json.dumps(bb),'闭合LWPOLYLINE':sum(e.closed for e in msp.query('LWPOLYLINE')),'闭合POLYLINE':sum(e.is_closed for e in msp.query('POLYLINE')),'INSERT数':cat['INSERT'],'XREF数':sum(1 for b in doc.blocks if getattr(b.block,'is_xref',False))})
 texts[fp.stem]=tlist
 entityinfo[fp.stem]={'type_stats':cat,'bbox':bb,'layers':{k:dict(v) for k,v in layer_cat.items()}}
 print('DXF',fp.stem,'layers',len(doc.layers),'entities',sum(cat.values()),'bbox',bb,'text',len(tlist),'types',cat,flush=True)
 (OUT/'09-提取的空间数据'/f'{fp.stem}_文字.json').write_text(json.dumps(tlist,ensure_ascii=False,indent=2),encoding='utf8')
dump('01A-文件清单.csv',files);dump('01B-图层清单.csv',layers);dump('01C-实体统计.csv',types);dump('01D-图块清单.csv',blocks)
(OUT/'09-提取的空间数据'/'结构摘要.json').write_text(json.dumps(entityinfo,ensure_ascii=False,indent=2,default=dict),encoding='utf8')
print('DONE')
