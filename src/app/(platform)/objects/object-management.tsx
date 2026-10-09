'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import ActionForm from '@/components/platform/action-form';
import { useApi } from '@/components/platform/use-api';

type ObjectRow={id:string;code:string;name:string;kind:string;version:number;source:string;archived_at:string|null};
export default function ObjectManagement(){
  const {data,reload}=useApi<{items:ObjectRow[]}>('/api/v1/objects?action=configure&limit=200');
  const [id,setId]=useState('');
  const [newKind,setNewKind]=useState<'field'|'pond'|'facility'>('field');
  const [creationOpen,setCreationOpen]=useState(false);
  useEffect(()=>{const hash=window.location.hash;if(['#new-field','#new-pond','#new-facility'].includes(hash)){setNewKind(hash.slice(5) as 'field'|'pond'|'facility');setCreationOpen(true);}},[]);
  if(!data?.items.length)return null;
  const rows=data?.items??[],farms=rows.filter(o=>o.kind==='farm'),objects=rows.filter(o=>['field','pond','facility'].includes(o.kind));
  const selected=objects.find(o=>o.id===id);
  const saved=()=>{void reload();};
  return <section aria-label="正式农业对象维护"><h2>正式农业对象维护</h2><p className="hint">仅显示你有配置权的对象。固定设施对象与关联的实体设备分别登记；登记设施不会产生可控制设备。归档保留主档和历史。边界草稿在原二维地图登记，只有明确审核后才能标为已核实。</p>
    {farms.length>0&&<details open={creationOpen} onToggle={event=>setCreationOpen(event.currentTarget.open)}><summary>新增正式地块、塘口或固定设施</summary><ActionForm path="/api/v1/objects" onSaved={saved} label="创建对象"><label>所属农场<select name="parentId" required defaultValue=""><option value="">选择农场</option>{farms.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>类型<select name="kind" required value={newKind} onChange={event=>setNewKind(event.target.value as typeof newKind)}><option value="field">地块</option><option value="pond">塘口</option><option value="facility">固定设施</option></select></label><label>唯一编号<input name="code" required maxLength={80}/></label><label>名称<input name="name" required maxLength={80}/></label><label>登记依据<input name="source" required maxLength={1000}/></label><label>变更依据<input name="reason" required maxLength={1000}/></label></ActionForm><p><Link href="/farm-overview">返回农场地图 ↗</Link>　<Link href="/map#boundary-draft">登记边界草稿 ↗</Link></p></details>}
    <label>选择已有地块、塘口或设施<select value={id} onChange={event=>setId(event.target.value)}><option value="">请选择</option>{objects.map(o=><option key={o.id} value={o.id}>{o.name} · {o.code}{o.archived_at?' · 已归档':''}</option>)}</select></label>
    {selected&&<div key={selected.id+'-'+selected.version}><p>当前版本 {selected.version} · {selected.archived_at?'已归档':'使用中'}</p>{!selected.archived_at&&<details><summary>修改名称与登记依据</summary><ActionForm path="/api/v1/objects" numbers={['version']} onSaved={saved} label="保存修改"><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="kind" value={selected.kind}/><input type="hidden" name="version" value={selected.version}/><label>名称<input name="name" defaultValue={selected.name} required maxLength={80}/></label><label>登记依据<input name="source" defaultValue={selected.source} required maxLength={1000}/></label><label>变更依据<input name="reason" required maxLength={1000}/></label></ActionForm></details>}
      <details><summary>{selected.archived_at?'恢复对象':'归档对象'}</summary><ActionForm path="/api/v1/objects/archive" numbers={['version']} booleans={['archived']} onSaved={saved} label={selected.archived_at?'确认恢复':'确认归档'}><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="version" value={selected.version}/>{!selected.archived_at&&<input type="hidden" name="archived" value="on"/>}<label>操作依据<input name="reason" required maxLength={1000}/></label></ActionForm></details>
      {!selected.archived_at&&<p><Link href="/map#boundary-draft">登记边界草稿 ↗</Link>　<Link href={`/objects/${selected.id}`}>查看对象历史 ↗</Link></p>}
    </div>}
  </section>;
}
