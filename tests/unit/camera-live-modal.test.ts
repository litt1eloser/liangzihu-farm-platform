import test from 'node:test';
import assert from 'node:assert/strict';
import {readErrorText} from '../../src/app/(platform)/farm-overview/camera-read-error';

// GIS 直播弹窗：后端错误码到用户文案的映射必须诚实区分权限、试点范围、配额与加密状态。
test('直播弹窗错误码映射：常见受控失败有明确中文说明', () => {
 assert.match(readErrorText('CAMERA_WAKING'), /唤醒/);
 assert.match(readErrorText('CAMERA_ENCRYPTED'), /加密/);
 assert.match(readErrorText('CAMERA_VERIFY_CODE'), /验证码/);
 assert.match(readErrorText('CAMERA_BROWSER_SCOPE'), /管理账号/);
 assert.match(readErrorText('CAMERA_PILOT_SCOPE'), /试点/);
 assert.match(readErrorText('CAMERA_READS_DISABLED'), /尚未启用/);
 assert.match(readErrorText('CAMERA_QUOTA'), /配额/);
});

test('直播弹窗错误码映射：未知码不伪造原因，空值给通用提示', () => {
 assert.match(readErrorText('SOME_NEW_CODE'), /SOME_NEW_CODE/);
 assert.match(readErrorText(null), /未完成/);
});
