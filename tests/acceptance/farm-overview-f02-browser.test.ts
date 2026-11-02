import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

test('F02 同类/跨类切换标签规则、快速连击、返回上下文恢复与撤权安全',{timeout:180000},()=>withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id),fieldA=await objectFixture(pool,owner.id),fieldB=await objectFixture(pool,owner.id),pond=await objectFixture(pool,owner.id);
 await pool.query("UPDATE objects SET parent_id=$2,name='东片田',code='F02-A',kind='field',boundary_status='verified',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.63 30.24,114.63 30.25,114.62 30.25,114.62 30.24))',4326) WHERE id=$1",[fieldA,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='北片田',code='F02-B',kind='field',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.64 30.26,114.65 30.26,114.65 30.27,114.64 30.27,114.64 30.26))',4326) WHERE id=$1",[fieldB,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='南塘口',code='F02-P',kind='pond',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.62 30.26,114.63 30.26,114.63 30.27,114.62 30.27,114.62 30.26))',4326) WHERE id=$1",[pond,farm]);
 await permit(pool,owner.id,farm,['read','configure']);await permit(pool,owner.id,fieldA,['read','configure']);await permit(pool,owner.id,fieldB,['read','configure']);await permit(pool,owner.id,pond,['read','configure']);
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage(),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   await mkdir('docs/acceptance/m2f02',{recursive:true});
   const detail=page.getByRole('complementary',{name:'对象详情'});
   const poll=async(fn:()=>Promise<string|null>,expected:string,label:string)=>{let last:string|null=null;for(let i=0;i<50;i++){last=await fn();if(last===expected)return;await page.waitForTimeout(100);}const tabs=await detail.getByRole('tablist').innerHTML().catch(()=>'(无标签栏)');throw new Error(`等待超时：${label} 应为 ${expected}，实际 ${last}；标签栏=${tabs}`);};
   const tabSelected=(name:string)=>detail.getByRole('tab',{name,exact:true});
   const assertTab=async(name:string,value:string,label:string)=>poll(()=>tabSelected(name).getAttribute('aria-selected'),value,label);
   const assertFilter=async(name:string,value:string,label:string)=>poll(()=>detail.getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),value,label);
   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'东片田',exact:true}).waitFor();

   // 同类切换保留标签
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   await tabSelected('农事生产').click();
   await assertTab('农事生产','true','农事生产标签选中');
   await page.getByRole('button',{name:'北片田',exact:true}).click();
   await detail.getByRole('heading',{name:'北片田'}).waitFor();
   await assertTab('农事生产','true','同类切换应保留中标签');

   // 跨类切换回基本信息
   await page.getByRole('button',{name:'南塘口',exact:true}).click();
   await detail.getByRole('heading',{name:'南塘口'}).waitFor();
   await assertTab('基本信息','true','跨类切换应回基本信息');
   assert.equal(await tabSelected('农事生产').count(),0,'塘口不应出现农田标签');
   await tabSelected('水体监测').waitFor();

   // 同类切换保留记录类别筛选
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   await tabSelected('相关记录').click();
   await detail.getByRole('button',{name:'告警',exact:true}).click();
   await assertFilter('告警','true','告警筛选按下');
   await page.getByRole('button',{name:'北片田',exact:true}).click();
   await detail.getByRole('heading',{name:'北片田'}).waitFor();
   await assertTab('相关记录','true','同类切换应保留相关记录标签');
   await assertFilter('告警','true','同类切换应保留记录类别筛选');
   await page.screenshot({path:'docs/acceptance/m2f02/01-同类保留标签与筛选.png'});

   // 快速连续点击：最终选中与标签合法
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await page.getByRole('button',{name:'北片田',exact:true}).click();
   await page.getByRole('button',{name:'南塘口',exact:true}).click();
   await detail.getByRole('heading',{name:'南塘口'}).waitFor();
   await assertTab('基本信息','true','快速连击后回基本信息');
   assert.equal(await tabSelected('农事生产').count(),0);

   // 修改 CAD 与注记显隐、改变视口后离开到完整档案
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   await tabSelected('相关记录').click();
   await detail.getByRole('button',{name:'告警',exact:true}).click();
   await page.getByRole('button',{name:'图层'}).click();
   const panel=page.getByRole('dialog',{name:'地图图层设置'});
   await panel.waitFor();
   await panel.getByLabel('生产道路').uncheck();
   await panel.getByLabel('显示注记（矢量底图）').uncheck();
   await panel.getByRole('button',{name:'关闭图层设置'}).click();
   await page.getByRole('button',{name:'竣工图范围'}).click();
   await page.waitForTimeout(900);
   const map=page.getByRole('application');
   const zoomBefore=await map.getAttribute('data-view-zoom'),centerBefore=await map.getAttribute('data-view-center');
   await detail.getByRole('link',{name:'查看对象台账 ↗'}).click();
   await page.getByRole('heading',{name:'东片田'}).first().waitFor();
   await page.goto(app.origin+'/farm-overview');
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   await assertTab('相关记录','true','返回后应恢复相关记录标签');
   await assertFilter('告警','true','返回后应恢复记录类别筛选');
   assert.equal(await map.getAttribute('data-annotations'),'false','返回后注记显隐应保持');
   await poll(()=>map.getAttribute('data-view-zoom'),zoomBefore??'','返回后缩放不被自动 fit 覆盖');
   await poll(()=>map.getAttribute('data-view-center'),centerBefore??'','返回后视口中心不被自动 fit 覆盖');
   await page.getByRole('button',{name:'图层'}).click();
   assert.equal(await panel.getByLabel('生产道路').isChecked(),false,'返回后 CAD 图层显隐应保持');
   await panel.getByRole('button',{name:'关闭图层设置'}).click();
   await page.screenshot({path:'docs/acceptance/m2f02/02-返回恢复上下文.png'});

   // 撤权后安全退回
   await pool.query('DELETE FROM grants WHERE user_id=$1',[owner.id]);
   await page.reload();
   await page.getByText('当前没有可查看的农业对象。').waitFor();
   assert.equal(await detail.count(),0,'撤权后详情应安全关闭');
   assert.equal(await page.getByRole('button',{name:'东片田',exact:true}).count(),0,'撤权后对象不得出现在目录');
   assert.deepEqual(errors,[],'页面不得出现脚本错误');
   await context.close();
  }finally{await browser.close();}
 });
}));
