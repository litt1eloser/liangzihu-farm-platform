'use client';
import {useApi} from './use-api';

type CameraImage={assetId:string;url:string;capturedAt:string|null;referenceAt:string|null};
type CameraChannel={deviceId:string;name:string;parentName:string;provider:string;channelNo:number|null;
 latestEvent:{id:string;type:string;occurredAt:string;imageState:string}|null;
 eventImage:CameraImage|null;captureImage:CameraImage|null};
type Summary={object:{id:string;name:string;kind:string};channels:CameraChannel[]};

const showTime=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));

/** A field or facility page can render this component with its existing object ID. */
export default function CameraObjectSummary({objectId}:{objectId:string}){
 const {data,error,loading,reload}=useApi<Summary>('/api/v1/cameras/by-object?objectId='+encodeURIComponent(objectId));
 return <section aria-label="对象关联摄像头">
  <h2>关联摄像头</h2>
  {loading&&<p>正在读取已保存的摄像头资料…</p>}
  {error&&<p role="alert">{error} <button type="button" onClick={()=>void reload()}>重试</button></p>}
  {data?.channels.length===0&&<p>该对象尚无已核实关联的摄像头通道。</p>}
  {data?.channels.map(channel=>{
   const image=channel.eventImage??channel.captureImage;
   const imageKind=channel.eventImage?'事件关联图':'平台抓拍图';
   return <article className="rule-card" key={channel.deviceId}>
    <h3>{channel.name}</h3>
    <p>{channel.parentName} · {channel.provider}{channel.channelNo?' · 通道 '+channel.channelNo:''}</p>
    {image?<>
     <a href={image.url}><img src={image.url} loading="lazy" alt={channel.name+'的'+imageKind} style={{maxWidth:'100%',maxHeight:220,objectFit:'contain'}}/></a>
     <p>{imageKind} · {image.capturedAt?'拍摄时间 '+showTime(image.capturedAt):'拍摄时间未知'}</p>
     {!image.capturedAt&&<p>{image.referenceAt?(channel.eventImage?'事件时间 ':'保存完成时间 ')+showTime(image.referenceAt):'参考时间未知'}</p>}
    </>:<p>暂无平台已保存图片</p>}
    {channel.latestEvent&&<p>最近事件：{channel.latestEvent.type} · {showTime(channel.latestEvent.occurredAt)}</p>}
    <a href="/imagery">查看监控事件与读取入口</a>
   </article>;
  })}
 </section>;
}
