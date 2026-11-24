import test from 'node:test';import assert from 'node:assert/strict';
import {buildGateCommand,parseGateResponse,gateDownTopicPrefix} from '../../src/adapters/gate/command';
import type {GateContract} from '../../src/adapters/gate/contract';
// 合成契约，仅测试报文构造与解析，不代表三诚真实协议已核实。
const contract:GateContract={version:'synthetic-v1',reference:'合成协议，仅测试',verified:true,synthetic:true,sourceId:'s',topicPrefix:'/synthetic/gate/publish/',directionKey:'dir',expectedDirection:'up',wrapperKey:'params',rowsKey:'r_data',nameKey:'name',valueKey:'value',errorKey:'err',sampledAtKeys:['sys_time'],identityKeys:[],metrics:[],mappings:[]};
test('开闸命令：sub主题与setOpening=100，关闸=0，显式下行前缀优先',()=>{
  const open=buildGateCommand(contract,'D1','open','cmd-1');
  assert.equal(open.topic,'/synthetic/gate/sub/D1');
  assert.deepEqual(JSON.parse(open.payload.toString('utf8')),{params:{Ver:'1.0.1',dir:'down',id:'cmd-1',w_data:[{name:'setOpening',value:100}]}});
  const close=buildGateCommand(contract,'hbdxscz012','close','cmd-2');
  assert.equal(JSON.parse(close.payload.toString('utf8')).params.w_data[0].value,0);
  assert.equal(buildGateCommand({...contract,downTopicPrefix:'/explicit/sub/'},'D1','open','c').topic,'/explicit/sub/D1');
  assert.throws(()=>gateDownTopicPrefix({...contract,topicPrefix:'/no-publish-marker/'}),{code:'GATE_TOPIC'});
  assert.throws(()=>buildGateCommand(contract,'bad id','open','c'),{code:'GATE_TOPIC'});
});
test('回执解析：rsp取指令ID，err字段非0记失败，非rsp报文返回null',()=>{
  const rsp=(id:unknown,rows:unknown)=>Buffer.from(JSON.stringify({params:{dir:'rsp',id,r_data:rows}}));
  const ok=parseGateResponse(contract,'/synthetic/gate/publish/D1',rsp('cmd-1',[{name:'setOpening',value:100,err:'0'}]));
  assert.deepEqual(ok,{commandId:'cmd-1',ok:true,errFields:[]});
  const failed=parseGateResponse(contract,'/synthetic/gate/publish/D1',rsp('cmd-2',[{name:'setOpening',value:100,err:'1'}]));
  assert.deepEqual(failed,{commandId:'cmd-2',ok:false,errFields:['setOpening']});
  const wdata=parseGateResponse(contract,'/synthetic/gate/publish/D1',Buffer.from(JSON.stringify({params:{dir:'rsp',id:'cmd-3',w_data:[{name:'setOpening',err:'2'}]}})));
  assert.deepEqual(wdata,{commandId:'cmd-3',ok:false,errFields:['setOpening']});
  assert.equal(parseGateResponse(contract,'/synthetic/gate/publish/D1',Buffer.from(JSON.stringify({params:{dir:'up',id:'x',r_data:[]}}))),null);
  assert.equal(parseGateResponse(contract,'/synthetic/gate/publish/D1',Buffer.from('not-json')),null);
  assert.equal(parseGateResponse(contract,'/synthetic/gate/publish/D1',rsp('',[])),null);
  assert.equal(parseGateResponse(contract,'/synthetic/gate/sub/D1',rsp('cmd-1',[])),null);
});
