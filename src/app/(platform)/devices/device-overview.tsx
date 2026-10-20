'use client';
import {useEffect} from 'react';
import {useApi} from '@/components/platform/use-api';
import styles from './devices.module.css';
type Device={id:string;name:string;kind:string;model:string|null;external_id:string;verified:boolean;parent_device_id:string|null;object_name:string};
type Point={id:string;code:string;name:string;device_id:string;metric:string;unit:string};
type Current={pointId:string;current:{value:number|null;unit:string|null;quality:string|null;sampledAt:string|null;reasons:string[]|null}|null};
const qualityLabel:Record<string,string>={valid:'有效',suspect:'可疑',invalid:'无效'};
const qualityDot:Record<string,string>={valid:styles.dotValid,suspect:styles.dotSuspect,invalid:styles.dotInvalid};
function relTime(iso:string){const diff=Date.now()-Date.parse(iso),m=Math.floor(diff/60000);if(m<1)return '刚刚';if(m<60)return `${m} 分钟前`;const h=Math.floor(m/60);if(h<24)return `${h} 小时前`;return `${Math.floor(h/24)} 天前`;}

export default function DeviceOverview({refreshKey=0}:{refreshKey?:number}){
 const devices=useApi<{items:Device[]}>('/api/v1/devices?limit=200'),points=useApi<Point[]>('/api/v1/points'),current=useApi<Current[]>('/api/v1/points/current');
 useEffect(()=>{if(refreshKey>0){void devices.reload();void points.reload();void current.reload();}},[refreshKey,devices.reload,points.reload,current.reload]);
 const error=devices.error||points.error||current.error;
 if(error)return <div className={`empty-state ${styles.overviewError}`}><p className="form-error" role="alert">{error}</p><button className="secondary" onClick={()=>{void devices.reload();void points.reload();void current.reload();}}>重试读取</button></div>;
 if(devices.loading||points.loading||current.loading)return <p className="loading-state" role="status">正在加载…</p>;
 const list=(devices.data?.items??[]).filter(d=>d.kind==='physical'),byDevice=new Map<string,Point[]>();
 for(const p of points.data??[])byDevice.set(p.device_id,[...byDevice.get(p.device_id)??[],p]);
 const currentByPoint=new Map((current.data??[]).map(c=>[c.pointId,c.current]));
 if(!list.length)return <p className="empty-state">当前没有已授权的物理设备。可由管理员在上方登记区建档并授权。</p>;
 return <div className={styles.cards}>{list.map(d=>{const devicePoints=byDevice.get(d.id)??[];return <article key={d.id} className={styles.card}>
  <div className={styles.cardHead}><div><h3>{d.name}</h3><p className={styles.meta}>{[d.model,`厂家编号 ${d.external_id}`].filter(Boolean).join(' · ')}</p></div><span className={`${styles.badge} ${d.verified?styles.badgeOk:''}`}>{d.verified?'已核实':'待核实'}</span></div>
  {devicePoints.length?<div className={styles.metrics}>{devicePoints.map(p=>{const c=currentByPoint.get(p.id)??null,q=c?.quality??'';return <a key={p.id} className={`${styles.metric} ${c?'':styles.metricEmpty}`} href={'/points/'+encodeURIComponent(p.id)}>
   <span className={styles.metricName}>{p.name.replace(/^闸门\d+/,'')}</span>
   <span className={styles.metricValue}>{c&&c.value!==null?<>{c.value}<small>{c.unit??p.unit}</small></>:'暂无数据'}</span>
   <span className={styles.metricFoot}><span className={`${styles.dot} ${q?(qualityDot[q]??styles.dotNone):styles.dotNone}`}/>{q?(qualityLabel[q]??q):'暂无数据'}{c?.sampledAt?' · '+relTime(c.sampledAt):''}</span>
   <span className={styles.metricLink}>查看历史 →</span>
  </a>;})}</div>:<p className="hint">该设备尚未登记测点。</p>}
 </article>;})}</div>;
}
