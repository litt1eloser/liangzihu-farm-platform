// 直播读取错误码 → 用户文案。独立成模块以便单元测试（不引入播放器依赖）。
export const readErrorText=(code:string|null)=>
 code==='CAMERA_WAKING'?'4G 设备正在唤醒出流，请等待约 15-20 秒后重新请求':
 code==='CAMERA_ENCRYPTED'?'设备已开启视频加密：未携带验证码或验证码不正确':
 code==='CAMERA_VERIFY_CODE'?'设备已开启视频加密：尚未登记铭牌验证码':
 code==='CAMERA_BROWSER_SCOPE'?'加密试点直播仅向已启用的管理账号开放':
 code==='CAMERA_PILOT_SCOPE'?'此通道尚未列入加密直播试点':
 code==='CAMERA_READS_DISABLED'?'真实监控读取尚未启用，当前环境不提供直播':
 code==='CAMERA_QUOTA'?'本月请求配额已达上限':
 code?`读取未完成（${code}）`:'读取未完成，请稍后重试';
