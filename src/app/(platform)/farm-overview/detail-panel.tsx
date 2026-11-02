'use client';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {demoAlerts,demoTasks} from './demo-fixture';
import KindIcon from './kind-icon';
import {resolveBusinessClass,resolveActiveTab,tabsFor,recordFiltersFor,scopeBadge,classLabels,type BusinessClass,type DetailTabId,type RecordFilter} from './detail-classes';
import {groupByMetric,factLabels,currentBatch,buildTopIndicators,selectOpeningView,orderGateMetrics,currentAlerts,severityLabel,type PointView,type SectionRequestState} from './detail-data';
import {boundaryAreaSqm,formatArea,areaPresentation} from './detail-area';
import {useObjectDetail} from './use-object-detail';
import {usePointHistory,type TrendWindow} from './use-point-history';
import TimeSeries from '@/components/platform/time-series';
import styles from './farm-overview.module.css';

type Item={id:string;farm_id?:string;farmId?:string;symbol?:string;name:string;code:string;kind:string;version:number;boundary_status:string;geometry:unknown;object_source?:string;object_recorded_at?:string;boundary_source?:string|null;boundary_recorded_at?:string|null;regionId?:string;detail?:string;status?:string;metric?:string;sampledAt?:string};
type Region={id:string;farmId:string;name:string;links:{objectId:string}[]};
type Mobile={binding_id:string;object_id:string;machine_name:string;terminal_name:string;valid_until:string};
type Summary={object_id:string;open_alerts:number;record_count:number;point_count:number};

function Facts({rows}:{rows:{value:string|number;label:string}[]}){return <div className={styles.detailFacts}>{rows.map(row=><div key={row.label}><strong>{row.value}</strong><span>{row.label}</span></div>)}</div>;}
function time(value?:string|null){return value?new Date(value).toLocaleString('zh-CN'):'未提供';}

// F07 单测点轻量趋势预览：24h/7d 切换、一次只展开一条、缺口断点与质量标识由 TimeSeries 承担。
function PointTrend({point}:{point:PointView}){
 const [win,setWin]=useState<TrendWindow>('24h');
 const trend=usePointHistory(point.id,win);
 return <div className={styles.trendBox}>
  <div className={styles.recordFilters} role="group" aria-label="趋势时间范围">
   <button type="button" aria-pressed={win==='24h'} className={win==='24h'?styles.activeFilter:''} onClick={()=>setWin('24h')}>24 小时</button>
   <button type="button" aria-pressed={win==='7d'} className={win==='7d'?styles.activeFilter:''} onClick={()=>setWin('7d')}>7 天</button>
  </div>
  {trend.status==='loading'&&<p className={styles.drawerHint}>正在读取历史…</p>}
  {trend.status==='denied'&&<p className={styles.drawerHint}>暂不可查看：没有该测点历史的查看权限。</p>}
  {trend.status==='error'&&<p className={styles.drawerHint}>历史读取失败。<button type="button" onClick={trend.retry}>重试</button></p>}
  {trend.status==='empty'&&<p className={styles.drawerHint}>该时段暂无监测记录{win==='24h'?'；可切换 7 天查看':''}。</p>}
  {trend.status==='ready'&&<TimeSeries points={trend.points} unit={trend.unit||point.unit} maxGapMs={trend.maxGapMs} title={point.name}/>}
 </div>;
}

// 统一右侧详情框架（F01）：身份标题 + 业务摘要插槽 + 三标签 + 真实完整档案入口。
// 只做展示分发；缺少后端可信数据时显示明确空态，不伪造数值。
export default function DetailPanel({mode,item,region,mobile,items,regions,summaries,mobileDevices,canConfigure,tab,recordFilter,density,onTab,onRecordFilter,onDensity,onClose,onLocate,onExitDemo,onManageRegion,onSaveReturn,onChangeRegion}:{mode:'real'|'demo';item:Item|null;region:Region|null;mobile:Mobile|null;items:Item[];regions:Region[];summaries:Summary[];mobileDevices:Mobile[];canConfigure:boolean;tab:DetailTabId;recordFilter:RecordFilter;density:'summary'|'full';onTab:(tab:DetailTabId)=>void;onRecordFilter:(filter:RecordFilter)=>void;onDensity:(density:'summary'|'full')=>void;onClose:()=>void;onLocate?:()=>void;onExitDemo:()=>void;onManageRegion:()=>void;onSaveReturn:()=>void;onChangeRegion?:(item:Item)=>void}){
 const cls:BusinessClass|null=item?resolveBusinessClass(item,mode==='demo'):null;
 const tabs=useMemo(()=>{if(region||mobile)return[{id:'basic' as const,label:'基本信息'},{id:'records' as const,label:'相关记录'}];return cls?tabsFor(cls):[];},[cls,region,mobile]);
 const activeTab=cls?resolveActiveTab(tab,cls):'basic';
 const demo=mode==='demo';
 // F03：真实对象的测点/告警按需读取；演示对象不请求正式接口。
 const detail=useObjectDetail(item&&!demo?item.id:null,true);
 // F06：记录展开属业务局部交互，一次一条，切换对象即清空（同类保留标签的规则在 F02 已落实）。
 const [expandedRecordId,setExpandedRecordId]=useState<string|null>(null);
 const [expandedPointId,setExpandedPointId]=useState<string|null>(null);
 useEffect(()=>{setExpandedRecordId(null);setExpandedPointId(null);},[item?.id]);
 const openAlerts=currentAlerts(detail.alertViews);
 const locateAlert=(id:string)=>{onDensity('full');onTab('records');onRecordFilter('alert');setExpandedRecordId(id);};
 // F06 顶部当前告警条：仅在可信查询成功且确有 open 事件时出现；读取失败明确「无法确认」，不冒充无告警。
 const alertSlot=<>{detail.alertState==='ready'?openAlerts.length>0&&<div className={styles.attention}>当前告警 {openAlerts.length} 条：{openAlerts[0].title} <button type="button" onClick={()=>locateAlert(openAlerts[0].id)}>查看</button></div>:detail.alertState==='error'?<p className={styles.drawerHint}>当前重要告警状态无法确认（读取失败）。<button type="button" onClick={detail.retry}>重试</button></p>:null}</>;
 if(!item&&!region&&!mobile)return null;
 const title=item?.name??region?.name??mobile?.machine_name??'';
 const kindLabel=region?'片区':mobile?'机动设备':cls?classLabels[cls]:'农业对象';
 const regionForItem=item&&regions.find(row=>row.links.some(link=>link.objectId===item.id));
 const summary=item?summaries.find(row=>row.object_id===item.id):undefined;
 const regionRows=region?items.filter(row=>region.links.some(link=>link.objectId===row.id)):[];
 const farmId=item?.kind==='farm'?item.id:null;
 const ownerFarmId=item?item.farm_id??item.farmId??(item.kind==='farm'?item.id:null):region?.farmId??null;
 const ownerFarm=ownerFarmId?items.find(row=>row.id===ownerFarmId)??null:null;
 const farmItems=farmId?items.filter(row=>(row.farm_id??row.farmId??(row.kind==='farm'?row.id:null))===farmId):[];
 const farmItemIds=new Set(farmItems.map(row=>row.id));
 const farmAlerts=demo?demoAlerts.filter(row=>farmItemIds.has(row.objectId)):[];
 const farmFacts=[{label:'片区',value:regions.filter(row=>row.farmId===farmId).length},{label:'农田',value:farmItems.filter(row=>row.kind==='field').length},{label:'塘口',value:farmItems.filter(row=>row.kind==='pond').length},{label:'固定设施',value:farmItems.filter(row=>row.kind==='facility').length},{label:'机动设备',value:demo?farmItems.filter(row=>row.kind==='mobile').length:mobileDevices.filter(row=>farmItemIds.has(row.object_id)).length}];
 const regionFacts=[{label:'农田',value:regionRows.filter(row=>row.kind==='field').length},{label:'塘口',value:regionRows.filter(row=>row.kind==='pond').length},{label:'固定设施',value:regionRows.filter(row=>row.kind==='facility').length}];
 const demoRecords=demo?[...demoAlerts.filter(row=>row.objectId===item?.id).map(row=>({id:row.id,cat:'alert' as const,text:row.text+' · 演示提醒'})),...demoTasks.filter(row=>row.regionId===(region?.id??item?.regionId)).map(row=>({id:row.id,cat:'inspection' as const,text:row.text}))]:[];
 const shownRecords=demoRecords.filter(row=>recordFilter==='all'||row.cat===recordFilter);

 const summarySlot=(()=>{
  if(region)return <><Facts rows={regionFacts}/><p className={styles.drawerHint}>共关联 {regionRows.length} 个可见农业对象；按关联对象边界定位，片区本身没有正式测绘边界。</p></>;
  if(mobile)return <><p className={styles.businessLead}>机具与定位终端：{mobile.terminal_name}</p><p className={styles.metric}>位置未知 · 无实时定位数据</p><p className={styles.detailContext}>绑定有效期至 {new Date(mobile.valid_until).toLocaleDateString('zh-CN')}；绑定归属不等于当前位置。</p></>;
  if(!item||!cls)return null;
  if(cls==='farm')return <><Facts rows={farmFacts}/>{demo?<div className={styles.attention}>关注事项 · {farmAlerts.length} 条演示提醒{farmAlerts[0]&&<><br/>{farmAlerts[0].text}</>}</div>:<p className={styles.drawerHint}>本农场已授权对象中有 {summaries.filter(row=>farmItemIds.has(row.object_id)).reduce((n,row)=>n+row.open_alerts,0)} 条未关闭告警；仅统计已有授权概要。</p>}</>;
  if(demo)return <><p className={styles.businessLead}>{item.detail}</p>{item.metric&&<p className={styles.metric}>{item.metric}</p>}{item.sampledAt&&<p className={styles.detailContext}>演示采样时间：{time(item.sampledAt)} · 非现场遥测</p>}{item.status&&cls!=='field'&&cls!=='pond'&&<p className={styles.detailContext}>{item.status} · 演示状态</p>}</>;
  if(cls==='field'||cls==='pond'){
   // R02-B（V1 顺序）：面积主值 → 当前生产/当前养殖 → 生长阶段（农田独立卡片）→ 塘口指标 → 告警 → 计数。
   const area=formatArea(boundaryAreaSqm(item.geometry));
   const areaText=area?areaPresentation(item):null;
   const batch=currentBatch(detail.batches,item.id);
   const slots=cls==='pond'?buildTopIndicators(detail.pointViews,2):[];
   const productionText=detail.batchState==='loading'?'正在读取生产批次…':detail.batchState==='denied'?'暂不可查看：没有生产批次的查看权限。':detail.batchState==='error'?'读取失败':batch.state==='trusted'&&batch.batch?`${batch.batch.species}${batch.batch.variety?`（${batch.batch.variety}）`:''}${cls==='pond'?` · ${batch.batch.stage}`:''}`:batch.state==='pending'?(cls==='field'?'资料待核实':'养殖资料待核实'):'暂无登记';
   const stageText=detail.batchState==='loading'?'正在读取…':detail.batchState==='denied'?'暂不可查看':detail.batchState==='error'?'读取失败':batch.state==='trusted'&&batch.batch?batch.batch.stage:batch.state==='pending'?'资料待核实':'暂无登记';
   return <>
    <div className={styles.bizCards}>
     <div className={styles.bizCard}><span>{areaText?areaText.label:(cls==='field'?'面积':'面积')}</span><strong>{area&&areaText?area.mu:(cls==='field'?'暂无参考面积':'暂无可信范围面积')}</strong>{area&&areaText&&<small>{area.sqm}</small>}</div>
     <div className={styles.bizCard}><span>{cls==='field'?'当前生产':'当前养殖'}</span><strong>{productionText}</strong>{detail.batchState==='error'&&<button type="button" className={styles.cardRetry} onClick={detail.retry}>重试</button>}</div>
     {cls==='field'&&<div className={styles.bizCard}><span>生长阶段</span><strong>{stageText}</strong></div>}
    </div>
    {area&&areaText&&<p className={styles.detailContext}>{areaText.note}</p>}
    {cls==='pond'&&slots.map(slot=>slot.kind==='single'?<p key={slot.view.id} className={styles.metric}>{slot.view.name} {slot.view.value} {slot.view.valueUnit??slot.view.unit}{slot.view.sampledAt&&<><br/><small>采样 {time(slot.view.sampledAt)}</small></>}</p>:<p key={slot.metric} className={styles.drawerHint}>{slot.metric}：{slot.count} 个测点，未指定代表测点 <button type="button" onClick={()=>onTab('monitoring')}>查看详情</button></p>)}
    {alertSlot}
   </>;
  }
  if(cls==='gate'){
   // F05 水闸摘要：实际开度只取可信 opening；多测点无代表不合成；set_opening 不出现在摘要。
   const opening=selectOpeningView(detail.pointViews);
   return <>
    <div className={styles.bizCards}>
     <div className={styles.bizCard}><span>实际开度</span><strong>{detail.measurementState==='loading'?'正在读取…':opening.kind==='single'&&opening.view?`${opening.view.value} ${opening.view.valueUnit??'%'}`:opening.kind==='multiple'?'多个测点，未指定代表':'暂无已核实测点'}</strong>{opening.kind==='single'&&opening.view?.sampledAt&&<small>采样 {time(opening.view.sampledAt)}</small>}</div>
     <div className={styles.bizCard}><span>数据上报</span><strong>待确认</strong></div>
    </div>
    {detail.alertState==='ready'?(openAlerts.length>0?alertSlot:<p className={styles.detailContext}>当前重要告警：暂无（仅表示本次可信查询无 open 事件，不代表设备正常）。</p>):alertSlot}
   </>;
  }
  if(cls==='pump_station')return <><div className={styles.bizCards}><div className={styles.bizCard}><span>泵组运行概况</span><strong>机组档案尚未核实</strong></div><div className={styles.bizCard}><span>数据上报</span><strong>待确认</strong></div></div>{detail.alertState==='ready'?(openAlerts.length>0?alertSlot:<p className={styles.detailContext}>当前重要告警：暂无（仅表示本次可信查询无 open 事件，不代表设备正常）。</p>):alertSlot}</>;
  return null;
 })();

 // F03 测量分区：按「指标→测点」展示，局部失败隔离与重试，不重置地图。
 const measurementSection=(title:string,ordered?:PointView[],expandable=true)=>{
  const {measurementState,pointViews,retry}=detail;
  const views=ordered??pointViews;
  if(measurementState==='loading')return <p className={styles.drawerHint}>正在读取测点与当前值…</p>;
  if(measurementState==='denied')return <p className={styles.drawerHint}>暂不可查看：没有该对象测点的查看权限。</p>;
  if(measurementState==='error')return <p className={styles.drawerHint}>测点资料读取失败。<button type="button" onClick={retry}>重试</button></p>;
  if(!views.length)return <p className={styles.drawerHint}>暂无关联测点。</p>;
  return <>
   {measurementState==='partial'&&<p className={styles.drawerHint}>部分数据读取失败，当前值可能不完整。<button type="button" onClick={retry}>重试</button></p>}
   {groupByMetric(views).map(group=><section key={group.metric} className={styles.detailSection}><h3>{group.metric}</h3><div className={styles.pointList}>{group.points.map(point=><div key={point.id} className={styles.pointRow}>
    {expandable?<button type="button" className={styles.pointRowButton} aria-expanded={expandedPointId===point.id} onClick={()=>setExpandedPointId(expandedPointId===point.id?null:point.id)}><span>{point.name}</span><strong>{point.fact==='trusted'?<>{point.value} {point.valueUnit??point.unit}{point.sampledAt&&<small className={styles.pointTime}>采样 {time(point.sampledAt)}</small>}</>:point.reason}</strong></button>:<div className={styles.pointRowButton}><span>{point.name}</span><strong>{point.fact==='trusted'?<>{point.value} {point.valueUnit??point.unit}{point.sampledAt&&<small className={styles.pointTime}>采样 {time(point.sampledAt)}</small>}</>:point.reason}</strong></div>}
    {expandable&&expandedPointId===point.id&&<PointTrend point={point}/>}
   </div>)}</div></section>)}
  </>;
 };

 const middleTabBody=(()=>{
  if(!item||!cls)return null;
  if(activeTab==='production'){
   if(demo)return <div className={styles.detailTabBody}><p className={styles.businessLead}>{item.detail??'演示生产资料'}</p></div>;
   const batch=currentBatch(detail.batches,item.id);
   return <div className={styles.detailTabBody}>
    {detail.batchState==='loading'?<p className={styles.drawerHint}>正在读取生产批次…</p>:detail.batchState==='denied'?<p className={styles.drawerHint}>当前账号无权读取生产批次。</p>:detail.batchState==='error'?<p className={styles.drawerHint}>生产批次读取失败。<button type="button" onClick={detail.retry}>重试</button></p>:batch.state==='trusted'&&batch.batch?<dl className={styles.detailList}><div><dt>当前作物</dt><dd>{batch.batch.species}{batch.batch.variety?`（${batch.batch.variety}）`:''}</dd></div><div><dt>生长阶段</dt><dd>{batch.batch.stage}</dd></div><div><dt>批次编号</dt><dd>{batch.batch.code}</dd></div><div><dt>开始时间</dt><dd>{time(batch.batch.started_at)}</dd></div><div><dt>登记来源</dt><dd>{batch.batch.source}</dd></div></dl>:batch.state==='pending'&&batch.batch?<p className={styles.drawerHint}>{batch.reason}：{batch.batch.species} · {batch.batch.stage}。</p>:<p className={styles.drawerHint}>暂无生产批次登记。</p>}
    <p className={styles.detailContext}>{summary?`农事记录 ${summary.record_count} · 关联测点 ${summary.point_count}`:'暂无关联记录'}</p>
   </div>;
  }
  if(activeTab==='monitoring')return <div className={styles.detailTabBody}>{demo?<><p className={styles.businessLead}>{item.detail??'演示水体资料'}</p>{item.metric&&<p className={styles.metric}>{item.metric}</p>}</>:measurementSection('水体监测')}{!demo&&<p className={styles.drawerHint}>同一指标的多个测点分别显示，不做合并。</p>}</div>;
  if(activeTab==='operation'){
   if(demo)return <div className={styles.detailTabBody}><p className={styles.businessLead}>{item.detail}</p><p className={styles.metric}>{item.status} · 演示状态</p></div>;
   if(cls==='gate')return <div className={styles.detailTabBody}>
    {measurementSection('运行信息',orderGateMetrics(detail.pointViews))}
    {detail.pointViews.some(point=>point.metric==='set_opening')&&<p className={styles.detailContext}>设置开度为设备上报的设置值，不代表本平台下发指令；未安装的指标不显示。</p>}
    <p className={styles.drawerHint}>本页面只读，不提供控制操作。</p>
   </div>;
   return <div className={styles.detailTabBody}>
    <p className={styles.businessLead}>机组：档案尚未核实，暂不统计运行台数。</p>
    <p className={styles.drawerHint}>未确认的设备不计入机组；无证据的状态保持未知。</p>
    <section className={styles.detailSection}><h3>站级监测</h3>{measurementSection('站级监测')}</section>
    <p className={styles.drawerHint}>本页面只读，不提供控制操作。</p>
   </div>;
  }
  if(activeTab==='devices')return <div className={styles.detailTabBody}>{item.kind==='facility'&&<p className={styles.detailContext}>设施对象与实体设备须分别登记；设备详情进入设备台账核对。</p>}{measurementSection('关联设备',undefined,false)}{item.kind==='facility'&&<Link href="/devices">查看关联设备 ↗</Link>}{canConfigure&&item.kind==='facility'&&<Link href="/devices#register">登记关联实体设备 ↗</Link>}</div>;
  return null;
 })();

 return <aside className={density==='summary'?`${styles.drawer} ${styles.drawerSummary}`:styles.drawer} data-density={density} aria-label="对象详情" aria-live="polite">
  <div className={styles.drawerTop}><div className={styles.detailHeading}><KindIcon kind={cls==='gate'||cls==='pump_station'?'facility':item?.kind??(region?'region':undefined)} className={styles.detailKindIcon}/><h2>{title}</h2></div><div className={styles.drawerTopActions}>{density==='full'&&<button type="button" className={styles.collapseButton} onClick={()=>onDensity('summary')}>收回概要</button>}<button type="button" onClick={onClose} aria-label="关闭对象详情" title="收起右侧详情栏">×</button></div></div>
  <div className={styles.detailBadges}><span className={styles.kind}>{kindLabel}{demo?' · 演示':''}</span>{item&&cls&&<span className={styles.statusBadge} data-status={demo?(item.geometry?(item.boundary_status==='verified'?'已核实':'草稿'):'待登记'):scopeBadge(cls,item).status}>{demo?(item.geometry?(item.boundary_status==='verified'?'已核实':'草稿'):'待登记'):scopeBadge(cls,item).text}</span>}{cls==='generic'&&item?.kind==='facility'&&!demo&&<span className={styles.statusBadge} data-status="待登记">子类未核实</span>}</div>
  <p className={styles.detailContext}>{demo?'合成示例 · 非真实现场':region?'经营分组，不代表行政村边界':item&&regionForItem?`所属 ${regionForItem.name}`:mobile?'绑定归属来自原农机业务':cls==='generic'&&item?.kind==='facility'?'设施类型尚未核实，按通用设施显示':'仅当前账号获授权资料'}</p>
  {summarySlot}
  {density==='summary'?<div className={styles.summaryActions}><button type="button" className={styles.expandButton} onClick={()=>onDensity('full')}>查看详细资料</button>{onLocate&&<button type="button" className={styles.locateButton} onClick={onLocate}>定位当前对象</button>}</div>:<>
  <div className={styles.detailTabs} role="tablist" aria-label="对象资料分区">
   {tabs.map(row=><button key={row.id} type="button" role="tab" aria-selected={activeTab===row.id} className={activeTab===row.id?styles.activeTab:''} onClick={()=>onTab(row.id)}>{row.label}</button>)}
  </div>
  {activeTab==='basic'&&<div className={styles.detailTabBody}>
   {(item||region)&&<section className={styles.detailSection}><div className={styles.detailSectionHeader}><h3>基本信息</h3>{!demo&&item&&item.kind!=='farm'&&<Link href={`/objects/${item.id}`} onClick={onSaveReturn}>编辑</Link>}</div>{region&&<p className={styles.drawerHint}>经营分组详情请在村庄管理中维护。</p>}{item&&!demo&&<p className={styles.drawerHint}>相关管理资料尚未登记（负责人、主要用途、现场位置说明等登记后在此展示）。</p>}{item&&demo&&<p className={styles.drawerHint}>演示对象，无正式管理资料。</p>}</section>}
   {mobile&&<section className={styles.detailSection}><h3>绑定信息</h3><p className={styles.businessLead}>机具与定位终端：{mobile.terminal_name}</p><p className={styles.detailContext}>绑定有效期至 {time(mobile.valid_until)}；绑定归属不等于当前位置。</p></section>}
   {item&&<details className={styles.moreActions}><summary>资料依据</summary><dl className={styles.detailList}><div><dt>对象编号</dt><dd>{item.code}</dd></div>{ownerFarm&&<div><dt>所属农场</dt><dd>{ownerFarm.name}</dd></div>}{item&&cls&&<div><dt>{cls==='gate'||cls==='pump_station'||cls==='generic'?'位置状态':'范围状态'}</dt><dd>{demo?'演示区域（非测绘边界）':scopeBadge(cls,item).text}</dd></div>}<div><dt>登记依据</dt><dd>{item.boundary_source??item.object_source??'未提供'}</dd></div><div><dt>记录时间</dt><dd>{time(item.boundary_recorded_at??item.object_recorded_at)}</dd></div><div><dt>版本</dt><dd>{item.version}</dd></div></dl></details>}
  </div>}
  {middleTabBody}
  {activeTab==='records'&&<div className={styles.detailTabBody}>
   <div className={styles.recordFilters} role="group" aria-label="记录类别筛选">{recordFiltersFor(region?'region':mobile?'mobile':cls??'generic').map(row=><button key={row.id} type="button" className={recordFilter===row.id?styles.activeFilter:''} aria-pressed={recordFilter===row.id} onClick={()=>onRecordFilter(row.id)}>{row.label}</button>)}</div>
   {demo?(shownRecords.length?shownRecords.map(row=><p key={row.id} className={styles.drawerHint}>{row.text}</p>):<p className={styles.drawerHint}>该类别暂无演示记录。</p>):(()=>{
    const {alertState,alertViews,retry}=detail;
    if(recordFilter!=='all'&&recordFilter!=='alert')return <p className={styles.drawerHint}>该类别记录暂未接入查询，接入后在此展示。</p>;
    if(alertState==='loading')return <p className={styles.drawerHint}>正在读取相关记录…</p>;
    if(alertState==='denied')return <p className={styles.drawerHint}>暂不可查看：没有该对象相关记录的查看权限。</p>;
    if(alertState==='error')return <p className={styles.drawerHint}>相关记录读取失败。<button type="button" onClick={retry}>重试</button></p>;
    if(!alertViews.length)return <p className={styles.drawerHint}>{recordFilter==='alert'?'暂无告警记录。':'已接入的记录中暂无内容；其他类别暂未接入查询。'}</p>;
    return <>{alertViews.map(row=><div key={row.id} className={styles.recordItem}>
     <button type="button" className={styles.recordItemButton} aria-expanded={expandedRecordId===row.id} onClick={()=>setExpandedRecordId(expandedRecordId===row.id?null:row.id)}><strong>{row.title}</strong><span>{severityLabel(row.severity)} · {row.current?'当前':'已恢复'}</span></button>
     {expandedRecordId===row.id&&<div className={styles.recordDetail}><dl className={styles.detailList}><div><dt>类别</dt><dd>告警</dd></div><div><dt>业务状态</dt><dd>{row.current?'当前':'已恢复'}</dd></div><div><dt>严重程度</dt><dd>{severityLabel(row.severity)}</dd></div></dl><Link href={`/alerts/${row.id}`}>查看完整告警 ↗</Link></div>}
    </div>)}<p className={styles.drawerHint}>已恢复告警仅作历史展示。{recordFilter==='all'&&alertViews.length>0?'其他类别暂未接入查询。':''}</p></>;
   })()}
  </div>}
  <div className={styles.drawerActions}>{demo?<button type="button" onClick={onExitDemo}>退出演示，管理真实资料 ↗</button>:<>{item?.kind==='farm'&&<Link href="/objects">查看全部对象 ↗</Link>}{region&&canConfigure&&<button type="button" onClick={onManageRegion}>管理村庄与关联 ↗</button>}{item&&item.kind!=='farm'&&<Link href={`/objects/${item.id}`} onClick={onSaveReturn}>查看对象台账 ↗</Link>}{item&&item.kind!=='farm'&&item.kind!=='mobile'&&<details className={styles.moreActions}><summary>更多</summary><div className={styles.drawerLinks}>{canConfigure&&item&&['field','pond'].includes(item.kind)&&<Link href={`/map-editor?object=${item.id}`} onClick={onSaveReturn}>{item.geometry?'编辑边界':'登记边界'}</Link>}{canConfigure&&item&&onChangeRegion&&<button type="button" onClick={()=>onChangeRegion(item)}>更改所属村庄</button>}{item?.kind==='field'&&<Link href="/records">查看农事记录 ↗</Link>}{item?.kind==='pond'&&<Link href="/alerts">查看告警与测点 ↗</Link>}{item?.kind==='facility'&&<Link href="/devices">查看关联设备 ↗</Link>}{canConfigure&&item?.kind==='facility'&&<Link href="/devices#register">登记关联实体设备 ↗</Link>}</div></details>}{mobile&&<Link href="/machinery">打开农机业务 ↗</Link>}</>}{onLocate&&<button type="button" className={styles.locateButton} onClick={onLocate}>定位当前对象</button>}</div>
  </>}
 </aside>;
}
