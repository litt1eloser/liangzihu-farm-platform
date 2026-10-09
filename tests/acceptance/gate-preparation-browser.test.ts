import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';
import {artifactPath} from '../support/artifacts';

test('闸门准备网页保存真实关联、刷新恢复、设备隔离与手机布局，申请仍未下发',{timeout:120000},()=>withDb(async pool=>{
  const actor=await actorFixture(pool,'technician'),objectId=await objectFixture(pool,actor.id);
  await permit(pool,actor.id,objectId,['read','configure','record','act']);
  const source=randomUUID(),first=randomUUID(),second=randomUUID();
  await pool.query("INSERT INTO data_sources(id,object_id,code,name,provider,created_by) VALUES($1::uuid,$2,$1::text,'隔离工程来源','synthetic',$3)",[source,objectId,actor.id]);
  for(const [id,name] of [[first,'仅工程测试闸门一'],[second,'仅工程测试闸门二']])await pool.query("INSERT INTO devices(id,object_id,source_id,external_id,name,kind,source,created_by) VALUES($1::uuid,$2,$3,$1::text,$4,'physical','仅工程测试，非实物',$5)",[id,objectId,source,name,actor.id]);
  await withApp(pool,async app=>{
    const browser=await chromium.launch({executablePath:process.env.AGRI_BROWSER_EXECUTABLE||undefined}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    try{
      await context.addCookies([{name:'agri_session',value:await app.authenticate(actor),url:app.origin}]);
      await page.goto(app.origin+'/control-records');await page.getByRole('heading',{name:'闸门接入与控制准备',exact:true}).waitFor();
      await page.getByLabel('当前设备',{exact:true}).selectOption(first);
      const setup=page.locator('form').filter({has:page.getByRole('button',{name:'保存部署资料',exact:true})});
      await setup.getByLabel('通信方式',{exact:true}).selectOption('tcp_rtu');
      await setup.getByLabel('厂家（按实物或资料填写）',{exact:true}).fill('隔离测试资料');
      await setup.getByLabel('协议文档版本、来源或待补说明',{exact:true}).fill('仅工程验证口头线索，未收到文档');
      await setup.getByLabel('TCP连接方向',{exact:true}).selectOption('device_client');
      await setup.getByRole('button',{name:'保存部署资料',exact:true}).click();await page.getByText(/已保存版本 1/).waitFor();
      await page.reload();await page.getByLabel('当前设备',{exact:true}).selectOption(first);
      assert.equal(await setup.getByLabel('通信方式',{exact:true}).inputValue(),'tcp_rtu');assert.equal(await setup.getByLabel('TCP连接方向',{exact:true}).inputValue(),'device_client');
      await page.screenshot({path:artifactPath('gate-preparation/desktop.png'),fullPage:true});
      await setup.getByLabel('通信方式',{exact:true}).selectOption('mqtt');assert.equal(await setup.getByLabel('TCP连接方向',{exact:true}).isDisabled(),true);
      await setup.getByRole('button',{name:'保存部署资料',exact:true}).click();await page.getByText(/已保存版本 2/).waitFor();
      assert.equal((await pool.query('SELECT tcp_role FROM gate_deployments ORDER BY version DESC LIMIT 1')).rows[0].tcp_role,'unknown');
      await page.getByLabel('当前设备',{exact:true}).selectOption(second);assert.equal(await setup.getByLabel('通信方式',{exact:true}).inputValue(),'unknown');assert.equal(await setup.getByLabel('厂家（按实物或资料填写）',{exact:true}).inputValue(),'');
      await page.getByLabel('当前设备',{exact:true}).selectOption(first);
      await page.getByText('登记控制申请（不会下发）',{exact:true}).click();const request=page.locator('form').filter({has:page.getByLabel('本次申请目的',{exact:true})});
      await request.getByLabel('本次申请目的',{exact:true}).fill('隔离测试申请');await request.getByLabel('本次授权依据',{exact:true}).fill('仅工程验证');await request.getByLabel('本次现场条件',{exact:true}).fill('不连接真实设备');await request.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('申请已登记，未下发。',{exact:true}).waitFor();
      assert.equal((await pool.query('SELECT dispatched FROM control_requests')).rows[0].dispatched,false);
      await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.app-sidebar')!.getBoundingClientRect().right<=1);await page.evaluate(()=>scrollTo(0,0));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:artifactPath('gate-preparation/mobile.png'),fullPage:true});await page.screenshot({path:artifactPath('gate-preparation/mobile-top.png')});await page.getByRole('link',{name:'安全条件',exact:true}).click();assert.equal(await page.locator('#safety').getAttribute('open'),'');
      assert.deepEqual(errors,[]);
      assert.equal((await pool.query("SELECT count(*) FROM jobs WHERE kind LIKE 'control.%'")).rows[0].count,'0');
    }catch(error){await page.screenshot({path:artifactPath("gate-preparation/failure.png"),fullPage:true});console.log(await page.locator(".form-error").allTextContents());throw error;}finally{await browser.close();}
  });
}));
