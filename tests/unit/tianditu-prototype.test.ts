import assert from 'node:assert/strict';
import { test } from 'node:test';
import XYZ from 'ol/source/XYZ.js';
import { fromLonLat, get as getProjection, toLonLat } from 'ol/proj.js';
import { INITIAL_CENTER_4326, tiandituWmtsUrls, validBrowserKey } from '../../src/modules/map-prototype/tianditu';

test('天地图浏览器 Key 格式和 WMTS 行列映射', () => {
  const key = 'a'.repeat(32);
  assert.equal(validBrowserKey(key), true);
  assert.equal(validBrowserKey(''), false);
  const source = new XYZ({ urls: tiandituWmtsUrls('img', key), maxZoom: 18 });
  const tileUrl = source.getTileUrlFunction()([11, 1676, 845], 1, getProjection('EPSG:3857')!);
  assert.ok(tileUrl);
  const url = new URL(tileUrl);
  assert.match(url.hostname, /^t[0-7]\.tianditu\.gov\.cn$/);
  assert.equal(url.pathname, '/img_w/wmts');
  assert.equal(url.searchParams.get('TILEMATRIXSET'), 'w');
  assert.equal(url.searchParams.get('TILEMATRIX'), '11');
  assert.equal(url.searchParams.get('TILEROW'), '845');
  assert.equal(url.searchParams.get('TILECOL'), '1676');
  assert.equal(url.searchParams.get('tk'), key);
  assert.equal(new URL(tiandituWmtsUrls('cia', key)[0]).searchParams.get('LAYER'), 'cia');
});

test('初始 WGS84 经纬度经 EPSG:3857 转换后可回到原位置', () => {
  const mercator = fromLonLat(INITIAL_CENTER_4326, 'EPSG:3857');
  assert.ok(mercator[0] > 1.2e7 && mercator[1] > 3e6);
  const geographic = toLonLat(mercator, 'EPSG:3857');
  assert.ok(Math.abs(geographic[0] - 114.635) < 1e-6);
  assert.ok(Math.abs(geographic[1] - 30.25) < 1e-6);
});
