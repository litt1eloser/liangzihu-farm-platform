'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import {boundingExtent,isEmpty} from 'ol/extent.js';
import {fromLonLat} from 'ol/proj.js';
import {useApi} from '@/components/platform/use-api';
import {INITIAL_CENTER_4326,tiandituWmtsUrls,validBrowserKey} from '@/modules/map-prototype/tianditu';
import styles from './farm-overview.module.css';
import RegionManagement from './region-management';

type Geometry={type:string;coordinates:unknown};
type FarmObject={id:string;name:string;code:string;kind:string;version:number;boundary_status:string;geometry:Geometry|null;object_source?:string;object_recorded_at?:string;boundary_source?:string|null;boundary_recorded_at?:string|null};
type Region={id:string;farmId:string;name:string;version:number;archivedAt:string|null;links:{objectId:string}[]};
type Summary={object_id:string;open_alerts:number;record_count:number;point_count:number};
type MobileDevice={binding_id:string;object_id:string;machine_id:string;machine_name:string;terminal_id:string;terminal_name:string;valid_until:string};
type MapData={items:FarmObject[];regions:Region[];summaries:Summary[];mobileDevices:MobileDevice[]};
const key=process.env.NEXT_PUBLIC_TIANDITU_KEY?.trim()??'';
const labels:Record<string,string>={farm:'农场',field:'农田',pond:'塘口',channel:'渠道',facility:'设施'};
const kindOrder=['farm','field','pond','channel','facility'];
const defaultStyle=new Style({stroke:new Stroke({color:'#e8f5d0',width:2.5}),fill:new Fill({color:'rgba(75,112,45,.24)'})});
const draftStyle=new Style({stroke:new Stroke({color:'#f2bd62',width:2.5,lineDash:[8,5]}),fill:new Fill({color:'rgba(184,130,48,.22)'})});
const selectedStyle=new Style({stroke:new Stroke({color:'#fff',width:4}),fill:new Fill({color:'rgba(146,195,49,.42)'})});
const stateKey='farm-overview-return-v1';
type SavedState={query:string;selectedId:string|null;center:number[];zoom:number;directoryCollapsed:boolean};
function savedState():SavedState|null{try{const raw=sessionStorage.getItem(stateKey);if(!raw)return null;const value=JSON.parse(raw) as SavedState;return typeof value.query==='string'&&value.query.length<=200&&(!value.selectedId||/^[a-f0-9-]{36}$/i.test(value.selectedId))&&Array.isArray(value.center)&&value.center.length===2&&value.center.every(Number.isFinite)&&Number.isFinite(value.zoom)&&value.zoom>=2&&value.zoom<=18&&typeof value.directoryCollapsed==='boolean'?value:null;}catch{return null;}}

export default function FarmOverview(){
 const {data,error,loading,reload}=useApi<MapData>('/api/v1/farm-overview');
 const lastLoaded=useRef<MapData|null>(null);if(data)lastLoaded.current=data;
 const offline=error.startsWith('网络不可用');
 const displayData=data??(offline?lastLoaded.current:null);
 const me=useApi<{actor:{role:string}}>('/api/v1/me');
 const target=useRef<HTMLDivElement>(null),mapRef=useRef<Map|null>(null),sourceRef=useRef<VectorSource<Feature>|null>(null),selectedRef=useRef<string|null>(null),returnFocus=useRef<HTMLElement|null>(null),itemsRef=useRef<FarmObject[]>([]),selectionAnchor=useRef<{id:string;coordinate:number[]}|null>(null);
 const restored=useRef<SavedState|null>(null),initialised=useRef(false),skipInitialFit=useRef(false),restoreApplied=useRef(false);
 const [query,setQuery]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null),[selectionVersion,setSelectionVersion]=useState(0),[directoryOpen,setDirectoryOpen]=useState(false),[directoryCollapsed,setDirectoryCollapsed]=useState(false),[tileError,setTileError]=useState(false);
 const items=displayData?.items??[];
 itemsRef.current=items;
 const selected=items.find(item=>item.id===selectedId)??null;
 const selectedSummary=displayData?.summaries.find(row=>row.object_id===selectedId);
 const mobileDevices=displayData?.mobileDevices??[];
 const filtered=useMemo(()=>items.filter(item=>(item.name+' '+item.code).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[items,query]);
 const regions=displayData?.regions?.filter(region=>!region.archivedAt)??[];
 const groups=useMemo(()=>{
  if(!regions.length)return kindOrder.map(kind=>({kind,label:labels[kind]??kind,items:filtered.filter(item=>item.kind===kind)})).filter(group=>group.items.length);
  const assigned=new Set(regions.flatMap(region=>region.links.map(link=>link.objectId)));
  const search=query.trim().toLocaleLowerCase();
  const villageGroups=regions.map(region=>({kind:region.id,label:region.name,items:(region.name.toLocaleLowerCase().includes(search)?items:filtered).filter(item=>region.links.some(link=>link.objectId===item.id))}));
  const unassigned=filtered.filter(item=>item.kind!=='farm'&&!assigned.has(item.id));
  const farms=filtered.filter(item=>item.kind==='farm');
  return [...villageGroups,...(unassigned.length?[{kind:'unassigned',label:'未关联村庄',items:unassigned}]:[]),...(farms.length?[{kind:'farm',label:'农场',items:farms}]:[])];
 },[filtered,items,query,regions]);
 const located=items.filter(item=>item.geometry).length;

 const revealObject=(item:FarmObject,anchor?:number[])=>{const map=mapRef.current,source=sourceRef.current,element=target.current;if(!map||!source||!element||!item.geometry)return;
  const features=source.getFeatures().filter(feature=>feature.get('objectId')===item.id);if(!features.length)return;
  const extent=boundingExtent(features.flatMap(feature=>{const e=feature.getGeometry()?.getExtent();return e?[[e[0],e[1]],[e[2],e[3]]]:[];}));if(isEmpty(extent))return;
  map.updateSize();const point=anchor??[(extent[0]+extent[2])/2,(extent[1]+extent[3])/2],pixel=map.getPixelFromCoordinate(point),size=map.getSize();if(!pixel||!size)return;
  const mapRect=element.getBoundingClientRect(),drawer=element.parentElement?.querySelector<HTMLElement>('[aria-label="对象详情"]'),drawerRect=drawer?.getBoundingClientRect();
  const mobile=window.matchMedia('(max-width:760px)').matches;
  const left=24,top=72,right=drawerRect&&!mobile?Math.max(left+1,drawerRect.left-mapRect.left-18):size[0]-24;
  const bottom=drawerRect&&mobile?Math.max(top+1,drawerRect.top-mapRect.top-18):size[1]-48;
  const cornerA=map.getPixelFromCoordinate([extent[0],extent[1]]),cornerB=map.getPixelFromCoordinate([extent[2],extent[3]]);
  const horizontal=cornerA&&cornerB?[Math.min(cornerA[0],cornerB[0]),Math.max(cornerA[0],cornerB[0])]:null;
  const vertical=cornerA&&cornerB?[Math.min(cornerA[1],cornerB[1]),Math.max(cornerA[1],cornerB[1])]:null;
  const dx=horizontal&&horizontal[1]-horizontal[0]<=right-left?(horizontal[1]>right?right-horizontal[1]:horizontal[0]<left?left-horizontal[0]:0):Math.min(Math.max(pixel[0],left),right)-pixel[0];
  const dy=vertical&&vertical[1]-vertical[0]<=bottom-top?(vertical[1]>bottom?bottom-vertical[1]:vertical[0]<top?top-vertical[0]:0):Math.min(Math.max(pixel[1],top),bottom)-pixel[1];
  const desiredX=pixel[0]+dx,desiredY=pixel[1]+dy;
  if(Math.abs(pixel[0]-desiredX)<1&&Math.abs(pixel[1]-desiredY)<1)return;
  const view=map.getView(),center=view.getCenter(),resolution=view.getResolution();if(!center||!resolution)return;
  view.cancelAnimations();view.animate({center:[center[0]+(pixel[0]-desiredX)*resolution,center[1]-(pixel[1]-desiredY)*resolution],duration:260});
 };
 const selectObject=(item:FarmObject,trigger?:HTMLElement,coordinate?:number[])=>{returnFocus.current=trigger??null;selectionAnchor.current=coordinate?{id:item.id,coordinate}:null;setSelectedId(item.id);setSelectionVersion(version=>version+1);setDirectoryOpen(false);};

 useEffect(()=>{if(initialised.current)return;initialised.current=true;const state=savedState();if(!state)return;restored.current=state;skipInitialFit.current=true;setQuery(state.query);setSelectedId(state.selectedId);setDirectoryCollapsed(state.directoryCollapsed);},[]);

 useEffect(()=>{selectedRef.current=selectedId;sourceRef.current?.changed();},[selectedId]);
 useEffect(()=>{if(!validBrowserKey(key)||!target.current)return;
  const returnState=savedState();if(returnState){restored.current=returnState;skipInitialFit.current=true;restoreApplied.current=false;}
  const imagery=new XYZ({urls:tiandituWmtsUrls('img',key),maxZoom:18,attributions:'© 国家地理信息公共服务平台 天地图'});
  imagery.on('tileloaderror',()=>setTileError(true));
  const annotations=new XYZ({urls:tiandituWmtsUrls('cia',key),maxZoom:18});
  const vectors=new VectorSource<Feature>();sourceRef.current=vectors;
  const layer=new VectorLayer({source:vectors,style:feature=>feature.get('objectId')===selectedRef.current?selectedStyle:feature.get('kind')==='facility'&&(mapRef.current?.getView().getZoom()??11)<13?undefined:feature.get('status')==='verified'?defaultStyle:draftStyle});
  const view=new View({center:restored.current?.center??fromLonLat(INITIAL_CENTER_4326),zoom:restored.current?.zoom??11,minZoom:2,maxZoom:18});
  const map=new Map({target:target.current,layers:[new TileLayer({source:imagery}),new TileLayer({source:annotations}),layer],view});mapRef.current=map;
  target.current.dataset.viewCenter=view.getCenter()?.join(',')??'';target.current.dataset.viewZoom=String(view.getZoom()??11);
  view.on('change:center',()=>{if(target.current)target.current.dataset.viewCenter=view.getCenter()?.join(',')??'';});
  view.on('change:resolution',()=>{if(target.current)target.current.dataset.viewZoom=String(view.getZoom()??'');vectors.changed();});
  map.on('singleclick',event=>{const feature=map.forEachFeatureAtPixel(event.pixel,f=>f,{layerFilter:visible=>visible===layer});const id=feature?.get('objectId') as string|undefined,item=itemsRef.current.find(row=>row.id===id);if(item)selectObject(item,undefined,event.coordinate);});
  const observer=new ResizeObserver(()=>map.updateSize());observer.observe(target.current);
  return()=>{observer.disconnect();map.setTarget(undefined);mapRef.current=null;sourceRef.current=null;};
 },[]);
 useEffect(()=>{const source=sourceRef.current,map=mapRef.current;if(!source||!map)return;source.clear();const format=new GeoJSON();for(const item of items){if(!item.geometry)continue;try{const features=format.readFeatures(item.geometry,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});for(const feature of features){feature.set('objectId',item.id);feature.set('status',item.boundary_status);feature.set('kind',item.kind);source.addFeature(feature);}}catch{/* 无效几何不绘制，对象仍在目录 */}}
  if(source.getFeatures().length){if(!skipInitialFit.current){const extent=source.getExtent();if(extent&&!isEmpty(extent))map.getView().fit(extent,{padding:[75,75,75,75],maxZoom:14,duration:0});}skipInitialFit.current=false;}
 },[items]);
 useEffect(()=>{const state=restored.current,map=mapRef.current;if(!data||!map||!state||restoreApplied.current)return;restoreApplied.current=true;const view=map.getView();view.cancelAnimations();view.setCenter(state.center);view.setZoom(state.zoom);},[data]);
 useEffect(()=>{if(data&&selectedId&&!items.some(item=>item.id===selectedId))setSelectedId(null);},[data,items,selectedId]);
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&selectedRef.current){setSelectedId(null);returnFocus.current?.focus();}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 useEffect(()=>{const item=itemsRef.current.find(row=>row.id===selectedId);if(!item||selectionVersion===0)return;const frame=window.requestAnimationFrame(()=>revealObject(item,selectionAnchor.current?.id===item.id?selectionAnchor.current.coordinate:undefined));return()=>window.cancelAnimationFrame(frame);},[selectedId,selectionVersion]);
 useEffect(()=>{const frame=window.requestAnimationFrame(()=>{mapRef.current?.updateSize();const item=itemsRef.current.find(row=>row.id===selectedRef.current);if(item)revealObject(item,selectionAnchor.current?.id===item.id?selectionAnchor.current.coordinate:undefined);});return()=>window.cancelAnimationFrame(frame);},[directoryCollapsed]);

 const fullView=()=>{const map=mapRef.current,source=sourceRef.current,extent=source?.getExtent();if(map&&source?.getFeatures().length&&extent)map.getView().fit(extent,{padding:[75,75,75,75],maxZoom:14,duration:350});};
 const focusRegion=(regionId:string)=>{const region=regions.find(row=>row.id===regionId),map=mapRef.current,source=sourceRef.current;if(!region||!map||!source)return;const ids=new Set(region.links.map(link=>link.objectId));const features=source.getFeatures().filter(feature=>ids.has(feature.get('objectId') as string));if(!features.length)return;const extent=boundingExtent(features.flatMap(feature=>{const bounds=feature.getGeometry()?.getExtent();return bounds?[[bounds[0],bounds[1]],[bounds[2],bounds[3]]]:[];}));if(isEmpty(extent))return;setSelectedId(null);setDirectoryOpen(false);map.updateSize();map.getView().fit(extent,{padding:[85,85,85,85],maxZoom:14,duration:350});};
 const saveReturnState=()=>{const view=mapRef.current?.getView(),center=view?.getCenter(),zoom=view?.getZoom();if(center&&zoom!==undefined)sessionStorage.setItem(stateKey,JSON.stringify({query,selectedId,center,zoom,directoryCollapsed} satisfies SavedState));};
 const close=()=>{setSelectedId(null);returnFocus.current?.focus();};
 return <section className={styles.page} aria-label="农场空间总览"><div className={styles.heading}><div><span className={styles.eyebrow}>FARM OVERVIEW · D2</span><h1>农场空间总览</h1><p>以已授权农业对象浏览卫星地图，按村庄目录查看关联与已有业务概要。</p></div><div className={styles.headingActions}><Link href="/map">图层与原二维地图 ↗</Link><Link href="/imagery">历史航次与影像 ↗</Link><Link href="/terrain">三维地形 ↗</Link><Link href="/map-prototype">私人标点 ↗</Link></div></div>
 <div className={styles.summary}><span><strong>{items.length}</strong> 个可见对象</span><span><strong>{located}</strong> 个有边界</span><span>边界状态以登记资料为准</span><button type="button" onClick={()=>void reload()}>刷新授权资料</button></div>
 <div className={`${styles.workspace} ${directoryCollapsed?styles.workspaceCollapsed:''}`}><aside id="farm-object-directory" className={`${styles.directory} ${directoryOpen?styles.directoryOpen:''}`} aria-label="农业对象目录"><div className={styles.directoryTop}><div><span className={styles.eyebrow}>OBJECTS</span><h2>已授权农业对象</h2></div><button type="button" className={styles.mobileClose} onClick={()=>setDirectoryOpen(false)} aria-label="关闭对象目录">×</button></div><p className={styles.directoryNote}>村庄只用于目录分组；未关联的对象仍可查看。</p><label className={styles.searchLabel}>搜索名称或编号<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索农田、塘口、设施…"/></label>{!offline&&<RegionManagement regions={displayData?.regions??[]} onSaved={()=>void reload()}/>}<div className={styles.groups}>{loading&&<p role="status">正在读取已授权对象…</p>}{error&&<div className={styles.error} role="alert">{error}{offline&&lastLoaded.current&&<p>正在显示上次成功读取的资料，当前状态尚未重新核实。</p>}<button type="button" onClick={()=>void reload()}>重试</button></div>}{!loading&&!error&&!items.length&&<p>当前没有可查看的农业对象。</p>}{!loading&&!error&&items.length&&!filtered.length&&<p>没有匹配的已授权对象。</p>}{groups.map(group=><section key={group.kind}><h3>{regions.some(region=>region.id===group.kind)?<button type="button" className={styles.regionFocus} onClick={()=>focusRegion(group.kind)} aria-label={`定位村庄 ${group.label}`} disabled={!group.items.some(item=>item.geometry)}>{group.label} ↗</button>:group.label}<span>{group.items.length}</span></h3><ul>{group.items.map(item=><li key={item.id}><button type="button" className={selectedId===item.id?styles.activeItem:styles.item} onClick={event=>selectObject(item,event.currentTarget)} aria-current={selectedId===item.id?'true':undefined}><span className={styles.itemName}>{item.name}</span><span className={styles.itemMeta}>{item.code} · {item.geometry?item.boundary_status==='verified'?'已核实边界':'边界草稿':'待登记边界'}</span></button></li>)}</ul></section>)}</div><section className={styles.mobileSection}><h3>机动设备<span>{mobileDevices.length}</span></h3>{mobileDevices.length?<ul>{mobileDevices.map(binding=><li key={binding.binding_id}><strong>{binding.machine_name}</strong><small> · 定位终端：{binding.terminal_name} · 位置未知（无实时定位数据） · 绑定有效期至 {new Date(binding.valid_until).toLocaleDateString('zh-CN')}</small></li>)}</ul>:<p className={styles.directoryNote}>当前授权对象下暂无有效农机绑定。</p>}<Link href="/machinery">打开农机业务 ↗</Link></section></aside>
 <div className={styles.mapShell}><div className={styles.mapToolbar}><button type="button" className={styles.mobileDirectory} onClick={()=>setDirectoryOpen(true)}>☰ 对象目录</button><button type="button" className={styles.desktopDirectory} aria-controls="farm-object-directory" aria-expanded={!directoryCollapsed} onClick={()=>setDirectoryCollapsed(value=>!value)}>{directoryCollapsed?'展开对象目录':'收起对象目录'}</button><div><strong>卫星地图</strong><span>真实影像 · 已授权边界</span></div><button type="button" onClick={fullView}>全场视图</button></div>{validBrowserKey(key)?<div ref={target} className={styles.map} data-view-zoom="11" data-view-center="" aria-label="天地图卫星影像及已授权农业对象边界" role="application"/>:<div className={styles.mapFallback} role="status">当前环境未配置有效天地图 Key，无法加载卫星影像。</div>}{tileError&&<p className={styles.tileWarning} role="status">部分影像瓦片加载失败，请检查网络后刷新；已读取的对象目录仍可浏览。</p>}<div className={styles.mapLegend}><span><i className={styles.verified}/> 已核实边界</span><span><i className={styles.draft}/> 边界草稿</span><span>无边界对象可从目录查看</span></div>
 {selected&&<aside className={styles.drawer} aria-label="对象详情" aria-live="polite"><div className={styles.drawerTop}><span className={styles.eyebrow}>OBJECT DETAIL</span><button type="button" onClick={close} aria-label="关闭对象详情">×</button></div><span className={styles.kind}>{labels[selected.kind]??selected.kind}</span><h2>{selected.name}</h2><p className={styles.objectCode}>{selected.code}</p><dl><div><dt>边界</dt><dd>{selected.geometry?selected.boundary_status==='verified'?'已核实':'草稿，尚未核实':'待登记'}</dd></div><div><dt>对象版本</dt><dd>{selected.version}</dd></div><div><dt>资料来源</dt><dd>{selected.geometry?selected.boundary_source??selected.object_source??'未登记':selected.object_source??'未登记'}</dd></div><div><dt>{selected.geometry&&selected.boundary_recorded_at?'边界记录时间':'对象建档时间'}</dt><dd>{selected.geometry&&selected.boundary_recorded_at?new Date(selected.boundary_recorded_at).toLocaleString('zh-CN'):selected.object_recorded_at?new Date(selected.object_recorded_at).toLocaleString('zh-CN'):'未提供'}</dd></div><div><dt>资料范围</dt><dd>仅当前账号获授权内容</dd></div></dl>{selectedSummary&&<p>未关闭告警 {selectedSummary.open_alerts} · 农事记录 {selectedSummary.record_count} · 测点 {selectedSummary.point_count}</p>}<p className={styles.drawerHint}>概要只统计已有告警、农事记录和测点；完整内容请在原业务页面核对。</p><div className={styles.drawerLinks}>{me.data?.actor.role&&me.data.actor.role!=='expert'&&<Link href={`/objects/${selected.id}`} onClick={saveReturnState}>查看对象详情 ↗</Link>}<Link href="/map">打开原二维地图 ↗</Link></div></aside>}
 </div></div><p className={styles.footerNote}>地图仅供浏览。没有边界的对象不生成虚构坐标；地图邻近不证明设备归属。当前列表使用既有地图授权结果，最多展示 500 个对象。</p></section>;
}
