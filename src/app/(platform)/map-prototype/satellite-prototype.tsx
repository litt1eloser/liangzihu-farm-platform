'use client';

import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Point from 'ol/geom/Point.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import VectorSource from 'ol/source/Vector.js';
import TileState from 'ol/TileState.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import Text from 'ol/style/Text.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import type { DraftPoint } from '@/modules/map-prototype/draft-points';
import { INITIAL_CENTER_4326, tiandituWmtsUrls, validBrowserKey } from '@/modules/map-prototype/tianditu';
import styles from './satellite-prototype.module.css';

type TileCounts = { loaded: number; failed: number };
const emptyCounts = (): TileCounts => ({ loaded: 0, failed: 0 });
const browserKey = process.env.NEXT_PUBLIC_TIANDITU_KEY?.trim() ?? '';
const API = '/api/v1/map-prototype/points';
type Editor = { kind: 'new' | 'existing'; id?: string; requestKey?: string; version?: number; lng: number; lat: number; name: string; note: string };

class PointRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function pointRequest<T>(path: string, method = 'GET', body?: object, actorId?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(actorId ? { 'X-Expected-Actor-Id': actorId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new PointRequestError('网络连接失败；表单和临时标点仍在，请检查连接后重试。', 0); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new PointRequestError(data?.message ?? '点位请求失败，请稍后重试。', response.status);
  return data as T;
}
function savedStyle(name: string): Style {
  return new Style({
    image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#e04436' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
    text: new Text({ text: name, offsetY: -20, font: '600 13px sans-serif', fill: new Fill({ color: '#fff' }),
      backgroundFill: new Fill({ color: '#19323b' }), padding: [4, 6, 4, 6] }),
  });
}
const pendingStyle = new Style({ image: new CircleStyle({ radius: 10, fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color: '#e04436', width: 3 }) }) });

export default function SatellitePrototype() {
  const target = useRef<HTMLDivElement>(null);
  const annotationLayer = useRef<TileLayer<XYZ> | null>(null);
  const savedSource = useRef<VectorSource<Feature<Point>> | null>(null);
  const pendingSource = useRef<VectorSource<Feature<Point>> | null>(null);
  const pointsRef = useRef<DraftPoint[]>([]);
  const editorRef = useRef<Editor | null>(null);
  const modeRef = useRef<'browse' | 'mark'>('browse');
  const savingRef = useRef(false);
  const composingRef = useRef(false);
  const compositionEndedAt = useRef(0);
  const nameInput = useRef<HTMLInputElement>(null);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [imagery, setImagery] = useState<TileCounts>(emptyCounts);
  const [labels, setLabels] = useState<TileCounts>(emptyCounts);
  const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER_4326);
  const [zoom, setZoom] = useState(13);
  const [slow, setSlow] = useState(false);
  const [online, setOnline] = useState(true);
  const [mode, setMode] = useState<'browse' | 'mark'>('browse');
  const [points, setPoints] = useState<DraftPoint[]>([]);
  const [actorId, setActorId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState('正在读取个人点位草稿…');
  const [saving, setSaving] = useState(false);
  const keyReady = validBrowserKey(browserKey);

  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { editorRef.current = editor; }, [editor]);
  useEffect(() => {
    const source = savedSource.current;
    if (!source) return;
    source.clear();
    for (const item of points) {
      const feature = new Feature(new Point(fromLonLat([item.lng, item.lat])));
      feature.set('pointId', item.id);
      feature.setStyle(savedStyle(item.name));
      source.addFeature(feature);
    }
  }, [points, keyReady]);
  useEffect(() => {
    const source = pendingSource.current;
    if (!source) return;
    source.clear();
    if (editor?.kind === 'new') {
      const feature = new Feature(new Point(fromLonLat([editor.lng, editor.lat])));
      feature.setStyle(pendingStyle);
      source.addFeature(feature);
    }
  }, [editor?.kind, editor?.lng, editor?.lat, keyReady]);
  useEffect(() => { if (editor) nameInput.current?.focus(); }, [editor?.kind, editor?.id, editor?.requestKey]);
  useEffect(() => {
    void pointRequest<{ actorId: string; points: DraftPoint[] }>(API)
      .then(data => { setActorId(data.actorId); setPoints(data.points); setMessage(`已读取 ${data.points.length} 个个人点位草稿。`); })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : '读取点位失败。'));
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      if (savingRef.current) return;
      if (editorRef.current || modeRef.current === 'mark') {
        setEditor(null); setMode('browse'); modeRef.current = 'browse'; setMessage('已取消标点，未写入数据。');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    const pointSource = new VectorSource<Feature<Point>>();
    const tempSource = new VectorSource<Feature<Point>>();
    const pointLayer = new VectorLayer({ source: pointSource });
    const tempLayer = new VectorLayer({ source: tempSource });
    annotationLayer.current = labelLayer;
    savedSource.current = pointSource;
    pendingSource.current = tempSource;

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
    const map = new Map({ target: target.current, layers: [imageLayer, labelLayer, pointLayer, tempLayer], view });
    map.on('moveend', () => {
      setZoom(view.getZoom() ?? 13);
      const projected = view.getCenter();
      if (projected) {
        const geographic = toLonLat(projected, 'EPSG:3857');
        setCenter([geographic[0], geographic[1]]);
      }
    });
    map.on('singleclick', event => {
      if (editorRef.current) return;
      const selected = map.forEachFeatureAtPixel(event.pixel, feature => feature, { layerFilter: layer => layer === pointLayer });
      const id = selected?.get('pointId') as string | undefined;
      if (id) {
        const item = pointsRef.current.find(point => point.id === id);
        if (item) {
          setMode('browse'); modeRef.current = 'browse';
          setEditor({ kind: 'existing', id, version: item.version, lng: item.lng, lat: item.lat, name: item.name, note: item.note ?? '' });
          setMessage('正在查看个人点位草稿。');
        }
        return;
      }
      if (modeRef.current !== 'mark') return;
      const [lng, lat] = toLonLat(event.coordinate);
      setMode('browse'); modeRef.current = 'browse';
      setEditor({ kind: 'new', requestKey: crypto.randomUUID(), lng, lat, name: '', note: '' });
      setMessage('临时标点尚未保存；填写名称后点击保存。');
    });
    const observer = new ResizeObserver(() => map.updateSize());
    observer.observe(target.current);
    const timer = window.setTimeout(() => setSlow(true), 10000);
    return () => {
      window.clearTimeout(timer); observer.disconnect();
      annotationLayer.current = null; savedSource.current = null; pendingSource.current = null;
      map.setTarget(undefined);
    };
  }, [keyReady]);

  function cancel(): void {
    setEditor(null); setMode('browse'); modeRef.current = 'browse'; setMessage('已取消，未写入数据。');
  }
  async function reloadPoints(): Promise<void> {
    try {
      const data = await pointRequest<{ actorId: string; points: DraftPoint[] }>(API, 'GET', undefined, actorId ?? undefined);
      setActorId(data.actorId); setPoints(data.points);
      setMessage(`已读取 ${data.points.length} 个个人点位草稿。`);
    } catch (error) {
      if (error instanceof PointRequestError && (error.status === 401 || error.status === 403)) {
        setPoints([]); setActorId(null); setEditor(null);
      }
      setMessage(error instanceof Error ? error.message : '读取点位失败。');
    }
  }
  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (composingRef.current || Date.now() - compositionEndedAt.current < 150 || savingRef.current || !editor || !actorId) return;
    savingRef.current = true; setSaving(true);
    try {
      const saved = editor.kind === 'new'
        ? await pointRequest<DraftPoint>(API, 'POST', { requestKey: editor.requestKey, name: editor.name, note: editor.note, lng: editor.lng, lat: editor.lat }, actorId)
        : await pointRequest<DraftPoint>(`${API}/${editor.id}`, 'PATCH', { version: editor.version, name: editor.name, note: editor.note }, actorId);
      setPoints(items => [saved, ...items.filter(item => item.id !== saved.id)]);
      setEditor(null); setMessage(`已保存“${saved.name}”，刷新后仍可查看。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败；表单和临时标点已保留。');
    } finally { savingRef.current = false; setSaving(false); }
  }
  async function remove(): Promise<void> {
    if (!editor?.id || !actorId || savingRef.current || !window.confirm(`确定删除“${editor.name}”吗？`)) return;
    savingRef.current = true; setSaving(true);
    try {
      await pointRequest(`${API}/${editor.id}`, 'DELETE', { version: editor.version }, actorId);
      setPoints(items => items.filter(item => item.id !== editor.id));
      setEditor(null); setMessage('点位已删除。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败；请稍后重试。');
    } finally { savingRef.current = false; setSaving(false); }
  }

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
        <div className={styles.modes} role="group" aria-label="地图工具">
          <button type="button" aria-pressed={mode === 'browse'} onClick={() => { setMode('browse'); modeRef.current = 'browse'; }}>浏览</button>
          <button type="button" aria-pressed={mode === 'mark'} disabled={!keyReady || !!editor || !actorId} onClick={() => { setMode('mark'); modeRef.current = 'mark'; setMessage('点击地图空白位置创建临时标点；按 Esc 取消。'); }}>标点</button>
        </div>
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
      <div className={styles.mapArea}>
        <div ref={target} className={`${styles.map} ${mode === 'mark' ? styles.marking : ''}`} role="application" aria-label="梁子湖天地图卫星底图，可拖动、缩放和标注个人点位" />
        {editor && <aside className={styles.editor} aria-label="点位编辑表单">
          <h2>{editor.kind === 'new' ? '新建临时标点' : '个人点位草稿'}</h2>
          <p>经度 {editor.lng.toFixed(6)}，纬度 {editor.lat.toFixed(6)}（EPSG:4326）</p>
          <form onSubmit={event => void save(event)} onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={() => { composingRef.current = false; compositionEndedAt.current = Date.now(); }} onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
            <label htmlFor="draft-point-name">中文名称</label>
            <input id="draft-point-name" ref={nameInput} maxLength={80} required value={editor.name} onChange={event => setEditor(value => value ? { ...value, name: event.target.value } : null)} placeholder="如：一号水泵" />
            <label htmlFor="draft-point-note">备注（可选）</label>
            <textarea id="draft-point-note" maxLength={2000} rows={4} value={editor.note} onChange={event => setEditor(value => value ? { ...value, note: event.target.value } : null)} />
            <div className={styles.actions}>
              <button type="submit" disabled={saving || !actorId}>{saving ? '处理中…' : '保存点位'}</button>
              <button type="button" className={styles.secondary} disabled={saving} onClick={cancel}>取消</button>
              {editor.kind === 'existing' && <button type="button" className={styles.danger} disabled={saving} onClick={() => void remove()}>删除</button>}
            </div>
          </form>
        </aside>}
      </div>
      <div className={styles.diagnostics} role="status" aria-live="polite">
        <strong>个人点位草稿</strong>
        <p>{message} 标点仅当前账号可见，不修改正式地块或设备台账。</p>
        <button type="button" className={styles.secondary} onClick={() => void reloadPoints()}>重新读取点位</button>
        <p>已保存 {points.length} 个点位。点击地图上的名称或标记可查看、修改、删除；按 Esc 可取消临时标点。</p>
        <strong>加载诊断</strong>
        <p>{imageStatus}</p>
        <p>影像瓦片：成功 {imagery.loaded} / 失败 {imagery.failed}；注记瓦片：成功 {labels.loaded} / 失败 {labels.failed}。</p>
        {labelsVisible && labels.failed > 0 && <p>中文注记加载失败；请检查 Key、网络或天地图服务响应。</p>}
        <p className={styles.note}>浏览器端 Key 会随瓦片请求发送给天地图；诊断区不显示 Key 或完整请求地址。</p>
      </div>
    </div>
  );
}
