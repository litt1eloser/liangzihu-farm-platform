"""基于最终候选表和符号原位提取表生成可复核的重点疑点清单。
这不是设施实体清单；设施符号全集另见 09-设施图块与插入位置待核实.csv。
"""
import csv
from pathlib import Path
P=Path('/mnt/data/梁子湖竣工图提取成果')
G=P/'09-提取的空间数据'
objs=list(csv.DictReader((P/'02-农业空间对象清单.csv').open(encoding='utf-8-sig')))
blocks=list(csv.DictReader((G/'设施图块与插入位置待核实.csv').open(encoding='utf-8-sig')))
rows=[];seen=set()
def add(ref,source,layer,handle,kind,problem,check,grade,xx='',yy=''):
 key=(source,handle,kind)
 if key in seen:return
 seen.add(key)
 rows.append({'疑点ID':ref,'来源图纸':source,'源图层':layer,'原始实体HANDLE':handle,'对象类别/图块':kind,'问题类型':problem,'人工核实事项':check,'当前可信等级':grade,'CAD原始X':xx,'CAD原始Y':yy})
for r in objs:
 if r['可信等级']=='C':
  msg=r['疑点'] or '仅有图形/地类表意，不足以确认为独立农业业务对象'
  add(r['记录ID'],r['来源图纸'],r['源图层'],r['源实体HANDLE'],r['对象类别'],msg,'查对源图颜色、填充、图签与现场资产，不能自动入生产',r['可信等级'],r['最小X'],r['最小Y'])
 elif r['对象类别']=='土地平整施工范围' and not r['文本关联']:
  add(r['记录ID'],r['来源图纸'],r['源图层'],r['源实体HANDLE'],r['对象类别'],'施工范围缺少一对一文字编号','确认其属于哪一片平整区；不能以最近标注强制赋编号','B',r['最小X'],r['最小Y'])
for h in ('2CEE','2CEF'):
 rr=next(x for x in objs if x['来源图纸']=='ABCDEFD区竣工图.dxf' and x['源实体HANDLE']==h)
 add(rr['记录ID'],rr['来源图纸'],rr['源图层'],h,rr['对象类别'],'平-1与平-2部分相交约25.229 CAD平方单位','核对是否同一范围重绘/内嵌；统计面积前消除重复计量但不覆盖源几何',rr['可信等级'],rr['最小X'],rr['最小Y'])
for b in blocks:
 if b['插入点落在主体范围']=='True':continue
 add(b['来源图纸']+'__'+b['源HANDLE'],b['来源图纸'],b['源图层'],b['源HANDLE'],b['块名称'],'INSERT原始插入坐标远离主体图形范围；不等于设备地理位置','优先核对块变换矩阵、布局/外部参照、原DWG及图纸设施表达','C',b['插入X原值'],b['插入Y原值'])
with (P/'06-可疑对象与待核实清单.csv').open('w',newline='',encoding='utf-8-sig') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
print('重点疑点行数',len(rows), '候选C',sum(x['可信等级']=='C' for x in objs),'坐标离群块',sum(x['插入点落在主体范围']!='True' for x in blocks))
