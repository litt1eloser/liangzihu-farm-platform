import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

test('F04 农田面积口径、塘口当前养殖与水体指标摘要',{timeout:180000},()=>withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id),field=await objectFixture(pool,owner.id),pond=await objectFixture(pool,owner.id);
 await pool.query("UPDATE objects SET parent_id=$2,name='东片田',code='F04-A',kind='field',boundary_status='verified',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.63 30.24,114.63 30.25,114.62 30.25,114.62 30.24))',4326) WHERE id=$1",[field,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='南塘口',code='F04-P',kind='pond',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.64 30.24,114.65 30.24,114.65 30.25,114.64 30.25,114.64 30.24))',4326) WHERE id=$1",[pond,farm]);
 await permit(pool,owner.id,farm,['read','configure']);await permit(pool,owner.id,field,['read','configure']);await permit(pool,owner.id,pond,['read','configure']);
 await pool.query("INSERT INTO production_batches(object_id,code,species,stage,source,verified,started_at,created_by) VALUES($1,'F04-PC','克氏原螯虾','养成期','仅测试',true,'2026-05-01',$2)",[pond,owner.id]);
 const source=(await pool.query("INSERT INTO data_sources(object_id,code,name,provider,verified,created_by) VALUES($1,'F04-SRC','F04 合成来源','synthetic',true,$2) RETURNING id",[pond,owner.id])).rows[0].id;
 const device=(await pool.query("INSERT INTO devices(object_id,source_id,external_id,name,kind,verified,source,created_by) VALUES($1,$2,'F04-D1','F04 水质仪','physical',true,'仅测试',$3) RETURNING id",[pond,source,owner.id])).rows[0].id;
 const mkPoint=async(code:string,name:string,metric:string,unit:string)=>(await pool.query("INSERT INTO points(device_id,code,name,metric,unit,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[device,code,name,metric,unit,owner.id])).rows[0].id as string;
 const pointDo=await mkPoint('F04-DO','溶解氧','dissolved_oxygen','mg/L'),pointWt=await mkPoint('F04-WT','水温','water_temp','°C'),pointPh=await mkPoint('F04-PH','pH','ph','');
 const bind=async(point:string)=>(await pool.query("INSERT INTO point_bindings(point_id,object_id,valid_from,verified,evidence,created_by) VALUES($1,$2,'2026-09-01',true,'仅测试绑定',$3) RETURNING id",[point,pond,owner.id])).rows[0].id as string;
 const bindingDo=await bind(pointDo);await bind(pointWt);await bind(pointPh);
 const raw=(await pool.query("INSERT INTO raw_receipts(source_id,received_at,body,sha256,synthetic) VALUES($1,now(),'{}',repeat('a',64),true) RETURNING id",[source])).rows[0].id;
 const put=async(point:string,binding:string,hash:string,value:number,unit:string)=>{
  const head=(await pool.query("INSERT INTO observation_heads(identity_hash,point_id) VALUES(md5($2),$1) RETURNING id",[point,hash])).rows[0].id;
  const obs=(await pool.query("INSERT INTO observations(head_id,content_hash,source_id,external_device_id,point_id,object_id,binding_id,metric,sampled_at,received_at,raw_value,value,unit,quality,reasons,origin,raw_ref) VALUES($1,md5($7),$2,'F04-D1',$3,$4,$5,'m',now()-interval '2 minutes',now(),to_jsonb($6::float8),$6,$8,'valid','{}','live',$9) RETURNING id",[head,source,point,pond,binding,value,hash+'v',unit,raw])).rows[0].id;
  await pool.query("INSERT INTO point_current(point_id,observation_id,sampled_at,quality,reasons) VALUES($1,$2,now()-interval '2 minutes','valid','{}')",[point,obs]);
 };
 await put(pointDo,bindingDo,'d',6.1,'mg/L');await put(pointWt,await (await pool.query("SELECT id FROM point_bindings WHERE point_id=$1",[pointWt])).rows[0].id,'e',25.1,'°C');
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage(),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   await mkdir('docs/acceptance/m2f04',{recursive:true});
   const detail=page.getByRole('complementary',{name:'对象详情'});
   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'东片田',exact:true}).waitFor();

   // 农田：管理范围面积（已核实边界）+ 无批次空态
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   await detail.getByText(/管理范围面积 .* 亩/).waitFor();
   await detail.getByText(/万㎡/).waitFor();
   await detail.getByText(/按已核实登记边界计算/).waitFor();
   await detail.getByText('暂无登记').first().waitFor();
   await detail.getByRole('tab',{name:'农事生产',exact:true}).click();
   await detail.getByText('暂无生产批次登记。').waitFor();
   await page.screenshot({path:'docs/acceptance/m2f04/01-农田面积与生产空态.png'});

   // 塘口：当前养殖 + 至多两个可信水体指标 + 草稿边界口径
   await page.getByRole('button',{name:'南塘口',exact:true}).click();
   await detail.getByRole('heading',{name:'南塘口'}).waitFor();
   await detail.getByText('当前养殖：克氏原螯虾 · 养成期').waitFor();
   await detail.getByText(/按草稿边界计算，尚未核实/).waitFor();
   assert.equal(await detail.getByText(/溶解氧 6\.1 mg\/L · 水温/).count(),0,'缺时效依据时摘要不得展示水体指标数值');
   await detail.getByRole('tab',{name:'水体监测',exact:true}).click();
   await detail.getByText('尚未核实：缺少时效依据').first().waitFor();
   await detail.getByText(/尚未核实：暂无可用当前值/).waitFor();
   await page.screenshot({path:'docs/acceptance/m2f04/02-塘口养殖与指标.png'});
   assert.deepEqual(errors,[],'页面不得出现脚本错误');
   await context.close();
  }finally{await browser.close();}
 });
}));
