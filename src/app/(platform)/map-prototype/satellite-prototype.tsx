'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import TileState from 'ol/TileState.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { INITIAL_CENTER_4326, tiandituWmtsUrls, validBrowserKey } from '@/modules/map-prototype/tianditu';
import styles from './satellite-prototype.module.css';

type TileCounts = { loaded: number; failed: number };
const emptyCounts = (): TileCounts => ({ loaded: 0, failed: 0 });
const browserKey = process.env.NEXT_PUBLIC_TIANDITU_KEY?.trim() ?? '';

export default function SatellitePrototype() {
  const target = useRef<HTMLDivElement>(null);
  const annotationLayer = useRef<TileLayer<XYZ> | null>(null);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [imagery, setImagery] = useState<TileCounts>(emptyCounts);
  const [labels, setLabels] = useState<TileCounts>(emptyCounts);
  const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER_4326);
  const [zoom, setZoom] = useState(13);
  const [slow, setSlow] = useState(false);
  const [online, setOnline] = useState(true);
  const keyReady = validBrowserKey(browserKey);

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  useEffect(() => {
    if (!keyReady || !target.current) return;

    const imagerySource = new XYZ({
      urls: tiandituWmtsUrls('img', browserKey),
      maxZoom: 18,
      attributions: '© 国家地理信息公共服务平台 天地图',
    });
    const annotationSource = new XYZ({ urls: tiandituWmtsUrls('cia', browserKey), maxZoom: 18 });
    const imageLayer = new TileLayer({ source: imagerySource });
    const labelLayer = new TileLayer({ source: annotationSource, visible: labelsVisible });
    annotationLayer.current = labelLayer;

    const watch = (source: XYZ, update: Dispatch<SetStateAction<TileCounts>>) => {
      source.on('tileloadend', event => {
        if (event.tile.getState() === TileState.LOADED)
          update(counts => ({ ...counts, loaded: counts.loaded + 1 }));
      });
      source.on('tileloaderror', () => update(counts => ({ ...counts, failed: counts.failed + 1 })));
    };
    watch(imagerySource, setImagery);
    watch(annotationSource, setLabels);

    const view = new View({
      projection: 'EPSG:3857',
      center: fromLonLat(INITIAL_CENTER_4326, 'EPSG:3857'),
      zoom: 13,
      minZoom: 2,
      maxZoom: 18,
    });
    const map = new Map({ target: target.current, layers: [imageLayer, labelLayer], view });
    map.on('moveend', () => {
      setZoom(view.getZoom() ?? 13);
      const projected = view.getCenter();
      if (projected) {
        const geographic = toLonLat(projected, 'EPSG:3857');
        setCenter([geographic[0], geographic[1]]);
      }
    });
    const timer = window.setTimeout(() => setSlow(true), 10000);
    return () => {
      window.clearTimeout(timer);
      annotationLayer.current = null;
      map.setTarget(undefined);
    };
  }, [keyReady]);

  const imageStatus = !keyReady
    ? '未配置有效的浏览器端 Key：请在忽略的 .env.local 中设置 NEXT_PUBLIC_TIANDITU_KEY 并重新构建。'
    : !online
      ? '浏览器当前离线，无法请求天地图影像。'
    : imagery.loaded > 0
      ? imagery.failed > 0 ? '卫星影像部分加载失败；请检查网络及浏览器开发者工具。' : '卫星影像已加载。'
      : imagery.failed > 0
        ? '卫星影像加载失败；可能是 Key 权限、网络或天地图服务响应问题。请检查浏览器网络请求。'
        : slow ? '卫星影像尚未返回；请检查浏览器网络和天地图服务。' : '正在请求真实卫星影像…';

  return (
    <div className={styles.prototype}>
      <div className={styles.toolbar}>
        <label className={styles.switch}>
          <input type="checkbox" checked={labelsVisible} disabled={!keyReady} onChange={event => {
            setLabelsVisible(event.target.checked);
            annotationLayer.current?.setVisible(event.target.checked);
          }} />
          显示中文注记
        </label>
        <span>中心坐标（EPSG:4326）：{center[0].toFixed(6)}, {center[1].toFixed(6)}</span>
        <span>缩放级别：{zoom.toFixed(1)}</span>
        <span>地图投影：EPSG:3857</span>
      </div>
      <div ref={target} className={styles.map} role="application" aria-label="梁子湖天地图卫星底图，可拖动和平滑缩放" />
      <div className={styles.diagnostics} role="status" aria-live="polite">
        <strong>加载诊断</strong>
        <p>{imageStatus}</p>
        <p>影像瓦片：成功 {imagery.loaded} / 失败 {imagery.failed}；注记瓦片：成功 {labels.loaded} / 失败 {labels.failed}。</p>
        {labelsVisible && labels.failed > 0 && <p>中文注记加载失败；请检查 Key、网络或天地图服务响应。</p>}
        <p className={styles.note}>浏览器端 Key 会随瓦片请求发送给天地图；诊断区不显示 Key 或完整请求地址。</p>
      </div>
    </div>
  );
}
