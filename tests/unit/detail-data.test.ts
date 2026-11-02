import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCurrent,buildPointViews,groupByMetric,sectionState,mapAlerts,severityLabel} from '../../src/app/(platform)/farm-overview/detail-data';

test('F03 当前值事实判定：可信/质量/冲突/缺失/过期分类，0 不等于缺失',()=>{
  const now=Date.parse('2026-10-29T12:00:00Z');
  // 可信，且 0 是有效值
  assert.deepEqual(classifyCurrent({value:0,unit:'mg/L',quality:'valid',sampledAt:'2026-10-29T11:59:00Z',reasons:[]},{maxAgeMs:120000,now}).fact,'trusted');
  assert.equal(classifyCurrent({value:0,unit:'mg/L',quality:'valid',sampledAt:'2026-10-29T11:59:00Z',reasons:[]},{maxAgeMs:120000,now}).value,0);
  // 过期不作为当前值
  const stale=classifyCurrent({value:6.1,unit:'mg/L',quality:'valid',sampledAt:'2026-10-29T10:00:00Z',reasons:[]},{maxAgeMs:120000,now});
  assert.equal(stale.fact,'stale');assert.equal(stale.value,null);
  // 质量无效/存疑不显示数值
  assert.equal(classifyCurrent({value:6.1,unit:'mg/L',quality:'invalid',sampledAt:'2026-10-29T11:59:00Z',reasons:['单位不符']},{now}).fact,'suspect');
  assert.equal(classifyCurrent({value:6.1,unit:'mg/L',quality:'suspect',sampledAt:'2026-10-29T11:59:00Z',reasons:[]},{now}).fact,'suspect');
  // 接口判空（绑定未核实/冲突/无数据）与未返回区分
  assert.equal(classifyCurrent(null,{now}).fact,'pending');
  assert.equal(classifyCurrent(undefined,{now}).fact,'pending');
  // R01：缺采样时间或缺时效依据均不得标记 trusted
  assert.equal(classifyCurrent({value:6.1,unit:'mg/L',quality:'valid',sampledAt:null,reasons:[]},{maxAgeMs:120000,now}).fact,'pending','无采样时间不作当前值');
  const noTiming=classifyCurrent({value:6.1,unit:'mg/L',quality:'valid',sampledAt:'2020-01-01T00:00:00Z',reasons:[]},{now});
  assert.equal(noTiming.fact,'pending','无时效参数不作当前值');
  assert.equal(noTiming.reason,'尚未核实：缺少时效依据');
});

test('F03 测点视图组装：当前值接口失败只降级不拖垮清单',()=>{
  const points=[{id:'p1',name:'溶解氧 1 号',code:'DO-1',metric:'dissolved_oxygen',unit:'mg/L'},{id:'p2',name:'水温',code:'WT-1',metric:'water_temp',unit:'°C'}];
  const failed=buildPointViews(points,null);
  assert.equal(failed.length,2);
  assert(failed.every(p=>p.fact==='pending'&&p.reason.includes('读取失败')));
  const rows=[{pointId:'p1',current:{value:6.1,unit:'mg/L',quality:'valid',sampledAt:'2026-10-29T11:59:00Z',reasons:[]}}];
  const views=buildPointViews(points,rows,{now:Date.parse('2026-10-29T12:00:00Z'),maxAgeMs:600000});
  assert.equal(views[0].fact,'trusted');
  assert.equal(views[1].fact,'pending','接口未返回的测点按待核实处理');
  const groups=groupByMetric(views);
  assert.deepEqual(groups.map(g=>g.metric),['dissolved_oxygen','water_temp']);
});

test('F03 分区请求状态合成：加载/成功/部分成功/失败/无权限',()=>{
  assert.equal(sectionState('loading','ok'),'loading');
  assert.equal(sectionState('ok','ok'),'ready');
  assert.equal(sectionState('ok','fail'),'partial');
  assert.equal(sectionState('fail','fail'),'error');
  assert.equal(sectionState('denied','ok'),'denied');
  assert.equal(sectionState('fail','denied'),'denied');
});

test('F03 告警映射：open 才是当前告警，recovered 仅作历史',()=>{
  const views=mapAlerts([{id:'a1',title:'溶氧偏低',state:'open',severity:'warning'},{id:'a2',title:'已恢复项',state:'recovered',severity:'info'}]);
  assert.equal(views[0].current,true);
  assert.equal(views[1].current,false);
  assert.equal(views[1].state,'recovered');
});

test('R02-C 告警级别中文化：已知枚举准确转换，未知值保守显示',()=>{
 assert.equal(severityLabel('severe'),'严重');
 assert.equal(severityLabel('warning'),'警告');
 assert.equal(severityLabel('info'),'提示');
 assert.equal(severityLabel('critical'),'未定级','未知枚举不猜测含义');
 assert.equal(severityLabel(''),'未定级');
});
