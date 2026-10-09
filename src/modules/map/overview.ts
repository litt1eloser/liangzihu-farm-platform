import type { PoolClient } from 'pg';
import type { Actor } from '../../platform/types';
import { listMap } from './service';
import { listRegions } from './regions';
import { assertBinding } from '../machinery/orders';
import { AppError } from '../../platform/error';

export async function farmOverview(c: PoolClient, actor: Actor) {
  const map = await listMap(c, actor);
  const originalIds = map.items.map(item => item.id as string);
  const archived = actor.role === 'expert' || !originalIds.length ? [] : (await c.query('SELECT id FROM objects WHERE id=ANY($1::uuid[]) AND archived_at IS NOT NULL', [originalIds])).rows.map(row => row.id as string);
  const items = map.items.filter(item => !archived.includes(item.id as string));
  if (actor.role === 'expert') return { items, regions: [], summaries: [], mobileDevices: [], limits: ['仅显示明确分享的边界资料', '历史轨迹不代表实时定位'] };
  const ids = items.map(item => item.id as string);
  const provenance = ids.length ? (await c.query(`SELECT o.id,o.source AS object_source,COALESCE(v.created_at,o.created_at) AS object_recorded_at,
    b.source AS boundary_source,b.created_at AS boundary_recorded_at
    FROM objects o LEFT JOIN object_versions v ON v.object_id=o.id AND v.version=o.version
    LEFT JOIN LATERAL (SELECT source,created_at FROM boundary_versions WHERE object_id=o.id AND object_version=o.version LIMIT 1) b ON true
    WHERE o.id=ANY($1::uuid[])`,[ids])).rows : [];
  const provenanceById=new Map(provenance.map(row=>[row.id,row]));
  const detailedItems=items.map(item=>({...item,...provenanceById.get(item.id as string)}));
  const regions = await listRegions(c, actor);
  const summaries = ids.length ? (await c.query(`SELECT o.id AS object_id,
    (SELECT count(*)::int FROM alerts a WHERE a.object_id=o.id AND a.state<>'closed') AS open_alerts,
    (SELECT count(*)::int FROM farm_records r WHERE r.object_id=o.id AND NOT EXISTS(SELECT 1 FROM farm_records later WHERE later.supersedes_id=r.id)) AS record_count,
    (SELECT count(*)::int FROM points p JOIN devices d ON d.id=p.device_id WHERE d.object_id=o.id) AS point_count
    FROM objects o WHERE o.id=ANY($1::uuid[])`, [ids])).rows : [];
  const bindingCandidates = ids.length ? (await c.query(`SELECT b.id AS binding_id,b.object_id,b.evidence,b.valid_from,b.valid_until,
    m.id AS machine_id,m.name AS machine_name,m.verified AS machine_verified,
    t.id AS terminal_id,t.name AS terminal_name,t.verified AS terminal_verified
    FROM machinery_bindings b JOIN devices m ON m.id=b.machine_device_id JOIN devices t ON t.id=b.terminal_device_id
    WHERE b.object_id=ANY($1::uuid[]) AND m.object_id=ANY($1::uuid[]) AND t.object_id=ANY($1::uuid[])
      AND m.verified AND t.verified
      AND b.revoked_at IS NULL AND b.valid_from<=clock_timestamp() AND b.valid_until>clock_timestamp()
    ORDER BY b.valid_from DESC LIMIT 200`, [ids])).rows : [];
  const mobileDevices = [];
  const now = new Date();
  for (const binding of bindingCandidates) {
    try { await assertBinding(c,binding.binding_id,binding.object_id,now,now); mobileDevices.push(binding); }
    catch (error) { if (!(error instanceof AppError) || error.code !== 'MACHINE_BINDING_INVALID') throw error; }
  }
  return { items:detailedItems, regions: regions.items, summaries, mobileDevices, limits: ['业务概要仅是已有记录数量', '机具与终端来自有效农机绑定；历史轨迹不代表实时定位'] };
}
