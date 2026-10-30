import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { withDb } from '../support/db';
import { actorFixture, objectFixture, permit } from '../support/fixtures';
import { transaction } from '../../src/db/pool';
import { farmOverview } from '../../src/modules/map/overview';

async function gateFixture(pool: Pool, actorId: string, objectId: string, tag: string, options: { installationRef?: string; withPosition?: boolean; withReading?: boolean; broken?: boolean } = {}) {
  const sourceId = randomUUID(), deviceId = randomUUID();
  await pool.query("INSERT INTO data_sources(id,object_id,code,name,provider,created_by) VALUES($1::uuid,$2,$3,'隔离测试闸门来源','synthetic',$4)", [sourceId, objectId, `SYNTH-GATE-SRC-${tag}`, actorId]);
  await pool.query("INSERT INTO devices(id,object_id,source_id,external_id,name,kind,source,created_by) VALUES($1::uuid,$2,$3,$4,$5,'physical','仅软件测试',$6)", [deviceId, objectId, sourceId, `synthgate${tag}`, `隔离测试闸门${tag}`, actorId]);
  await pool.query("INSERT INTO gate_deployments(object_id,device_id,version,manufacturer,controller_model,firmware,installation_ref,protocol,protocol_status,protocol_ref,tcp_role,created_by) VALUES($1,$2,1,'隔离测试厂家','synth-controller','test-fw',$3,'mqtt','received','隔离测试文档，仅工程验证','unknown',$4)", [objectId, deviceId, options.installationRef ?? `现场编号${tag} 铭牌SN synth.${tag} 图上坐标待核`, actorId]);
  if (options.withPosition) await pool.query("INSERT INTO device_positions(device_id,object_id,version,position,source,verified,created_by) VALUES($1,$2,1,ST_SetSRID(ST_MakePoint(114.3,30.1),4326),'仅测试',false,$3)", [deviceId, objectId, actorId]);
  if (options.withReading) {
    const pointId = randomUUID(), rawId = randomUUID(), obsId = randomUUID();
    await pool.query("INSERT INTO points(id,device_id,code,name,metric,unit,created_by) VALUES($1::uuid,$2,$3,'隔离测试开度','opening','%',$4)", [pointId, deviceId, `SYNTH-GATE-${tag}-OPENING`, actorId]);
    await pool.query("INSERT INTO raw_receipts(id,source_id,received_at,body,sha256,synthetic) VALUES($1::uuid,$2,now(),$3,repeat('a',64),true)", [rawId, sourceId, Buffer.from('synthetic')]);
    await pool.query("INSERT INTO observations(id,content_hash,source_id,external_device_id,point_id,object_id,metric,sampled_at,received_at,raw_value,value,unit,quality,reasons,origin,raw_ref) VALUES($1::uuid,repeat('b',64),$2,$3,$4,$5,'opening',now()-interval '5 minutes',now(),'{\"value\":42}','42','%','valid','{}','live',$6)", [obsId, sourceId, `synthgate${tag}`, pointId, objectId, rawId]);
    await pool.query("INSERT INTO point_current(point_id,observation_id,sampled_at,quality,reasons) VALUES($1,$2,now()-interval '5 minutes','valid','{}')", [pointId, obsId]);
    await pool.query("INSERT INTO source_health(source_id,last_attempt_at,last_success_at,state) VALUES($1,now(),now()-interval '10 minutes','ok')", [sourceId]);
  }
  return { sourceId, deviceId };
}

test('总览返回可见对象下的闸门，含点位、档案、最新开度与来源在线状态', () => withDb(async pool => {
  const owner = await actorFixture(pool, 'owner');
  const viewer = await actorFixture(pool, 'worker');
  const farm = await objectFixture(pool, owner.id);
  await permit(pool, owner.id, farm, ['read', 'configure']);
  await permit(pool, viewer.id, farm, ['read']);
  const hidden = await objectFixture(pool, owner.id);
  await permit(pool, owner.id, hidden, ['read', 'configure']);
  const gate = await gateFixture(pool, owner.id, farm, '001', { withPosition: true, withReading: true });
  await gateFixture(pool, owner.id, farm, '002', { withPosition: true });
  await gateFixture(pool, owner.id, hidden, '003', { withPosition: true, withReading: true });
  const overview = await transaction(c => farmOverview(c, viewer), pool);
  const ids = overview.gateDevices.map((row: { deviceId: string }) => row.deviceId).sort();
  assert.deepEqual(ids, [gate.deviceId, (await pool.query("SELECT id FROM devices WHERE external_id='synthgate002'")).rows[0].id].sort(), '只返回可见对象下的闸门');
  const first = overview.gateDevices.find((row: { deviceId: string }) => row.deviceId === gate.deviceId);
  assert.ok(first);
  assert.ok(first.latestOpening);
  assert.equal(first.externalId, 'synthgate001');
  assert.equal(first.geometry.type, 'Point');
  assert.equal(first.positionVerified, false, '未核实现场点位应保持 false');
  assert.equal(first.deployment.manufacturer, '隔离测试厂家');
  assert.equal(first.deployment.controllerModel, 'synth-controller');
  assert.equal(first.deployment.firmware, 'test-fw');
  assert.match(first.deployment.installationRef, /现场编号001/);
  assert.equal(first.latestOpening.value, 42);
  assert.ok(first.latestOpening.sampledAt, '应返回开度采样时间');
  assert.ok(first.lastSuccessAt, '应返回来源最近成功时间');
  assert.ok(first.lastReadingAt, '有读数闸门应返回最近收到数据时间');
  const second = overview.gateDevices.find((row: { externalId: string }) => row.externalId === 'synthgate002');
  assert.ok(second);
  assert.equal(second.latestOpening, null, '无读数闸门 latestOpening 为 null');
  assert.equal(second.lastSuccessAt, null, '无来源健康记录时为 null');
  assert.equal(second.lastReadingAt, null, '从未读取数据的闸门 lastReadingAt 为 null');
}));

test('专家角色总览不返回闸门设备，登记已坏标记原样保留在档案中', () => withDb(async pool => {
  const owner = await actorFixture(pool, 'owner');
  const expert = await actorFixture(pool, 'expert');
  const farm = await objectFixture(pool, owner.id);
  await permit(pool, owner.id, farm, ['read', 'configure']);
  await gateFixture(pool, owner.id, farm, '005', { withPosition: true, installationRef: '现场编号5 铭牌SN synth.005 已坏' });
  const expertView = await transaction(c => farmOverview(c, expert), pool);
  assert.deepEqual(expertView.gateDevices, []);
  const ownerView = await transaction(c => farmOverview(c, owner), pool);
  assert.equal(ownerView.gateDevices.length, 1);
  assert.match(ownerView.gateDevices[0].deployment.installationRef, /已坏/, '已坏标记只来自登记资料原文，由前端按原文着色');
}));
