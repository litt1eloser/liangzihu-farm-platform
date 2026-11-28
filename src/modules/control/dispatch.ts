import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {PoolClient} from 'pg';
import type {Actor} from '../../platform/types';
import {AppError} from '../../platform/error';
import {choice} from '../../platform/validation';
import {uuid} from '../identity/common';
import {scope} from '../field/common';
import {buildGateCommand} from '../../adapters/gate/command';
import type {GateContract} from '../../adapters/gate/contract';
export type GatePublish=(topic:string,payload:Buffer)=>Promise<void>;
export interface GateDispatchOptions{publish?:GatePublish;contract?:GateContract}
// 默认发布到本地broker（桥接转发由部署侧负责）；动态引入mqtt，避免把broker客户端打进web路由包。
async function defaultPublish(topic:string,payload:Buffer):Promise<void>{
  let parsed:URL;try{parsed=new URL(process.env.GATE_MQTT_URL??'');}catch{throw new AppError(503,'GATE_MQTT_CONFIG','闸门MQTT接入地址未配置或无效');}
  if(!['mqtt:','mqtts:'].includes(parsed.protocol))throw new AppError(503,'GATE_MQTT_CONFIG','闸门MQTT仅允许mqtt/mqtts地址');
  const {default:mqtt}=await import('mqtt');
  const client=mqtt.connect(parsed.toString(),{clientId:(process.env.GATE_MQTT_CLIENT_ID||'liangzihu-gate-'+process.pid)+'-dispatch',username:process.env.GATE_CREDENTIAL_USERNAME||undefined,password:process.env.GATE_CREDENTIAL_PASSWORD||undefined,connectTimeout:10000});
  try{
    await new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('error',reject);});
    await new Promise<void>((resolve,reject)=>client.publish(topic,payload,{qos:1},e=>e?reject(e):resolve()));
  }finally{await new Promise<void>(resolve=>client.end(false,{},()=>resolve()));}
}
async function loadContract():Promise<GateContract>{
  const file=process.env.GATE_CONTRACT_FILE;if(!file)throw new AppError(503,'GATE_CONTRACT_FILE','未配置私有闸门契约文件位置');
  return JSON.parse(await readFile(file,'utf8'));
}
// 控制执行链路默认关闭（GATE_DISPATCH_ENABLED !== '1'）：条件复核照常执行并随错误返回完整阻断清单。
export async function dispatchGateControl(c:PoolClient,a:Actor,b:Record<string,unknown>,options:GateDispatchOptions={}){
  uuid(b.requestId);
  const req=(await c.query('SELECT * FROM control_requests WHERE id=$1 FOR UPDATE',[b.requestId])).rows[0];
  if(!req)throw new AppError(404,'CONTROL_REQUEST_NOT_FOUND','申请不存在');
  const d=(await c.query('SELECT * FROM devices WHERE id=$1',[req.device_id])).rows[0];
  if(!d)throw new AppError(404,'DEVICE_NOT_FOUND','设备不存在');
  await scope(c,a,d.object_id,'read');await scope(c,a,d.object_id,'act');
  if(req.dispatched_at)return {commandId:req.command_id,state:'dispatched' as const};
  const profile=(await c.query('SELECT * FROM control_profiles WHERE device_id=$1 ORDER BY version DESC LIMIT 1',[d.id])).rows[0];
  const reasons:string[]=[];
  if(!profile||+profile.valid_until<=Date.now())reasons.push('控制资料缺失或已到复核期限');
  if(profile?.permission!=='allowed')reasons.push('设备操作许可未确认');
  if(profile?.mode!=='remote')reasons.push('未确认处于远程模式');
  if(profile?.protection!=='clear')reasons.push('现场保护状态未知或生效');
  const rule=req.rule_id?(await c.query('SELECT * FROM control_rules WHERE id=$1',[req.rule_id])).rows[0]:null;
  if(!rule||rule.state!=='approved')reasons.push('专业规则尚未批准');
  const bound=await c.query('SELECT 1 FROM points p JOIN point_bindings pb ON pb.point_id=p.id WHERE p.device_id=$1 AND pb.verified AND pb.valid_from<=now() AND (pb.valid_to IS NULL OR pb.valid_to>now()) LIMIT 1',[d.id]);
  if(!bound.rowCount)reasons.push('设备测点缺少已核实的对象绑定');
  if(process.env.GATE_DISPATCH_ENABLED!=='1')throw new AppError(503,'GATE_DISPATCH_DISABLED','控制下发未启用（待联合签验）；本次条件复核阻断项：'+(reasons.length?reasons.join('；'):'无'));
  if(reasons.length)throw new AppError(409,'GATE_DISPATCH_BLOCKED','控制条件复核未通过：'+reasons.join('；'));
  const action=choice(b.action,['open','close','stop'] as const,'控制动作');
  const contract=options.contract??await loadContract();
  const commandId=randomUUID(),command=buildGateCommand(contract,d.external_id,action,commandId);
  await (options.publish??defaultPublish)(command.topic,command.payload);
  await c.query('UPDATE control_requests SET dispatched_at=now(),command_id=$2 WHERE id=$1',[req.id,commandId]);
  await c.query("INSERT INTO domain_events(event_type,object_id,payload) VALUES('control.dispatch',$1,$2)",[d.object_id,JSON.stringify({actorId:a.id,resultId:req.id})]);
  return {commandId,state:'dispatched' as const};
}
