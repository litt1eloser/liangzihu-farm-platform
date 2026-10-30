'use client';
import {useState} from 'react';
import Link from 'next/link';
import styles from './farm-overview.module.css';

type Geometry={type:string;coordinates:unknown};
type GateDeployment={manufacturer:string|null;controllerModel:string|null;firmware:string|null;installationRef:string|null};
type GateDevice={deviceId:string;externalId:string;name:string;geometry:Geometry|null;positionVerified:boolean;deployment:GateDeployment;latestOpening:{value:number|null;sampledAt:string}|null;lastSuccessAt:string|null};

function time(value?:string|null){return value?new Date(value).toLocaleString('zh-CN'):'未提供';}
function Facts({rows}:{rows:{value:string|number;label:string}[]}){return <div className={styles.detailFacts}>{rows.map(row=><div key={row.label}><strong>{row.value}</strong><span>{row.label}</span></div>)}</div>;}

const gateActions=[['开闸','开'],['关闸','关'],['停止','停']] as const;

export default function GateDetail({gate,onClose}:{gate:GateDevice|null;onClose:()=>void}){
 const [busy,setBusy]=useState<string|null>(null),[result,setResult]=useState(''),[error,setError]=useState('');
 if(!gate)return null;
 const broken=gate.deployment.installationRef?.includes('已坏')??false;
 const apply=async(label:string,word:string)=>{
  setBusy(label);setError('');setResult('');
  try{
   const response=await fetch('/api/v1/control-records/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    deviceId:gate.deviceId,
    purpose:`农场总览页面发起的闸门${word}申请`,
    authorizationRef:'农场总览页面快速申请；正式授权依据待补充核对',
    conditions:'现场条件未经平台核实；本次仅登记申请，平台未下发任何命令',
    requestKey:crypto.randomUUID(),
   })});
   const data=await response.json();
   if(!response.ok)throw new Error(data.message??'申请未登记成功');
   const reasons=Array.isArray(data.blocked_reasons)?(data.blocked_reasons as string[]).join('；'):'';
   setResult(`已登记，平台未下发命令。${reasons?`阻断原因：${reasons}`:''}`);
  }catch(e){setError(e instanceof TypeError?'网络不可用，尚未确认登记，请恢复网络后重试。':e instanceof Error?e.message:'申请未登记成功');}
  finally{setBusy(null);}
 };
 return <aside className={styles.drawer} aria-label="闸门详情" aria-live="polite">
  <div className={styles.drawerTop}><span className={styles.eyebrow}>GATE · REGISTERED DEVICE</span><button type="button" onClick={onClose} aria-label="关闭闸门详情">×</button></div>
  <span className={styles.kind}>智能闸门{broken?' · 登记已坏':''}</span><h2>{gate.name}</h2>
  <p className={styles.detailContext}>设备编号 {gate.externalId} · 仅当前账号获授权资料</p>
  <Facts rows={[
   {label:'最新开度',value:gate.latestOpening?.value===null||gate.latestOpening===null?'暂无读数':`${gate.latestOpening.value}%`},
   {label:'在线状态',value:gate.lastSuccessAt?'有数据':'离线'},
   {label:'点位核实',value:gate.positionVerified?'已核实':'待确认'},
  ]}/>
  {gate.latestOpening
   ?<p className={styles.metric}>开度 {gate.latestOpening.value===null?'未知（读数无效）':`${gate.latestOpening.value}%`} · 采样 {time(gate.latestOpening.sampledAt)}</p>
   :<p className={styles.metric}>暂无开度读数</p>}
  <p className={styles.businessLead}>{gate.lastSuccessAt?`最近收到数据：${time(gate.lastSuccessAt)}`:'离线/未收到过数据'}</p>
  {!gate.positionVerified&&<p className={styles.drawerHint}>位置待现场确认；图上点位来自登记资料，未经现场核实。</p>}
  {broken&&<div className={styles.attention}>登记资料注明该闸门"已坏"，控制申请不会被下发，请先现场处理。</div>}
  <section aria-label="申请控制">
   <p className={styles.businessLead}>申请控制（只登记，不下发命令）</p>
   <p className={styles.detailContext}>点击只会在平台登记一条控制申请；没有已联合签验的执行适配器，平台不会向闸门发送任何命令。</p>
   <div className={styles.drawerLinks}>
    {gateActions.map(([label,word])=><button key={label} type="button" disabled={busy!==null} onClick={()=>void apply(label,word)}>{busy===label?`正在登记${label}申请…`:`申请${label}`}</button>)}
   </div>
   {error&&<p className={styles.error} role="alert">{error}</p>}
   {result&&<p className={styles.drawerHint} role="status">{result}</p>}
  </section>
  <div className={styles.drawerLinks}><Link href="/control-records">查看控制申请记录 ↗</Link></div>
  <details className={styles.metadata}><summary>设备档案</summary><dl>
   <div><dt>现场编号与铭牌SN</dt><dd>{gate.deployment.installationRef??'未登记'}</dd></div>
   <div><dt>厂家</dt><dd>{gate.deployment.manufacturer??'未登记'}</dd></div>
   <div><dt>控制器型号</dt><dd>{gate.deployment.controllerModel??'未登记'}</dd></div>
   <div><dt>固件版本</dt><dd>{gate.deployment.firmware??'未登记'}</dd></div>
   <div><dt>安装说明</dt><dd>{gate.deployment.installationRef??'未登记'}</dd></div>
   <div><dt>控制边界</dt><dd>平台只登记申请，未下发任何命令</dd></div>
  </dl></details>
 </aside>;
}
