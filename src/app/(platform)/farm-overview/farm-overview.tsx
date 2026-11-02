'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Draw from 'ol/interaction/Draw.js';
import Polygon from 'ol/geom/Polygon.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import VectorSource from 'ol/source/Vector.js';
import {boundingExtent,isEmpty,createEmpty} from 'ol/extent.js';
import {fromLonLat} from 'ol/proj.js';
import Style from 'ol/style/Style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import {useApi} from '@/components/platform/use-api';
import {tiandituWmtsUrls,validBrowserKey} from '@/modules/map-prototype/tianditu';
import styles from './farm-overview.module.css';
import DetailPanel from './detail-panel';
import {resolveBusinessClass,nextTabOnSelection,type DetailTabId,type RecordFilter,type SelectionClass} from './detail-classes';
import KindIcon from './kind-icon';
import ManagementDrawer from './management-drawer';
import ResourceTree from './resource-tree';
import type Tree from '@rc-component/tree';
import { buildTreeData, getDefaultExpandedKeys, type TreeNodeData } from './resource-tree-helpers';
import LayerPanel from './layer-panel';
import {demoAlerts,demoItems,demoRegions,demoTasks,type DemoItem} from './demo-fixture';
import {CATEGORY_ORDER,objectStyles,selectedStyles,demoStyles,facilitySymbolFromCode} from './map-symbols';
import CadReferenceCard,{type CadCategory,type CadFeatureProperties} from './cad-reference-card';

type CadFeatureCollection={type:'FeatureCollection';features:{type:'Feature';id?:string;geometry:{type:string;coordinates:unknown}|null;properties:CadFeatureProperties}[]};
type Geometry={type:string;coordinates:unknown};
type FarmObject={id:string;farm_id?:string;farmId?:string;symbol?:string;name:string;code:string;kind:string;version:number;boundary_status:string;geometry:Geometry|null;object_source?:string;object_recorded_at?:string;boundary_source?:string|null;boundary_recorded_at?:string|null;regionId?:string;detail?:string;status?:string;metric?:string;sampledAt?:string};
type Region={id:string;farmId:string;name:string;version:number;archivedAt:string|null;links:{objectId:string}[]};
type Summary={object_id:string;open_alerts:number;record_count:number;point_count:number};
type MobileDevice={binding_id:string;object_id:string;machine_id:string;machine_name:string;terminal_id:string;terminal_name:string;valid_until:string};
type MapData={items:FarmObject[];regions:Region[];summaries:Summary[];mobileDevices:MobileDevice[]};
const key=process.env.NEXT_PUBLIC_TIANDITU_KEY?.trim()??'';
const FARM_HOME_4326:[number,number]=[114.635,30.25];
const defaultVisibility:Record<string,boolean>=Object.fromEntries(CATEGORY_ORDER.map(kind=>[kind,true]));
const labels:Record<string,string>={farm:'农场',field:'农田',pond:'塘口',channel:'渠道',facility:'设施'};
const cadLayerOrder:CadCategory[]=['land','road','canal'];
const kindOrder=['farm','field','pond','channel','facility'];
const stateKey='farm-overview-return-v1';
type SavedState={query:string;selectedId:string|null;expandedKeys:string[];center:number[];zoom:number;directoryCollapsed:boolean;basemap:'vector'|'satellite';visibility:Record<string,boolean>;detailTab?:DetailTabId;recordFilter?:RecordFilter;annotationsVisible?:boolean;cadVisibility?:Record<CadCategory,boolean>};
const detailTabIds:DetailTabId[]=['basic','production','monitoring','operation','devices','records'];
const recordFilters:RecordFilter[]=['all','operation','inspection','alert','maintenance','farm_work','aquaculture'];
function savedState():SavedState|null{try{const raw=sessionStorage.getItem(stateKey);if(!raw)return null;const value=JSON.parse(raw) as SavedState;if(typeof value.query!=='string'||value.query.length>200)return null;if(value.selectedId!==null&&!/^[a-f0-9-]{36}$/i.test(value.selectedId))return null;if(!Array.isArray(value.expandedKeys)||value.expandedKeys.length>500||!value.expandedKeys.every(k=>typeof k==='string'&&k.length<120))return null;if(!Array.isArray(value.center)||value.center.length!==2||!value.center.every(Number.isFinite))return null;if(!Number.isFinite(value.zoom)||value.zoom<2||value.zoom>18)return null;if(typeof value.directoryCollapsed!=='boolean')return null;const basemap=value.basemap==='satellite'?'satellite':'vector';const visibility:Record<string,boolean>={...defaultVisibility};if(value.visibility&&typeof value.visibility==='object'){for(const k of CATEGORY_ORDER){if(typeof value.visibility[k]==='boolean')visibility[k]=value.visibility[k];}}const detailTab=detailTabIds.includes(value.detailTab as DetailTabId)?value.detailTab:'basic';const recordFilter=recordFilters.includes(value.recordFilter as RecordFilter)?value.recordFilter:'all';const annotationsVisible=typeof value.annotationsVisible==='boolean'?value.annotationsVisible:true;const cadVisibility:Record<CadCategory,boolean>={land:true,road:true,canal:true};if(value.cadVisibility&&typeof value.cadVisibility==='object'){for(const k of cadLayerOrder){if(typeof value.cadVisibility[k]==='boolean')cadVisibility[k]=value.cadVisibility[k];}}return{...value,basemap,visibility,detailTab,recordFilter,annotationsVisible,cadVisibility};}catch{return null;}}

function TopLinkIcon({type}:{type:'map'|'terrain'|'dashboard'|'devices'}){
 const common={width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true,className:styles.topLinkIcon};
 if(type==='terrain')return <svg {...common}><path d="M2 13 6 5l3 5 2-3 3 6z"/><path d="M6 5l1.5 2.5"/></svg>;
 if(type==='dashboard')return <svg {...common}><path d="M3 13h10M4 10V6M8 10V3M12 10V7"/></svg>;
 if(type==='devices')return <svg {...common}><path d="M5 5h6v6H5zM8 2v3M8 11v3M2 8h3M11 8h3"/></svg>;
 return <svg {...common}><path d="M2.5 4.5 6 3l4 1.5L13.5 3v9L10 13.5 6 12l-3.5 1.5z"/><path d="M6 3v9M10 4.5v9"/></svg>;
}

export default function FarmOverview(){
 const [mode,setMode]=useState<'real'|'demo'>('real');
 const [addedDemo,setAddedDemo]=useState<DemoItem[]>([]),[demoFormOpen,setDemoFormOpen]=useState(false),[demoKind,setDemoKind]=useState<'field'|'pond'|'gate'|'pump'|'drone'|'harvester'>('field'),[demoName,setDemoName]=useState(''),[demoRegionId,setDemoRegionId]=useState(demoRegions[0].id),[drawing,setDrawing]=useState(false);
 const [basemap,setBasemap]=useState<'vector'|'satellite'>('vector');
 const [annotationsVisible,setAnnotationsVisible]=useState(true);
 const [categoryVisibility,setCategoryVisibility]=useState<Record<string,boolean>>(defaultVisibility);
 const [layerPanelOpen,setLayerPanelOpen]=useState(false);
 const [cadVisibility,setCadVisibility]=useState<Record<CadCategory,boolean>>({land:true,road:true,canal:true});
 const [cadSelectedId,setCadSelectedId]=useState<string|null>(null);
 const cadVisibilityRef=useRef(cadVisibility);cadVisibilityRef.current=cadVisibility;
 const cadSelectedRef=useRef<string|null>(null);cadSelectedRef.current=cadSelectedId;
 const cadData=useApi<CadFeatureCollection>('/api/v1/cad-completion-reference');
 const {data,error,loading,reload}=useApi<MapData>('/api/v1/farm-overview');
 const lastLoaded=useRef<MapData|null>(null);if(data)lastLoaded.current=data;
 const offline=error.startsWith('网络不可用');
 const displayData=data??(offline?lastLoaded.current:null);
 const configure=useApi<{items:{id:string;name:string;code:string;kind:string;version:number;archived_at:string|null}[]}>('/api/v1/objects?action=configure&limit=200');
 const me=useApi<{actor:{displayName?:string;username?:string;role?:string}}>('/api/v1/me');
 const target=useRef<HTMLDivElement>(null),mapRef=useRef<Map|null>(null),sourceRef=useRef<VectorSource<Feature>|null>(null),realSourceRef=useRef<VectorSource<Feature>|null>(null),demoSourceRef=useRef<VectorSource<Feature>|null>(null),realLayerRef=useRef<VectorLayer<VectorSource<Feature>>|null>(null),demoLayerRef=useRef<VectorLayer<VectorSource<Feature>>|null>(null),baseLayerRef=useRef<TileLayer<XYZ>|null>(null),annoLayerRef=useRef<TileLayer<XYZ>|null>(null),drawRef=useRef<Draw|null>(null),drawingRef=useRef(false),modeRef=useRef(mode),selectedRef=useRef<string|null>(null),returnFocus=useRef<HTMLElement|null>(null),itemsRef=useRef<FarmObject[]>([]),treeRef=useRef<Tree<TreeNodeData>>(null),knownKeys=useRef<Set<string>|null>(null),justSwitched=useRef(false);
 const cadSourceRefs={land:useRef<VectorSource<Feature>|null>(null),road:useRef<VectorSource<Feature>|null>(null),canal:useRef<VectorSource<Feature>|null>(null)};
 const cadLayerRefs={land:useRef<VectorLayer<VectorSource<Feature>>|null>(null),road:useRef<VectorLayer<VectorSource<Feature>>|null>(null),canal:useRef<VectorLayer<VectorSource<Feature>>|null>(null)};
 const cadExtentRef=useRef<number[]|null>(null);
 const restored=useRef<SavedState|null>(null),initialised=useRef(false),skipInitialFit=useRef(false),restoreApplied=useRef(false);
 const visibilityRef=useRef(categoryVisibility);visibilityRef.current=categoryVisibility;
 const currentBasemapRef=useRef(basemap);
 const [query,setQuery]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null),[selectedRegionId,setSelectedRegionId]=useState<string|null>(null),[selectedMobileId,setSelectedMobileId]=useState<string|null>(null),[selectionVersion,setSelectionVersion]=useState(0),[expandedKeys,setExpandedKeys]=useState<string[]>([]),[directoryOpen,setDirectoryOpen]=useState(false),[directoryCollapsed,setDirectoryCollapsed]=useState(false),[tileError,setTileError]=useState(false),[manageOpen,setManageOpen]=useState(false),[drawerView,setDrawerView]=useState<'new-village'|'new-object'|'change-region'|'region-maintenance'|'recycle-bin'|null>(null),[drawerRegionId,setDrawerRegionId]=useState<string|null>(null),[drawerObjectId,setDrawerObjectId]=useState<string|null>(null),[mapMessage,setMapMessage]=useState('');
 // F02：详情标签与记录筛选由工作台统一持有，纳入返回上下文；切换规则见 detail-classes.nextTabOnSelection。
 const [detailTab,setDetailTab]=useState<DetailTabId>('basic'),[recordFilter,setRecordFilter]=useState<RecordFilter>('all');
 // R03 V1.2：概要/完整展示状态由工作台持有；仅选中行为重置为概要，同类切换保留（见下方 F02 效果）。
 const [detailDensity,setDetailDensity]=useState<'summary'|'full'>('summary');
 // R03 V1.2 目录协同折叠：区分系统自动折叠与用户手动操作，用户手动状态优先。
 const dirAutoCollapsed=useRef(false),dirUserTouched=useRef(false),prevDetailOpen=useRef(false);
 const prevSelectionClass=useRef<SelectionClass>(null);
 const demoRows=useMemo(()=>[...demoItems,...addedDemo],[addedDemo]);
 const demoStats={regions:demoRegions.length,fields:demoRows.filter(row=>row.kind==='field').length,ponds:demoRows.filter(row=>row.kind==='pond').length,facilities:demoRows.filter(row=>row.kind==='facility').length,mobiles:demoRows.filter(row=>row.kind==='mobile').length,alerts:demoAlerts.length};
 const items=mode==='demo'?demoRows as FarmObject[]:displayData?.items??[];
 itemsRef.current=items;
 const selected=items.find(item=>item.id===selectedId)??null;
 const cadSelectedFeature=useMemo(()=>{if(!cadSelectedId)return null;for(const cat of cadLayerOrder){const src=cadSourceRefs[cat].current;if(!src)continue;const f=src.getFeatures().find(x=>x.get('cadId')===cadSelectedId);if(f)return {id:cadSelectedId,properties:f.get('cadProperties') as CadFeatureProperties};}return null;},[cadSelectedId]);
 const detailOpen=drawerView!==null||selectedId!==null||selectedRegionId!==null||selectedMobileId!==null||cadSelectedId!==null;
 const mobileDevices=mode==='real'?displayData?.mobileDevices??[]:[];
 const configurable=configure.data?.items.filter(row=>!row.archived_at)??[];
 const canManageFarm=!offline&&configurable.some(row=>row.kind==='farm');
 const canConfigure=!offline&&configurable.length>0;
 const regions=mode==='demo'?demoRegions.map(region=>({...region,links:[...region.links,...addedDemo.filter(row=>row.regionId===region.id&&row.kind!=='mobile').map(row=>({objectId:row.id}))]})) as Region[]:displayData?.regions?.filter(region=>!region.archivedAt)??[];
 const farms=useMemo(()=>items.filter(item=>item.kind==='farm').map(item=>({id:item.id,name:item.name})),[items]);
 const treeData=useMemo(()=>buildTreeData({mode,items,regions,farms,demoRegions:mode==='demo'?demoRegions:undefined,demoItems:mode==='demo'?demoRows as FarmObject[]:undefined}),[mode,items,regions,farms]);
 const located=items.filter(item=>item.geometry).length;
 // 模式切换保留底图偏好（D5 会话状态），但清空检索、选中、绘制等浏览上下文；业务类别显隐重置为全显以匹配新会话。
 const switchMode=(next:'real'|'demo')=>{justSwitched.current=true;drawRef.current?.setActive(false);drawRef.current=null;drawingRef.current=false;setDrawing(false);setDemoFormOpen(false);sessionStorage.removeItem(stateKey);restored.current=null;restoreApplied.current=false;skipInitialFit.current=false;setQuery('');setSelectedId(null);setSelectedRegionId(null);setSelectedMobileId(null);setCadSelectedId(null);setExpandedKeys([]);knownKeys.current=null;setMapMessage('');setDirectoryOpen(false);setManageOpen(false);setCategoryVisibility(defaultVisibility);setDetailTab('basic');setRecordFilter('all');setDetailDensity('summary');prevSelectionClass.current=null;setMode(next);};
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('demo')==='1')switchMode('demo');},[]);
 const openRegionManager=()=>{if(mode==='demo'){switchMode('real');return;}setDrawerView('region-maintenance');setDirectoryOpen(false);};

 // R03 V1.2：定位留白按实际详情面板尺寸与可视地图区域计算，使目标尽量完整落入未遮挡区域。
 const measurePanel=():{width:number;height:number}=>{const shell=target.current?.parentElement;let width=0,height=0;shell?.querySelectorAll('aside').forEach(el=>{const r=el.getBoundingClientRect();width=Math.max(width,r.width);height=Math.max(height,r.height);});return{width,height};};
 const getFitPadding=():[number,number,number,number]=>{const mobile=typeof window!=='undefined'&&window.matchMedia('(max-width:760px)').matches;const panel=detailOpen?measurePanel():{width:0,height:0};if(mobile)return[90,24,detailOpen?Math.min(Math.round(panel.height)+24,Math.round(window.innerHeight*0.7)):90,24];return[120,detailOpen&&panel.width?Math.round(panel.width)+32:60,120,60];};
 // 测试钩子：选中定位完成后，把目标外接框的屏幕像素范围写到 data-selection-px，供验收断言实际可见性。
 const markSelectionPx=(features:Feature[])=>{const map=mapRef.current,el=target.current;if(!map||!el)return;let done=false;const write=()=>{if(done)return;done=true;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const f of features){const e=f.getGeometry()?.getExtent();if(!e)continue;const a=map.getPixelFromCoordinate([e[0],e[1]]),b=map.getPixelFromCoordinate([e[2],e[3]]);x0=Math.min(x0,a[0],b[0]);y0=Math.min(y0,a[1],b[1]);x1=Math.max(x1,a[0],b[0]);y1=Math.max(y1,a[1],b[1]);}if(Number.isFinite(x0))el.dataset.selectionPx=[Math.round(x0),Math.round(y0),Math.round(x1),Math.round(y1)].join(',');};map.once('moveend',write);window.setTimeout(write,500);};
 const fitToObject=(item:FarmObject)=>{const map=mapRef.current,source=sourceRef.current;if(!map||!source)return;if(!item.geometry){if(item.kind!=='farm')setMapMessage('尚未登记地图位置');return;}const features=source.getFeatures().filter(f=>f.get('objectId')===item.id);if(!features.length)return;const extent=boundingExtent(features.flatMap(f=>{const e=f.getGeometry()?.getExtent();return e?[[e[0],e[1]],[e[2],e[3]]]:[];}));if(isEmpty(extent))return;map.updateSize();map.getView().fit(extent,{padding:getFitPadding(),maxZoom:16,duration:300});markSelectionPx(features);};
 const fitToRegion=(region:Region)=>{const map=mapRef.current,source=sourceRef.current;if(!map||!source)return;const ids=new Set(region.links.map(l=>l.objectId));const features=source.getFeatures().filter(f=>ids.has(f.get('objectId') as string));if(!features.length){setMapMessage('该村庄暂无可定位的地图资料');return;}const extent=boundingExtent(features.flatMap(f=>{const e=f.getGeometry()?.getExtent();return e?[[e[0],e[1]],[e[2],e[3]]]:[];}));if(isEmpty(extent))return;map.updateSize();map.getView().fit(extent,{padding:getFitPadding(),maxZoom:16,duration:300});markSelectionPx(features);};
 const selectObject=(item:FarmObject,trigger?:HTMLElement)=>{returnFocus.current=trigger??null;setSelectedRegionId(null);setSelectedMobileId(null);setCadSelectedId(null);setSelectedId(item.id);setSelectionVersion(version=>version+1);setDirectoryOpen(false);};
 const focusRegion=(region:Region)=>{setSelectedId(null);setSelectedMobileId(null);setCadSelectedId(null);setSelectedRegionId(region.id);setSelectionVersion(version=>version+1);setDirectoryOpen(false);fitToRegion(region);};
 const stopDrawing=()=>{const map=mapRef.current,draw=drawRef.current;if(map&&draw)map.removeInteraction(draw);drawRef.current=null;drawingRef.current=false;setDrawing(false);};
 const startDrawing=()=>{const map=mapRef.current,name=demoName.trim();if(mode!=='demo'||!map||!name||!demoRegionId)return;stopDrawing();const area=demoKind==='field'||demoKind==='pond',symbol=demoKind,kind=area?demoKind:demoKind==='gate'||demoKind==='pump'?'facility':'mobile';const draw=new Draw({type:area?'Polygon':'Point'});drawRef.current=draw;drawingRef.current=true;setDrawing(true);map.addInteraction(draw);draw.on('drawend',event=>{const geometry=event.feature.getGeometry();if(!geometry)return;const encoded=new GeoJSON().writeGeometryObject(geometry,{featureProjection:'EPSG:3857',dataProjection:'EPSG:4326'}) as DemoItem['geometry'];if(!encoded)return;const id=`demo:added:${crypto.randomUUID()}`,regionName=demoRegions.find(row=>row.id===demoRegionId)?.name??'演示片区';const newItem:DemoItem={id,farmId:'demo:farm:main',name,code:`演示-${id.slice(-8)}`,kind,symbol,regionId:demoRegionId,geometry:encoded,detail:kind==='mobile'?`登记归属：${regionName}；演示坐标，非真实 GPS`:kind==='facility'?'演示设施；无控制指令':kind==='field'?'演示农田；非测绘边界':'演示塘口；非测绘边界',status:'临时演示',object_source:'现场临时合成演示；非测绘、非真实资料',object_recorded_at:new Date().toISOString(),boundary_status:'draft',version:1};skipInitialFit.current=true;setAddedDemo(rows=>[...rows,newItem]);setSelectedId(id);setSelectionVersion(value=>value+1);setDemoName('');stopDrawing();});};

 const cadStyleLookup:Record<CadCategory,{fill?:string;stroke:string;width:number}>=
  {land:{fill:'rgba(75,160,75,0.22)',stroke:'#2d8a2d',width:1.5},road:{stroke:'#e6a23c',width:2.5},canal:{stroke:'#2f7cc7',width:2.5}};
 const cadStyles=(feature:import('ol/Feature.js').FeatureLike):Style[]|undefined=>{
  const cat=feature.get('cadCategory') as CadCategory|undefined;
  if(!cat||cadVisibilityRef.current[cat]===false)return undefined;
  const selected=(feature.get('cadId') as string|undefined)===cadSelectedRef.current;
  const s=cadStyleLookup[cat];
  if(cat==='land')return [new Style({stroke:new Stroke({color:'#fff',width:s.width+2}),fill:new Fill({color:s.fill})}),new Style({stroke:new Stroke({color:selected?'#163a2d':s.stroke,width:selected?s.width+1.5:s.width}),fill:new Fill({color:selected?'rgba(75,160,75,0.35)':s.fill})})];
  return [new Style({stroke:new Stroke({color:'#fff',width:s.width+2})}),new Style({stroke:new Stroke({color:selected?'#163a2d':s.stroke,width:selected?s.width+1.5:s.width,lineDash:selected?undefined:[6,4]})})];
 };
 const clearCadSelection=()=>{setCadSelectedId(null);returnFocus.current?.focus();};
 const fitCadExtent=()=>{const map=mapRef.current,extent=cadExtentRef.current;if(map&&extent&&!isEmpty(extent))map.getView().fit(extent,{padding:getFitPadding(),maxZoom:16,duration:350});};

 useEffect(()=>{if(initialised.current)return;initialised.current=true;const state=savedState();if(!state)return;restored.current=state;skipInitialFit.current=true;setQuery(state.query);setSelectedId(state.selectedId);setExpandedKeys(state.expandedKeys);setDirectoryCollapsed(state.directoryCollapsed);setBasemap(state.basemap);setCategoryVisibility(state.visibility);setDetailTab(state.detailTab??'basic');setRecordFilter(state.recordFilter??'all');setAnnotationsVisible(state.annotationsVisible??true);if(state.cadVisibility)setCadVisibility(state.cadVisibility);},[]);
 // F02 跨对象切换：同类保留标签、跨类回基本信息；首次建立选择（含会话恢复）不重置，避免覆盖恢复的标签。
 useEffect(()=>{const selectedItem=selectedId?itemsRef.current.find(row=>row.id===selectedId):null;const next:SelectionClass=selectedItem?resolveBusinessClass(selectedItem,modeRef.current==='demo'):selectedRegionId?'region':selectedMobileId?'mobile':null;if(next===null){prevSelectionClass.current=next;return;}const sameClass=prevSelectionClass.current!==null&&prevSelectionClass.current===next;const decided=nextTabOnSelection(prevSelectionClass.current,next,detailTab);if(decided!==detailTab)setDetailTab(decided);if(!sameClass)setDetailDensity('summary');prevSelectionClass.current=next;},[selectedId,selectedRegionId,selectedMobileId]);
 // R03 V1.2：1024 等窄屏桌面下详情打开时自动折叠资源目录；仅恢复系统自动折叠，不覆盖用户手动操作。
 useEffect(()=>{const narrow=window.matchMedia('(max-width:1100px)').matches&&!window.matchMedia('(max-width:760px)').matches;if(detailOpen&&!prevDetailOpen.current){dirUserTouched.current=false;dirAutoCollapsed.current=false;if(narrow&&!directoryCollapsed){setDirectoryCollapsed(true);dirAutoCollapsed.current=true;}}if(!detailOpen&&prevDetailOpen.current){if(dirAutoCollapsed.current&&!dirUserTouched.current)setDirectoryCollapsed(false);dirAutoCollapsed.current=false;dirUserTouched.current=false;}prevDetailOpen.current=detailOpen;},[detailOpen]);
 useEffect(()=>{selectedRef.current=selectedId;sourceRef.current?.changed();},[selectedId]);
 useEffect(()=>{if(!validBrowserKey(key)||!target.current)return;
  const returnState=savedState();if(returnState){restored.current=returnState;skipInitialFit.current=true;restoreApplied.current=false;}
  const imagery=new XYZ({urls:tiandituWmtsUrls(basemap==='vector'?'vec':'img',key),maxZoom:18,attributions:'© 国家地理信息公共服务平台 天地图'});
  imagery.on('tileloaderror',()=>setTileError(true));
  const annotations=new XYZ({urls:tiandituWmtsUrls(basemap==='vector'?'cva':'cia',key),maxZoom:18});
  annotations.on('tileloaderror',()=>setTileError(true));
  const vectors=new VectorSource<Feature>(),demoVectors=new VectorSource<Feature>();sourceRef.current=vectors;realSourceRef.current=vectors;demoSourceRef.current=demoVectors;
  const layer=new VectorLayer({source:vectors,style:feature=>{const id=feature.get('objectId') as string|undefined;return id===selectedRef.current?selectedStyles(feature as Feature):objectStyles(feature as Feature,mapRef.current?.getView().getZoom()??12,visibilityRef.current);}});realLayerRef.current=layer;
  const demoLayer=new VectorLayer({source:demoVectors,visible:false,style:feature=>demoStyles(feature as Feature,visibilityRef.current,(feature.get('objectId') as string|undefined)===selectedRef.current)});demoLayerRef.current=demoLayer;
  const cadLayers:VectorLayer<VectorSource<Feature>>[]=[];
  for(const cat of cadLayerOrder){const src=new VectorSource<Feature>();const lyr=new VectorLayer({source:src,style:cadStyles});cadSourceRefs[cat].current=src;cadLayerRefs[cat].current=lyr;cadLayers.push(lyr);}
  const view=new View({center:restored.current?.center??fromLonLat(FARM_HOME_4326),zoom:restored.current?.zoom??12,minZoom:2,maxZoom:18});
  const baseLayer=new TileLayer({source:imagery}),annoLayer=new TileLayer({source:annotations,visible:annotationsVisible});
  baseLayerRef.current=baseLayer;annoLayerRef.current=annoLayer;currentBasemapRef.current=basemap;
  const map=new Map({target:target.current,layers:[baseLayer,annoLayer,...cadLayers,layer,demoLayer],view});mapRef.current=map;
  target.current.dataset.viewCenter=view.getCenter()?.join(',')??'';target.current.dataset.viewZoom=String(view.getZoom()??12);target.current.dataset.basemap=basemap;target.current.dataset.annotations=String(annotationsVisible);target.current.dataset.mode=mode;
  view.on('change:center',()=>{if(target.current)target.current.dataset.viewCenter=view.getCenter()?.join(',')??'';});
  view.on('change:resolution',()=>{if(target.current)target.current.dataset.viewZoom=String(view.getZoom()??'');vectors.changed();demoVectors.changed();});
  map.on('singleclick',event=>{if(drawingRef.current)return;const activeLayer=modeRef.current==='demo'?demoLayer:layer;const formalFeature=map.forEachFeatureAtPixel(event.pixel,f=>f,{layerFilter:visible=>visible===activeLayer});const formalId=formalFeature?.get('objectId') as string|undefined,formalItem=formalId?itemsRef.current.find(row=>row.id===formalId):undefined;if(formalItem){selectObject(formalItem);const region=regions.find(r=>r.links.some(l=>l.objectId===formalItem.id));if(region){const rKey=`region:${region.id}`;setExpandedKeys(prev=>prev.includes(rKey)?prev:[...prev,rKey]);}window.requestAnimationFrame(()=>treeRef.current?.scrollTo({key:formalItem.id,align:'auto'}));return;}const cadFeature=map.forEachFeatureAtPixel(event.pixel,f=>f,{layerFilter:visible=>cadLayers.includes(visible as VectorLayer<VectorSource<Feature>>)});const cadId=cadFeature?.get('cadId') as string|undefined;if(cadId){setSelectedId(null);setSelectedRegionId(null);setSelectedMobileId(null);setCadSelectedId(cadId);}});
  const observer=new ResizeObserver(()=>map.updateSize());observer.observe(target.current);
  return()=>{observer.disconnect();if(drawRef.current)map.removeInteraction(drawRef.current);map.setTarget(undefined);mapRef.current=null;sourceRef.current=null;realSourceRef.current=null;demoSourceRef.current=null;realLayerRef.current=null;demoLayerRef.current=null;baseLayerRef.current=null;annoLayerRef.current=null;for(const cat of cadLayerOrder){cadSourceRefs[cat as CadCategory].current=null;cadLayerRefs[cat as CadCategory].current=null;}cadExtentRef.current=null;};
 },[]);
 useEffect(()=>{const map=mapRef.current,base=baseLayerRef.current,anno=annoLayerRef.current,targetEl=target.current;if(!map||!base||!anno)return;
  if(basemap!==currentBasemapRef.current){
   currentBasemapRef.current=basemap;
   const imagery=new XYZ({urls:tiandituWmtsUrls(basemap==='vector'?'vec':'img',key),maxZoom:18,attributions:'© 国家地理信息公共服务平台 天地图'});
   imagery.on('tileloaderror',()=>setTileError(true));
   const annotations=new XYZ({urls:tiandituWmtsUrls(basemap==='vector'?'cva':'cia',key),maxZoom:18});
   annotations.on('tileloaderror',()=>setTileError(true));
   base.setSource(imagery);anno.setSource(annotations);
  }
  anno.setVisible(annotationsVisible);
  if(targetEl){targetEl.dataset.basemap=basemap;targetEl.dataset.annotations=String(annotationsVisible);}
 },[basemap,annotationsVisible]);
 useEffect(()=>{visibilityRef.current=categoryVisibility;sourceRef.current?.changed();},[categoryVisibility]);
 useEffect(()=>{if(target.current)target.current.dataset.mode=mode;},[mode]);
 useEffect(()=>{const source=mode==='demo'?demoSourceRef.current:realSourceRef.current,map=mapRef.current;if(!source||!map)return;modeRef.current=mode;sourceRef.current=source;realLayerRef.current?.setVisible(mode==='real');demoLayerRef.current?.setVisible(mode==='demo');source.clear();const format=new GeoJSON();for(const item of items){if(!item.geometry)continue;try{const features=format.readFeatures(item.geometry,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});for(const feature of features){feature.set('objectId',item.id);feature.set('status',item.boundary_status);feature.set('kind',item.kind);feature.set('symbol',item.symbol??facilitySymbolFromCode(item.code)??item.kind);source.addFeature(feature);}}catch{/* 无效几何不绘制，对象仍在目录 */}}
  if(source.getFeatures().length){if(!skipInitialFit.current){const extent=source.getExtent();if(extent&&!isEmpty(extent))map.getView().fit(extent,{padding:[75,75,75,75],maxZoom:14,duration:0});}skipInitialFit.current=false;}
 },[items,mode]);
 useEffect(()=>{const data=cadData.data;if(!data)return;const format=new GeoJSON();const extent=createEmpty();let hasGeometry=false;for(const cat of cadLayerOrder){const src=cadSourceRefs[cat].current;if(!src)continue;src.clear();}
  for(const f of data.features){if(!f.geometry)continue;const cat=f.properties.category;const src=cadSourceRefs[cat]?.current;if(!src)continue;try{const features=format.readFeatures(f.geometry,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});for(const feature of features){feature.set('cadId',f.id??`${cat}:${feature.getId()}`);feature.set('cadCategory',cat);feature.set('cadProperties',f.properties);src.addFeature(feature);const e=feature.getGeometry()?.getExtent();if(e){extent[0]=Math.min(extent[0],e[0]);extent[1]=Math.min(extent[1],e[1]);extent[2]=Math.max(extent[2],e[2]);extent[3]=Math.max(extent[3],e[3]);hasGeometry=true;}}}catch{/* 跳过无效几何 */}}
  cadExtentRef.current=hasGeometry&&!isEmpty(extent)?extent:null;
  for(const cat of cadLayerOrder)cadSourceRefs[cat].current?.changed();
 },[cadData.data]);
 useEffect(()=>{for(const cat of cadLayerOrder){const layer=cadLayerRefs[cat].current;if(!layer)continue;layer.setVisible(cadVisibility[cat]!==false);layer.changed();}},[cadVisibility,cadSelectedId]);
 useEffect(()=>{const state=restored.current,map=mapRef.current;if(mode!=='real'||!data||!map||!state||restoreApplied.current)return;restoreApplied.current=true;const view=map.getView();view.cancelAnimations();view.setCenter(state.center);view.setZoom(state.zoom);},[data,mode]);
 useEffect(()=>{if(mode==='real'&&data&&selectedId&&!items.some(item=>item.id===selectedId))setSelectedId(null);},[data,items,selectedId,mode]);
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSelectedId(null);setSelectedRegionId(null);setSelectedMobileId(null);setCadSelectedId(null);setDetailDensity('summary');setLayerPanelOpen(false);returnFocus.current?.focus();}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 useEffect(()=>{const item=itemsRef.current.find(row=>row.id===selectedId);if(!item||selectionVersion===0)return;const frame=window.requestAnimationFrame(()=>{fitToObject(item);treeRef.current?.scrollTo({key:item.id,align:'auto'});});return()=>window.cancelAnimationFrame(frame);},[selectedId,selectionVersion]);
 useEffect(()=>{const frame=window.requestAnimationFrame(()=>{mapRef.current?.updateSize();});return()=>window.cancelAnimationFrame(frame);},[directoryCollapsed,detailOpen]);
 useEffect(()=>{if(knownKeys.current===null){knownKeys.current=new Set([...(restored.current?.expandedKeys??[]),...getDefaultExpandedKeys(treeData)]);if(!(restored.current?.expandedKeys?.length)&&treeData.length)setExpandedKeys(getDefaultExpandedKeys(treeData));return;}const fresh=getDefaultExpandedKeys(treeData).filter(k=>!knownKeys.current!.has(k));if(fresh.length){for(const k of fresh)knownKeys.current!.add(k);setExpandedKeys(prev=>[...new Set([...prev,...fresh])]);}},[treeData]);

 const fullView=()=>{const map=mapRef.current,source=sourceRef.current,extent=source?.getExtent();if(map&&source?.getFeatures().length&&extent)map.getView().fit(extent,{padding:getFitPadding(),maxZoom:14,duration:350});};
 const persistState=()=>{if(mode!=='real')return;if(justSwitched.current){justSwitched.current=false;return;}const view=mapRef.current?.getView(),center=view?.getCenter(),zoom=view?.getZoom();if(center&&zoom!==undefined)sessionStorage.setItem(stateKey,JSON.stringify({query,selectedId,expandedKeys,center,zoom,directoryCollapsed,basemap,visibility:categoryVisibility,detailTab,recordFilter,annotationsVisible,cadVisibility} satisfies SavedState));};
 const saveReturnState=()=>persistState();
 // 底图与类别显隐变化即写回会话状态，页面刷新后保持底图选择（D1/D5）。
 useEffect(()=>{persistState();},[basemap,categoryVisibility,query,selectedId,directoryCollapsed,detailTab,recordFilter,annotationsVisible,cadVisibility]);
 const close=()=>{setSelectedId(null);setSelectedRegionId(null);setSelectedMobileId(null);setCadSelectedId(null);setDetailDensity('summary');setMapMessage('');returnFocus.current?.focus();};
 const cadVisibleAny=Object.values(cadVisibility).some(Boolean);
 const mapLabel=mode==='demo'?(basemap==='vector'?`天地图矢量底图、合成演示对象${cadVisibleAny?'及真实 CAD 参考（非正式资产）':''}`:`天地图卫星影像、合成演示对象${cadVisibleAny?'及真实 CAD 参考（非正式资产）':''}`):(basemap==='vector'?`天地图矢量底图及已授权农业对象边界${cadVisibleAny?'、真实 CAD 参考（未建档）':''}`:`天地图卫星影像及已授权农业对象边界${cadVisibleAny?'、真实 CAD 参考（未建档）':''}`);
 const accountName=me.data?.actor.displayName??me.data?.actor.username??'我的账号';
 return <section className={styles.page} data-mode={mode} aria-label="农场空间总览">
  <nav className={styles.topNav} aria-label="农场总览快捷导航"><h1 className={styles.srOnly}>农场空间总览</h1><div className={styles.topBrand}><span className={styles.topBrandIcon}><KindIcon kind="field"/></span><div><strong>梁子湖农场</strong><span>二维 GIS 农业资源管理平台</span></div></div><div className={styles.topLinks}><Link href="/farm-overview" aria-current="page"><TopLinkIcon type="map"/>农场地图</Link><Link href="/terrain"><TopLinkIcon type="terrain"/>地形分析</Link><Link href="/management"><TopLinkIcon type="dashboard"/>数据看板</Link><Link href="/devices"><TopLinkIcon type="devices"/>设备管理</Link></div><div className={styles.topActions}>{mode==='real'&&<><span className={styles.topMode}>真实数据</span><button type="button" onClick={()=>switchMode('demo')}>查看演示效果 ↗</button><button type="button" className={styles.topRefreshButton} onClick={()=>void reload()}>刷新授权资料</button></>}<Link className={styles.accountLink} href="/account"><span className={styles.accountAvatar}>{accountName.slice(0,1)}</span><span>{accountName}</span></Link></div></nav>
  {mode==='demo'?<div className={styles.demoBanner} role="status"><strong>演示模式</strong><span>当前所有村庄、地块、设备位置、状态和告警均为合成示例，不代表真实现场；竣工图参考图层为真实 CAD 提取结果，尚未核实为正式农业资产。</span><span className={styles.demoBannerStats}><span>{demoStats.regions} 片区</span><span>{demoStats.fields} 农田</span><span>{demoStats.ponds} 塘口</span><span>{demoStats.facilities} 固定设施</span><span>{demoStats.mobiles} 机动设备</span><span>{demoStats.alerts} 条演示关注 · {demoTasks.length} 条演示任务</span></span><button type="button" onClick={()=>switchMode('real')}>退出演示，返回真实数据</button></div>:null}
  <div className={`${styles.workspace} ${directoryCollapsed?styles.workspaceCollapsed:''}`}><aside id="farm-object-directory" className={`${styles.directory} ${directoryOpen?styles.directoryOpen:''}`} aria-label="农业资源目录"><div className={styles.directoryTop}><h2>农业资源</h2>{mode==='demo'?<button type="button" className={styles.manageButton} aria-label="＋ 新增演示对象" aria-expanded={demoFormOpen} onClick={()=>setDemoFormOpen(value=>!value)}>+ 新建</button>:<button type="button" className={styles.manageButton} aria-label="＋ 新增/管理" aria-expanded={manageOpen} onClick={()=>setManageOpen(value=>!value)}>+ 新建</button>}<button type="button" className={styles.mobileClose} onClick={()=>setDirectoryOpen(false)} aria-label="关闭对象目录">×</button></div>
   {mode==='demo'&&demoFormOpen&&<div className={styles.management}><div className={styles.manageMenu}><label>演示类型<select value={demoKind} onChange={event=>setDemoKind(event.target.value as typeof demoKind)}><option value="field">农田</option><option value="pond">塘口</option><option value="gate">水闸</option><option value="pump">水泵</option><option value="drone">无人机</option><option value="harvester">农机</option></select></label><label>名称<input value={demoName} onChange={event=>setDemoName(event.target.value)} maxLength={60} placeholder="填写演示名称"/></label><label>所属演示片区<select value={demoRegionId} onChange={event=>setDemoRegionId(event.target.value)}>{demoRegions.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button type="button" disabled={!demoName.trim()||drawing} onClick={startDrawing}>在地图{demoKind==='field'||demoKind==='pond'?'逐点绘制，双击结束':'单击选位置'}</button>{drawing&&<><p>正在地图绘制；农田或塘口至少点 3 个顶点，双击结束。仅本页有效。</p><button type="button" onClick={stopDrawing}>取消绘制</button></>}</div></div>}
   <div hidden={mode==='demo'} className={styles.management}>{manageOpen&&<div className={styles.manageMenu}>{canConfigure?<><button type="button" onClick={()=>{setDrawerView('new-object');setDrawerRegionId(null);setDrawerObjectId(null);setManageOpen(false);}}>新增农业对象</button>{canManageFarm&&<><button type="button" onClick={()=>{setDrawerView('new-village');setDrawerRegionId(null);setDrawerObjectId(null);setManageOpen(false);}}>新增村庄</button><button type="button" onClick={()=>{openRegionManager();setManageOpen(false);}}>维护村庄与关联</button></>}<Link href="/devices#register" onClick={saveReturnState}>登记机动设备</Link></>:<p>当前账号没有对象配置权；请联系对象负责人授权。</p>}</div>}</div>
   <label className={styles.searchLabel}><span className={styles.srOnly}>搜索名称或编号</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索村庄、农田、塘口、设施…"/></label>
   <ResourceTree
     mode={mode} items={items} regions={regions} farms={farms} demoRegions={demoRegions} demoItems={demoRows as FarmObject[]}
     selectedId={selectedId} expandedKeys={expandedKeys} query={query}
     canConfigure={canConfigure} canManageFarm={canManageFarm}
     loading={loading} error={error} offline={offline} hasData={!!lastLoaded.current}
     treeRef={treeRef}
     onSelectObject={item=>selectObject(item as FarmObject)}
     onFitRegion={focusRegion}
     onNewObject={regionId=>{setDrawerView('new-object');setDrawerRegionId(regionId??null);setDrawerObjectId(null);setDirectoryOpen(false);}}
     onManageRegion={openRegionManager}
     onChangeRegion={item=>{setDrawerView('change-region');setDrawerObjectId(item.id);setDrawerRegionId(null);setDirectoryOpen(false);}}
     onEditBoundary={item=>{saveReturnState();window.location.assign(`/map-editor?object=${item.id}&from=farm-overview`);}}
     onViewDetail={item=>{setSelectedId(item.id);setSelectedRegionId(null);setSelectedMobileId(null);setCadSelectedId(null);setDirectoryOpen(false);}}
     onExpand={keys=>setExpandedKeys(keys)}
     onReload={()=>{void reload();void configure.reload();}}
     onNotify={msg=>setMapMessage(msg)}
   />
   <div className={styles.treeFooter}>
    {canConfigure&&<button type="button" className={styles.treeFooterButton} onClick={()=>{setDrawerView('recycle-bin');setDrawerRegionId(null);setDrawerObjectId(null);setDirectoryOpen(false);}}>回收站</button>}
   </div>
   <section className={styles.mobileSection}><h3>机动设备<span>{mode==='demo'?demoStats.mobiles:mobileDevices.length}</span></h3>{mode==='demo'?<ul>{demoRows.filter(row=>row.kind==='mobile').map(row=><li key={row.id}><button type="button" className={styles.mobileItem} onClick={event=>selectObject(row as FarmObject,event.currentTarget)}>{row.name} · 演示坐标，非真实 GPS</button></li>)}</ul>:mobileDevices.length?<ul>{mobileDevices.map(binding=><li key={binding.binding_id}><button type="button" className={styles.mobileItem} onClick={()=>{setSelectedId(null);setSelectedRegionId(null);setCadSelectedId(null);setSelectedMobileId(binding.binding_id);setDirectoryOpen(false);}}>{binding.machine_name} · 位置未知</button><small>定位终端：{binding.terminal_name} · 绑定有效期至 {new Date(binding.valid_until).toLocaleDateString('zh-CN')}</small></li>)}</ul>:<p className={styles.directoryNote}>当前授权对象下暂无有效农机绑定。</p>}{mode==='real'&&<Link href="/machinery">打开农机业务 ↗</Link>}</section></aside>
   <div className={styles.mapShell}><div className={styles.mapToolbar}><button type="button" className={styles.mobileDirectory} onClick={()=>{if(window.matchMedia('(max-width:760px)').matches)close();setDirectoryOpen(true);}}>☰ 对象目录</button><button type="button" className={styles.desktopDirectory} aria-controls="farm-object-directory" aria-label={directoryCollapsed?'展开对象目录':'收起对象目录'} aria-expanded={!directoryCollapsed} title={directoryCollapsed?'展开左侧资源目录':'收起左侧资源目录'} onClick={()=>{dirUserTouched.current=true;dirAutoCollapsed.current=false;setDirectoryCollapsed(value=>!value);}}>{directoryCollapsed?'› 目录':'‹ 目录'}</button>{directoryCollapsed&&<button type="button" className={styles.toolbarManage} onClick={()=>{dirUserTouched.current=true;dirAutoCollapsed.current=false;setDirectoryCollapsed(false);setManageOpen(true);}}>＋ 新增/管理</button>}<button type="button" className={styles.basemapButton} data-basemap={basemap} aria-label={basemap==='vector'?'切换为卫星底图':'切换为矢量底图'} onClick={()=>setBasemap(basemap==='vector'?'satellite':'vector')}>底图：{basemap==='vector'?'矢量':'卫星'}</button><button type="button" className={styles.layerButton} aria-expanded={layerPanelOpen} aria-controls="farm-layer-panel" onClick={()=>setLayerPanelOpen(value=>!value)}>图层</button><button type="button" onClick={fitCadExtent} title="完整显示三类竣工图参考数据">竣工图范围</button><button type="button" onClick={fullView}>全场视图</button></div>{layerPanelOpen&&<div id="farm-layer-panel" className={styles.layerPanelWrap}><LayerPanel mode={mode} basemap={basemap} setBasemap={setBasemap} annotationsVisible={annotationsVisible} setAnnotationsVisible={setAnnotationsVisible} visibility={categoryVisibility} setVisibility={(kind,visible)=>setCategoryVisibility(prev=>({...prev,[kind]:visible}))} onClose={()=>setLayerPanelOpen(false)} cadVisibility={cadVisibility} setCadVisibility={(cat,visible)=>setCadVisibility(prev=>({...prev,[cat]:visible}))}/></div>}{validBrowserKey(key)?<div ref={target} className={styles.map} data-view-zoom="12" data-view-center="" data-basemap={basemap} data-annotations={String(annotationsVisible)} data-mode={mode} aria-label={mapLabel} role="application"/>:<div className={styles.mapFallback} role="status">当前环境未配置有效天地图 Key，无法加载地图影像。</div>}{tileError&&<p className={styles.tileWarning} role="status">部分影像瓦片加载失败，请检查网络后刷新；已读取的对象目录仍可浏览。</p>}
     {mapMessage&&<p className={styles.mapMessage} role="status">{mapMessage}<button type="button" aria-label="关闭提示" onClick={()=>setMapMessage('')}>×</button></p>}
    {drawerView===null&&cadSelectedFeature&&<CadReferenceCard feature={cadSelectedFeature} onClose={()=>{clearCadSelection();fitCadExtent();}}/>}
    {drawerView===null&&!cadSelectedFeature&&<DetailPanel mode={mode} tab={detailTab} recordFilter={recordFilter} density={detailDensity} onTab={setDetailTab} onRecordFilter={setRecordFilter} onDensity={setDetailDensity} onLocate={selected?()=>fitToObject(selected):selectedRegionId?()=>{const target=regions.find(row=>row.id===selectedRegionId);if(target)fitToRegion(target);}:undefined} item={selected} region={regions.find(row=>row.id===selectedRegionId)??null} mobile={mobileDevices.find(row=>row.binding_id===selectedMobileId)??null} items={items} regions={regions} summaries={mode==='real'?displayData?.summaries??[]:[]} mobileDevices={mobileDevices} canConfigure={canConfigure} onClose={close} onExitDemo={()=>switchMode('real')} onManageRegion={openRegionManager} onSaveReturn={saveReturnState} onChangeRegion={item=>{setDrawerView('change-region');setDrawerObjectId(item.id);setDrawerRegionId(null);setDirectoryOpen(false);}}/>}
    {drawerView!==null&&(()=>{const drawerObject=drawerObjectId?items.find(i=>i.id===drawerObjectId)??null:null;return<ManagementDrawer view={drawerView} onClose={()=>{setDrawerView(null);setDrawerRegionId(null);setDrawerObjectId(null);}} onSaved={result=>{void reload();void configure.reload();if(result.view==='new-object'&&result.drawNow){saveReturnState();window.location.assign(`/map-editor?object=${result.id}&from=farm-overview`);return;}if(result.view==='new-village'){setSelectedRegionId(result.id);setSelectedId(null);setDirectoryCollapsed(false);}if(result.view==='new-object'){setSelectedId(result.id);setSelectedRegionId(null);}if(result.view==='recycle-bin'){setSelectedId(null);setSelectedRegionId(null);}setDrawerView(null);setDrawerRegionId(null);setDrawerObjectId(null);}} regions={regions} configurable={configurable} allConfigurable={configure.data?.items??[]} defaultRegionId={drawerRegionId??undefined} objectId={drawerObjectId??undefined} objectFarmId={drawerObject?(drawerObject.farm_id??drawerObject.farmId??undefined):undefined} currentRegionId={drawerObjectId?(regions.find(r=>r.links.some(l=>l.objectId===drawerObjectId))?.id??undefined):undefined} mode={mode} demoReadOnly={mode==='demo'} onSwitchMode={()=>switchMode('real')}/>;})()}
   </div></div><p className={styles.footerNote}>{mode==='demo'?'演示几何仅用于界面体验，不代表测绘界址、设备 GPS 或真实告警；不会写入正式业务库。':'地图仅供浏览。没有边界的对象不生成虚构坐标；地图邻近不证明设备归属。当前列表使用既有地图授权结果，最多展示 500 个对象。'}</p></section>;
}
