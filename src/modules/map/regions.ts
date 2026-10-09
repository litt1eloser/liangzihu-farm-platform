import type { PoolClient } from 'pg';
import type { Actor } from '../../platform/types';
import { AppError } from '../../platform/error';
import { integer, text } from '../../platform/validation';
import { assertAccess, listAccessibleObjects } from '../identity/access';
import { audit, uuid } from '../identity/common';

async function farmOf(c: PoolClient, objectId: string) {
  const result = await c.query(`WITH RECURSIVE ancestors AS (
    SELECT id,parent_id,kind FROM objects WHERE id=$1
    UNION ALL SELECT o.id,o.parent_id,o.kind FROM objects o JOIN ancestors a ON o.id=a.parent_id
  ) SELECT id FROM ancestors WHERE kind='farm' AND parent_id IS NULL LIMIT 1`, [objectId]);
  if (!result.rowCount) throw new AppError(422, 'REGION_FARM', '对象不属于有效农场');
  return result.rows[0].id as string;
}

export async function listRegions(c: PoolClient, actor: Actor) {
  if (actor.role === 'expert') throw new AppError(403, 'EXPERT_ITEM_ONLY', '专家只能访问明确授权的地图资料');
  const ids = await listAccessibleObjects(c, actor, 'read');
  const rows = (await c.query(`SELECT r.id,r.farm_id,r.name,r.source,r.version,r.archived_at,
    l.id AS link_id,l.object_id,l.valid_from,l.source AS link_source
    FROM map_regions r LEFT JOIN map_region_links l ON l.region_id=r.id AND l.valid_to IS NULL AND l.object_id=ANY($1::uuid[])
    WHERE r.farm_id=ANY($1::uuid[]) OR l.id IS NOT NULL
    ORDER BY r.name,r.id,l.valid_from`, [ids])).rows;
  const regions = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!regions.has(row.id)) regions.set(row.id, { id: row.id, farmId: row.farm_id, name: row.name, source: row.source, version: row.version, archivedAt: row.archived_at, links: [] });
    if (row.link_id) (regions.get(row.id)!.links as unknown[]).push({ id: row.link_id, objectId: row.object_id, validFrom: row.valid_from, source: row.link_source });
  }
  return { items: [...regions.values()] };
}

export async function saveRegion(c: PoolClient, actor: Actor, input: Record<string, unknown>) {
  const name = text(input.name, '村庄名称', 80), source = text(input.source, '维护依据', 1000);
  let row;
  if (input.id) {
    uuid(input.id);
    const old = (await c.query('SELECT * FROM map_regions WHERE id=$1 FOR UPDATE', [input.id])).rows[0];
    if (!old) throw new AppError(404, 'REGION_NOT_FOUND', '村庄不存在');
    await assertAccess(c, actor, { objectId: old.farm_id, action: 'configure', at: new Date().toISOString() });
    if (old.archived_at) throw new AppError(409, 'REGION_ARCHIVED', '请先恢复村庄');
    if (old.version !== integer(input.version, '版本')) throw new AppError(409, 'VERSION_CONFLICT', '村庄已更新，请刷新后重试');
    row = (await c.query('UPDATE map_regions SET name=$2,source=$3,version=version+1,updated_at=now() WHERE id=$1 RETURNING *', [old.id, name, source])).rows[0];
  } else {
    uuid(input.farmId);
    await assertAccess(c, actor, { objectId: input.farmId, action: 'configure', at: new Date().toISOString() });
    if ((await farmOf(c, input.farmId)) !== input.farmId) throw new AppError(422, 'REGION_FARM', '只能在农场主档下建立村庄');
    const existing = await c.query('SELECT id FROM map_regions WHERE farm_id=$1 AND lower(name)=lower($2) AND archived_at IS NULL', [input.farmId, name]);
    if (existing.rowCount) throw new AppError(409, 'REGION_NAME_EXISTS', '该农场已有同名村庄');
    row = (await c.query('INSERT INTO map_regions(farm_id,name,source,created_by) VALUES($1,$2,$3,$4) RETURNING *', [input.farmId, name, source, actor.id])).rows[0];
  }
  await audit(c, actor.id, 'map_region_saved', row.id);
  return row;
}

export async function setRegionArchive(c: PoolClient, actor: Actor, input: Record<string, unknown>) {
  uuid(input.id);
  const row = (await c.query('SELECT * FROM map_regions WHERE id=$1 FOR UPDATE', [input.id])).rows[0];
  if (!row) throw new AppError(404, 'REGION_NOT_FOUND', '村庄不存在');
  await assertAccess(c, actor, { objectId: row.farm_id, action: 'configure', at: new Date().toISOString() });
  if (row.version !== integer(input.version, '版本')) throw new AppError(409, 'VERSION_CONFLICT', '村庄已更新，请刷新后重试');
  const archived = input.archived;
  if (typeof archived !== 'boolean' || Boolean(row.archived_at) === archived) throw new AppError(400, 'REGION_ARCHIVE_STATE', '归档状态没有变化');
  const reason = text(input.reason, '变更依据', 1000);
  if (archived) {
    const links = (await c.query('SELECT object_id FROM map_region_links WHERE region_id=$1 AND valid_to IS NULL FOR UPDATE', [row.id])).rows;
    for (const link of links) await assertAccess(c, actor, { objectId: link.object_id, action: 'configure', at: new Date().toISOString() });
    await c.query('UPDATE map_region_links SET valid_to=now(),ended_by=$2,end_reason=$3 WHERE region_id=$1 AND valid_to IS NULL', [row.id, actor.id, reason]);
  }
  const saved = (await c.query('UPDATE map_regions SET archived_at=CASE WHEN $2 THEN now() ELSE NULL END,archived_by=CASE WHEN $2 THEN $3::uuid ELSE NULL END,version=version+1,updated_at=now() WHERE id=$1 RETURNING *', [row.id, archived, actor.id])).rows[0];
  await audit(c, actor.id, archived ? 'map_region_archived' : 'map_region_restored', row.id);
  return saved;
}

export async function assignRegion(c: PoolClient, actor: Actor, input: Record<string, unknown>) {
  uuid(input.objectId);
  const objectId = input.objectId;
  await assertAccess(c, actor, { objectId, action: 'configure', at: new Date().toISOString() });
  const obj = (await c.query('SELECT id,kind FROM objects WHERE id=$1 FOR UPDATE', [objectId])).rows[0];
  if (!obj || obj.kind === 'farm') throw new AppError(422, 'REGION_OBJECT', '请选择农场内的农业对象');
  const reason = text(input.source, '关联依据', 1000);
  let regionId: string | null = null;
  if (input.regionId !== null) {
    uuid(input.regionId);
    regionId = input.regionId;
    const region = (await c.query('SELECT * FROM map_regions WHERE id=$1 FOR UPDATE', [regionId])).rows[0];
    if (!region || region.archived_at) throw new AppError(404, 'REGION_NOT_FOUND', '有效村庄不存在');
    await assertAccess(c, actor, { objectId: region.farm_id, action: 'configure', at: new Date().toISOString() });
    if (await farmOf(c, objectId) !== region.farm_id) throw new AppError(422, 'REGION_FARM_MISMATCH', '村庄和对象必须属于同一农场');
  }
  const active = (await c.query('SELECT * FROM map_region_links WHERE object_id=$1 AND valid_to IS NULL FOR UPDATE', [objectId])).rows[0];
  if (active?.region_id === regionId) return { objectId, regionId, unchanged: true };
  if (active) await c.query('UPDATE map_region_links SET valid_to=now(),ended_by=$2,end_reason=$3 WHERE id=$1', [active.id, actor.id, reason]);
  const link = regionId ? (await c.query('INSERT INTO map_region_links(region_id,object_id,source,created_by) VALUES($1,$2,$3,$4) RETURNING id', [regionId, objectId, reason, actor.id])).rows[0] : null;
  await audit(c, actor.id, 'map_region_link_changed', objectId);
  return { objectId, regionId, linkId: link?.id ?? null };
}

export async function regionHistory(c: PoolClient, actor: Actor, regionId: string) {
  uuid(regionId);
  const region = (await c.query('SELECT * FROM map_regions WHERE id=$1', [regionId])).rows[0];
  if (!region) throw new AppError(404, 'REGION_NOT_FOUND', '村庄不存在');
  await assertAccess(c, actor, { objectId: region.farm_id, action: 'configure', at: new Date().toISOString() });
  const ids = await listAccessibleObjects(c, actor, 'configure');
  const links = (await c.query('SELECT id,object_id,valid_from,valid_to,source,end_reason FROM map_region_links WHERE region_id=$1 AND object_id=ANY($2::uuid[]) ORDER BY valid_from DESC', [regionId, ids])).rows;
  return { region, links };
}
