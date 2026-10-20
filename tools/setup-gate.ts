import { transaction, closePool } from '../src/db/pool';
import { saveSource, saveDevice } from '../src/modules/registry/devices';
import { savePoint, bindPoint } from '../src/modules/registry/points';
// 三诚单螺杆闸门只读登记：--device hbdxsczNNN（缺省 hbdxscz001），--sn 序列号可选。
// 来源、设备、测点均保持未核实；绑定对象必须通过 --bind-object <uuid> 显式给出，不伪造任何场区对象。
function pointsOf(nnn: string) {
  return [
    { code: `GATE-${nnn}-OPENING`, name: `闸门${nnn}当前开度`, metric: 'opening', unit: '%' },

    { code: `GATE-${nnn}-SET-OPENING`, name: `闸门${nnn}设置开度`, metric: 'set_opening', unit: '%' },
    { code: `GATE-${nnn}-STALL-CURRENT`, name: `闸门${nnn}堵转电流`, metric: 'stall_current', unit: 'mA' },
  ];
}
async function main() {
  const args = process.argv.slice(2);
  const bindObject = args.includes('--bind-object') ? args[args.indexOf('--bind-object') + 1] : null;
  const device = args.includes('--device') ? args[args.indexOf('--device') + 1] : 'hbdxscz001';
  const sn = args.includes('--sn') ? args[args.indexOf('--sn') + 1] : null;
  if (bindObject && !/^[0-9a-f-]{36}$/i.test(bindObject)) throw new Error('绑定对象编号无效');
  if (!/^hbdxscz[0-9]{3}$/.test(device)) throw new Error('设备编号须形如 hbdxsczNNN');
  const nnn = device.slice(-3);
  const POINTS = pointsOf(nnn);
  // 水位/流量测点依赖水位计与测流箱（本批未安装），加装后用 --with-hydrology 补充登记
  if (args.includes('--with-hydrology')) POINTS.push(
    { code: `GATE-${nnn}-WATER-LEVEL`, name: `闸门${nnn}水位`, metric: 'water_level', unit: 'mm' },
    { code: `GATE-${nnn}-INSTANT-FLOW`, name: `闸门${nnn}瞬时流量`, metric: 'instantaneous_flow', unit: 'm³/s' },
    { code: `GATE-${nnn}-CUMULATIVE-FLOW`, name: `闸门${nnn}累计流量`, metric: 'cumulative_flow', unit: 'm³' },
  );
  await transaction(async c => {
    if ((await c.query('SELECT current_database() AS name')).rows[0].name !== 'agri_dev') throw new Error('仅登记开发库');
    const user = (await c.query("SELECT id FROM users WHERE username='farm-admin' AND role='admin' AND enabled")).rows[0];
    if (!user) throw new Error('请先初始化管理员');
    const root = (await c.query("SELECT id FROM objects WHERE code='LZH-ROOT'")).rows[0];
    if (!root) throw new Error('请先执行 registry:setup 创建场区入口');
    const actor = { id: user.id, role: 'admin' as const, enabled: true, mfaVerified: true };
    const source = (await c.query("SELECT * FROM data_sources WHERE code='SDSC-GATE'")).rows[0]
      ?? await saveSource(c, actor, { objectId: root.id, code: 'SDSC-GATE', name: '三诚单螺杆闸门MQTT只读上报', provider: 'sdsc', contractRef: 'docs/contracts/gate-sdsc.md' });
    const dtu = (await c.query('SELECT * FROM devices WHERE source_id=$1 AND external_id=$2', [source.id, `${device}-dtu`])).rows[0]
      ?? await saveDevice(c, actor, { objectId: root.id, sourceId: source.id, externalId: `${device}-dtu`, name: `闸门${nnn}通信DTU`, kind: 'gateway', source: '厂家《闸门设备通过mqtt对接协议》及接入资料；在线状态待现场核实' });
    const gate = (await c.query('SELECT * FROM devices WHERE source_id=$1 AND external_id=$2', [source.id, device])).rows[0]
      ?? await saveDevice(c, actor, { objectId: root.id, sourceId: source.id, externalId: device, name: `三诚单螺杆闸门${nnn}`, kind: 'physical', parentDeviceId: dtu.id, model: 'SCZM-LG', serialNumber: sn ?? undefined, source: '厂家接入资料登记；固件VER:V2.4.05.000000.0000；verified留待现场核实' });
    const created: Record<string, string> = {};
    for (const p of POINTS) {
      const point = (await c.query('SELECT * FROM points WHERE code=$1', [p.code])).rows[0]
        ?? await savePoint(c, actor, { deviceId: gate.id, code: p.code, name: p.name, metric: p.metric, unit: p.unit });

      created[p.metric] = point.id;
      if (bindObject && !(await c.query('SELECT 1 FROM point_bindings WHERE point_id=$1 AND valid_to IS NULL', [point.id])).rowCount)
        await bindPoint(c, actor, { pointId: point.id, objectId: bindObject, validFrom: new Date().toISOString(), verified: false, evidence: '登记脚本预绑定，待现场核实后由授权人员置真' });
    }
    console.log(JSON.stringify({ device, sourceId: source.id, dtuDeviceId: dtu.id, gateDeviceId: gate.id, points: created, bound: !!bindObject }));
    if (!bindObject) console.log('未提供 --bind-object，测点未绑定对象；绑定前测值会被拒绝或隔离，属于预期。');
  });
}
main().catch(e => { console.error(e instanceof Error ? e.message : '闸门登记未完成'); process.exitCode = 1; }).finally(closePool);
