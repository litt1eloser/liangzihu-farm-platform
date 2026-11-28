import {AppError} from '../../platform/error';
import type {GateContract} from './contract';
export type GateCommandAction='open'|'close'|'stop';
export interface GateCommand{topic:string;payload:Buffer}
export interface GateResponse{commandId:string;ok:boolean;errFields:string[]}
// 下行主题为上行 publish 前缀换成 sub；私有契约文件可用 downTopicPrefix 显式登记。
export function gateDownTopicPrefix(contract:GateContract):string{
  if(contract.downTopicPrefix)return contract.downTopicPrefix;
  const derived=contract.topicPrefix.replace(/\/publish\/$/,'/sub/');
  if(derived===contract.topicPrefix)throw new AppError(422,'GATE_TOPIC','契约未登记下行主题前缀');
  return derived;
}
export function buildGateCommand(contract:GateContract,deviceId:string,action:GateCommandAction,commandId:string):GateCommand{
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(deviceId))throw new AppError(422,'GATE_TOPIC','设备编号不符已登记契约');
  if(!/^[A-Za-z0-9-]{1,64}$/.test(commandId))throw new AppError(422,'GATE_COMMAND','指令编号无效');
  const row=action==='stop'?{name:'stop',value:'0'}:{name:'setOpening',value:action==='open'?'100':'0'};
  const body={[contract.wrapperKey]:{Ver:'1.0.1',[contract.directionKey]:'down',id:commandId,w_data:[row]}};
  return {topic:gateDownTopicPrefix(contract)+deviceId,payload:Buffer.from(JSON.stringify(body),'utf8')};
}
// 仅识别设备回执（dir="rsp"）：其余报文返回 null，交由上行采集路径处理。
export function parseGateResponse(contract:GateContract,topic:string,payload:Buffer|string):GateResponse|null{
  if(!topic.startsWith(contract.topicPrefix))return null;
  let raw:unknown;try{raw=JSON.parse(payload.toString());}catch{return null;}
  const wrapper=raw&&typeof raw==='object'?(raw as Record<string,unknown>)[contract.wrapperKey]:undefined;
  if(!wrapper||typeof wrapper!=='object')return null;
  const body=wrapper as Record<string,unknown>;
  if(body[contract.directionKey]!=='rsp')return null;
  const id=body.id,commandId=typeof id==='string'&&id!==''?id:typeof id==='number'&&Number.isFinite(id)?String(id):null;
  if(!commandId)return null;
  const rows=[body[contract.rowsKey],body.w_data].find(Array.isArray)??[];
  const errFields:string[]=[];
  for(const row of rows as unknown[]){
    if(!row||typeof row!=='object')continue;
    const record=row as Record<string,unknown>,name=record[contract.nameKey],err=record[contract.errorKey];
    if(typeof name==='string'&&err!==undefined&&err!=='0'&&err!==0)errFields.push(name);
  }
  return {commandId,ok:errFields.length===0,errFields};
}
