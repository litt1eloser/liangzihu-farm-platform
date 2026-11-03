'use client';
import {useEffect,useRef,useState} from 'react';
import CameraPlayer from '@/components/platform/camera-player';
import {EzopenSessionPlayer} from '@/components/platform/ezuikit-player';
import type {LiveChannel} from './camera-section';
import {readErrorText} from './camera-read-error';
import styles from './farm-overview.module.css';

type Read={id:string;state:string;error_code:string|null;streamUrl:string|null;streamKind:string|null};
type Phase='requesting'|'preparing'|'ready'|'failed';

// 用户主动点击「查看直播」才打开；关闭弹窗、切换对象即停止播放并清理连接。
export default function CameraLiveModal({channel,onClose}:{channel:LiveChannel|null;onClose:()=>void}){
 const [phase,setPhase]=useState<Phase>('requesting');
 const [read,setRead]=useState<Read|null>(null);
 const [message,setMessage]=useState('');
 const timer=useRef<number|undefined>(undefined);

 useEffect(()=>{
  if(!channel)return;
  let cancelled=false;
  setPhase('requesting');setRead(null);setMessage('');
  const stop=()=>{if(timer.current!==undefined){window.clearTimeout(timer.current);timer.current=undefined;}};
  const track=(id:string)=>{
   const poll=async()=>{
    try{
     const r=await fetch('/api/v1/cameras/reads',{cache:'no-store'});
     const d=await r.json();
     if(cancelled)return;
     const found=(d.reads??[]).find((row:Read)=>row.id===id) as Read|undefined;
     if(!found){setPhase('failed');setMessage('读取记录不存在或已过期，请关闭后重新申请。');return;}
     if(found.state==='ready'&&found.streamUrl){setRead(found);setPhase('ready');return;}
     if(found.state==='queued'||found.state==='running'){timer.current=window.setTimeout(()=>void poll(),2000);return;}
     setPhase('failed');setMessage(readErrorText(found.error_code)||(found.state==='blocked'?'读取被拦截：权限或试点范围不足。':'读取未完成。'));
    }catch{if(!cancelled){setPhase('failed');setMessage('网络不可用，读取状态查询失败。');}}
   };
   void poll();
  };
  void (async()=>{
   try{
    const r=await fetch('/api/v1/cameras/reads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:channel.deviceId,operation:'live',requestKey:'gis-live-'+crypto.randomUUID()})});
    const d=await r.json();
    if(cancelled)return;
    if(!r.ok){setPhase('failed');setMessage(d.message??'直播申请被拒绝');return;}
    setPhase('preparing');track(String(d.id));
   }catch{if(!cancelled){setPhase('failed');setMessage('网络不可用，直播申请未发出。');}}
  })();
  return()=>{cancelled=true;stop();};
 },[channel]);

 useEffect(()=>{
  if(!channel)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[channel,onClose]);

 if(!channel)return null;
 return <div className={styles.liveOverlay} role="dialog" aria-modal="true" aria-label={channel.name+' 直播'}>
  <div className={styles.liveModal}>
   <div className={styles.liveHeader}>
    <div><strong>{channel.name}</strong><span className={styles.liveSub}>{channel.parentName}</span></div>
    <button type="button" onClick={onClose} aria-label="关闭直播" title="关闭直播">×</button>
   </div>
   <div className={styles.liveBody}>
    {phase==='requesting'&&<p className={styles.drawerHint}>正在申请受控直播读取…</p>}
    {phase==='preparing'&&<p className={styles.drawerHint}>设备正在准备直播流（4G 设备唤醒约需 15-20 秒）…</p>}
    {phase==='failed'&&<p className={styles.formError} role="alert">{message}</p>}
    {phase==='ready'&&read?.streamUrl&&<>
     {read.streamKind==='ezopen'?<EzopenSessionPlayer endpoint={read.streamUrl}/>:<CameraPlayer src={read.streamUrl}/>}
     <p className={styles.liveNote}>本次播放授权约 5 分钟内有效；加密试点通道最多播放 2 分钟后自动停止。关闭本弹窗即断开连接。</p>
    </>}
   </div>
  </div>
 </div>;
}
