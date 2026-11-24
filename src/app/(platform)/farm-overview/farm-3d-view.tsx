'use client';

import {useEffect,useRef,useState} from 'react';
import {tiandituWmtsUrls,validBrowserKey} from '@/modules/map-prototype/tianditu';
import styles from './farm-3d-view.module.css';

type Geometry={type:string;coordinates:unknown};
export type SpatialItem={id:string;name:string;kind:string;geometry:Geometry|null};
type CadItem={id?:string;geometry:Geometry|null;properties:{category:string}};
type Props={
 items:SpatialItem[];cadFeatures:CadItem[];selectedId:string|null;focusVersion:number;
 visibility:Record<string,boolean>;cadVisibility:Record<string,boolean>;
 basemap:'vector'|'satellite';annotationsVisible:boolean;
 center:[number,number];zoom:number;homeVersion:number;
 onSelect:(id:string)=>void;onMessage:(text:string)=>void;onFallback:()=>void;
};

declare global{interface Window{Cesium?:typeof import('cesium');CESIUM_BASE_URL?:string}}
let loading:Promise<typeof import('cesium')>|null=null;
function runtime(){
 if(window.Cesium)return Promise.resolve(window.Cesium);
 if(loading)return loading;
 loading=new Promise<typeof import('cesium')>((resolve,reject)=>{
  window.CESIUM_BASE_URL='/vendor/cesium/';
  if(!document.querySelector('link[data-cesium]')){
   const link=document.createElement('link');link.rel='stylesheet';link.href='/vendor/cesium/Widgets/widgets.css';link.dataset.cesium='true';document.head.appendChild(link);
  }
  const script=document.createElement('script');script.src='/vendor/cesium/Cesium.js';script.async=true;
  script.onload=()=>window.Cesium?resolve(window.Cesium):reject(Error('三维引擎初始化失败'));
  script.onerror=()=>reject(Error('三维引擎资源加载失败'));
  document.head.appendChild(script);
 }).catch(error=>{loading=null;throw error;});
 return loading;
}
function paths(geometry:Geometry|null):number[][][]{
 if(!geometry)return [];
 const c=geometry.coordinates as any;
 if(geometry.type==='Point'&&Array.isArray(c)&&Number.isFinite(c[0])&&Number.isFinite(c[1]))return [[[c[0],c[1]]]];
 if(geometry.type==='MultiPoint'&&Array.isArray(c))return c.filter((p:any)=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])).map((p:any)=>[[p[0],p[1]]]);
 if(geometry.type==='LineString'&&Array.isArray(c))return [c];
 if(geometry.type==='MultiLineString'&&Array.isArray(c))return c;
 if(geometry.type==='Polygon'&&Array.isArray(c))return c;
 if(geometry.type==='MultiPolygon'&&Array.isArray(c))return c.flatMap((poly:any)=>poly);
 return [];
}
function validPath(p:number[][]):boolean{return p.length>0&&p.every(x=>Array.isArray(x)&&x.length>=2&&Number.isFinite(x[0])&&Number.isFinite(x[1])&&Math.abs(x[0])<=180&&Math.abs(x[1])<=90)}
function extentOf(geometry:Geometry|null):[number,number,number,number]|null{
 const all=paths(geometry).flat().filter(p=>validPath([p]));
 if(!all.length)return null;
 return [Math.min(...all.map(x=>x[0])),Math.min(...all.map(x=>x[1])),Math.max(...all.map(x=>x[0])),Math.max(...all.map(x=>x[1]))];
}
export default function Farm3DView(props:Props){
 const host=useRef<HTMLDivElement>(null),viewerRef=useRef<any>(null),engineRef=useRef<typeof import('cesium')|null>(null);
 const [phase,setPhase]=useState<'loading'|'ready'|'failed'>('loading');
 const [note,setNote]=useState('三维地图准备中…');
 const [resetCounter,setResetCounter]=useState(0);
 const first=useRef(true);
 const current=useRef(props);current.current=props;

 useEffect(()=>{
  let disposed=false;
  void(async()=>{
   const C=await runtime();
   if(disposed||!host.current)return;
   engineRef.current=C;C.Ion.defaultAccessToken='';
   const viewer=new C.Viewer(host.current,{
    baseLayer:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,
    animation:false,timeline:false,fullscreenButton:false,selectionIndicator:false,infoBox:false,
    navigationHelpButton:false,skyBox:false,skyAtmosphere:false,terrainProvider:new C.EllipsoidTerrainProvider(),
    requestRenderMode:true,maximumRenderTimeChange:Infinity,contextOptions:{webgl:{alpha:false}}
   });
   if(disposed){viewer.destroy();return;}
   viewerRef.current=viewer;
   viewer.resolutionScale=Math.min(1,1/(window.devicePixelRatio||1));
   viewer.scene.globe.baseColor=C.Color.fromCssColorString('#dbe5da');
   viewer.scene.backgroundColor=C.Color.fromCssColorString('#dce7dd');
   viewer.scene.globe.depthTestAgainstTerrain=false;
   const initial=current.current;
   const altitude=Math.max(400,Math.min(2000000,1300000/Math.pow(2,initial.zoom-6)));
   viewer.camera.setView({destination:C.Cartesian3.fromDegrees(initial.center[0],initial.center[1],altitude),
    orientation:{heading:0,pitch:C.Math.toRadians(-62),roll:0}});
   viewer.screenSpaceEventHandler.setInputAction((event:{position:import('cesium').Cartesian2})=>{
    const picked=viewer.scene.pick(event.position);
    const id=picked?.id?.id as string|undefined;
    if(id?.startsWith('farm-object:'))current.current.onSelect(id.slice('farm-object:'.length).split(':')[0]);
   },C.ScreenSpaceEventType.LEFT_CLICK);
   viewer.scene.renderError.addEventListener(()=>{
    if(!disposed){setPhase('failed');setNote('当前设备无法绘制三维，请切回二维地图。');}
   });
   setPhase('ready');setNote('当前为参考椭球，尚无梁子湖实测三维地形。');
   viewer.scene.requestRender();
  })().catch(()=>{if(!disposed){setPhase('failed');setNote('三维加载失败，请使用二维地图。');}});
  return()=>{disposed=true;const viewer=viewerRef.current;viewerRef.current=null;engineRef.current=null;if(viewer&&!viewer.isDestroyed())viewer.destroy();};
 },[]);

 // Use the same source object IDs as the 2D workbench; these layers are visualizations, not verified elevation.
 useEffect(()=>{
  const C=engineRef.current,viewer=viewerRef.current;if(!C||!viewer||phase!=='ready')return;
  viewer.entities.removeAll();
  const draw=(id:string,name:string,geometry:Geometry|null,kind:string,selected:boolean,cad=false)=>{
   const p=paths(geometry),color=selected?C.Color.YELLOW:cad?C.Color.fromCssColorString('#62b66a'):kind==='pond'?C.Color.fromCssColorString('#2c86cf'):kind==='channel'?C.Color.fromCssColorString('#428bc6'):C.Color.fromCssColorString('#83b54a');
   const lineColor=selected?C.Color.YELLOW:color;
   for(let i=0;i<p.length;i++){
    const path=p[i];if(!validPath(path))continue;
    const coords=C.Cartesian3.fromDegreesArray(path.flatMap(x=>[x[0],x[1]]));
    if(path.length>=3&&(geometry?.type==='Polygon'||geometry?.type==='MultiPolygon')&&i===0){
     viewer.entities.add({id:id+':surface:'+i,name,polygon:{hierarchy:coords,material:color.withAlpha(selected ? 0.36 : cad ? 0.12 : 0.19),height:0}});
    }
    if(path.length>=2)viewer.entities.add({id:id+':line:'+i,name,polyline:{positions:coords,width:selected?4:cad?2:2.5,material:lineColor,clampToGround:true}});
    if(path.length===1&&!cad)viewer.entities.add({id:id+':point:'+i,name,position:coords[0],point:{pixelSize:selected?13:9,color,outlineColor:C.Color.WHITE,outlineWidth:1,heightReference:C.HeightReference.CLAMP_TO_GROUND}});
   }
  };
  for(const item of props.items){
   if(props.visibility[item.kind]===false&&! (props.selectedId===item.id))continue;
   if(item.kind==='mobile'&&!item.geometry)continue;
   draw('farm-object:'+item.id,item.name,item.geometry,item.kind,props.selectedId===item.id);
  }
  for(const feature of props.cadFeatures){
   const cat=feature.properties.category;
   if(props.cadVisibility[cat]===false)continue;
   draw('cad-reference:'+String(feature.id??''),'竣工图参考',feature.geometry,'cad',false,true);
  }
  viewer.scene.requestRender();
 },[phase,props.items,props.cadFeatures,props.selectedId,props.visibility,props.cadVisibility]);

 useEffect(()=>{
  const C=engineRef.current,viewer=viewerRef.current;if(!C||!viewer||phase!=='ready')return;
  viewer.imageryLayers.removeAll(true);
  if(!validBrowserKey(process.env.NEXT_PUBLIC_TIANDITU_KEY??'')){setNote('缺少有效天地图 Key，已显示参考椭球和农业对象。');return;}
  const key=process.env.NEXT_PUBLIC_TIANDITU_KEY!;
  const add=(layer:'img'|'vec'|'cia'|'cva')=>{
   const provider=new C.UrlTemplateImageryProvider({
    url:tiandituWmtsUrls(layer,key)[0],tilingScheme:new C.WebMercatorTilingScheme(),
    maximumLevel:18,credit:'天地图 © 国家地理信息公共服务平台'
   });
   viewer.imageryLayers.addImageryProvider(provider);
  };
  add(props.basemap==='satellite'?'img':'vec');
  if(props.annotationsVisible)add(props.basemap==='satellite'?'cia':'cva');
  viewer.scene.requestRender();
 },[phase,props.basemap,props.annotationsVisible]);

 // Selection changes in the existing directory should focus the same 3D object, without opening a second details system.
 useEffect(()=>{
  const C=engineRef.current,viewer=viewerRef.current;if(!C||!viewer||phase!=='ready'||!props.selectedId)return;
  const item=props.items.find(i=>i.id===props.selectedId),ext=extentOf(item?.geometry??null);
  if(!ext){setNote('该对象尚无有效地图位置，业务详情仍可查看。');return;}
  const points=[C.Cartesian3.fromDegrees(ext[0],ext[1],0),C.Cartesian3.fromDegrees(ext[2],ext[3],0)];
  const sphere=C.BoundingSphere.fromPoints(points);
  viewer.camera.flyToBoundingSphere(sphere,{duration:.7,offset:new C.HeadingPitchRange(0,C.Math.toRadians(-58),Math.max(sphere.radius*3.5,350))});
 },[phase,props.selectedId,props.focusVersion,props.items]);

 useEffect(()=>{
  const C=engineRef.current,viewer=viewerRef.current;if(!C||!viewer||phase!=='ready'||first.current)return;
  if(resetCounter>0)viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(current.current.center[0],current.current.center[1],3000),
   orientation:{heading:0,pitch:C.Math.toRadians(-62),roll:0},duration:.7});
 },[resetCounter,phase]);
 useEffect(()=>{first.current=false;},[]);
 useEffect(()=>{const C=engineRef.current,viewer=viewerRef.current;if(!C||!viewer||phase!=='ready'||props.homeVersion===0)return;
  const bounds=props.items.map(i=>extentOf(i.geometry)).filter((e):e is [number,number,number,number]=>e!==null);
  if(!bounds.length)return;
  const west=Math.min(...bounds.map(e=>e[0])),south=Math.min(...bounds.map(e=>e[1])),east=Math.max(...bounds.map(e=>e[2])),north=Math.max(...bounds.map(e=>e[3]));
  viewer.camera.flyTo({destination:C.Rectangle.fromDegrees(west,south,east,north),orientation:{heading:0,pitch:C.Math.toRadians(-65),roll:0},duration:.7});
 },[phase,props.homeVersion]);
 return <div className={styles.root} aria-label="三维农业地图" role="application">
  <div ref={host} className={styles.canvas}/>
  <div className={styles.actions}>
   <button type="button" onClick={()=>setResetCounter(n=>n+1)} disabled={phase!=='ready'}>复位视角</button>
   <button type="button" onClick={props.onFallback}>返回 2D</button>
  </div>
  <div className={styles.notice} role="status">
   {phase==='loading'?'正在加载 Cesium 三维引擎…':note}
   {phase==='ready'&&<small> · 卫星影像位于参考椭球表面，不代表实测地面起伏</small>}
  </div>
 </div>;
}
