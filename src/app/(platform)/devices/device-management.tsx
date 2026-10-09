'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import ActionForm from '@/components/platform/action-form';
import {useApi} from '@/components/platform/use-api';

type ObjectRow={id:string;name:string;kind:string;archived_at:string|null};
type SourceRow={id:string;object_id:string;name:string;code:string;verified:boolean};
export default function DeviceManagement({onDeviceSaved}:{onDeviceSaved:()=>void}){
 const objects=useApi<{items:ObjectRow[]}>('/api/v1/objects?action=configure&limit=200');
 const sources=useApi<SourceRow[]>('/api/v1/sources');
 const [open,setOpen]=useState(false),[objectId,setObjectId]=useState('');
 useEffect(()=>{if(location.hash==='#register')setOpen(true);},[]);
 const managed=objects.data?.items.filter(row=>!row.archived_at)??[];
 const available=sources.data?.filter(row=>row.object_id===objectId)??[];
 return <section aria-label="设备与数据来源登记"><h2>登记设备与数据来源</h2><p className="hint">登记不代表核实、实时定位或控制权限。无人机和农机先按实体设备建档；适用的机具、终端关系在农机业务模块维护。</p>
  {!managed.length?<p className="hint">当前没有可配置的农业对象。请先取得对象配置权限，或在<Link href="/objects">对象台账</Link>登记对象。</p>:<details open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>＋ 登记实体设备</summary><label>关联对象<select value={objectId} onChange={event=>setObjectId(event.target.value)}><option value="">选择有配置权的对象</option>{managed.map(row=><option key={row.id} value={row.id}>{row.name} · {row.kind}</option>)}</select></label>
   {objectId&&<>{!available.length&&<p className="hint">该对象尚无数据来源。先登记真实来源编号、服务方和依据，再登记设备；不可使用虚构来源。</p>}
    <details><summary>先登记数据来源</summary><ActionForm path="/api/v1/sources" onSaved={()=>void sources.reload()} label="保存数据来源"><input type="hidden" name="objectId" value={objectId}/><label>来源编号<input name="code" required maxLength={80}/></label><label>来源名称<input name="name" required maxLength={80}/></label><label>服务方<input name="provider" required maxLength={80}/></label><label>合同或资料路径（如有）<input name="contractRef" maxLength={1000}/></label></ActionForm></details>
    {available.length>0&&<ActionForm path="/api/v1/devices" onSaved={onDeviceSaved} label="登记实体设备"><input type="hidden" name="objectId" value={objectId}/><input type="hidden" name="kind" value="physical"/><label>已登记数据来源<select name="sourceId" required defaultValue=""><option value="">选择来源</option>{available.map(row=><option key={row.id} value={row.id}>{row.name} · {row.code}{row.verified?' · 已核实':' · 待核实'}</option>)}</select></label><label>厂家或业务编号<input name="externalId" required maxLength={120}/></label><label>设备名称<input name="name" required maxLength={80}/></label><label>型号（如有）<input name="model"/></label><label>登记依据<input name="source" required maxLength={1000}/></label></ActionForm>}
   </>}
   <p><Link href="/machinery">农机机具与定位终端关系 ↗</Link>　<Link href="/farm-overview">返回农场地图 ↗</Link></p>
  </details>}
 </section>;
}
