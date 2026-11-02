import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

test('R03 覆盖式详情抽屉：开关不改变地图宽度与视口、不遮目录、响应式',{timeout:180000},()=>withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id),field=await objectFixture(pool,owner.id);
 await pool.query("UPDATE objects SET parent_id=$2,name='东片田',code='R03-A',kind='field',boundary_status='verified',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.64 30.24,114.64 30.26,114.62 30.26,114.62 30.24))',4326) WHERE id=$1",[field,farm]);
 await permit(pool,owner.id,farm,['read','configure']);await permit(pool,owner.id,field,['read','configure']);
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage(),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   await mkdir('docs/acceptance/m2r03',{recursive:true});
   const detail=page.getByRole('complementary',{name:'对象详情'});
   const map=page.getByRole('application');
   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'东片田',exact:true}).waitFor();
   await page.waitForTimeout(1000);
   const mapBox0=await map.boundingBox();assert(mapBox0);
   const center0=await map.getAttribute('data-view-center'),zoom0=await map.getAttribute('data-view-zoom');

   // 打开详情：地图容器宽度与视口不变
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   await page.waitForTimeout(400);
   const mapBox1=await map.boundingBox();assert(mapBox1);
   assert(Math.abs(mapBox1.width-mapBox0.width)<2,'打开详情不得改变地图容器宽度');
   assert.equal(await map.getAttribute('data-view-zoom'),zoom0,'打开详情不得改变缩放');
   const drawerBox=await detail.boundingBox();assert(drawerBox);
   const dirBox=await page.locator('#farm-object-directory').boundingBox();assert(dirBox);
   assert(drawerBox.x>=dirBox.x+dirBox.width-1,'抽屉不得遮挡资源目录');
   assert(drawerBox.x>mapBox1.x&&drawerBox.x+drawerBox.width<=mapBox1.x+mapBox1.width+2,'抽屉应覆盖在地图范围内');
   await page.screenshot({path:'docs/acceptance/m2r03/1440-详情打开.png'});

   // 标签切换与关闭：地图保持
   await detail.getByRole('tab',{name:'相关记录',exact:true}).click();
   await detail.getByRole('button',{name:'巡检',exact:true}).waitFor();
   await detail.getByRole('button',{name:'关闭对象详情'}).click();
   assert.equal(await detail.count(),0);
   const mapBox2=await map.boundingBox();assert(mapBox2&&Math.abs(mapBox2.width-mapBox0.width)<2,'关闭详情后地图宽度不变');
   assert.equal(await map.getAttribute('data-view-zoom'),zoom0,'关闭详情后缩放不变');
   assert.equal(await map.getAttribute('data-view-center'),center0,'关闭详情后中心不变');

   // 宽屏与 1024
   for(const [w,h] of [[1920,1080],[1024,768]] as const){
    await page.setViewportSize({width:w,height:h});
    await page.waitForTimeout(500);
    await page.getByRole('button',{name:'东片田',exact:true}).click();
    await detail.getByRole('heading',{name:'东片田'}).waitFor();
    const mb=await map.boundingBox(),db=await detail.boundingBox();
    assert(mb&&db&&db.x>mb.x&&db.x+db.width<=mb.x+mb.width+2,`${w} 抽屉应在地图范围内`);
    assert(db.width<=380,`${w} 抽屉宽度应受控`);
    await page.screenshot({path:`docs/acceptance/m2r03/${w}-详情打开.png`});
    await detail.getByRole('button',{name:'关闭对象详情'}).click();
   }

   // 手机：底部抽屉不覆盖全部地图，无横向滚动
   await page.setViewportSize({width:390,height:844});
   await page.waitForTimeout(500);
   await page.getByRole('button',{name:'☰ 对象目录'}).click();
   await page.getByRole('button',{name:'东片田',exact:true}).click();
   await detail.getByRole('heading',{name:'东片田'}).waitFor();
   const dBox=await detail.boundingBox();assert(dBox);
   assert(dBox.height<844*0.85,'手机抽屉不得覆盖全部地图');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'手机不得出现横向滚动');
   await page.screenshot({path:'docs/acceptance/m2r03/390-详情打开.png'});
   assert.deepEqual(errors,[],'页面不得出现脚本错误');
   await context.close();
  }finally{await browser.close();}
 });
}));
