import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {withDb} from '../support/db';import {actorFixture,objectFixture,permit} from '../support/fixtures';import {transaction} from '../../src/db/pool';
import {saveControlProfile,saveControlRule,reviewControlRule,requestControl} from '../../src/modules/control/records';
import {dispatchGateControl,type GatePublish} from '../../src/modules/control/dispatch';
import {persistGateMessage,type GateMqttConfiguration} from '../../src/modules/telemetry/gate-mqtt';
import type {GateContract} from '../../src/adapters/gate/contract';
// 全部为合成数据与注入的假 publish（仅测试，agri_test），不连接真实broker、不代表三诚下行协议已核实。
const key=()=>randomUUID(),future=()=>new Date(Date.now()+86400000).toISOString();
const contract:GateContract={version:'synthetic-v1',reference:'合成协议',verified:true,synthetic:true,sourceId:'',topicPrefix:'/synthetic/gate/publish/',directionKey:'dir',expectedDirection:'up',wrapperKey:'params',rowsKey:'r_data',nameKey:'name',valueKey:'value',errorKey:'err',sampledAtKeys:['sys_time','id'],identityKeys:['sys_sn'],metrics:[{sourceName:'opening',metric:'opening',sourceUnit:'%',unit:'%',scale:1,offset:0}],mappings:[]};
function setDispatch(value:string|undefined){const prev=process.env.GATE_DISPATCH_ENABLED;if(value===undefined)delete process.env.GATE_DISPATCH_ENABLED;else process.env.GATE_DISPATCH_ENABLED=value;return prev;}
async function failure(p:Promise<unknown>):Promise<any>{try{await p;}catch(e){return e;}throw new Error('应当被拒绝');}
async function fixture(pool:any){
 const a=await actorFixture(pool,'technician'),b=await actorFixture(pool,'technician'),objectId=await objectFixture(pool,a.id);
 for(const u of [a,b])await permit(pool,u.id,objectId,['read','record','review','configure','act']);
 const sourceId=key(),deviceId=key(),pointId=key();
 await pool.query("INSERT INTO data_sources(id,object_id,code,name,provider,contract_ref,verified,created_by) VALUES($1::uuid,$2,$1::text,'合成闸门来源','sdsc','合成协议',true,$3)",[sourceId,objectId,a.id]);
 await pool.query("INSERT INTO devices(id,object_id,source_id,external_id,name,kind,serial_number,source,verified,created_by) VALUES($1,$2,$3,'D1','合成闸门','physical','test-serial','仅软件测试',true,$4)",[deviceId,objectId,sourceId,a.id]);
 await pool.query("INSERT INTO points(id,device_id,code,name,metric,unit,max_age_ms,max_gap_ms,timing_source,created_by) VALUES($1,$2,'SYNTH-GATE-OPENING','合成开度','opening','%',1800000,600000,'仅测试时效参数',$3)",[pointId,deviceId,a.id]);
 await pool.query("INSERT INTO point_bindings(point_id,object_id,valid_from,verified,evidence,created_by) VALUES($1,$2,'2026-01-01T00:00:00Z',true,'仅测试绑定',$3)",[pointId,objectId,a.id]);
 return {a,b,objectId,sourceId,deviceId,pointId};
}
async function approvedRequest(pool:any,f:any){
 const tx=(fn:any)=>transaction<any>(fn,pool);
 await tx((c:any)=>saveControlProfile(c,f.a,{deviceId:f.deviceId,permission:'allowed',mode:'remote',protection:'clear',loadType:'合成负载',offlineBehavior:'待实物核实',powerLossBehavior:'待实物核实',powerReturnBehavior:'待实物核实',protocolRef:'仅工程测试',feedbackRef:'仅合成字段',validUntil:future(),requestKey:key()}));
 const rule=await tx((c:any)=>saveControlRule(c,f.a,{deviceId:f.deviceId,purpose:'合成申请',species:'测试物种',stage:'测试阶段',conditions:'合成',sourceRef:'软件测试',requestKey:key()}));
 await tx((c:any)=>reviewControlRule(c,f.b,{id:rule.id,action:'approve',evidence:'仅软件链路',requestKey:key()}));
 return tx((c:any)=>requestControl(c,f.a,{deviceId:f.deviceId,ruleId:rule.id,purpose:'合成下发验证',authorizationRef:'测试授权',conditions:'合成',requestKey:key()}));
}
test('下发默认关闭：503拒绝，条件复核照常执行并返回完整阻断清单',()=>withDb(async pool=>{
 const f=await fixture(pool),tx=(fn:any)=>transaction<any>(fn,pool),prev=setDispatch(undefined);
 try{
  const bare=await tx((c:any)=>requestControl(c,f.a,{deviceId:f.deviceId,purpose:'无资料申请',authorizationRef:'测试授权',conditions:'合成',requestKey:key()}));
  const e1=await failure(tx((c:any)=>dispatchGateControl(c,f.a,{requestId:bare.id},{publish:async()=>{throw new Error('不应发布');},contract})));
  assert.equal(e1.status,503);assert.equal(e1.code,'GATE_DISPATCH_DISABLED');
  for(const reason of ['控制资料缺失或已到复核期限','设备操作许可未确认','未确认处于远程模式','现场保护状态未知或生效'])assert(e1.message.includes(reason),reason);
  const ready=await approvedRequest(pool,f);
  const e2=await failure(tx((c:any)=>dispatchGateControl(c,f.a,{requestId:ready.id,action:'open'},{publish:async()=>{throw new Error('不应发布');},contract})));
  assert.equal(e2.code,'GATE_DISPATCH_DISABLED');assert(e2.message.includes('阻断项：无'));
  assert.equal((await pool.query('SELECT dispatched_at,command_id FROM control_requests WHERE id=$1',[ready.id])).rows[0].dispatched_at,null);
 }finally{setDispatch(prev);}
}));
test('开关开启但条件不满足：409列出阻断原因，过期资料与未核实绑定分别拦截',()=>withDb(async pool=>{
 const f=await fixture(pool),tx=(fn:any)=>transaction<any>(fn,pool),prev=setDispatch('1');
 try{
  const bare=await tx((c:any)=>requestControl(c,f.a,{deviceId:f.deviceId,purpose:'无资料申请',authorizationRef:'测试授权',conditions:'合成',requestKey:key()}));
  const e=await failure(tx((c:any)=>dispatchGateControl(c,f.a,{requestId:bare.id,action:'open'},{publish:async()=>{throw new Error('不应发布');},contract})));
  assert.equal(e.status,409);assert.equal(e.code,'GATE_DISPATCH_BLOCKED');
  for(const reason of ['设备操作许可未确认','专业规则尚未批准'])assert(e.message.includes(reason),reason);
  const ready=await approvedRequest(pool,f);
  await tx((c:any)=>saveControlProfile(c,f.a,{deviceId:f.deviceId,permission:'allowed',mode:'remote',protection:'clear',loadType:'合成负载',offlineBehavior:'待实物核实',powerLossBehavior:'待实物核实',powerReturnBehavior:'待实物核实',protocolRef:'仅工程测试',feedbackRef:'仅合成字段',validUntil:new Date(Date.now()-3600000).toISOString(),requestKey:key()}));
  await assert.rejects(()=>tx((c:any)=>dispatchGateControl(c,f.a,{requestId:ready.id,action:'open'},{publish:async()=>{throw new Error('不应发布');},contract})),(e2:any)=>e2.code==='GATE_DISPATCH_BLOCKED'&&e2.message.includes('复核期限'));
  await tx((c:any)=>saveControlProfile(c,f.a,{deviceId:f.deviceId,permission:'allowed',mode:'remote',protection:'clear',loadType:'合成负载',offlineBehavior:'待实物核实',powerLossBehavior:'待实物核实',powerReturnBehavior:'待实物核实',protocolRef:'仅工程测试',feedbackRef:'仅合成字段',validUntil:future(),requestKey:key()}));
  await pool.query('UPDATE point_bindings SET verified=false');
  await assert.rejects(()=>tx((c:any)=>dispatchGateControl(c,f.a,{requestId:ready.id,action:'open'},{publish:async()=>{throw new Error('不应发布');},contract})),(e3:any)=>e3.code==='GATE_DISPATCH_BLOCKED'&&e3.message.includes('绑定'));
 }finally{setDispatch(prev);}
}));
test('开关开启且条件齐备：注入假publish成功下发并回写，重复dispatch幂等返回首个commandId',()=>withDb(async pool=>{
 const f=await fixture(pool),tx=(fn:any)=>transaction<any>(fn,pool),prev=setDispatch('1');
 try{
  const r=await approvedRequest(pool,f),calls:{topic:string;payload:Buffer}[]=[],publish:GatePublish=async(topic,payload)=>{calls.push({topic,payload});};
  const first=await tx((c:any)=>dispatchGateControl(c,f.a,{requestId:r.id,action:'open'},{publish,contract}));
  assert.equal(first.state,'dispatched');assert.equal(calls.length,1);
  assert.equal(calls[0].topic,'/synthetic/gate/sub/D1');
  const body=JSON.parse(calls[0].payload.toString('utf8'));
  assert.deepEqual(body,{params:{Ver:'1.0.1',dir:'down',id:first.commandId,w_data:[{name:'setOpening',value:100}]}});
  const row=(await pool.query('SELECT dispatched_at,command_id FROM control_requests WHERE id=$1',[r.id])).rows[0];
  assert(row.dispatched_at);assert.equal(row.command_id,first.commandId);
  const again=await tx((c:any)=>dispatchGateControl(c,f.a,{requestId:r.id,action:'close'},{publish,contract}));
  assert.equal(again.commandId,first.commandId);assert.equal(calls.length,1);
  await assert.rejects(()=>pool.query('UPDATE control_requests SET blocked_reasons=$2 WHERE id=$1',[r.id,'[]']));
 }finally{setDispatch(prev);}
}));
test('rsp回包经采集路径写入device_received反馈；字段错误记not_observed；未匹配回执丢弃不入库',()=>withDb(async pool=>{
 const f=await fixture(pool),tx=(fn:any)=>transaction<any>(fn,pool),prev=setDispatch('1');
 try{
  const r=await approvedRequest(pool,f),calls:{topic:string;payload:Buffer}[]=[],publish:GatePublish=async(topic,payload)=>{calls.push({topic,payload});};
  const sent=await tx((c:any)=>dispatchGateControl(c,f.a,{requestId:r.id,action:'close'},{publish,contract}));
  const config:GateMqttConfiguration={actorId:f.a.id,authVersion:0,fields:{...contract,sourceId:f.sourceId,mappings:[{externalDeviceId:'D1',metric:'opening',pointId:f.pointId}]}};
  const topic='/synthetic/gate/publish/D1';
  const rsp=(id:string,rows:unknown)=>Buffer.from(JSON.stringify({params:{dir:'rsp',id,r_data:rows}}));
  const ok=await persistGateMessage(pool,config,topic,rsp(sent.commandId,[{name:'setOpening',value:0,err:'0'}]),{synthetic:true}) as {receipt:string;commandId:string};
  assert.deepEqual(ok,{receipt:'recorded',commandId:sent.commandId});
  const fb=(await pool.query("SELECT * FROM control_feedback WHERE layer='device_received'")).rows[0];
  assert.equal(fb.request_id,r.id);assert.equal(fb.source,'vendor_receipt');assert.equal(fb.result,'observed');assert.equal(fb.evidence,r.id);
  const bad=await persistGateMessage(pool,config,topic,rsp(sent.commandId,[{name:'setOpening',value:0,err:'1'}]),{synthetic:true}) as {receipt:string};
  assert.equal(bad.receipt,'recorded');
  assert.equal((await pool.query("SELECT result FROM control_feedback WHERE layer='device_received' ORDER BY created_at DESC LIMIT 1")).rows[0].result,'not_observed');
  const stray=await persistGateMessage(pool,config,topic,rsp(key(),[]),{synthetic:true}) as {receipt:string;commandId:string};
  assert.equal(stray.receipt,'unmatched');
  assert.equal(Number((await pool.query("SELECT count(*) FROM control_feedback WHERE layer='device_received'")).rows[0].count),2);
  assert.equal(Number((await pool.query('SELECT count(*) FROM observations')).rows[0].count),0);
  assert.equal(Number((await pool.query('SELECT count(*) FROM quarantined_readings')).rows[0].count),0);
  // 上行报文解析行为不变
  const up=await persistGateMessage(pool,config,topic,Buffer.from(JSON.stringify({params:{dir:'up',id:'1790812810',sys_sn:'SYNTH',sys_time:'1790812810',r_data:[{name:'opening',value:0}]}})),{synthetic:true});
  assert.equal((up as any)[0].disposition,'inserted');
 }finally{setDispatch(prev);}
}));
