import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { withDb } from '../support/db';
import { withApp } from '../support/app';
import { actorFixture, objectFixture, permit } from '../support/fixtures';
import { transaction } from '../../src/db/pool';
import { saveObject } from '../../src/modules/registry/objects';

test('D2 村庄目录、对象概要、旧页面和角色权限浏览器核对', {timeout:120000}, () => withDb(async pool => {
  const owner=await actorFixture(pool,'owner'),worker=await actorFixture(pool,'worker'),expert=await actorFixture(pool,'expert');
  const farm=await objectFixture(pool,owner.id);
  await permit(pool,owner.id,farm,['read','configure']);
  const field=await transaction(c=>saveObject(c,owner,{parentId:farm,code:'SYNTH-D2-BROWSER',name:'合成东村地块',kind:'field',source:'浏览器验收合成资料'}),pool);
  await pool.query("UPDATE objects SET boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.64 30.24,114.64 30.26,114.62 30.26,114.62 30.24))',4326) WHERE id=$1",[field.id]);
  await permit(pool,worker.id,field.id,['read']);await permit(pool,expert.id,field.id,['read']);
  await withApp(pool,async app=>{
    const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
    try{
      const ownerContext=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
      await ownerContext.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
      const page=await ownerContext.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(app.origin+'/farm-overview');await page.getByRole('button',{name:/合成东村地块/}).waitFor();
      const created=await ownerContext.request.post(app.origin+'/api/v1/map-regions',{headers:{Origin:app.origin},data:{farmId:farm,name:'合成东村',source:'浏览器验收合成资料'}});assert.equal(created.status(),201);
      const region=await created.json();
      const assigned=await ownerContext.request.patch(app.origin+'/api/v1/map-regions',{headers:{Origin:app.origin},data:{action:'assign',objectId:field.id,regionId:region.id,source:'浏览器验收合成资料'}});assert.equal(assigned.status(),200);
      await page.getByRole('button',{name:'刷新授权资料'}).click();await page.getByRole('heading',{name:/合成东村/}).waitFor();
      const map=page.getByRole('application',{name:'天地图卫星影像及已授权农业对象边界'});
      await page.locator('.ol-zoom-out').evaluate(button=>{for(let i=0;i<3;i++)(button as HTMLButtonElement).click();});await page.waitForTimeout(500);
      const beforeVillage=await map.getAttribute('data-view-zoom');
      await page.getByRole('button',{name:'定位村庄 合成东村'}).click();await page.waitForTimeout(450);
      assert.notEqual(await map.getAttribute('data-view-zoom'),beforeVillage,'村庄点击应定位关联边界');
      await page.getByRole('searchbox',{name:'搜索名称或编号'}).fill('合成东村');
      await page.getByRole('button',{name:/合成东村地块/}).click();
      await page.getByRole('complementary',{name:'对象详情'}).getByText(/未关闭告警 0/).waitFor();
      await page.waitForTimeout(350);
      const centerBeforeReturn=await map.getAttribute('data-view-center'),zoomBeforeReturn=await map.getAttribute('data-view-zoom');
      await page.getByRole('complementary',{name:'对象详情'}).getByRole('link',{name:/查看对象详情/}).click();
      const saved=await page.evaluate(()=>sessionStorage.getItem('farm-overview-return-v1'));assert(saved,'离开地图前应保存返回状态');
      assert.equal(JSON.parse(saved).zoom,Number(zoomBeforeReturn));
      await page.getByRole('link',{name:'返回农场地图'}).click();
      await page.getByRole('complementary',{name:'对象详情'}).getByRole('heading',{name:'合成东村地块'}).waitFor();
      assert.equal(await page.getByRole('searchbox',{name:'搜索名称或编号'}).inputValue(),'合成东村');
      assert.equal(await map.getAttribute('data-view-zoom'),zoomBeforeReturn,saved);
      assert.equal(await map.getAttribute('data-view-center'),centerBeforeReturn);
      await mkdir('docs/acceptance/d2',{recursive:true});
      await page.screenshot({path:'docs/acceptance/d2/2026-10-09-D2村庄目录-桌面.png',fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await page.getByRole('button',{name:'关闭对象详情'}).click();
      await page.getByRole('button',{name:'☰ 对象目录'}).click();
      await page.getByRole('heading',{name:/合成东村/}).waitFor();
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:'docs/acceptance/d2/2026-10-09-D2村庄目录-手机.png',fullPage:true});
      const oldMap=await ownerContext.request.get(app.origin+'/map');assert.equal(oldMap.status(),200);
      const objects=await ownerContext.request.get(app.origin+'/objects');assert.equal(objects.status(),200);
      const machinery=await ownerContext.request.get(app.origin+'/machinery');assert.equal(machinery.status(),200);
      const workerContext=await browser.newContext();try{
        await workerContext.addCookies([{name:'agri_session',value:await app.authenticate(worker),url:app.origin}]);
        const workerOverview=await workerContext.request.get(app.origin+'/api/v1/farm-overview');assert.equal(workerOverview.status(),200);
        assert.equal((await workerOverview.json()).items.length,1);
        const workerPage=await workerContext.newPage();await workerPage.goto(app.origin+'/farm-overview');await workerPage.getByRole('button',{name:/合成东村地块/}).waitFor();
        assert.equal(await workerPage.getByText('维护村庄与对象关联').count(),0);
        const denied=await workerContext.request.post(app.origin+'/api/v1/map-regions',{headers:{Origin:app.origin},data:{farmId:farm,name:'越权村庄',source:'测试'}});assert.equal(denied.status(),403);
      }finally{await workerContext.close();}
      const expertContext=await browser.newContext();try{
        await expertContext.addCookies([{name:'agri_session',value:await app.authenticate(expert),url:app.origin}]);
        const expertOverview=await expertContext.request.get(app.origin+'/api/v1/farm-overview');assert.equal(expertOverview.status(),200);
        const data=await expertOverview.json();assert.deepEqual(data.items,[]);assert.deepEqual(data.regions,[]);assert.deepEqual(data.mobileDevices,[]);
      }finally{await expertContext.close();}
      assert.deepEqual(errors,[]);await ownerContext.close();
    }finally{await browser.close();}
  });
}));
