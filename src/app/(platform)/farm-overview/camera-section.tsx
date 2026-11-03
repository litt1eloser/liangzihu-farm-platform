'use client';
import Link from 'next/link';
import {useApi} from '@/components/platform/use-api';
import styles from './farm-overview.module.css';

type CameraImage={assetId:string;url:string;capturedAt:string|null;referenceAt:string|null};
export type LiveChannel={deviceId:string;name:string;parentName:string};
type Channel=LiveChannel&{provider:string;channelNo:number|null;
 latestEvent:{id:string;type:string;occurredAt:string;imageState:string}|null;
 eventImage:CameraImage|null;captureImage:CameraImage|null};
type Summary={object:{id:string;name:string;kind:string};channels:Channel[]};

const showTime=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));

// 详情面板「基本信息」内的关联监控区：只读取已保存资料，不唤醒摄像头、不申请直播。
export default function CameraSection({objectId,onOpenLive}:{objectId:string;onOpenLive:(channel:LiveChannel)=>void}){
 const {data,error,loading,reload}=useApi<Summary>('/api/v1/cameras/by-object?objectId='+encodeURIComponent(objectId));
 return <section className={styles.detailSection} aria-label="关联监控">
  <div className={styles.detailSectionHeader}><h3>关联监控</h3><Link href="/imagery">监控管理 ↗</Link></div>
  {loading&&<p className={styles.drawerHint}>正在读取关联监控资料…</p>}
  {!loading&&error&&<p className={styles.drawerHint}>{error.includes('无权')?'暂不可查看：没有该对象监控资料的查看权限。':'关联监控读取失败。'} <button type="button" onClick={()=>void reload()}>重试</button></p>}
  {!loading&&!error&&data&&data.channels.length===0&&<p className={styles.drawerHint}>该对象暂无已核实关联的监控通道。</p>}
  {data?.channels.map(channel=>{
   const image=channel.eventImage??channel.captureImage;
   return <div className={styles.cameraChannel} key={channel.deviceId}>
    <p className={styles.cameraChannelName}>{channel.name}</p>
    <p className={styles.detailContext}>{channel.parentName} · {channel.provider}{channel.channelNo?` · 通道 ${channel.channelNo}`:''}</p>
    <p className={styles.detailContext}>实时状态：状态未知（本平台不推断设备在线情况）</p>
    {image?<figure className={styles.cameraImage}>
     <a href={image.url}><img src={image.url} loading="lazy" alt={channel.name+'已保存图片'}/></a>
     <figcaption>{channel.eventImage?'事件关联图':'平台抓拍图'} · {image.capturedAt?`拍摄时间 ${showTime(image.capturedAt)}`:image.referenceAt?`${channel.eventImage?'事件':'保存完成'}时间 ${showTime(image.referenceAt)}`:'时间未知'}</figcaption>
    </figure>:<p className={styles.detailContext}>暂无平台已保存图片。</p>}
    <button type="button" className={styles.liveButton} onClick={()=>onOpenLive({deviceId:channel.deviceId,name:channel.name,parentName:channel.parentName})}>查看直播</button>
   </div>;
  })}
 </section>;
}
