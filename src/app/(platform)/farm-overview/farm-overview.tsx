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

type Geometry={type:string;coordinates:unknown};
type FarmObject={id:string;name:string;code:string;kind:string;version:number;boundary_status:string;geometry:Geometry|null};
type MapData={items:FarmObject[]};
const key=process.env.NEXT_PUBLIC_TIANDITU_KEY?.trim()??'';
const labels:Record<string,string>={farm:'农场',field:'农田',pond:'塘口',channel:'渠道',facility:'设施'};
const kindOrder=['farm','field','pond','channel','facility'];
const defaultStyle=new Style({stroke:new Stroke({color:'#e8f5d0',width:2.5}),fill:new Fill({color:'rgba(75,112,45,.24)'})});
const draftStyle=new Style({stroke:new Stroke({color:'#f2bd62',width:2.5,lineDash:[8,5]}),fill:new Fill({color:'rgba(184,130,48,.22)'})});
const selectedStyle=new Style({stroke:new Stroke({color:'#fff',width:4}),fill:new Fill({color:'rgba(146,195,49,.42)'})});

export default function FarmOverview(){
 const {data,error,loading,reload}=useApi<MapData>('/api/v1/map');
 const me=useApi<{actor:{role:string}}>('/api/v1/me');
 const target=useRef<HTMLDivElement>(null),mapRef=useRef<Map|null>(null),sourceRef=useRef<VectorSource<Feature>|null>(null),selectedRef=useRef<string|null>(null),returnFocus=useRef<HTMLElement|null>(null);
 const [query,setQuery]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null),[directoryOpen,setDirectoryOpen]=useState(false),[tileError,setTileError]=useState(false);
 const items=data?.items??[];
 const selected=items.find(item=>item.id===selectedId)??null;
 const filtered=useMemo(()=>items.filter(item=>(item.name+' '+item.code).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[items,query]);
 const groups=useMemo(()=>kindOrder.map(kind=>({kind,items:filtered.filter(item=>item.kind===kind)})).filter(group=>group.items.length),[filtered]);
 const located=items.filter(item=>item.geometry).length;

 useEffect(()=>{selectedRef.current=selectedId;sourceRef.current?.changed();},[selectedId]);
 useEffect(()=>{if(!validBrowserKey(key)||!target.current)return;
  const imagery=new XYZ({urls:tiandituWmtsUrls('img',key),maxZoom:18,attributions:'© 国家地理信息公共服务平台 天地图'});
  imagery.on('tileloaderror',()=>setTileError(true));
  const annotations=new XYZ({urls:tiandituWmtsUrls('cia',key),maxZoom:18});
  const vectors=new VectorSource<Feature>();sourceRef.current=vectors;
  const layer=new VectorLayer({source:vectors,style:feature=>feature.get('objectId')===selectedRef.current?selectedStyle:feature.get('status')==='verified'?defaultStyle:draftStyle});
  const view=new View({center:fromLonLat(INITIAL_CENTER_4326),zoom:11,minZoom:2,maxZoom:18});
  const map=new Map({target:target.current,layers:[new TileLayer({source:imagery}),new TileLayer({source:annotations}),layer],view});mapRef.current=map;
  map.on('singleclick',event=>{const feature=map.forEachFeatureAtPixel(event.pixel,f=>f,{layerFilter:visible=>visible===layer});const id=feature?.get('objectId') as string|undefined;if(id){returnFocus.current=null;setSelectedId(id);}});
  const observer=new ResizeObserver(()=>map.updateSize());observer.observe(target.current);
  return()=>{observer.disconnect();map.setTarget(undefined);mapRef.current=null;sourceRef.current=null;};
 },[]);
 useEffect(()=>{const source=sourceRef.current,map=mapRef.current;if(!source||!map)return;source.clear();const format=new GeoJSON();for(const item of items){if(!item.geometry)continue;try{const features=format.readFeatures(item.geometry,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});for(const feature of features){feature.set('objectId',item.id);feature.set('status',item.boundary_status);source.addFeature(feature);}}catch{/* 无效几何不绘制，对象仍在目录 */}}
  if(source.getFeatures().length){const extent=source.getExtent();if(extent&&!isEmpty(extent))map.getView().fit(extent,{padding:[75,75,75,75],maxZoom:14,duration:0});}
 },[items]);
 useEffect(()=>{if(selectedId&&!items.some(item=>item.id===selectedId))setSelectedId(null);},[items,selectedId]);
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&selectedRef.current){setSelectedId(null);returnFocus.current?.focus();}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);

 const focus=(item:FarmObject,trigger?:HTMLElement)=>{returnFocus.current=trigger??null;setSelectedId(item.id);setDirectoryOpen(false);if(!item.geometry)return;const source=sourceRef.current,map=mapRef.current;if(!source||!map)return;const features=source.getFeatures().filter(feature=>feature.get('objectId')===item.id);if(!features.length)return;const extent=boundingExtent(features.flatMap(feature=>{const e=feature.getGeometry()?.getExtent();return e?[[e[0],e[1]],[e[2],e[3]]]:[];}));if(!isEmpty(extent))map.getView().fit(extent,{padding:[80,Math.min(430,Math.round((target.current?.clientWidth??900)*.36)),80,55],maxZoom:15,duration:350});};
 const fullView=()=>{const map=mapRef.current,source=sourceRef.current,extent=source?.getExtent();if(map&&source?.getFeatures().length&&extent)map.getView().fit(extent,{padding:[75,75,75,75],maxZoom:14,duration:350});};
 const close=()=>{setSelectedId(null);returnFocus.current?.focus();};
 return <section className={styles.page} aria-label="农场空间总览"><div className={styles.heading}><div><span className={styles.eyebrow}>FARM OVERVIEW · D1</span><h1>农场空间总览</h1><p>以已授权农业对象浏览卫星地图。村庄目录将在后续阶段接入。</p></div><div className={styles.headingActions}><Link href="/map">原二维地图 ↗</Link><Link href="/map-prototype">私人标点 ↗</Link></div></div>
 <div className={styles.summary}><span><strong>{items.length}</strong> 个可见对象</span><span><strong>{located}</strong> 个有边界</span><span>边界状态以登记资料为准</span><button type="button" onClick={()=>void reload()}>刷新授权资料</button></div>
 <div className={styles.workspace}><aside className={`${styles.directory} ${directoryOpen?styles.directoryOpen:''}`} aria-label="农业对象目录"><div className={styles.directoryTop}><div><span className={styles.eyebrow}>OBJECTS</span><h2>已授权农业对象</h2></div><button type="button" className={styles.mobileClose} onClick={()=>setDirectoryOpen(false)} aria-label="关闭对象目录">×</button></div><p className={styles.directoryNote}>按正式对象类别浏览；此阶段不创建村庄分组。</p><label className={styles.searchLabel}>搜索名称或编号<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索农田、塘口、设施…"/></label><div className={styles.groups}>{loading&&<p role="status">正在读取已授权对象…</p>}{error&&<div className={styles.error} role="alert">{error}<button type="button" onClick={()=>void reload()}>重试</button></div>}{!loading&&!error&&!items.length&&<p>当前没有可查看的农业对象。</p>}{!loading&&!error&&items.length&&!filtered.length&&<p>没有匹配的已授权对象。</p>}{groups.map(group=><section key={group.kind}><h3>{labels[group.kind]??group.kind}<span>{group.items.length}</span></h3><ul>{group.items.map(item=><li key={item.id}><button type="button" className={selectedId===item.id?styles.activeItem:styles.item} onClick={event=>focus(item,event.currentTarget)} aria-current={selectedId===item.id?'true':undefined}><span className={styles.itemName}>{item.name}</span><span className={styles.itemMeta}>{item.code} · {item.geometry?item.boundary_status==='verified'?'已核实边界':'边界草稿':'待登记边界'}</span></button></li>)}</ul></section>)}</div></aside>
 <div className={styles.mapShell}><div className={styles.mapToolbar}><button type="button" className={styles.mobileDirectory} onClick={()=>setDirectoryOpen(true)}>☰ 对象目录</button><div><strong>卫星地图</strong><span>真实影像 · 已授权边界</span></div><button type="button" onClick={fullView}>全场视图</button></div>{validBrowserKey(key)?<div ref={target} className={styles.map} aria-label="天地图卫星影像及已授权农业对象边界" role="application"/>:<div className={styles.mapFallback} role="status">当前环境未配置有效天地图 Key，无法加载卫星影像。</div>}{tileError&&<p className={styles.tileWarning} role="status">部分影像瓦片加载失败，请检查网络后刷新；已读取的对象目录仍可浏览。</p>}<div className={styles.mapLegend}><span><i className={styles.verified}/> 已核实边界</span><span><i className={styles.draft}/> 边界草稿</span><span>无边界对象可从目录查看</span></div>
 {selected&&<aside className={styles.drawer} aria-label="对象详情" aria-live="polite"><div className={styles.drawerTop}><span className={styles.eyebrow}>OBJECT DETAIL</span><button type="button" onClick={close} aria-label="关闭对象详情">×</button></div><span className={styles.kind}>{labels[selected.kind]??selected.kind}</span><h2>{selected.name}</h2><p className={styles.objectCode}>{selected.code}</p><dl><div><dt>边界</dt><dd>{selected.geometry?selected.boundary_status==='verified'?'已核实':'草稿，尚未核实':'待登记'}</dd></div><div><dt>对象版本</dt><dd>{selected.version}</dd></div><div><dt>资料范围</dt><dd>仅当前账号获授权内容</dd></div></dl><p className={styles.drawerHint}>此处只显示对象基本资料。面积、测值和设备状态请以原业务页面及来源记录为准。</p><div className={styles.drawerLinks}>{me.data?.actor.role&&me.data.actor.role!=='expert'&&<Link href={`/objects/${selected.id}`}>查看对象详情 ↗</Link>}<Link href="/map">打开原二维地图 ↗</Link></div></aside>}
 </div></div><p className={styles.footerNote}>地图仅供浏览。没有边界的对象不生成虚构坐标；地图邻近不证明设备归属。当前列表使用原 `/api/v1/map` 授权结果，最多展示 500 个对象。</p></section>;
}
