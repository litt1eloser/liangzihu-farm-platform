import 'ol/ol.css';
import SatellitePrototype from './satellite-prototype';

export default function Page() {
  return (
    <section className="workspace">
      <h1>天地图卫星底图验证</h1>
      <p className="hint">独立试验页；使用真实天地图影像和中文注记。点位仅保存为当前账号的私有草稿，不写入正式农场对象或设备台账。</p>
      <SatellitePrototype />
    </section>
  );
}
