'use client';

import {useEffect,useRef,useState} from 'react';
import {useApi} from './use-api';
import CameraPlayer from './camera-player';
import {EzopenSessionPlayer} from './ezuikit-player';

type Channel={deviceId:string;name:string;parentName:string};
type Summary={channels:Channel[]};
type Read={id:string;device_id:string;state:string;error_code:string|null;streamKind:'ezopen'|'hls'|null;streamUrl:string|null};
type Reads={reads:Read[];actualReadsEnabled:boolean};

/** Other pages pass their existing farm object ID; this component owns the live request and playback. */
export default function CameraObjectLive({objectId}:{objectId:string}){
 const cameras=useApi<Summary>('/api/v1/cameras/by-object?objectId='+encodeURIComponent(objectId));
 const [readId,setReadId]=useState<string|null>(null),[selected,setSelected]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[stopped,setStopped]=useState(false);
 const requestKey=useRef<string|null>(null);
 const reads=useApi<Reads>('/api/v1/cameras/reads');
 const active=reads.data?.reads.find(r=>r.id===readId);
 useEffect(()=>{
  if(!readId||active&&!['queued','running'].includes(active.state))return;
  const timer=window.setInterval(()=>void reads.reload(),2000);
  return()=>window.clearInterval(timer);
 },[readId,active?.state,reads.reload]);
 useEffect(()=>{setReadId(null);setSelected(null);setStopped(false);setError('');requestKey.current=null;},[objectId]);
 useEffect(()=>{
  if(!active?.streamUrl||stopped)return;
  const timer=window.setTimeout(()=>setStopped(true),120000);
  return()=>window.clearTimeout(timer);
 },[active?.streamUrl,stopped]);
 async function start(deviceId:string){
  if(busy)return;
  setBusy(true);setError('');setReadId(null);setSelected(deviceId);setStopped(false);
  requestKey.current=crypto.randomUUID();
  try{
   const response=await fetch('/api/v1/cameras/reads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,operation:'live',requestKey:requestKey.current})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.message??'直播请求未完成');
   setReadId(result.id);requestKey.current=null;await reads.reload();
  }catch(e){setError(e instanceof Error?e.message:'直播请求未完成');setSelected(null);}
  finally{setBusy(false);}
 }
 return <section aria-label="对象关联摄像头直播">
  <h2>摄像头直播</h2>
  {cameras.loading&&<p>正在查找关联摄像头…</p>}
  {cameras.error&&<p role="alert">{cameras.error}</p>}
  {reads.error&&<p role="alert">直播状态不可用：{reads.error}</p>}
  {cameras.data?.channels.length===0&&<p>该对象没有已核实的摄像头通道。</p>}
  {reads.data&&!reads.data.actualReadsEnabled&&<p>当前环境尚未启用直播读取。</p>}
  {cameras.data?.channels.map(channel=><div key={channel.deviceId}>
   <span>{channel.name} · {channel.parentName}</span>{' '}
   <button type="button" disabled={busy||!reads.data?.actualReadsEnabled} onClick={()=>void start(channel.deviceId)}>打开直播</button>
  </div>)}
  {selected&&<div>
   <button type="button" onClick={()=>{setStopped(true);setReadId(null);setSelected(null);}}>停止播放</button>
   {busy&&<p>正在申请直播…</p>}
   {active&&['queued','running'].includes(active.state)&&<p>正在准备直播画面…</p>}
   {active&&active.state!=='ready'&&!['queued','running'].includes(active.state)&&<p role="alert">直播未完成：{active.error_code??active.state}</p>}
   {active?.state==='ready'&&!active.streamUrl&&<p role="alert">播放入口不可用或已过期，请重新打开直播。</p>}
   {!stopped&&active?.streamUrl&&(active.streamKind==='ezopen'?<EzopenSessionPlayer endpoint={active.streamUrl}/>:<CameraPlayer src={active.streamUrl}/>)}
   {stopped&&<p>本次播放已停止。如需继续，请重新打开直播。</p>}
  </div>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
