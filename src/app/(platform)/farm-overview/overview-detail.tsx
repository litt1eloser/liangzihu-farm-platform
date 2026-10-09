'use client';
import Link from 'next/link';
import {demoAlerts,demoCounts,demoItems,demoTasks} from './demo-fixture';
import styles from './farm-overview.module.css';

type Item={id:string;name:string;code:string;kind:string;version:number;boundary_status:string;geometry:unknown;object_source?:string;object_recorded_at?:string;boundary_source?:string|null;boundary_recorded_at?:string|null;regionId?:string;detail?:string;status?:string;metric?:string;sampledAt?:string};
type Region={id:string;name:string;links:{objectId:string}[]};
type Mobile={binding_id:string;object_id:string;machine_name:string;terminal_name:string;valid_until:string};
type Summary={object_id:string;open_alerts:number;record_count:number;point_count:number};
const labels:Record<string,string>={farm:'农场',field:'农田',pond:'塘口',facility:'固定设施',mobile:'机动设备',channel:'渠道'};
function Facts({rows}:{rows:{value:string|number;label:string}[]}){return <div className={styles.detailFacts}>{rows.map(row=><div key={row.label}><strong>{row.value}</strong><span>{row.label}</span></div>)}</div>;}
function time(value?:string|null){return value?new Date(value).toLocaleString('zh-CN'):'未提供';}
export default function OverviewDetail({mode,item,region,mobile,items,regions,summaries,mobileDevices,canConfigure,onClose,onExitDemo,onManageRegion,onSaveReturn}:{mode:'real'|'demo';item:Item|null;region:Region|null;mobile:Mobile|null;items:Item[];regions:Region[];summaries:Summary[];mobileDevices:Mobile[];canConfigure:boolean;onClose:()=>void;onExitDemo:()=>void;onManageRegion:()=>void;onSaveReturn:()=>void}){
 if(!item&&!region&&!mobile)return null;
 const demo=mode==='demo';
 const title=item?.name??region?.name??mobile?.machine_name??'';
 const kind=region?'片区':mobile?'机动设备':labels[item?.kind??'']??'农业对象';
 const regionForItem=item&&regions.find(row=>row.links.some(link=>link.objectId===item.id));
 const summary=summaries.find(row=>row.object_id===item?.id);
 const regionRows=region?items.filter(row=>region.links.some(link=>link.objectId===row.id)):[];
 const attention=demo?demoAlerts.find(row=>row.objectId===item?.id):null;
 const relatedTasks=demo?demoTasks.filter(row=>row.regionId===(region?.id??item?.regionId)):[];
 const farmFacts=[{label:'片区',value:regions.length},{label:'农田',value:items.filter(row=>row.kind==='field').length},{label:'塘口',value:items.filter(row=>row.kind==='pond').length},{label:'固定设施',value:items.filter(row=>row.kind==='facility').length},{label:'机动设备',value:demo?demoCounts.mobiles:mobileDevices.length}];
 const regionFacts=[{label:'农田',value:regionRows.filter(row=>row.kind==='field').length},{label:'塘口',value:regionRows.filter(row=>row.kind==='pond').length},{label:'固定设施',value:regionRows.filter(row=>row.kind==='facility').length}];
 return <aside className={styles.drawer} aria-label="对象详情" aria-live="polite"><div className={styles.drawerTop}><span className={styles.eyebrow}>{demo?'DEMO · SYNTHETIC':'AUTHORIZED DETAIL'}</span><button type="button" onClick={onClose} aria-label="关闭对象详情">×</button></div>
  <span className={styles.kind}>{kind}{demo?' · 演示':''}</span><h2>{title}</h2><p className={styles.detailContext}>{demo?'合成示例 · 非真实现场':region?'经营分组，不代表行政村边界':item&&regionForItem?`所属 ${regionForItem.name}`:mobile?'绑定归属来自原农机业务':'仅当前账号获授权资料'}</p>
  {item?.kind==='farm'&&<><Facts rows={farmFacts}/>{demo?<div className={styles.attention}>关注事项 · {demoAlerts.length} 条演示提醒<br/>{demoAlerts[0].text}</div>:<p className={styles.drawerHint}>已授权对象中有 {summaries.reduce((n,row)=>n+row.open_alerts,0)} 条未关闭告警；仅统计已有授权概要。</p>}</>}
  {region&&<><Facts rows={regionFacts}/><p className={styles.drawerHint}>共关联 {regionRows.length} 个可见农业对象；按关联对象边界定位，片区本身没有正式测绘边界。</p></>}
  {item?.kind==='field'&&<><p className={styles.businessLead}>{demo?item.detail:'暂无可信作物或生长阶段资料；进入原农事模块核对。'}</p><Facts rows={[{label:'农事记录',value:demo?'演示资料':summary?.record_count??'暂无可信数据'},{label:'关联测点',value:demo?'演示资料':summary?.point_count??'暂无可信数据'}]}/></>}
  {item&&!demo&&!item.geometry&&<p className={styles.detailContext}>待登记</p>}
  {item?.kind==='pond'&&<><p className={styles.businessLead}>{demo?item.detail:'暂无可信养殖品种资料。'}</p><p className={styles.metric}>{demo?item.metric:'暂无可信监测数据'}</p>{demo&&item.sampledAt&&<p className={styles.detailContext}>演示采样时间：{time(item.sampledAt)} · 非现场遥测</p>}</>}
  {item?.kind==='facility'&&<><p className={styles.businessLead}>{demo?item.detail:'暂无可信设备状态；设施对象与实体设备须分别登记。'}</p><p className={styles.metric}>{demo?`${item.status} · 演示状态`:'设备状态未知'}</p></>}
  {item?.kind==='mobile'&&<><p className={styles.businessLead}>{item.detail}</p><p className={styles.metric}>{item.status} · 演示状态</p><p className={styles.detailContext}>演示坐标，非真实 GPS；没有终端绑定或真实轨迹。</p></>}
  {mobile&&<><p className={styles.businessLead}>机具与定位终端：{mobile.terminal_name}</p><p className={styles.metric}>位置未知 · 无实时定位数据</p><p className={styles.detailContext}>绑定有效期至 {new Date(mobile.valid_until).toLocaleDateString('zh-CN')}；绑定归属不等于当前位置。</p></>}
  {item&&item.kind!=='farm'&&item.kind!=='mobile'&&!demo&&summary&&<p className={styles.drawerHint}>未关闭告警 {summary.open_alerts} · 农事记录 {summary.record_count} · 测点 {summary.point_count}</p>}
  {attention&&<div className={styles.attention}>{attention.text} · 演示提醒</div>}
  {relatedTasks.map(task=><p key={task.id} className={styles.drawerHint}>{task.text}</p>)}
  <div className={styles.drawerLinks}>{demo?<button type="button" onClick={onExitDemo}>退出演示，管理真实资料 ↗</button>:<>{item?.kind==='farm'&&<Link href="/objects">查看全部对象 ↗</Link>}{region&&canConfigure&&<button type="button" onClick={onManageRegion}>管理村庄与关联 ↗</button>}{item&&item.kind!=='farm'&&<Link href={`/objects/${item.id}`} onClick={onSaveReturn}>查看对象详情 ↗</Link>}{item?.kind==='field'&&<Link href="/records">查看农事记录 ↗</Link>}{item?.kind==='pond'&&<Link href="/alerts">查看告警与测点 ↗</Link>}{item?.kind==='facility'&&<Link href="/devices">查看关联设备 ↗</Link>}{mobile&&<Link href="/machinery">打开农机业务 ↗</Link>}{canConfigure&&item?.kind==='facility'&&<Link href="/devices#register">登记关联实体设备 ↗</Link>}</>}</div>
  <details className={styles.metadata}><summary>资料与记录</summary><dl><div><dt>编号</dt><dd>{item?.code??region?.id??mobile?.binding_id}</dd></div>{item&&<><div><dt>边界</dt><dd>{demo?'演示区域（非测绘边界）':item.geometry?item.boundary_status==='verified'?'已核实':'草稿，尚未核实':'边界待登记'}</dd></div><div><dt>版本</dt><dd>{item.version}</dd></div><div><dt>资料来源</dt><dd>{item.boundary_source??item.object_source??'未提供'}</dd></div><div><dt>记录时间</dt><dd>{time(item.boundary_recorded_at??item.object_recorded_at)}</dd></div></>}<div><dt>资料范围</dt><dd>{demo?'只读合成演示，不写入业务库':'仅当前账号获授权内容'}</dd></div></dl></details>
 </aside>;
}
