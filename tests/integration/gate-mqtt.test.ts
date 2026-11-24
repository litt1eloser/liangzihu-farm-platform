import test from 'node:test';import assert from 'node:assert/strict';import {withDb} from '../support/db';import {telemetryFixture} from '../support/telemetry';import {persistGateMessage,type GateMqttConfiguration} from '../../src/modules/telemetry/gate-mqtt';
// 全部使用合成契约与合成报文（仅测试，agri_test），不代表三诚真实协议已核实；不连接真实broker。
test('闸门MQTT报文持久后推进游标并去重，撤权不推进， malformed报文留存隔离',()=>withDb(async pool=>{
  const f=await telemetryFixture(pool);await pool.query("UPDATE data_sources SET verified=true,provider='sdsc',contract_ref='合成协议' WHERE id=$1",[f.source.id]);
  const config:GateMqttConfiguration={actorId:f.actor.id,authVersion:0,fields:{version:'synthetic-v1',reference:'合成协议',verified:true,synthetic:true,sourceId:f.source.id,topicPrefix:'/synthetic/gate/publish/',directionKey:'dir',expectedDirection:'up',wrapperKey:'params',rowsKey:'r_data',nameKey:'name',valueKey:'value',errorKey:'err',sampledAtKeys:['sys_time','id'],identityKeys:['sys_sn','sys_imei','sys_time'],metrics:[{sourceName:'opening',metric:'synthetic_metric',sourceUnit:'test_unit',unit:'test_unit',scale:1,offset:0}],mappings:[{externalDeviceId:'D1',metric:'synthetic_metric',pointId:f.point.id}]}};
  const topic='/synthetic/gate/publish/D1',message=()=>Buffer.from(JSON.stringify({params:{dir:'up',id:'1790812810',sys_sn:'SYNTH-SN',sys_time:'1790812810',r_data:[{name:'opening',value:0}]}}));
  const first=await persistGateMessage(pool,config,topic,message(),{synthetic:true}) as {disposition:string}[];
  assert.equal(first[0].disposition,'inserted');
  assert.equal(Number((await pool.query('SELECT value FROM observations')).rows[0].value),0);
  assert.equal((await pool.query('SELECT cursor FROM ingestion_cursors')).rows[0].cursor,'2026-10-01T00:00:10.000Z');
  assert.equal((await pool.query('SELECT state FROM source_health')).rows[0].state,'ok');
  assert.equal((await pool.query('SELECT contract_version FROM raw_receipts')).rows[0].contract_version,'synthetic-v1');
  const again=await persistGateMessage(pool,config,topic,message(),{synthetic:true}) as {disposition:string}[];
  assert.equal(again[0].disposition,'duplicate');assert.equal(Number((await pool.query('SELECT count(*) FROM observations')).rows[0].count),1);
  await pool.query("UPDATE grants SET revoked_at=now() WHERE user_id=$1 AND action='record'",[f.actor.id]);
  const later=Buffer.from(JSON.stringify({params:{dir:'up',sys_sn:'SYNTH-SN',sys_time:'1790812909',r_data:[{name:'opening',value:1}]}}));
  await assert.rejects(()=>persistGateMessage(pool,config,topic,later,{synthetic:true}),{status:403});
  assert.equal((await pool.query('SELECT cursor FROM ingestion_cursors')).rows[0].cursor,'2026-10-01T00:00:10.000Z');
  await pool.query("UPDATE grants SET revoked_at=NULL WHERE user_id=$1",[f.actor.id]);
  await assert.rejects(()=>persistGateMessage(pool,config,topic,Buffer.from('not-json'),{synthetic:true}),{code:'GATE_MESSAGE_QUARANTINED'});
  assert.equal(Number((await pool.query('SELECT count(*) FROM quarantined_readings')).rows[0].count),1);
  assert.equal(Number((await pool.query('SELECT count(*) FROM raw_receipts')).rows[0].count),3);
  await assert.rejects(()=>persistGateMessage(pool,config,'/synthetic/gate/sub/D1',message(),{synthetic:true}),{code:'GATE_TOPIC'});
}));
