import test from 'node:test';
import assert from 'node:assert/strict';
import { withDb } from '../support/db';
import { actorFixture, objectFixture, permit } from '../support/fixtures';
import { transaction } from '../../src/db/pool';
import { listObjects, saveObject, setObjectArchive } from '../../src/modules/registry/objects';
import { assignRegion, saveRegion } from '../../src/modules/map/regions';

test('正式对象归档保留主档、版本与区域关联历史，原列表仍可见', async () => withDb(async pool => {
  const actor = await actorFixture(pool, 'owner');
  const farm = await objectFixture(pool, actor.id);
  await permit(pool, actor.id, farm, ['read', 'configure']);
  const field = await transaction(c => saveObject(c, actor, { parentId: farm, code: 'SYNTH-D2-ARCHIVE', name: '合成地块', kind: 'field', source: '测试' }), pool);
  const region = await transaction(c => saveRegion(c, actor, { farmId: farm, name: '归档测试村', source: '测试' }), pool);
  await transaction(c => assignRegion(c, actor, { objectId: field.id, regionId: region.id, source: '测试' }), pool);
  const archived = await transaction(c => setObjectArchive(c, actor, { id: field.id, version: 1, archived: true, reason: '测试停用' }), pool);
  assert.ok(archived.archived_at);
  assert.equal((await transaction(c => listObjects(c, actor), pool)).items.find(r => r.id === field.id)?.archived_at !== null, true);
  assert.equal((await pool.query('SELECT count(*) FROM map_region_links WHERE object_id=$1 AND valid_to IS NOT NULL', [field.id])).rows[0].count, '1');
  await assert.rejects(() => transaction(c => saveObject(c, actor, { id: field.id, version: 2, name: '归档更名', kind: 'field', source: '测试' }), pool), { code: 'OBJECT_ARCHIVED' });
  await transaction(c => setObjectArchive(c, actor, { id: field.id, version: 2, archived: false, reason: '测试恢复' }), pool);
  assert.equal((await pool.query('SELECT count(*) FROM object_versions WHERE object_id=$1', [field.id])).rows[0].count, '3');
  assert.equal((await pool.query('SELECT count(*) FROM map_region_links WHERE object_id=$1 AND valid_to IS NULL', [field.id])).rows[0].count, '0');
}));
