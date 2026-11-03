ALTER TABLE camera_capabilities ADD COLUMN encrypted_verify_code text;
COMMENT ON COLUMN camera_capabilities.encrypted_verify_code IS '萤石设备验证码密文；仅供按需加密播放，禁止写入日志';
