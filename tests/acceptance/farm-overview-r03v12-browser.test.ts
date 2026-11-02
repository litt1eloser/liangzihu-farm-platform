import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

// R03 V1.2：轻量概要卡 + 按需展开完整详情。覆盖：双态切换、同类/跨类切换规则、
// 目录协同折叠与手动优先、地图目标避让（屏幕像素级）、视口保持、三档响应式截图。
test('R03 V1.2 概要卡与按需展开：双态切换、目录协同、目标避让、视口保持、响应式',{timeout:240000},()=>withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id),fieldA=await objectFixture(pool,owner.id),fieldB=await objectFixture(pool,owner.id),pond=await objectFixture(pool,owner.id);
 await pool.query("UPDATE objects SET parent_id=$2,name='东片田',code='V12-A',kind='field',boundary_status='verified',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.64 30.24,114.64 30.26,114.62 30.26,114.62 30.24))',4326) WHERE id=$1",[fieldA,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='北片田',code='V12-B',kind='field',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.64 30.26,114.65 30.26,114.65 30.27,114.64 30.27,114.64 30.26))',4326) WHERE id=$1",[fieldB,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='南塘口',code='V12-P',kind='pond',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.62 30.26,114.63 30.26,114.63 30.27,114.62 30.27,114.62 30.26))',4326) WHERE id=$1",[pond,farm]);
 await permit(pool,owner.id,farm,['read','configure']);await permit(pool,owner.id,fieldA,['read','configure']);await permit(pool,owner.id,fieldB,['read','configure']);await permit(pool,owner.id,pond,['read','configure']);
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage(),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   await mkdir('docs/acceptance/m2r03v12',{recursive:true});
   const detail=page.getByRole('complementary',{name:'对象详情'});
   const map=page.getByRole('application');
   const directory=page.locator('#farm-object-directory');
   const expand=async()=>{await detail.getByRole('button',{name:'查看详细资料'}).click();await detail.getByRole('tablist').waitFor();};
   const settleMouse=async()=>{const mb=await map.boundingBox();if(mb)await page.mouse.move(mb.x+mb.width*0.4,mb.y+mb.height*0.25);await page.waitForTimeout(220);};
   const selectionPx=async()=>{const raw=await map.getAttribute('data-selection-px');assert(raw,'应写入目标屏幕像素范围');return raw.split(',').map(Number);};
   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'东片田',exact:true}).waitFor();
   await page.waitForTimeout(800);

   // —— 1440 桌面：默认概要卡 ——
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   assert.equal(await detail.getAttribute('data-density'),'summary','选中后默认为概要卡');
   assert.equal(await detail.getByRole('tablist').count(),0,'概要卡不展示标签栏');
   await detail.getByText('管理范围面积',{exact:true}).waitFor();
   const summaryBox=await detail.boundingBox();assert(summaryBox);
   const mapBox=await map.boundingBox();assert(mapBox);
   assert(summaryBox.height<mapBox.height*0.6,'概要卡高度应随内容、不撑满全高');
   await page.waitForTimeout(600);
   const center0=await map.getAttribute('data-view-center'),zoom0=await map.getAttribute('data-view-zoom');
   // 目标避让：边界像素完整落在抽屉左侧未遮挡区
   {
    const [x0,y0,x1,y1]=await selectionPx();
    const drawerLeft=summaryBox.x-mapBox.x;
    assert(x0>=0&&y0>=0,'目标边界应在地图可视区内');
    assert(x1<=drawerLeft-4,`目标右缘 ${x1} 应在抽屉左缘 ${drawerLeft} 左侧`);
    assert(y1<=mapBox.height,'目标下缘应在地图可视区内');
   }
   await settleMouse();await page.screenshot({path:'docs/acceptance/m2r03v12/1440-概要.png'});

   // —— 展开完整详情：三标签、资料依据默认折叠、视口不变 ——
   await expand();
   assert.equal(await detail.getAttribute('data-density'),'full');
   await detail.getByRole('tab',{name:'农事生产',exact:true}).waitFor();
   const basis=detail.locator('details',{hasText:'资料依据'});
   await basis.waitFor();
   assert.equal(await basis.getAttribute('open'),null,'资料依据须默认折叠');
   assert.equal(await map.getAttribute('data-view-zoom'),zoom0,'展开不得改变缩放');
   assert.equal(await map.getAttribute('data-view-center'),center0,'展开不得改变中心');
   await settleMouse();await page.screenshot({path:'docs/acceptance/m2r03v12/1440-完整.png'});

   // 标签切换与收回概要均不动视口
   await detail.getByRole('tab',{name:'农事生产',exact:true}).click();
   assert.equal(await map.getAttribute('data-view-zoom'),zoom0,'切换标签不得改变缩放');
   await detail.getByRole('button',{name:'收回概要'}).click();
   assert.equal(await detail.getAttribute('data-density'),'summary','收回后返回概要卡');
   assert.equal(await detail.getByRole('tablist').count(),0);
   assert.equal(await map.getAttribute('data-view-center'),center0,'收回概要不得改变中心');

   // —— 同类切换保留展开状态与标签；跨类回概要+基本信息 ——
   await expand();
   await detail.getByRole('tab',{name:'农事生产',exact:true}).click();
   await page.getByRole('button',{name:'北片田',exact:true}).click();
   await detail.getByRole('heading',{name:'北片田'}).waitFor();
   assert.equal(await detail.getAttribute('data-density'),'full','同类切换应保留展开状态');
   assert.equal(await detail.getByRole('tab',{name:'农事生产',exact:true}).getAttribute('aria-selected'),'true','同类切换应保留标签');
   await page.getByRole('button',{name:'南塘口',exact:true}).click();
   await detail.getByRole('heading',{name:'南塘口'}).waitFor();
   assert.equal(await detail.getAttribute('data-density'),'summary','跨类切换应回概要卡');
   await expand();
   assert.equal(await detail.getByRole('tab',{name:'基本信息',exact:true}).getAttribute('aria-selected'),'true','跨类切换应回基本信息');

   // 关闭详情：视口保持（以最后一次选中定位后为基准）
   await page.waitForTimeout(400);
   const centerClose=await map.getAttribute('data-view-center'),zoomClose=await map.getAttribute('data-view-zoom');
   await detail.getByRole('button',{name:'关闭对象详情'}).click();
   assert.equal(await detail.count(),0);
   assert.equal(await map.getAttribute('data-view-zoom'),zoomClose,'关闭详情后缩放不变');
   assert.equal(await map.getAttribute('data-view-center'),centerClose,'关闭详情后中心不变');

   // —— 1024 窄屏：目录协同折叠与手动优先 ——
   await page.setViewportSize({width:1024,height:768});
   await page.waitForTimeout(500);
   const dirBox0=await directory.boundingBox();assert(dirBox0&&dirBox0.width>200,'详情未打开时目录应展开');
   // 1024 导航：不横向截断文字，使用「更多导航」可发现入口
   const navMore=page.locator('summary[aria-label="更多导航"]');
   assert.equal(await navMore.isVisible(),true,'1024 应显示「更多导航」入口');
   await navMore.click();
   await page.locator('.navMoreMenu a, [class*=navMoreMenu] a').first().waitFor();
   assert(await page.locator('[class*=navMoreMenu]').getByRole('link',{name:'地形分析'}).isVisible(),'更多导航菜单应包含全部导航项');
   await settleMouse();await page.screenshot({path:'docs/acceptance/m2r03v12/1024-导航更多.png'});
   await navMore.click();
   // 900px 同样收敛
   await page.setViewportSize({width:900,height:768});
   await page.waitForTimeout(400);
   assert.equal(await navMore.isVisible(),true,'900px 应显示「更多导航」入口');
   await page.screenshot({path:'docs/acceptance/m2r03v12/900-导航更多.png'});
   await page.setViewportSize({width:1024,height:768});
   await page.waitForTimeout(400);
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   await page.waitForTimeout(600);
   assert.equal(await directory.count()&&await directory.isVisible(),false,'1024 选中对象后目录应自动折叠');
   await page.getByRole('button',{name:'展开对象目录'}).waitFor();
   {
    const [x0,,x1]=await selectionPx();
    const dBox=await detail.boundingBox();const mb=await map.boundingBox();assert(dBox&&mb);
    assert(x1<=dBox.x-mb.x-4&&x0>=0,'1024 目标边界应在未遮挡区');
   }
   await settleMouse();await page.screenshot({path:'docs/acceptance/m2r03v12/1024-概要.png'});
   await expand();
   await settleMouse();await page.screenshot({path:'docs/acceptance/m2r03v12/1024-完整.png'});
   // 用户手动展开目录：不被后续选择强制折叠
   await page.getByRole('button',{name:'展开对象目录'}).click();
   await page.waitForTimeout(300);
   assert.equal(await directory.isVisible(),true,'手动展开后目录应可见');
   await page.getByRole('button',{name:'北片田',exact:true}).click();
   await detail.getByRole('heading',{name:'北片田'}).waitFor();
   await page.waitForTimeout(400);
   assert.equal(await directory.isVisible(),true,'用户手动展开的目录不得被普通选择更新折叠');
   await settleMouse();await page.screenshot({path:'docs/acceptance/m2r03v12/1024-目录手动展开.png'});
   // 关闭详情：用户已手动操作过目录，不自动还原折叠
   await detail.getByRole('button',{name:'关闭对象详情'}).click();
   await page.waitForTimeout(300);
   assert.equal(await directory.isVisible(),true,'用户手动展开的目录在关闭详情后保持');
   // 再次选中→自动折叠；关闭→仅恢复系统自动折叠
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   await page.waitForTimeout(400);
   assert.equal(await directory.isVisible(),false,'再次选中应再次自动折叠');
   await detail.getByRole('button',{name:'关闭对象详情'}).click();
   await page.waitForTimeout(300);
   assert.equal(await directory.isVisible(),true,'关闭详情应恢复系统自动折叠前的展开状态');

   // —— 390 手机端：底部卡、控件避让、定位入口 ——
   await page.setViewportSize({width:390,height:844});
   await page.waitForTimeout(500);
   await page.getByRole('link',{name:'农场地图'}).first().waitFor();
   await page.getByRole('button',{name:'☰ 对象目录'}).click();
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   await page.waitForTimeout(600);
   const mSummary=await detail.boundingBox();const mMap=await map.boundingBox();assert(mSummary&&mMap);
   assert(mSummary.height<mMap.height*0.58,'手机概要卡不得遮住大部分地图');
   const zoomBox=await page.locator('.ol-zoom').boundingBox();assert(zoomBox);
   assert(zoomBox.y+zoomBox.height<=mSummary.y+1,'缩放控件不得被底部卡遮挡');
   await detail.getByRole('button',{name:'定位当前对象'}).waitFor();
   await settleMouse();await page.screenshot({path:'docs/acceptance/m2r03v12/390-概要.png'});
   await expand();
   await page.waitForTimeout(300);
   const mFull=await detail.boundingBox();assert(mFull);
   assert(mFull.height<=mMap.height*0.66+2,'手机完整详情不得超过地图高度 66%');
   // 完整态进入后无需滚动即可见三标签与至少一部分正文；操作区流式排布不遮挡正文
   const tabsBox=await detail.getByRole('tablist').boundingBox();assert(tabsBox);
   assert(tabsBox.y>=mFull.y-1&&tabsBox.y+tabsBox.height<=mFull.y+mFull.height+1,'手机完整态进入后三标签应无需滚动可见');
   const bodyBox=await detail.getByText(/相关管理资料尚未登记/).boundingBox();
   assert(bodyBox&&bodyBox.y<mFull.y+mFull.height,'手机完整态进入后应可见至少一部分正文');
   const actionsPos=await detail.locator('[class*=drawerActions]').first().evaluate(el=>getComputedStyle(el).position);
   assert.equal(actionsPos,'static','手机完整态操作区应流式排布，不得以吸附形式遮挡正文');
   // 展开不动视口；目标被遮住时使用「定位当前对象」按需重新定位
   await detail.getByRole('button',{name:'定位当前对象'}).click();
   await page.waitForTimeout(700);
   {
    const [x0,y0,x1,y1]=await selectionPx();
    assert(y1<=mFull.y-mMap.y+1&&y0>=0&&x0>=0&&x1<=mMap.width,'手机端定位后目标边界应在底部卡上方可视区');
   }
   await settleMouse();await page.screenshot({path:'docs/acceptance/m2r03v12/390-完整.png'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'手机不得出现横向滚动');
   assert.deepEqual(errors,[],'页面不得出现脚本错误');
   await context.close();
  }finally{await browser.close();}
 });
}));
