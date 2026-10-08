import type { PoolClient } from 'pg';
import type { Actor } from '@/platform/types';
import { AppError } from '@/platform/error';
import { finite, integer, optionalText, text } from '@/platform/validation';
import { audit, uuid } from '@/modules/identity/common';

export interface DraftPoint {
  id: string;
  name: string;
  note: string | null;
  lng: number;
  lat: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const fields = `id,name,note,ST_X(position) AS lng,ST_Y(position) AS lat,
  version,created_at AS "createdAt",updated_at AS "updatedAt"`;

function allowPrivateDrafts(actor: Actor): void {
  if (actor.role === 'expert')
    throw new AppError(403, 'EXPERT_ITEM_ONLY', '专家账号不能使用私有地图标点草稿');
}

function pointName(value: unknown): string {
  const name = text(value, '点位名称', 80).normalize('NFC');
  if (!/^[\p{Script=Han}A-Za-z0-9 _（）()·.-]+$/u.test(name))
    throw new AppError(400, 'INVALID_POINT_NAME', '名称只支持常见中文、英文、数字、空格及括号等符号');
  return name;
}

function pointNote(value: unknown): string | null {
  if (typeof value === 'string' && !value.trim()) return null;
  return optionalText(value, '备注', 2000);
}

function coordinates(body: Record<string, unknown>): { lng: number; lat: number } {
  const lng = finite(body.lng, '经度');
  const lat = finite(body.lat, '纬度');
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90)
    throw new AppError(400, 'INVALID_COORDINATES', '经度须在 -180 到 180、纬度须在 -90 到 90 之间');
  return { lng, lat };
}

export async function listDraftPoints(client: PoolClient, actor: Actor): Promise<{ actorId: string; points: DraftPoint[] }> {
  allowPrivateDrafts(actor);
  const result = await client.query<DraftPoint>(
    `SELECT ${fields} FROM satellite_draft_points WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 1000`,
    [actor.id],
  );
  return { actorId: actor.id, points: result.rows };
}

export async function createDraftPoint(client: PoolClient, actor: Actor, body: Record<string, unknown>): Promise<DraftPoint> {
  allowPrivateDrafts(actor);
  uuid(body.requestKey);
  const name = pointName(body.name);
  const note = pointNote(body.note);
  const { lng, lat } = coordinates(body);
  const result = await client.query<DraftPoint>(
    `INSERT INTO satellite_draft_points(owner_id,request_key,name,note,position)
     VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326))
     ON CONFLICT (owner_id,request_key) DO NOTHING RETURNING ${fields}`,
    [actor.id, body.requestKey, name, note, lng, lat],
  );
  if (result.rows[0]) {
    await audit(client, actor.id, 'satellite_draft_point_created', result.rows[0].id);
    return result.rows[0];
  }
  const existing = (await client.query<DraftPoint>(
    `SELECT ${fields} FROM satellite_draft_points WHERE owner_id=$1 AND request_key=$2`,
    [actor.id, body.requestKey],
  )).rows[0];
  if (!existing) throw new AppError(409, 'REQUEST_RETRY', '保存状态已变化，请重新读取点位后核对');
  if (existing.name !== name || existing.note !== note || existing.lng !== lng || existing.lat !== lat)
    throw new AppError(409, 'REQUEST_KEY_REUSED', '该保存请求已用于其他点位，请重新标点');
  return existing;
}

export async function updateDraftPoint(client: PoolClient, actor: Actor, id: string, body: Record<string, unknown>): Promise<DraftPoint> {
  allowPrivateDrafts(actor);
  uuid(id);
  const name = pointName(body.name);
  const note = pointNote(body.note);
  const version = integer(body.version, '点位版本');
  const result = await client.query<DraftPoint>(
    `UPDATE satellite_draft_points SET name=$3,note=$4,version=version+1,updated_at=now()
     WHERE id=$1 AND owner_id=$2 AND version=$5 RETURNING ${fields}`,
    [id, actor.id, name, note, version],
  );
  if (!result.rows[0]) await missingOrChanged(client, actor.id, id);
  await audit(client, actor.id, 'satellite_draft_point_updated', id);
  return result.rows[0];
}

export async function deleteDraftPoint(client: PoolClient, actor: Actor, id: string, body: Record<string, unknown>): Promise<{ id: string; deleted: true }> {
  allowPrivateDrafts(actor);
  uuid(id);
  const version = integer(body.version, '点位版本');
  const result = await client.query(
    `DELETE FROM satellite_draft_points WHERE id=$1 AND owner_id=$2 AND version=$3 RETURNING id`,
    [id, actor.id, version],
  );
  if (!result.rowCount) await missingOrChanged(client, actor.id, id);
  await audit(client, actor.id, 'satellite_draft_point_deleted', id);
  return { id, deleted: true };
}

async function missingOrChanged(client: PoolClient, ownerId: string, id: string): Promise<never> {
  const exists = (await client.query('SELECT 1 FROM satellite_draft_points WHERE id=$1 AND owner_id=$2', [id, ownerId])).rowCount;
  if (exists) throw new AppError(409, 'POINT_VERSION_CHANGED', '点位已由另一页面修改，请刷新后核对');
  throw new AppError(404, 'POINT_NOT_FOUND', '点位不存在或不属于当前账号');
}
