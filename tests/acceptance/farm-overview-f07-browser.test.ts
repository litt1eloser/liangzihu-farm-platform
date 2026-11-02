import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

test('F07 单测点 24h/7d 轻量趋势预览：展开、窗口切换、空态与一次一条',{timeout:180000},()=>withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id),pond=await objectFixture(pool,owner.id);
 await pool.query("UPDATE objects SET parent_id=$2,name='南塘口',code='F07-P',kind='pond',boundary_status='verified',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.63 30.24,114.63 30.25,114.62 30.25,114.62 30.24))',4326) WHERE id=$1",[pond,farm]);
 await permit(pool,owner.id,farm,['read','configure']);await permit(pool,owner.id,pond,['read','configure']);
 const source=(await pool.query("INSERT INTO data_sources(object_id,code,name,provider,verified,created_by) VALUES($1,'F07-SRC','F07 合成来源','synthetic',true,$2) RETURNING id",[pond,owner.id])).rows[0].id;
 const device=(await pool.query("INSERT INTO devices(object_id,source_id,external_id,name,kind,verified,source,created_by) VALUES($1,$2,'F07-D1','F07 水质仪','physical',true,'仅测试',$3) RETURNING id",[pond,source,owner.id])).rows[0].id;
 const pointDo=(await pool.query("INSERT INTO points(device_id,code,name,metric,unit,max_age_ms,max_gap_ms,timing_source,created_by) VALUES($1,'F07-DO','溶解氧','dissolved_oxygen','mg/L',600000,300000,'仅测试时效',$2) RETURNING id",[device,owner.id])).rows[0].id;
 const pointWt=(await pool.query("INSERT INTO points(device_id,code,name,metric,unit,created_by) VALUES($1,'F07-WT','水温','water_temp','°C',$2) RETURNING id",[device,owner.id])).rows[0].id;
 const bindingDo=(await pool.query("INSERT INTO point_bindings(point_id,object_id,valid_from,verified,evidence,created_by) VALUES($1,$2,'2026-09-01',true,'仅测试绑定',$3) RETURNING id",[pointDo,pond,owner.id])).rows[0].id;
 await pool.query("INSERT INTO point_bindings(point_id,object_id,valid_from,verified,evidence,created_by) VALUES($1,$2,'2026-09-01',true,'仅测试绑定',$3)",[pointWt,pond,owner.id]);
 const raw=(await pool.query("INSERT INTO raw_receipts(source_id,received_at,body,sha256,synthetic) VALUES($1,now(),'{}',md5('f07raw'),true) RETURNING id",[source])).rows[0].id;
 const put=async(seq:number,hoursAgo:number,value:number)=>{
  const head=(await pool.query("INSERT INTO observation_heads(identity_hash,point_id) VALUES(md5($2),$1) RETURNING id",[pointDo,`f07h${seq}`])).rows[0].id;
  const obs=(await pool.query("INSERT INTO observations(head_id,content_hash,source_id,external_device_id,point_id,object_id,binding_id,metric,sampled_at,received_at,raw_value,value,unit,quality,reasons,origin,raw_ref) VALUES($1,md5($7),$2,'F07-D1',$3,$4,$5,'dissolved_oxygen',now()-($6||' hours')::interval,now(),to_jsonb($8::float8),$8,'mg/L','valid','{}','live',$9) RETURNING id",[head,source,pointDo,pond,bindingDo,String(hoursAgo),`f07o${seq}`,value,raw])).rows[0].id;
  await pool.query("UPDATE observation_heads SET canonical_id=$1 WHERE id=$2",[obs,head]);
 };
 await put(1,1,6.1);await put(2,3,6.0);await put(3,5,6.2);await put(4,50,5.9);
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage(),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   await mkdir('docs/acceptance/m2f07',{recursive:true});
   const detail=page.getByRole('complementary',{name:'对象详情'});
   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'南塘口',exact:true}).waitFor();
   await page.getByRole('button',{name:'南塘口',exact:true}).click();
   await detail.getByRole('heading',{name:'南塘口'}).waitFor();
   await detail.getByRole('button',{name:'查看详细资料'}).click();
   await detail.getByRole('tab',{name:'水体监测',exact:true}).click();
   // 展开溶解氧趋势：默认 24 小时，3 个点在窗口内（50 小时前的不在）
   await detail.getByRole('button',{name:/溶解氧/}).click();
   const chart=detail.getByRole('img',{name:/溶解氧/});
   await chart.waitFor();
   await detail.getByText(/3个已载入值/).waitFor();
   // 切换 7 天：4 个点
   await detail.getByRole('button',{name:'7 天',exact:true}).click();
   await detail.getByText(/4个已载入值/).waitFor();
   await page.screenshot({path:'docs/acceptance/m2f07/01-溶解氧趋势7天.png'});
   // 空态：水温无观测，24h 显示空态且不自动跳 7 天
   await detail.getByRole('button',{name:/水温/}).click();
   await detail.getByText(/该时段暂无监测记录；可切换 7 天查看/).waitFor();
   assert.equal(await detail.getByRole('img',{name:/水温/}).count(),0,'空时段不得绘制曲线');
   // 一次只展开一条
   assert.equal(await chart.count(),0,'展开水温后溶解氧趋势应收起');
   assert.deepEqual(errors,[],'页面不得出现脚本错误');
   await context.close();
  }finally{await browser.close();}
 });
}));
