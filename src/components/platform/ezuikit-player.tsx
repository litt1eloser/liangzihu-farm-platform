'use client';

import {useEffect,useRef,useState} from 'react';
import {useApi} from './use-api';

type Player={stop:()=>void};
type EzuikitWindow=typeof globalThis&{EZUIKit?:{EZUIKitPlayer:new(options:{
 id:string;url:string;accessToken:string;autoplay:boolean;template:'simple'|'pcRec';
 staticPath:string;width:number;height:number;disableRenderPrivateData:boolean;
 handleSuccess:()=>void;handleError:(error:{errorCode?:number;retcode?:number;nErrorCode?:number})=>void;
})=>Player}};
let scriptPromise:Promise<void>|null=null;

function loadEzuikit():Promise<void>{
 if((globalThis as EzuikitWindow).EZUIKit?.EZUIKitPlayer)return Promise.resolve();
 if(scriptPromise)return scriptPromise;
 scriptPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='/vendor/ezuikit/ezuikit.js';
  script.onload=()=>((globalThis as EzuikitWindow).EZUIKit?.EZUIKitPlayer?resolve():reject(new Error('PLAYER_MISSING')));
  script.onerror=()=>{scriptPromise=null;reject(new Error('PLAYER_LOAD_FAILED'));};
  document.head.appendChild(script);
 });
 return scriptPromise;
}

// 仅在用户主动打开后装载播放器；离开页面或两分钟到期时停止连接。
export function EzuikitPlayer({url,accessToken}:{url:string;accessToken:string}){
 const host=useRef<HTMLDivElement>(null),[message,setMessage]=useState('');
 useEffect(()=>{
  const box=host.current;
  if(!box)return;
  let cancelled=false,player:Player|null=null,timer:number|undefined;
  const id='ezopen-'+Math.random().toString(36).slice(2,10);
  box.replaceChildren();
  const holder=document.createElement('div');holder.id=id;box.appendChild(holder);
  void loadEzuikit().then(()=>{
   if(cancelled)return;
   try{
    const Ctor=(globalThis as EzuikitWindow).EZUIKit!.EZUIKitPlayer;
    player=new Ctor({
     id,url,accessToken,autoplay:true,template:'simple',
     staticPath:'/vendor/ezuikit/ezuikit_static',width:640,height:360,
     disableRenderPrivateData:false,
     handleSuccess:()=>{if(!cancelled)setMessage('');},
     handleError:error=>{if(!cancelled)setMessage(
      [5].includes(error?.retcode??error?.nErrorCode??error?.errorCode??-1)
       ?'播放失败，请核对设备验证码。':'播放连接未完成，请重新请求。');},
    });
    timer=window.setTimeout(()=>{
     try{player?.stop();}catch{}
     if(!cancelled)setMessage('本次播放已满两分钟，请关闭后按需重新申请。');
    },120000);
   }catch{if(!cancelled)setMessage('播放器初始化失败。');}
  }).catch(()=>{if(!cancelled)setMessage('播放器组件加载失败。');});
  return()=>{
   cancelled=true;if(timer!==undefined)window.clearTimeout(timer);
   try{player?.stop();}catch{}
   box.replaceChildren();
  };
 },[url,accessToken]);
 return <><div ref={host} style={{maxWidth:640}}/>{message&&<p className="form-error">{message}</p>}</>;
}

export function EzopenSessionPlayer({endpoint}:{endpoint:string}){
 const session=useApi<{url:string;accessToken:string}>(endpoint);
 if(session.error)return <p className="form-error">播放授权不可用：{session.error}</p>;
 if(!session.data)return <p className="hint">正在准备播放授权…</p>;
 return <EzuikitPlayer url={session.data.url} accessToken={session.data.accessToken}/>;
}
