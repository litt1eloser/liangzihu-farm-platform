import test from 'node:test';
import assert from 'node:assert/strict';
import {demoAlerts,demoCounts,demoItems,demoRegions,demoTasks} from '../../src/app/(platform)/farm-overview/demo-fixture';

test('D3.1 演示清单、关系和计数来自同一份只读 fixture',()=>{
 assert.deepEqual(demoCounts,{regions:3,fields:5,ponds:3,facilities:4,mobiles:2,alerts:1,tasks:2});
 assert.equal(new Set(demoItems.map(row=>row.id)).size,demoItems.length);
 assert(demoItems.every(row=>row.id.startsWith('demo:')&&row.object_source.includes('合成演示')));
 const ids=new Set(demoItems.map(row=>row.id));
 for(const region of demoRegions){assert(region.id.startsWith('demo:'));assert(region.links.every(link=>ids.has(link.objectId)));}
 const mobiles=demoItems.filter(row=>row.kind==='mobile');
 assert(demoRegions.every(region=>region.links.every(link=>!mobiles.some(row=>row.id===link.objectId))),'机动设备只列在独立目录');
 assert(mobiles.every(row=>demoRegions.some(region=>region.id===row.regionId)),'详情仍保留管理归属');
 assert(demoAlerts.every(alert=>ids.has(alert.objectId)));
 assert(demoTasks.every(task=>demoRegions.some(region=>region.id===task.regionId)));
 assert(demoItems.filter(row=>row.kind==='mobile').every(row=>row.geometry?.type==='Point'&&row.detail.includes('非真实 GPS')));
});
