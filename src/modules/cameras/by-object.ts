import type {PoolClient} from 'pg';
import type {Actor} from '../../platform/types';
import {AppError} from '../../platform/error';
import {uuid} from '../identity/common';
import {visible,scope} from '../field/common';

type ImageRow={device_id:string;asset_id:string;captured_at:string|null;reference_at:string|null;event_id?:string};

/** An object's camera summary is read only: loading it never wakes a 4G camera. */
export async function camerasForObject(c:PoolClient,a:Actor,objectId:string|null){
 if(!objectId)throw new AppError(400,'CAMERA_OBJECT_REQUIRED','请提供农业对象 ID');
 uuid(objectId);
 objectId=objectId.toLowerCase();
 const cameraScope=await visible(c,a,'camera');
 if(!cameraScope.objects.includes(objectId))throw new AppError(403,'ACCESS_DENIED','无权查看该对象的摄像头');
 const object=(await c.query('SELECT id,name,kind FROM objects WHERE id=$1',[objectId])).rows[0];
 if(!object)throw new AppError(404,'OBJECT_NOT_FOUND','农业对象不存在');
 const devices=(await c.query(`SELECT d.id,d.name,p.name AS parent_name,s.provider,
   CASE WHEN x.verified THEN (x.capabilities->>'channel')::integer ELSE NULL END AS channel_no
   FROM devices d JOIN data_sources s ON s.id=d.source_id
   JOIN devices p ON p.id=d.parent_device_id
   LEFT JOIN camera_capabilities x ON x.device_id=d.id
   WHERE d.object_id=$1 AND d.kind='camera_channel' AND d.verified AND p.verified
     AND p.object_id=d.object_id AND p.source_id=d.source_id
     AND s.verified AND s.object_id=d.object_id
     AND ($2::uuid[] IS NULL OR d.id=ANY($2))
   ORDER BY p.name,d.name,d.id LIMIT 200`,[objectId,cameraScope.resources])).rows;
 if(!devices.length)return {object:{id:object.id,name:object.name,kind:object.kind},channels:[]};
 const ids=devices.map(d=>d.id as string);
 const eventScope=await visible(c,a,'camera_event');
 const mediaScope=await visible(c,a,'media');
 const events=(await c.query(`SELECT DISTINCT ON (e.device_id) e.device_id,e.id,e.event_type,e.occurred_at,e.image_state
   FROM camera_events e WHERE e.object_id=$1 AND e.device_id=ANY($2::uuid[])
     AND ($3::uuid[] IS NULL OR e.id=ANY($3))
   ORDER BY e.device_id,e.occurred_at DESC,e.id DESC`,[objectId,ids,eventScope.resources])).rows;
 const eventImages=(await c.query(`SELECT DISTINCT ON (e.device_id) e.device_id,e.id AS event_id,m.id AS asset_id,m.captured_at,e.occurred_at AS reference_at
   FROM camera_events e JOIN media_assets m ON m.id=e.asset_id
   WHERE e.object_id=$1 AND e.device_id=ANY($2::uuid[]) AND e.image_state='complete'
     AND m.object_id=$1 AND m.ingest_state='complete' AND m.mime LIKE 'image/%'
     AND ($3::uuid[] IS NULL OR e.id=ANY($3)) AND ($4::uuid[] IS NULL OR m.id=ANY($4))
   ORDER BY e.device_id,e.occurred_at DESC,e.id DESC`,[objectId,ids,eventScope.resources,mediaScope.resources])).rows as ImageRow[];
 const captures=(await c.query(`SELECT DISTINCT ON (r.device_id) r.device_id,m.id AS asset_id,m.captured_at,r.completed_at AS reference_at
   FROM camera_reads r JOIN media_assets m ON m.id=r.asset_id
   WHERE r.object_id=$1 AND r.device_id=ANY($2::uuid[]) AND r.operation='capture' AND r.state='ready'
     AND m.object_id=$1 AND m.ingest_state='complete' AND m.mime LIKE 'image/%'
     AND ($3::uuid[] IS NULL OR m.id=ANY($3))
   ORDER BY r.device_id,r.completed_at DESC,r.id DESC`,[objectId,ids,mediaScope.resources])).rows as ImageRow[];
 const permitted=async(type:string,id:string,at?:string)=>{
  try{await scope(c,a,objectId,'read',type,id,at);return true;}
  catch(error){if(error instanceof AppError&&error.status===403)return false;throw error;}
 };
 const accessibleImage=async(row:ImageRow|undefined)=>{
  if(!row)return null;
  if(a.role==='expert'){
   if(row.event_id&&!await permitted('camera_event',row.event_id,row.reference_at??undefined))return null;
   if(!await permitted('media',row.asset_id,row.captured_at??undefined))return null;
  }
  return {assetId:row.asset_id,url:'/api/v1/media/'+row.asset_id,capturedAt:row.captured_at,referenceAt:row.reference_at};
 };
 const channels=[];
 for(const d of devices){
  const event=events.find(e=>e.device_id===d.id);
  const eventImage=eventImages.find(i=>i.device_id===d.id);
  const capture=captures.find(i=>i.device_id===d.id);
  if(a.role==='expert'&&!await permitted('camera',d.id,new Date().toISOString()))continue;
  const visibleEvent=event&&(a.role!=='expert'||await permitted('camera_event',event.id,event.occurred_at))?event:null;
  channels.push({deviceId:d.id,name:d.name,parentName:d.parent_name,provider:d.provider,channelNo:d.channel_no,
   latestEvent:visibleEvent?{id:visibleEvent.id,type:visibleEvent.event_type,occurredAt:visibleEvent.occurred_at,imageState:visibleEvent.image_state}:null,
   eventImage:await accessibleImage(eventImage),captureImage:await accessibleImage(capture)});
 }
 return {object:{id:object.id,name:object.name,kind:object.kind},channels};
}
