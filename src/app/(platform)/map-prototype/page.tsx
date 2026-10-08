import 'ol/ol.css';
import SatellitePrototype from './satellite-prototype';

export default function Page() {
  return (
    <section className="workspace">
      <h1>天地图卫星底图验证</h1>
      <p className="hint">独立试验页；使用真实天地图影像和中文注记，不读写农场对象、设备或业务数据。</p>
      <SatellitePrototype />
    </section>
  );
}
