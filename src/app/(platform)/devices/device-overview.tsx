'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useApi} from '@/components/platform/use-api';
import styles from './devices.module.css';

type Device={id:string;name:string;kind:string;model:string|null;external_id:string;verified:boolean;object_id:string;object_name:string};
type Point={id:string;code:string;name:string;device_id:string;metric:string;unit:string};
type Current={pointId:string;current:{value:number|null;unit:string|null;quality:string|null;sampledAt:string|null;reasons:string[]|null}|null};
const qualityLabel:Record<string,string>={valid:'有效采样',suspect:'采样可疑',invalid:'无效采样',stale:'采样已过期',missing:'数据缺失'};
function sampleTime(iso:string){const date=new Date(iso);return Number.isNaN(date.getTime())?'采样时间待核对':date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});}
function relativeTime(iso:string){const diff=Date.now()-Date.parse(iso);if(!Number.isFinite(diff)||diff< -60000)return '时间待核对';const minutes=Math.floor(Math.max(0,diff)/60000);if(minutes<1)return '刚刚';if(minutes<60)return `${minutes} 分钟前`;if(minutes<1440)return `${Math.floor(minutes/60)} 小时前`;return `${Math.floor(minutes/1440)} 天前`;}
function DeviceIcon({gate}:{gate:boolean}){
  return gate?<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M9 40V13h30v27M5 40h38M14 19h20v15H14zM24 13V6M19 6h10M14 37h20M19 23v7m5-7v7m5-7v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>:<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="10" y="9" width="28" height="30" rx="5" stroke="currentColor" strokeWidth="1.8"/><path d="M16 17h16M16 24h9M16 31h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

export default function DeviceOverview({refreshKey=0}:{refreshKey?:number}){
  const devices=useApi<{items:Device[];counts:{kind:string;count:number}[]}>('/api/v1/devices?limit=200');
  const points=useApi<Point[]>('/api/v1/points'),current=useApi<Current[]>('/api/v1/points/current');
  const [search,setSearch]=useState(''),[objectId,setObjectId]=useState('');
  useEffect(()=>{if(refreshKey>0){void devices.reload();void points.reload();void current.reload();}},[refreshKey,devices.reload,points.reload,current.reload]);
  const reload=()=>{void devices.reload();void points.reload();void current.reload();};
  const error=devices.error||points.error||current.error;
  if(error)return <div className={styles.stateCard}><p className="form-error" role="alert">{error}</p><button type="button" onClick={reload}>重试读取</button></div>;
  if(devices.loading||points.loading||current.loading)return <div className={styles.stateCard} role="status"><span className={styles.loadingDot}/>正在读取设备与测点…</div>;
  const list=(devices.data?.items??[]).filter(device=>device.kind==='physical');
  const byDevice=new Map<string,Point[]>();
  for(const point of points.data??[])byDevice.set(point.device_id,[...byDevice.get(point.device_id)??[],point]);
  const currentByPoint=new Map((current.data??[]).map(row=>[row.pointId,row.current]));
  const objects=[...new Map(list.map(device=>[device.object_id,device.object_name])).entries()];
  const visible=list.filter(device=>(!objectId||device.object_id===objectId)&&[device.name,device.external_id,device.model,device.object_name].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const pointCount=list.reduce((count,device)=>count+(byDevice.get(device.id)?.length??0),0);
  const totalPhysical=devices.data?.counts?.find(row=>row.kind==='physical')?.count??list.length;
  return <>
    <div className={styles.summary} aria-label="已加载设备概况">
      <div><span className={styles.summaryIcon} aria-hidden="true">▦</span><div><span>物理设备</span><strong>{list.length}<small>台</small></strong></div><p>当前已加载</p></div>
      <div><span className={styles.summaryIcon} aria-hidden="true">⌁</span><div><span>登记测点</span><strong>{pointCount}<small>项</small></strong></div><p>上述设备关联测点</p></div>
      <div><span className={styles.summaryIcon} aria-hidden="true">◇</span><div><span>待现场核实</span><strong>{list.filter(device=>!device.verified).length}<small>台</small></strong></div><p>核实状态以台账为准</p></div>
    </div>
    <div className={styles.overviewHeading}><div><h2>设备总览 <span>{visible.length}</span></h2><p>按物理设备查看，网关与通道收录在下方完整台账。</p></div><button type="button" className={styles.refreshButton} onClick={reload}>↻ 刷新数据</button></div>
    <div className={styles.toolbar}>
      <label className={styles.searchField}><span className={styles.srOnly}>搜索设备</span><span aria-hidden="true">⌕</span><input type="search" placeholder="搜索设备名称、编号或型号" value={search} onChange={event=>setSearch(event.target.value)}/></label>
      <label className={styles.objectFilter}><span className={styles.srOnly}>筛选所属对象</span><select aria-label="筛选所属对象" value={objectId} onChange={event=>setObjectId(event.target.value)}><option value="">全部所属对象</option>{objects.map(([id,name])=><option key={id} value={id}>{name||'未命名对象'}</option>)}</select></label>
      <span className={styles.scopeNote}>已加载 {list.length} 台{totalPhysical>list.length?` / 授权范围共 ${totalPhysical} 台`:''}</span>
    </div>
    {!visible.length?<div className={styles.stateCard}>{list.length?<><strong>没有匹配的设备</strong><p>调整搜索词或所属对象后重试。</p><button type="button" onClick={()=>{setSearch('');setObjectId('');}}>清除筛选</button></>:<><strong>还没有已授权的物理设备</strong><p>可在下方登记设备与数据来源，并按实际情况完成授权和核实。</p></>}</div>:<div className={styles.cards}>{visible.map(device=>{
      const devicePoints=byDevice.get(device.id)??[],gate=/闸门|SCZM|hbdxscz/i.test([device.name,device.model,device.external_id].join(' '));
      return <article key={device.id} className={styles.card} aria-label={device.name}>
        <div className={styles.identity}>
          <div className={styles.identityTop}><span className={styles.deviceIcon}><DeviceIcon gate={gate}/></span><span className={`${styles.badge} ${device.verified?styles.badgeOk:''}`}>{device.verified?'已现场核实':'待现场核实'}</span></div>
          <p className={styles.deviceType}>{gate?'闸门设备':'物理设备'}</p><h3>{device.name}</h3>
          <p className={styles.deviceCode}>{device.external_id||'厂家编号待登记'}</p>
          <dl className={styles.deviceMeta}><div><dt>型号</dt><dd>{device.model||'待补充'}</dd></div><div><dt>所属对象</dt><dd>{device.object_name||'未登记'}</dd></div></dl>
        </div>
        <div className={styles.cardData}>
          <div className={styles.cardDataHeading}><h4>最近采集</h4><span>{devicePoints.length} 项测点 <i aria-hidden="true">·</i> 点选查看历史</span></div>
          {devicePoints.length?<div className={styles.metrics}>{devicePoints.map(point=>{
            const reading=currentByPoint.get(point.id)??null,quality=reading?.quality??'',usable=reading?.value!=null&&quality!=='invalid';
            return <Link key={point.id} className={`${styles.metric} ${!reading?styles.metricEmpty:''}`} href={'/points/'+encodeURIComponent(point.id)}>
              <span className={styles.metricName}>{point.name.replace(/^闸门\d+/,'')}</span>
              <span className={styles.metricValue}>{usable?reading.value:'—'}<small>{reading?.unit??point.unit}</small></span>
              <span className={styles.metricQuality} data-quality={quality||'none'}><i/>{quality?(qualityLabel[quality]??'质量待核实'):'暂无可展示数据'}</span>
              <span className={styles.metricTimestamp}>{reading?.sampledAt?<><time dateTime={reading.sampledAt} title={sampleTime(reading.sampledAt)}>{sampleTime(reading.sampledAt)}</time><small>{relativeTime(reading.sampledAt)}</small></>:'尚无可展示采样时间'}</span>
              <span className={styles.metricLink}>历史数据 <span aria-hidden="true">↗</span></span>
            </Link>;
          })}</div>:<p className={styles.noPoints}>该设备尚未登记测点，可在完整台账中核对。</p>}
        </div>
      </article>;
    })}</div>}
    <p className={styles.dataNote}><span aria-hidden="true">ⓘ</span> 登记与现场核实不代表设备在线；测值以质量和采样时间为准，空白值不表示开度为零。</p>
  </>;
}
