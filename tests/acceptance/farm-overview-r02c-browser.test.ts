import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

test('R02-C 收尾：全部筛选提示未接入类别、未接入类别不被告警状态覆盖、级别中文',{timeout:180000},()=>withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id),pond=await objectFixture(pool,owner.id);
 await pool.query("UPDATE objects SET parent_id=$2,name='南塘口',code='R2C-P',kind='pond',boundary_status='verified',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.63 30.24,114.63 30.25,114.62 30.25,114.62 30.24))',4326) WHERE id=$1",[pond,farm]);
 await permit(pool,owner.id,farm,['read','configure']);await permit(pool,owner.id,pond,['read','configure']);
 await pool.query("INSERT INTO alerts(object_id,correlation_key,kind,title,severity,state,opened_at) VALUES($1,'R2C-AL-1','measurement','溶氧偏低','warning','open',now()-interval '1 hour')",[pond]);
 await pool.query("INSERT INTO alerts(object_id,correlation_key,kind,title,severity,state,opened_at,recovered_at) VALUES($1,'R2C-AL-2','monitoring_gap','监测曾中断','info','recovered',now()-interval '2 days',now()-interval '1 day')",[pond]);
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage(),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   const detail=page.getByRole('complementary',{name:'对象详情'});
   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'南塘口',exact:true}).click();
   await detail.getByRole('heading',{name:'南塘口'}).waitFor();
   await detail.getByRole('button',{name:'查看详细资料'}).click();
   await detail.getByRole('tab',{name:'相关记录',exact:true}).click();
   // 「全部」有告警时仍提示其他类别未接入
   await detail.getByText('溶氧偏低',{exact:true}).waitFor();
   await detail.getByText('警告 · 当前',{exact:true}).waitFor();
   await detail.getByText('提示 · 已恢复',{exact:true}).waitFor();
   await detail.getByText(/其他类别暂未接入查询/).waitFor();
   // 未接入类别不被告警状态覆盖
   await detail.getByRole('button',{name:'巡检',exact:true}).click();
   await detail.getByText(/该类别记录暂未接入查询/).waitFor();
   assert.equal(await detail.getByText('溶氧偏低',{exact:true}).count(),0,'未接入类别不得展示告警内容');
   assert.deepEqual(errors,[],'页面不得出现脚本错误');
   await context.close();
  }finally{await browser.close();}
 });
}));
