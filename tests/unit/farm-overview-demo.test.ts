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
 const areas=demoItems.filter(row=>row.kind==='field'||row.kind==='pond');
 assert.equal(areas.length,8);
 const signatures=new Set<string>();
 for(const area of areas){const ring=area.geometry?.coordinates as number[][][];assert.equal(area.geometry?.type,'Polygon');assert(ring[0].length>=5);assert.deepEqual(ring[0][0],ring[0].at(-1));const points=ring[0].slice(0,-1);const cross=(a:number[],b:number[],c:number[])=>Math.sign((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){if(i===0&&j===points.length-1)continue;assert.equal(cross(points[i],points[(i+1)%points.length],points[j])*cross(points[i],points[(i+1)%points.length],points[(j+1)%points.length])<0&&cross(points[j],points[(j+1)%points.length],points[i])*cross(points[j],points[(j+1)%points.length],points[(i+1)%points.length])<0,false,'演示面不能自交');}signatures.add(points.map(([x,y])=>`${(x-points[0][0]).toFixed(3)},${(y-points[0][1]).toFixed(3)}`).join(';'));}
 assert.equal(signatures.size,8,'每个农田或塘口的形状应不同');
});
