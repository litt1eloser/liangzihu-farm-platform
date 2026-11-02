import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

test('F06 顶部当前告警定位、记录一次展开一条与真实业务入口',{timeout:180000},()=>withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id),pond=await objectFixture(pool,owner.id);
 await pool.query("UPDATE objects SET parent_id=$2,name='南塘口',code='F06-P',kind='pond',boundary_status='verified',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.63 30.24,114.63 30.25,114.62 30.25,114.62 30.24))',4326) WHERE id=$1",[pond,farm]);
 await permit(pool,owner.id,farm,['read','configure']);await permit(pool,owner.id,pond,['read','configure']);
 const openAlert=(await pool.query("INSERT INTO alerts(object_id,correlation_key,kind,title,severity,state,opened_at) VALUES($1,'F06-AL-1','measurement','溶氧偏低','warning','open',now()-interval '1 hour') RETURNING id",[pond])).rows[0].id;
 const recoveredAlert=(await pool.query("INSERT INTO alerts(object_id,correlation_key,kind,title,severity,state,opened_at,recovered_at) VALUES($1,'F06-AL-2','monitoring_gap','监测曾中断','info','recovered',now()-interval '2 days',now()-interval '1 day') RETURNING id",[pond])).rows[0].id;
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage(),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   await mkdir('docs/acceptance/m2f06',{recursive:true});
   const detail=page.getByRole('complementary',{name:'对象详情'});
   const tabSelected=(name:string)=>detail.getByRole('tab',{name,exact:true});
   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'南塘口',exact:true}).waitFor();
   await page.getByRole('button',{name:'南塘口',exact:true}).click();
   await detail.getByRole('heading',{name:'南塘口'}).waitFor();
   // 顶部当前告警条：仅在有 open 事件时出现
   const banner=detail.getByText(/当前告警 1 条：溶氧偏低/);
   await banner.waitFor();
   await detail.getByRole('button',{name:'查看',exact:true}).click();
   // 跳转到相关记录并定位展开原事件
   for(let i=0;i<50;i++){if(await tabSelected('相关记录').getAttribute('aria-selected')==='true')break;await page.waitForTimeout(100);}
   assert.equal(await tabSelected('相关记录').getAttribute('aria-selected'),'true','应切换到相关记录标签');
   assert.equal(await detail.getByRole('button',{name:'告警',exact:true}).getAttribute('aria-pressed'),'true','应筛选告警类别');
   const openItem=detail.getByRole('button',{name:/溶氧偏低/});
   assert.equal(await openItem.getAttribute('aria-expanded'),'true','点击顶部告警应展开原事件');
   await detail.getByText('警告 · 当前',{exact:true}).waitFor();
   const link=detail.getByRole('link',{name:'查看完整告警 ↗'});
   await link.waitFor();
   assert((await link.getAttribute('href'))?.endsWith(`/alerts/${openAlert}`),'完整业务入口应指向真实告警页');
   await page.screenshot({path:'docs/acceptance/m2f06/01-顶部告警定位展开.png'});
   // 一次只展开一条
   await detail.getByRole('button',{name:/监测曾中断/}).click();
   assert.equal(await detail.getByRole('button',{name:/监测曾中断/}).getAttribute('aria-expanded'),'true');
   assert.equal(await openItem.getAttribute('aria-expanded'),'false','展开新记录时旧记录应收起');
   await detail.getByText('提示 · 已恢复',{exact:true}).waitFor();
   assert((await detail.getByRole('link',{name:'查看完整告警 ↗'}).getAttribute('href'))?.endsWith(`/alerts/${recoveredAlert}`));
   assert.deepEqual(errors,[],'页面不得出现脚本错误');
   await context.close();
  }finally{await browser.close();}
 });
}));
