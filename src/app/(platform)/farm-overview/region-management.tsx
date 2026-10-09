'use client';
import { useEffect,useRef,useState } from 'react';
import ActionForm from '@/components/platform/action-form';
import { useApi } from '@/components/platform/use-api';

type ObjectRow={id:string;name:string;code:string;kind:string;archived_at:string|null};
type Region={id:string;farmId:string;name:string;version:number;archivedAt:string|null};
export default function RegionManagement({regions,onSaved,openSignal=0}:{regions:Region[];onSaved:()=>void;openSignal?:number}){
  const {data}=useApi<{items:ObjectRow[]}>('/api/v1/objects?action=configure&limit=200');
  const [selectedId,setSelectedId]=useState('');
  const root=useRef<HTMLDetailsElement>(null),create=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(!openSignal)return;if(root.current)root.current.open=true;if(create.current)create.current.open=true;root.current?.scrollIntoView({block:'nearest'});},[openSignal]);
  if(!data?.items.length)return null;
  const farms=data?.items.filter(o=>o.kind==='farm')??[];
  const objects=data?.items.filter(o=>o.kind!=='farm'&&!o.archived_at)??[];
  const managedRegions=regions.filter(region=>farms.some(farm=>farm.id===region.farmId));
  if(!farms.length)return null;
  const selected=managedRegions.find(r=>r.id===selectedId);
  return <details ref={root}><summary>维护村庄与对象关联</summary><p className="hint">村庄是目录分组，不是测绘边界；关联历史会保留。仅可操作你有配置权的农场与对象。</p>
    {farms.length>0&&<details ref={create}><summary>新增村庄</summary><ActionForm path="/api/v1/map-regions" onSaved={onSaved} label="新增村庄"><label>所属农场<select name="farmId" required defaultValue=""><option value="">选择农场</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>村庄名称<input name="name" required maxLength={80}/></label><label>维护依据<input name="source" required maxLength={1000}/></label></ActionForm></details>}
    <label>已有村庄<select value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value="">选择村庄</option>{managedRegions.map(r=><option key={r.id} value={r.id}>{r.name}{r.archivedAt?' · 已归档':''}</option>)}</select></label>
    {selected&&<div key={selected.id+'-'+selected.version}>{!selected.archivedAt&&<details><summary>修改村庄名称</summary><ActionForm path="/api/v1/map-regions" method="PATCH" numbers={['version']} onSaved={onSaved} label="保存名称"><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="version" value={selected.version}/><label>名称<input name="name" defaultValue={selected.name} required maxLength={80}/></label><label>维护依据<input name="source" required maxLength={1000}/></label></ActionForm></details>}
      <details><summary>{selected.archivedAt?'恢复村庄':'归档村庄'}</summary><ActionForm path="/api/v1/map-regions" method="PATCH" numbers={['version']} booleans={['archived']} onSaved={onSaved} label={selected.archivedAt?'确认恢复':'确认归档'}><input type="hidden" name="action" value="archive"/><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="version" value={selected.version}/>{!selected.archivedAt&&<input type="hidden" name="archived" value="on"/>}<label>变更依据<input name="reason" required maxLength={1000}/></label></ActionForm></details>
      {!selected.archivedAt&&<details><summary>关联农业对象</summary><ActionForm path="/api/v1/map-regions" method="PATCH" onSaved={onSaved} label="保存关联"><input type="hidden" name="action" value="assign"/><input type="hidden" name="regionId" value={selected.id}/><label>对象<select name="objectId" required defaultValue=""><option value="">选择对象</option>{objects.map(o=><option key={o.id} value={o.id}>{o.name} · {o.code}</option>)}</select></label><label>关联依据<input name="source" required maxLength={1000}/></label></ActionForm></details>}
      <details><summary>移除对象当前关联</summary><ActionForm path="/api/v1/map-regions" method="PATCH" onSaved={onSaved} label="移除关联"><input type="hidden" name="action" value="assign"/><input type="hidden" name="regionId" value=""/><label>对象<select name="objectId" required defaultValue=""><option value="">选择对象</option>{objects.map(o=><option key={o.id} value={o.id}>{o.name} · {o.code}</option>)}</select></label><label>变更依据<input name="source" required maxLength={1000}/></label></ActionForm></details>
      <p><a href={`/api/v1/map-regions/${selected.id}/history`} target="_blank" rel="noreferrer">查看关联历史 ↗</a></p>
    </div>}
  </details>;
}
