"""利用artifact_tool生成结构清单和面积核验工作簿，绝不修改源文件。"""
from pathlib import Path
import csv
from artifact_tool import Workbook,SpreadsheetFile
ROOT=Path('/mnt/data/梁子湖竣工图提取成果')
def load(fn):
 with (ROOT/fn).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def add(wb,name,rows,desired=None):
 ws=wb.worksheets.add(name)
 if not rows:return ws
 columns=[x for x in (desired or list(rows[0].keys())) if x in rows[0]]
 data=[columns]+[[int(v) if v.isdigit() and not k.startswith('sha') and k not in ('文件','图纸','图层','颜色') else (float(v) if k in ('PDF标注值','CAD反算值','CAD原值','差值','相对误差%') and v not in ('',None) else str(v) if v is not None else '') for k,v in ((k,r.get(k,'')) for k in columns)] for r in rows]
 ws.get_range_by_indexes(0,0,len(data),len(columns)).values=data
 header=ws.get_range_by_indexes(0,0,1,len(columns));header.format={'fill':'#E7EEF4','font':{'bold':True,'color':'#20303B'},'row_height':28,'vertical_alignment':'center'}
 ws.freeze_panes.freeze_rows(1)
 for j,k in enumerate(columns):
  from_col=ws.get_range_by_indexes(0,j,len(data),1)
  width=36 if any(z in k for z in ('文件','图纸','来源','对照依据','文本','图层','图块','名称','原始标注','比较项目')) else (15 if k not in ('sha256',) else 42)
  from_col.format.column_width=width
 return ws
w=Workbook.create()
add(w,'文件清单',load('01A-文件清单.csv'),['文件','格式','字节数','PDF页数','PDF首页文本字数','DXF版本','INSUNITS','MEASUREMENT','模型实体总数','图层数','布局空间','块定义数','闭合LWPOLYLINE','闭合POLYLINE','INSERT数','XREF数','未展开主体bbox','sha256'])
add(w,'图层清单',load('01B-图层清单.csv'),['图纸','图层','颜色','真彩色','关闭','冻结','锁定','合计模型实体','N_LWPOLYLINE','N_POLYLINE','N_LINE','N_HATCH','N_INSERT','N_TEXT','N_MTEXT','N_POINT'])
add(w,'实体统计',load('01C-实体统计.csv'),['图纸','空间','实体类型','数量'])
add(w,'图块清单',load('01D-图块清单.csv'),['图纸','块名','实体数量','参照数','嵌套INSERT数','外参标记','类型统计'])
SpreadsheetFile.export_xlsx(w).save(str(ROOT/'01-文件与图层清单.xlsx'))
print('EXPORTED inventory',flush=True)
b=Workbook.create()
add(b,'面积与长度校核',load('03A-面积尺寸比对.csv'),['图纸','PDF原始标注','比较项目','PDF标注值','CAD反算值','差值','相对误差%','CAD实体HANDLE','对照依据','校核等级'])
add(b,'各图平整统计',load('09-提取的空间数据/各图分级与面积统计.csv'),['图纸','平整范围闭合面数','平整范围面积合计(㎡假设)','折合亩(㎡假设)','等级A数量','等级B数量','等级C数量'])
add(b,'重叠问题',load('09-提取的空间数据/平整范围跨图及内部重叠.csv'),['图纸1','候选1','图纸2','候选2','重叠面积','问题'])
SpreadsheetFile.export_xlsx(b).save(str(ROOT/'03-图纸面积与尺寸校核.xlsx'))
print('EXPORTED area',flush=True)
for book,name in [(w,'inventory'),(b,'area')]:
 try:print(name,book.inspect({'kind':'sheet','include':'id,name'}).ndjson[:600],flush=True)
 except Exception as e:print(name,'inspect issue',str(e)[:150],flush=True)
