import type {Pool,PoolClient} from 'pg';
import mqtt from 'mqtt';
import {AppError} from '../../platform/error';
import {database,transaction} from '../../db/pool';
import {normalizeGate,gateDeviceFromTopic} from '../../adapters/gate/adapter';
import {parseGateResponse,type GateResponse} from '../../adapters/gate/command';
import type {GateContract} from '../../adapters/gate/contract';
import type {ReadingInput} from './types';
import {assertAccess} from '../identity/access';
import {archiveReceipt,persistBatch} from './ingest';
import {heartbeat} from '../operations/heartbeat';

export interface GateMqttConfiguration{actorId:string;authVersion:number;fields:GateContract}
export interface GateMqttSettings{url:string;clientId:string;username:string|null;password:string|null}

export function readGateMqttSettings(env:NodeJS.ProcessEnv=process.env):GateMqttSettings{
  if(env.GATE_MQTT_ENABLED!=='1')throw new AppError(503,'GATE_MQTT_DISABLED','三诚闸门MQTT采集尚未启用');
  let parsed:URL;try{parsed=new URL(env.GATE_MQTT_URL??'');}catch{throw new AppError(503,'GATE_MQTT_CONFIG','闸门MQTT接入地址未配置或无效');}
  if(!['mqtt:','mqtts:'].includes(parsed.protocol))throw new AppError(503,'GATE_MQTT_CONFIG','闸门MQTT仅允许mqtt/mqtts地址');
  const username=env.GATE_CREDENTIAL_USERNAME??null,password=env.GATE_CREDENTIAL_PASSWORD??null;
  for(const secret of [username,password])if(secret&&/[\r\n]/.test(secret))throw new AppError(503,'GATE_CREDENTIAL','只读凭据配置无效');
  return {url:parsed.toString(),clientId:env.GATE_MQTT_CLIENT_ID||'liangzihu-gate-'+process.pid,username,password};
}
async function guard(c:PoolClient,config:GateMqttConfiguration){
  const source=(await c.query('SELECT * FROM data_sources WHERE id=$1 FOR SHARE',[config.fields.sourceId])).rows[0],u=(await c.query('SELECT role,enabled,auth_version FROM users WHERE id=$1 FOR SHARE',[config.actorId])).rows[0];
  if(!source?.verified||source.provider!=='sdsc'||source.contract_ref!==config.fields.reference||!u?.enabled||u.auth_version!==config.authVersion)throw new AppError(409,'GATE_CONFIGURATION_CHANGED','当前来源、操作主体或契约已改变');
  const actor={id:config.actorId,role:u.role,enabled:true,mfaVerified:true};
  await assertAccess(c,actor,{objectId:source.object_id,action:'record',at:new Date().toISOString()});
  for(const mapping of config.fields.mappings){const objs=(await c.query('SELECT DISTINCT object_id FROM point_bindings WHERE point_id=$1 AND verified',[mapping.pointId])).rows;for(const o of objs)await assertAccess(c,actor,{objectId:o.object_id,action:'record',at:new Date().toISOString()});}
}
export interface GateReceiptOutcome{receipt:'recorded'|'unmatched';commandId:string}
// 设备回执（dir="rsp"）只证明设备收到命令；到位/失败语义厂家未确认，不在这里下结论。
// 按 commandId 匹配待回执申请，匹配不到（含设备编号不一致）丢弃并记日志行，不进隔离区也不入观测。
async function recordGateReceipt(pool:Pool,config:GateMqttConfiguration,externalDeviceId:string,receipt:GateResponse):Promise<GateReceiptOutcome>{
  return transaction(async c=>{
    const req=(await c.query('SELECT r.id,r.object_id,d.external_id FROM control_requests r JOIN devices d ON d.id=r.device_id WHERE r.command_id=$1 AND r.dispatched_at IS NOT NULL',[receipt.commandId])).rows[0];
    if(!req||req.external_id!==externalDeviceId){console.warn(JSON.stringify({event:'gate_receipt_unmatched',commandId:receipt.commandId,device:externalDeviceId}));return {receipt:'unmatched' as const,commandId:receipt.commandId};}
    const value=receipt.ok?`设备回执已收到指令（commandId=${receipt.commandId}）`:`设备回执字段错误（commandId=${receipt.commandId}）：${receipt.errFields.join(',')}`;
    await c.query("INSERT INTO control_feedback(object_id,request_id,layer,result,value,source,observed_at,evidence,created_by) VALUES($1,$2,'device_received',$3,$4,'vendor_receipt',now(),$5,$6)",[req.object_id,req.id,receipt.ok?'observed':'not_observed',value,req.id,config.actorId]);
    return {receipt:'recorded' as const,commandId:receipt.commandId};
  },pool);
}
export async function persistGateMessage(pool:Pool,config:GateMqttConfiguration,topic:string,payload:Buffer,options:{synthetic?:boolean}={}){
  const synthetic=options.synthetic===true;
  if(synthetic&&(await pool.query('SELECT current_database() AS name')).rows[0].name!=='agri_test')throw new AppError(403,'GATE_TEST_ONLY','合成传输仅允许测试库');
  if(!synthetic&&process.env.GATE_MQTT_ENABLED!=='1')throw new AppError(503,'GATE_MQTT_DISABLED','三诚闸门MQTT采集尚未启用');
  const externalDeviceId=gateDeviceFromTopic(topic,config.fields);
  const receipt=parseGateResponse(config.fields,topic,payload);
  if(receipt)return recordGateReceipt(pool,config,externalDeviceId,receipt);
  const receivedAt=new Date().toISOString();
  let body:unknown;try{body=JSON.parse(payload.toString('utf8'));}catch{body=null;}
  let readings:ReadingInput[];
  try{readings=normalizeGate(body,config.fields,externalDeviceId,receivedAt,synthetic?'synthetic':'real');}
  catch(e){
    if(e instanceof AppError&&e.code==='GATE_CONTRACT_NOT_READY')throw e;
    await transaction(async c=>{const rawRef=await archiveReceipt(c,config.fields.sourceId,payload,receivedAt,synthetic);await c.query('INSERT INTO quarantined_readings(raw_ref,input,reasons) VALUES($1,$2,$3)',[rawRef,{topic},['adapter_rejected']]);},pool);
    throw new AppError(422,'GATE_MESSAGE_QUARANTINED','单条报文已留存待核；采集链路继续');
  }
  // 消息幂等由 sourceRecordId（sys_sn/sys_imei/sys_time组合）与观测内容哈希去重保证；
  // 游标只记录最近采样时间作为断点参考，MQTT推送无分页语义，不做漏报补拉。
  const sampled=readings.map(r=>r.sampledAt).filter((x):x is string=>x!==null).sort().pop()??receivedAt;
  const cursor=await database(async c=>{await guard(c,config);return (await c.query('SELECT cursor FROM ingestion_cursors WHERE source_id=$1',[config.fields.sourceId])).rows[0]?.cursor??null;},pool);
  return persistBatch(pool,{sourceId:config.fields.sourceId,raw:payload,receivedAt,synthetic,expectedCursor:cursor,nextCursor:sampled,readings,resolveMappings:true,guard:c=>guard(c,config),contract:{version:config.fields.version,reference:config.fields.reference,snapshot:JSON.parse(JSON.stringify(config.fields))}});
}
async function markUnavailable(pool:Pool,sourceId:string,code:string){
  await transaction(async c=>{await c.query("INSERT INTO source_health(source_id,last_attempt_at,state,error_code) VALUES($1,now(),'unavailable',$2) ON CONFLICT(source_id) DO UPDATE SET last_attempt_at=now(),state='unavailable',error_code=excluded.error_code",[sourceId,code]);},pool);
}
export async function runGateMqtt(pool:Pool,config:GateMqttConfiguration,options:{settings?:GateMqttSettings;shouldStop?:()=>boolean;connect?:typeof mqtt.connect}={}){
  if(!config.fields.reference||!config.fields.version||!config.fields.verified||config.fields.synthetic)throw new AppError(503,'GATE_CONTRACT_NOT_READY','三诚闸门字段与真实样本尚未核实，真实接入未开放');
  const settings=options.settings??readGateMqttSettings(),shouldStop=options.shouldStop??(()=>false);
  const lock=await pool.connect();let locked=false;
  try{
    locked=(await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',['gate-mqtt:'+config.fields.sourceId])).rows[0].locked;
    if(!locked)return {state:'busy' as const};
    const client=(options.connect??mqtt.connect)(settings.url,{clientId:settings.clientId,username:settings.username??undefined,password:settings.password??undefined,reconnectPeriod:10000,connectTimeout:10000});
    await new Promise<void>((resolve,reject)=>{client.once('connect',()=>client.subscribe(config.fields.subscribeTopic??config.fields.topicPrefix+'#',e=>e?reject(e):resolve()));client.once('error',reject);});
    client.on('error',()=>{markUnavailable(pool,config.fields.sourceId,'GATE_MQTT_FAILED').catch(()=>{});});
    let chain=Promise.resolve();
    client.on('message',(topic,payload)=>{chain=chain.then(async()=>{
      try{await persistGateMessage(pool,config,topic,payload);await transaction(c=>heartbeat(c,'ingest','gate-mqtt-'+process.pid,'ok',new Date(),true),pool);}
      catch(e){await markUnavailable(pool,config.fields.sourceId,e instanceof AppError?e.code:'GATE_MQTT_FAILED').catch(()=>{});}
    });});
    while(!shouldStop()){await transaction(c=>heartbeat(c,'ingest','gate-mqtt-'+process.pid,'ok',new Date(),false),pool);await new Promise(r=>setTimeout(r,30000));}
    await new Promise<void>(resolve=>client.end(false,{},()=>resolve()));
    await chain;
    return {state:'ok' as const};
  }finally{if(locked)await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['gate-mqtt:'+config.fields.sourceId]);lock.release();}
}
