import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {withDb} from '../support/db';
import {actorFixture,objectFixture,permit} from '../support/fixtures';
import {transaction} from '../../src/db/pool';
import {saveGateDeployment} from '../../src/modules/control/gate-deployments';
import {controlOverview} from '../../src/modules/control/queries';
import {exportBusinessRelations} from '../../src/modules/maintenance/business-export';

async function fixture(pool:Pool){
  const actor=await actorFixture(pool,'technician'),objectId=await objectFixture(pool,actor.id);
  await permit(pool,actor.id,objectId,['read','configure','record','act']);
  const source=randomUUID(),device=randomUUID(),gateway=randomUUID();
  await pool.query("INSERT INTO data_sources(id,object_id,code,name,provider,created_by) VALUES($1::uuid,$2,$1::text,'隔离测试来源','synthetic',$3)",[source,objectId,actor.id]);
  for(const [id,kind] of [[device,'physical'],[gateway,'gateway']])await pool.query("INSERT INTO devices(id,object_id,source_id,external_id,name,kind,source,created_by) VALUES($1::uuid,$2,$3,$1::text,'隔离测试设备',$4,'仅软件测试',$5)",[id,objectId,source,kind,actor.id]);
  return {actor,objectId,device,gateway};
}
const pending=(deviceId:string)=>({deviceId,protocol:'tcp_rtu',protocolStatus:'pending',tcpRole:'unknown',protocolRef:'仅测试口头线索，非厂家文档',requestKey:randomUUID()});

test('闸门资料允许未取得参数，重复提交不增版本，新记录追加并纳入范围导出',()=>withDb(async pool=>{
  const f=await fixture(pool),body=pending(f.device);
  const a=await transaction(c=>saveGateDeployment(c,f.actor,body),pool),repeat=await transaction(c=>saveGateDeployment(c,f.actor,body),pool);
  assert.equal(a.id,repeat.id);assert.equal(a.version,1);assert.equal(a.controller_model,null);assert.equal(a.protocol_status,'pending');
  await assert.rejects(()=>transaction(c=>saveGateDeployment(c,f.actor,{...body,protocol:'mqtt'}),pool));
  const b=await transaction(c=>saveGateDeployment(c,f.actor,{...body,protocol:'mqtt',requestKey:randomUUID()}),pool);assert.equal(b.version,2);
  const overview=await transaction(c=>controlOverview(c,f.actor,f.objectId),pool);
  assert.equal(overview.gateDeployments.length,1);assert.equal(overview.gateDeployments[0].id,b.id);assert.equal(overview.actualDispatchEnabled,false);
  const exported=await transaction(c=>exportBusinessRelations(c,f.actor,[f.objectId]),pool);assert.equal(exported.phase3.gate_deployments.length,2);
  await assert.rejects(()=>pool.query('UPDATE gate_deployments SET protocol_status=$2 WHERE id=$1',[a.id,'received']));
  assert.equal((await pool.query("SELECT count(*) FROM jobs WHERE kind LIKE 'control.%'")).rows[0].count,'0');
}));

test('闸门协议文档状态不允许由口头线索升级，完整资料也不创建动作任务',()=>withDb(async pool=>{
  const f=await fixture(pool),body=pending(f.device);
  await assert.rejects(()=>transaction(c=>saveGateDeployment(c,f.actor,{...body,protocolStatus:'received'}),pool),{code:'GATE_PROTOCOL_DOCUMENT_REQUIRED'});
  await assert.rejects(()=>transaction(c=>saveGateDeployment(c,f.actor,{...body,protocol:'mqtt',tcpRole:'device_client'}),pool),{code:'GATE_TCP_ROLE_SCOPE'});
  const r=await transaction(c=>saveGateDeployment(c,f.actor,{...body,protocolStatus:'received',controllerModel:'isolated-controller',firmware:'test-v1',protocolRef:'隔离测试文档，仅工程验证'}),pool);
  assert.equal(r.protocol_status,'received');assert.equal((await pool.query('SELECT count(*) FROM control_requests')).rows[0].count,'0');
  assert.equal((await pool.query("SELECT count(*) FROM jobs WHERE kind LIKE 'control.%'")).rows[0].count,'0');
}));

test('闸门资料须物理设备和对象配置授权，换账号不能提交旧草稿',()=>withDb(async pool=>{
  const f=await fixture(pool),outsider=await actorFixture(pool,'technician');
  await assert.rejects(()=>transaction(c=>saveGateDeployment(c,f.actor,pending(f.gateway)),pool),{code:'GATE_PHYSICAL_DEVICE_REQUIRED'});
  await assert.rejects(()=>transaction(c=>saveGateDeployment(c,outsider,pending(f.device)),pool));
  await assert.rejects(()=>transaction(c=>saveGateDeployment(c,f.actor,{...pending(f.device),expectedActorId:outsider.id}),pool),{code:'ACCOUNT_CHANGED'});
  assert.equal((await pool.query('SELECT count(*) FROM gate_deployments')).rows[0].count,'0');
}));
