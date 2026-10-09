import test from 'node:test';
import assert from 'node:assert/strict';
import { withDb } from '../support/db';
import { actorFixture, objectFixture, permit } from '../support/fixtures';
import { transaction } from '../../src/db/pool';
import { saveObject } from '../../src/modules/registry/objects';
import { assignRegion, listRegions, regionHistory, saveRegion, setRegionArchive } from '../../src/modules/map/regions';

test('村庄分组关联保留历史，跨农场和未授权对象不能关联', async () => withDb(async pool => {
  const owner = await actorFixture(pool, 'owner');
  const viewer = await actorFixture(pool, 'worker');
  const farm = await objectFixture(pool, owner.id);
  const otherFarm = await objectFixture(pool, owner.id);
  await permit(pool, owner.id, farm, ['read', 'configure']);
  await permit(pool, owner.id, otherFarm, ['read', 'configure']);
  await permit(pool, viewer.id, farm, ['read']);
  const field = await transaction(c => saveObject(c, owner, { parentId: farm, code: 'SYNTH-D2-F', name: '合成地块', kind: 'field', source: '测试' }), pool);
  const other = await transaction(c => saveObject(c, owner, { parentId: otherFarm, code: 'SYNTH-D2-X', name: '异农场地块', kind: 'field', source: '测试' }), pool);
  const first = await transaction(c => saveRegion(c, owner, { farmId: farm, name: '甲村', source: '测试' }), pool);
  const second = await transaction(c => saveRegion(c, owner, { farmId: farm, name: '乙村', source: '测试' }), pool);
  await assert.rejects(() => transaction(c => assignRegion(c, owner, { objectId: other.id, regionId: first.id, source: '测试' }), pool), { code: 'REGION_FARM_MISMATCH' });
  await assert.rejects(() => transaction(c => assignRegion(c, viewer, { objectId: field.id, regionId: first.id, source: '测试' }), pool), { status: 403 });
  await transaction(c => assignRegion(c, owner, { objectId: field.id, regionId: first.id, source: '测试' }), pool);
  const renamed=await transaction(c=>saveRegion(c,owner,{id:first.id,version:1,name:'甲村新名',source:'测试更名'}),pool);
  assert.equal(renamed.name,'甲村新名');
  assert.equal((await transaction(c=>regionHistory(c,owner,first.id),pool)).links.length,1,'更名应保留既有关联');
  await transaction(c => assignRegion(c, owner, { objectId: field.id, regionId: second.id, source: '调整' }), pool);
  const history = await transaction(c => regionHistory(c, owner, first.id), pool);
  assert.equal(history.links.length, 1);
  assert.ok(history.links[0].valid_to);
  const visible = await transaction(c => listRegions(c, viewer), pool);
  assert.equal(visible.items.length, 2);
  assert.deepEqual((visible.items.find(r => r.id === second.id)?.links as { objectId: string }[]).map(l => l.objectId), []);
  await transaction(c => setRegionArchive(c, owner, { id: second.id, version: 1, archived: true, reason: '测试归档' }), pool);
  assert.equal((await transaction(c => regionHistory(c, owner, second.id), pool)).links.length, 1);
  await transaction(c => setRegionArchive(c, owner, { id: second.id, version: 2, archived: false, reason: '测试恢复' }), pool);
  assert.equal((await transaction(c => listRegions(c, owner), pool)).items.find(r => r.id === second.id)?.links instanceof Array, true);
  assert.equal((await pool.query('SELECT count(*) FROM map_region_links WHERE object_id=$1 AND valid_to IS NULL', [field.id])).rows[0].count, '0');
}));

test('各角色遵守资源配置权，管理员身份不自动获得对象授权', async () => withDb(async pool => {
  const creator=await actorFixture(pool,'owner');
  const farm=await objectFixture(pool,creator.id);
  for(const role of ['admin','owner','technician','worker','maintainer','expert'] as const){
    const actor=await actorFixture(pool,role);
    await assert.rejects(()=>transaction(c=>saveRegion(c,actor,{farmId:farm,name:role+'未授权',source:'测试'}),pool),{status:403});
    await permit(pool,actor.id,farm,['read','configure']);
    if(['worker','expert'].includes(role)) await assert.rejects(()=>transaction(c=>saveRegion(c,actor,{farmId:farm,name:role+'无配置角色',source:'测试'}),pool),{status:403});
    else assert.equal((await transaction(c=>saveRegion(c,actor,{farmId:farm,name:role+'测试村',source:'测试'}),pool)).farm_id,farm);
  }
}));
