import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {withDb} from '../support/db';
import {withApp} from '../support/app';
import {actorFixture,objectFixture,permit} from '../support/fixtures';

test('R02-B 冻结偏差修复：顶部顺序与独立卡片、类别筛选、范围/位置徽标、未核实不上顶部',{timeout:180000},()=>withDb(async pool=>{
 const owner=await actorFixture(pool,'owner');
 const farm=await objectFixture(pool,owner.id),fieldOk=await objectFixture(pool,owner.id),fieldPending=await objectFixture(pool,owner.id),pond=await objectFixture(pool,owner.id),facility=await objectFixture(pool,owner.id);
 await pool.query("UPDATE objects SET parent_id=$2,name='自营田A',code='R2B-FA',kind='field',boundary_status='verified',boundary=ST_GeomFromText('POLYGON((114.62 30.24,114.63 30.24,114.63 30.25,114.62 30.25,114.62 30.24))',4326) WHERE id=$1",[fieldOk,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='自营田B',code='R2B-FB',kind='field',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.64 30.24,114.65 30.24,114.65 30.25,114.64 30.25,114.64 30.24))',4326) WHERE id=$1",[fieldPending,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='南塘口',code='R2B-P',kind='pond',boundary_status='draft',boundary=ST_GeomFromText('POLYGON((114.62 30.26,114.63 30.26,114.63 30.27,114.62 30.27,114.62 30.26))',4326) WHERE id=$1",[pond,farm]);
 await pool.query("UPDATE objects SET parent_id=$2,name='一号闸',code='R2B-G',kind='facility',boundary_status='draft',boundary=ST_GeomFromText('POINT(114.635 30.255)',4326) WHERE id=$1",[facility,farm]);
 await permit(pool,owner.id,farm,['read','configure']);
 for(const id of [fieldOk,fieldPending,pond,facility])await permit(pool,owner.id,id,['read','configure']);
 await pool.query("INSERT INTO production_batches(object_id,code,species,variety,stage,source,verified,started_at,created_by) VALUES($1,'R2B-PC1','水稻','甬优','分蘖期','仅测试',true,'2026-05-01',$2)",[fieldOk,owner.id]);
 await pool.query("INSERT INTO production_batches(object_id,code,species,variety,stage,source,verified,started_at,created_by) VALUES($1,'R2B-PC2','小麦','未知','抽穗期','仅测试',false,'2026-05-01',$2)",[fieldPending,owner.id]);
 await withApp(pool,async app=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
   await context.addCookies([{name:'agri_session',value:await app.authenticate(owner),url:app.origin}]);
   const page=await context.newPage(),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   await mkdir('docs/acceptance/m2r02b',{recursive:true});
   const detail=page.getByRole('complementary',{name:'对象详情'});
   await page.goto(app.origin+'/farm-overview');
   await page.getByRole('button',{name:'自营田A',exact:true}).waitFor();

   // 农田 A（已核实批次）：面积在前，当前生产与生长阶段为独立两行；范围已核实徽标
   await page.getByRole('button',{name:'自营田A',exact:true}).click();
   await detail.getByRole('heading',{name:'自营田A'}).waitFor();
   await detail.getByText('范围已核实',{exact:true}).first().waitFor();
   await detail.getByText('管理范围面积',{exact:true}).waitFor();
   await detail.getByText(/\d+(\.\d+)? 亩/).first().waitFor();
   await detail.getByText('水稻（甬优）',{exact:true}).waitFor();
   await detail.getByText('分蘖期',{exact:true}).waitFor();
   const html=await detail.innerHTML();
   assert(html.indexOf('管理范围面积')<html.indexOf('当前生产'),'面积须在当前生产之前');
   assert(html.indexOf('当前生产')<html.indexOf('生长阶段'),'当前生产须在生长阶段之前');
   // 记录筛选为农事类别
   await detail.getByRole('tab',{name:'相关记录',exact:true}).click();
   await detail.getByRole('button',{name:'农事',exact:true}).waitFor();
   assert.equal(await detail.getByRole('button',{name:'操作',exact:true}).count(),0,'农田不得出现操作筛选');
   assert.equal(await detail.getByRole('button',{name:'养殖',exact:true}).count(),0,'农田不得出现养殖筛选');

   // 农田 B（未核实批次）：顶部不得出现具体作物与阶段
   await page.getByRole('button',{name:'自营田B',exact:true}).click();
   await detail.getByRole('heading',{name:'自营田B'}).waitFor();
   await detail.getByText('范围待核对',{exact:true}).first().waitFor();
   await detail.getByText('资料待核实').first().waitFor();
   
   assert.equal(await detail.getByText(/小麦/).count(),0,'未核实批次品种不得上顶部');
   assert.equal(await detail.getByText(/抽穗期/).count(),0,'未核实批次阶段不得上顶部');

   // 塘口：筛选为养殖；徽标范围待核对
   await page.getByRole('button',{name:'南塘口',exact:true}).click();
   await detail.getByRole('heading',{name:'南塘口'}).waitFor();
   await detail.getByText('范围待核对',{exact:true}).first().waitFor();
   await detail.getByRole('tab',{name:'相关记录',exact:true}).click();
   await detail.getByRole('button',{name:'养殖',exact:true}).waitFor();
   assert.equal(await detail.getByRole('button',{name:'操作',exact:true}).count(),0,'塘口不得出现操作筛选');

   // 固定设施：位置状态徽标；筛选为操作
   await page.getByRole('button',{name:'一号闸',exact:true}).click();
   await detail.getByRole('heading',{name:'一号闸'}).waitFor();
   await detail.getByText('位置待核对',{exact:true}).first().waitFor();
   assert.equal(await detail.getByText('范围待核对',{exact:true}).count(),0,'设施不得误用范围语义');
   await detail.getByRole('tab',{name:'相关记录',exact:true}).click();
   await detail.getByRole('button',{name:'操作',exact:true}).waitFor();
   assert.equal(await detail.getByRole('button',{name:'养殖',exact:true}).count(),0);
   await page.screenshot({path:'docs/acceptance/m2r02b/01-顶部结构与徽标.png'});
   assert.deepEqual(errors,[],'页面不得出现脚本错误');
   await context.close();
  }finally{await browser.close();}
 });
}));
