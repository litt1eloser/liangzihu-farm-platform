// Deterministic, read-only presentation data. IDs and coordinates never enter business APIs.
export type DemoGeometry={type:'Polygon'|'Point';coordinates:number[][][]|number[]};
export type DemoItem={id:string;name:string;code:string;kind:'farm'|'field'|'pond'|'facility'|'mobile';regionId?:string;geometry:DemoGeometry|null;detail:string;status:string;metric?:string;sampledAt?:string;object_source:string;object_recorded_at:string;boundary_status:'draft'|'unknown';version:1};
export type DemoRegion={id:string;farmId:string;name:string;version:number;archivedAt:null;links:{objectId:string}[]};
const date='2026-10-09T08:00:00+08:00';
const polygon=(lon:number,lat:number):DemoGeometry=>({type:'Polygon',coordinates:[[[lon-.006,lat-.004],[lon+.006,lat-.004],[lon+.006,lat+.004],[lon-.006,lat+.004],[lon-.006,lat-.004]]]});
const point=(lon:number,lat:number):DemoGeometry=>({type:'Point',coordinates:[lon,lat]});
const base={object_source:'D3.1 合成演示 fixture；非测绘、非现场资料',object_recorded_at:date,boundary_status:'draft' as const,version:1 as const};
const item=(id:string,name:string,kind:DemoItem['kind'],regionId:string|undefined,geometry:DemoGeometry|null,detail:string,status:string,metric?:string):DemoItem=>({id:`demo:${id}`,code:`演示-${id}`,name,kind,regionId,geometry,detail,status,metric,sampledAt:metric?date:undefined,...base});
export const demoItems:DemoItem[]=[
 item('farm:main','梁子湖农场（演示总览）','farm',undefined,null,'3 个虚构演示经营片区；不代表现场经营权属','只读演示'),
 item('field:01','沙湾东片水稻田','field','demo:region:sawan',polygon(114.56,30.29),'演示作物：水稻 · 演示阶段：分蘖期','演示地块'),
 item('field:02','沙湾北片农田','field','demo:region:sawan',polygon(114.575,30.305),'演示作物：水稻 · 演示阶段：育秧期','演示地块'),
 item('pond:01','沙湾养殖塘 A','pond','demo:region:sawan',polygon(114.583,30.283),'演示养殖：淡水鱼','演示水质','演示溶解氧 6.1 mg/L'),
 item('facility:01','沙湾 1 号水闸','facility','demo:region:sawan',point(114.578,30.287),'演示开度 65%；没有控制指令','模拟运行'),
 item('field:03','长岭南片水田','field','demo:region:changling',polygon(114.71,30.32),'演示作物：水稻 · 演示阶段：抽穗期','演示地块'),
 item('field:04','长岭道路东试验田','field','demo:region:changling',polygon(114.728,30.335),'演示作物：试验水稻 · 演示阶段：观察期','演示地块'),
 item('pond:02','长岭养殖塘 B','pond','demo:region:changling',polygon(114.739,30.313),'演示养殖：淡水鱼；关联 1 条演示提醒','演示溶氧偏低','演示溶解氧 4.2 mg/L · 水温 25.1 °C'),
 item('facility:02','长岭泵站','facility','demo:region:changling',point(114.724,30.31),'演示泵站；没有控制指令','模拟待命'),
 item('facility:03','长岭水质监测桩','facility','demo:region:changling',point(114.742,30.319),'演示监测设施；读数不来自真实终端','模拟采样'),
 item('field:05','湖东示范田','field','demo:region:hudong',polygon(114.87,30.275),'演示作物：水稻 · 演示阶段：成熟期','演示地块'),
 item('pond:03','湖东养殖塘 C','pond','demo:region:hudong',polygon(114.891,30.287),'演示养殖：淡水鱼','演示水质','演示溶解氧 5.8 mg/L'),
 item('facility:04','湖东 2 号水闸','facility','demo:region:hudong',point(114.883,30.272),'演示灌排设施；没有控制指令','模拟待命'),
 item('mobile:01','植保无人机 U-01','mobile','demo:region:sawan',point(114.595,30.3),'登记归属：沙湾示范片区；演示坐标，非真实 GPS','演示待命'),
 item('mobile:02','收割机 H-01','mobile','demo:region:hudong',point(114.865,30.285),'登记归属：湖东示范片区；演示坐标，非真实 GPS','演示作业中'),
];
export const demoRegions:DemoRegion[]=[
 {id:'demo:region:sawan',farmId:'demo:farm:main',name:'沙湾示范片区',version:1,archivedAt:null,links:[]},
 {id:'demo:region:changling',farmId:'demo:farm:main',name:'长岭示范片区',version:1,archivedAt:null,links:[]},
 {id:'demo:region:hudong',farmId:'demo:farm:main',name:'湖东示范片区',version:1,archivedAt:null,links:[]},
].map(region=>({...region,links:demoItems.filter(row=>row.regionId===region.id).map(row=>({objectId:row.id}))}));
export const demoAlerts=[{id:'demo:attention:01',objectId:'demo:pond:02',text:'长岭养殖塘 B：演示溶氧偏低'}];
export const demoTasks=[{id:'demo:task:01',regionId:'demo:region:sawan',text:'沙湾田间巡查 · 演示任务'},{id:'demo:task:02',regionId:'demo:region:hudong',text:'湖东灌排设施巡检 · 演示任务'}];
export const demoCounts={regions:demoRegions.length,fields:demoItems.filter(row=>row.kind==='field').length,ponds:demoItems.filter(row=>row.kind==='pond').length,facilities:demoItems.filter(row=>row.kind==='facility').length,mobiles:demoItems.filter(row=>row.kind==='mobile').length,alerts:demoAlerts.length,tasks:demoTasks.length};
