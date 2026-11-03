import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

const R=6378137;
const DEG2RAD=Math.PI/180;
function toMercator(lonLat:[number,number]):[number,number]{
 const x=R*lonLat[0]*DEG2RAD;
 const y=R*Math.log(Math.tan(Math.PI/4+lonLat[1]*DEG2RAD/2));
 return [x,y];
}
function toPixel(lonLat:[number,number],center:[number,number],resolution:number,size:[number,number]):[number,number]{
 const m=toMercator(lonLat);
 return [size[0]/2+(m[0]-center[0])/resolution,size[1]/2-(m[1]-center[1])/resolution];
}

test('M2-B 农业对象新增与管理体验重构',{timeout:300000},()=>withDb(async pool=>{
 await mkdir('docs/acceptance/m2b',{recursive:true});
 const owner=await actorFixture(pool,'owner'),worker=await actorFixture(pool,'worker');
 const farm=await objectFixture(pool,owner.id);
 await pool.query("UPDATE objects SET name='合成测试农场',code='SYNTH-M2B-FARM' WHERE id=$1",[farm]);
 await permit(pool,owner.id,farm,['read','configure','review']);
 await permit(pool,worker.id,farm,['read']);

 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage();
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));

   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'合成测试农场',exact:true}).waitFor();
   await page.getByRole('button',{name:'＋ 新增/管理'}).click();
   await page.getByRole('button',{name:'新增村庄'}).click();
   await page.getByLabel('所属农场').selectOption(farm);
   await page.getByLabel('村庄名称').fill('测试村');
   await page.getByLabel('维护依据').fill('M2-B 验收测试');
   await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/v1/map-regions')&&response.request().method()==='POST'&&response.status()===201),page.getByRole('button',{name:'保存村庄'}).click()]);
   await page.getByRole('button',{name:'定位村庄 测试村'}).waitFor();
   await page.screenshot({path:'docs/acceptance/m2b/01-新增村庄后目录.png',fullPage:true});

   // 村庄下新增农田，稍后补位置
   await page.getByRole('button',{name:'测试村 操作菜单',exact:true}).click();
   await page.getByRole('menuitem',{name:'在该村新增对象'}).click();
   await page.getByLabel('类型').selectOption('field');
   await page.getByLabel('名称',{exact:true}).fill('M2B 测试农田');
   await page.getByRole('textbox',{name:'编号'}).fill('SYNTH-M2B-FIELD');
   await page.getByLabel('登记依据').fill('M2-B 验收测试');
   await page.getByLabel('所属村庄').selectOption('测试村');
   await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/v1/objects')&&response.request().method()==='POST'&&response.status()===201),page.waitForResponse(response=>response.url().endsWith('/api/v1/map-regions')&&response.request().method()==='PATCH'&&response.status()===200),page.getByRole('button',{name:'保存对象'}).click()]);
   await page.getByRole('button',{name:'M2B 测试农田',exact:true}).waitFor();
   const createdFieldButton=page.getByRole('button',{name:'M2B 测试农田',exact:true});
   assert((await createdFieldButton.getAttribute('title'))?.includes('SYNTH-M2B-FIELD · 待登记边界'),'未登记位置对象的编号与状态应保留在 tooltip');
   await page.locator('.rc-tree-treenode',{hasText:'M2B 测试农田'}).locator('[data-status="待登记"]').waitFor();
   await page.screenshot({path:'docs/acceptance/m2b/02-新增农田待补位置.png',fullPage:true});
   const field=(await pool.query("SELECT id FROM objects WHERE code='SYNTH-M2B-FIELD'")).rows[0];
   const link=(await pool.query('SELECT region_id FROM map_region_links WHERE object_id=$1 AND valid_to IS NULL',[field.id])).rows[0];
   const region=(await pool.query("SELECT id FROM map_regions WHERE name='测试村'")).rows[0];
   assert.equal(link.region_id,region.id);

   // 村庄下新增塘口，现在绘制不规则六边形边界
   await page.getByRole('button',{name:'测试村 操作菜单',exact:true}).click();
   await page.getByRole('menuitem',{name:'在该村新增对象'}).click();
   await page.getByLabel('类型').selectOption('pond');
   await page.getByLabel('名称',{exact:true}).fill('M2B 测试塘口');
   await page.getByRole('textbox',{name:'编号'}).fill('SYNTH-M2B-POND');
   await page.getByLabel('登记依据').fill('M2-B 验收测试');
   await page.getByLabel('所属村庄').selectOption('测试村');
   await page.getByLabel('现在绘制边界').check();
   await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/v1/objects')&&response.request().method()==='POST'&&response.status()===201),page.waitForResponse(response=>response.url().endsWith('/api/v1/map-regions')&&response.request().method()==='PATCH'&&response.status()===200),page.getByRole('button',{name:'保存对象'}).click()]);
   await page.waitForURL(url=>url.pathname==='/map-editor'&&url.searchParams.has('object'));
   await page.locator('[data-testid="boundary-form"]').waitFor();
   await page.waitForTimeout(500);

   const map=page.locator('[data-testid="map-editor-map"]');
   await map.waitFor();
   const box=await map.boundingBox();assert(box);
   const center=await map.evaluate(el=>{const c=(el as HTMLElement).dataset.viewCenter?.split(',').map(Number)??[0,0];return [c[0],c[1]] as [number,number];});
   const resolution=Number(await map.getAttribute('data-view-resolution'));
   const size:[number,number]=[box.width,box.height];
   const pts=[[114.56,30.22],[114.60,30.215],[114.63,30.22],[114.62,30.235],[114.58,30.238],[114.55,30.23]];
   for(const lonLat of pts.slice(0,-1)){
    const p=toPixel(lonLat as [number,number],center,resolution,size);
    await page.mouse.click(box.x+p[0],box.y+p[1]);await page.waitForTimeout(80);
   }
   const last=toPixel(pts[pts.length-1] as [number,number],center,resolution,size);
   await page.mouse.dblclick(box.x+last[0],box.y+last[1]);await page.waitForTimeout(500);
   await page.locator('[data-testid="boundary-form"] textarea').fill('M2-B 不规则六边形边界');
   await page.locator('[data-testid="boundary-form"] button[type=submit]').click();
   await page.getByText(/已保存“M2B 测试塘口”/).waitFor();
   await page.screenshot({path:'docs/acceptance/m2b/03-塘口不规则六边形保存.png',fullPage:true});
   const pondRow=(await pool.query("SELECT boundary_status,ST_AsText(boundary) AS w FROM objects WHERE code='SYNTH-M2B-POND'")).rows[0];
   assert.equal(pondRow.boundary_status,'draft');assert.ok(pondRow.w);

   // 返回农场总览恢复选中
   assert.equal(await page.getByRole('link',{name:'返回农场总览 ↗'}).count(),2,'保存成功后应出现消息区返回链接');
   await page.getByRole('link',{name:'返回农场总览 ↗'}).nth(1).click();
   await page.getByRole('button',{name:'合成测试农场',exact:true}).waitFor();
   await page.getByRole('button',{name:'M2B 测试塘口',exact:true}).waitFor();
   await page.screenshot({path:'docs/acceptance/m2b/04-绘制后返回总览.png',fullPage:true});

   // 更改所属村庄
   await page.getByRole('button',{name:'＋ 新增/管理'}).click();
   await page.getByRole('button',{name:'新增村庄'}).click();
   await page.getByLabel('所属农场').selectOption(farm);
   await page.getByLabel('村庄名称').fill('测试二村');
   await page.getByLabel('维护依据').fill('M2-B 更改归属测试');
   await page.getByRole('button',{name:'保存村庄'}).click();
   await page.getByRole('button',{name:'定位村庄 测试二村'}).waitFor();
   await page.getByRole('button',{name:'M2B 测试农田',exact:true}).click();
   await page.getByRole('complementary',{name:'对象详情'}).getByRole('button',{name:'查看详细资料'}).click();
   await page.getByRole('complementary',{name:'对象详情'}).locator('[class*=moreActions] > summary[aria-label="更多"]').click();
   await page.getByRole('complementary',{name:'对象详情'}).getByRole('button',{name:'更改所属村庄'}).click();
   await page.getByLabel('新归属村庄').selectOption('测试二村');
   await page.getByLabel('变更依据').fill('M2-B 归属调整');
   await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/v1/map-regions')&&response.request().method()==='PATCH'&&response.status()===200),page.getByRole('button',{name:'保存归属'}).click()]);
   const history=await pool.query('SELECT region_id,valid_to FROM map_region_links WHERE object_id=$1 ORDER BY valid_from',[field.id]);
   const region2=(await pool.query("SELECT id FROM map_regions WHERE name='测试二村'")).rows[0];
   assert.equal(history.rows.length,2,'应保留两条关联历史');
   assert.equal(history.rows[0].region_id,region.id);assert.ok(history.rows[0].valid_to,'旧关联应已结束');
   assert.equal(history.rows[1].region_id,region2.id);assert.equal(history.rows[1].valid_to,null,'新关联应为当前有效');
   await page.screenshot({path:'docs/acceptance/m2b/05-更改所属村庄后.png',fullPage:true});

   // worker 无创建入口且 POST 403
   const workerContext=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await workerContext.addCookies([{name:'agri_session',value:await app.authenticate(worker),url:app.origin}]);
   const workerPage=await workerContext.newPage();
   await workerPage.goto(app.origin+'/farm-overview');
   await workerPage.getByRole('button',{name:'合成测试农场',exact:true}).waitFor();
   await workerPage.getByRole('button',{name:'＋ 新增/管理'}).click();
   assert.equal(await workerPage.getByRole('button',{name:'新增农业对象'}).count(),0);
   const denied=await workerContext.request.post(app.origin+'/api/v1/objects',{headers:{Origin:app.origin},data:{parentId:farm,kind:'field',code:'DENIED',name:'越权',source:'测试'}});
   assert.equal(denied.status(),403);
   await workerContext.close();

   // 手机 390px 核心流程
   await page.setViewportSize({width:390,height:844});
   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'合成测试农场',exact:true}).waitFor();
   await page.getByRole('button',{name:'☰ 对象目录'}).click();
   await page.getByRole('button',{name:'＋ 新增/管理'}).click();
   assert.equal(await page.getByRole('button',{name:'新增农业对象'}).count(),1);
   await page.screenshot({path:'docs/acceptance/m2b/06-手机管理菜单.png'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);

   assert.deepEqual(errors,[]);
   await context.close();
  }finally{await browser.close();}
 });
}));
