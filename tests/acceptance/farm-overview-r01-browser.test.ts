import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

test('R01 当前值可信口径、面积口径与切换不残留',{timeout:180000},()=>withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id),cadField=await objectFixture(pool,owner.id),field=await objectFixture(pool,owner.id),pondA=await objectFixture(pool,owner.id),pondB=await objectFixture(pool,owner.id);
 await pool.query("UPDATE objects SET parent_id=$2,name='庙下流农田01',code='CAD-R01-T01',kind='field',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.63 30.24,114.63 30.25,114.62 30.25,114.62 30.24))',4326),source='CAD 竣工图导入，待现场核实' WHERE id=$1",[cadField,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='自营田',code='R01-F1',kind='field',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.64 30.24,114.65 30.24,114.65 30.25,114.64 30.25,114.64 30.24))',4326) WHERE id=$1",[field,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='南塘口A',code='R01-PA',kind='pond',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.62 30.26,114.63 30.26,114.63 30.27,114.62 30.27,114.62 30.26))',4326) WHERE id=$1",[pondA,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='北塘口B',code='R01-PB',kind='pond',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.64 30.26,114.65 30.26,114.65 30.27,114.64 30.27,114.64 30.26))',4326) WHERE id=$1",[pondB,farm]);
 await permit(pool,owner.id,farm,['read','configure']);
 for(const id of [cadField,field,pondA,pondB])await permit(pool,owner.id,id,['read','configure']);
 await pool.query("INSERT INTO production_batches(object_id,code,species,stage,source,verified,started_at,created_by) VALUES($1,'R01-PC','克氏原螯虾','养成期','仅测试',true,'2026-05-01',$2)",[pondA,owner.id]);
 const source=(await pool.query("INSERT INTO data_sources(object_id,code,name,provider,verified,created_by) VALUES($1,'R01-SRC','R01 合成来源','synthetic',true,$2) RETURNING id",[pondA,owner.id])).rows[0].id;
 const device=(await pool.query("INSERT INTO devices(object_id,source_id,external_id,name,kind,verified,source,created_by) VALUES($1,$2,'R01-D1','R01 水质仪','physical',true,'仅测试',$3) RETURNING id",[pondA,source,owner.id])).rows[0].id;
 const pointDo=(await pool.query("INSERT INTO points(device_id,code,name,metric,unit,created_by) VALUES($1,'R01-DO','溶解氧','dissolved_oxygen','mg/L',$2) RETURNING id",[device,owner.id])).rows[0].id;
 const bindingDo=(await pool.query("INSERT INTO point_bindings(point_id,object_id,valid_from,verified,evidence,created_by) VALUES($1,$2,'2026-09-01',true,'仅测试绑定',$3) RETURNING id",[pointDo,pondA,owner.id])).rows[0].id;
 const raw=(await pool.query("INSERT INTO raw_receipts(source_id,received_at,body,sha256,synthetic) VALUES($1,now(),'{}',md5('r01raw'),true) RETURNING id",[source])).rows[0].id;
 const head=(await pool.query("INSERT INTO observation_heads(identity_hash,point_id) VALUES(md5('r01h'),$1) RETURNING id",[pointDo])).rows[0].id;
 const obs=(await pool.query("INSERT INTO observations(head_id,content_hash,source_id,external_device_id,point_id,object_id,binding_id,metric,sampled_at,received_at,raw_value,value,unit,quality,reasons,origin,raw_ref) VALUES($1,md5('r01o'),$2,'R01-D1',$3,$4,$5,'dissolved_oxygen',now()-interval '2 minutes',now(),to_jsonb(6.1::float8),6.1,'mg/L','valid','{}','live',$6) RETURNING id",[head,source,pointDo,pondA,bindingDo,raw])).rows[0].id;
 await pool.query("INSERT INTO point_current(point_id,observation_id,sampled_at,quality,reasons) VALUES($1,$2,now()-interval '2 minutes','valid','{}')",[pointDo,obs]);
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage(),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   await mkdir('docs/acceptance/m2r01',{recursive:true});
   const detail=page.getByRole('complementary',{name:'对象详情'});
   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'庙下流农田01',exact:true}).waitFor();

   // 面积口径：CAD 对象只能称施工参考面积
   await page.getByRole('button',{name:'庙下流农田01',exact:true}).click();
   await detail.getByRole('heading',{name:'庙下流农田01'}).waitFor();
   await detail.getByText('竣工图施工参考面积',{exact:true}).waitFor();
   await detail.getByText(/约 .*万㎡/).first().waitFor();
   assert.equal(await detail.getByText(/管理范围面积/).count(),0,'CAD 施工范围不得称管理范围面积');
   // 非 CAD 对象保持管理范围口径
   await page.getByRole('button',{name:'自营田',exact:true}).click();
   await detail.getByRole('heading',{name:'自营田'}).waitFor();
   await detail.getByText('管理范围面积',{exact:true}).waitFor();

   // 当前值可信口径：接口未提供时效参数时不得显示数值
   await page.getByRole('button',{name:'南塘口A',exact:true}).click();
   await detail.getByRole('heading',{name:'南塘口A'}).waitFor();
   await detail.getByRole('tab',{name:'水体监测',exact:true}).click();
   await detail.getByText('尚未核实：缺少时效依据').waitFor();
   assert.equal(await detail.getByText(/6\.1 mg\/L/).count(),0,'缺时效依据不得显示当前值');

   // 快速切换不残留：批次与测点随对象清空
   await page.getByRole('tab',{name:'基本信息',exact:true}).click();
   await detail.getByText('当前养殖：克氏原螯虾 · 养成期').waitFor();
   await page.getByRole('button',{name:'北塘口B',exact:true}).click();
   await detail.getByRole('heading',{name:'北塘口B'}).waitFor();
   assert.equal(await detail.getByText(/克氏原螯虾/).count(),0,'切换后不得残留上一对象的批次');
   await detail.getByRole('tab',{name:'水体监测',exact:true}).click();
   await detail.getByText(/暂无关联测点。/).waitFor();
   assert.equal(await detail.getByText('溶解氧',{exact:true}).count(),0,'切换后不得残留上一对象的测点');
   await page.screenshot({path:'docs/acceptance/m2r01/01-口径与切换不残留.png'});
   assert.deepEqual(errors,[],'页面不得出现脚本错误');
   await context.close();
  }finally{await browser.close();}
 });
}));
