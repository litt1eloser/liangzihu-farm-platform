-- 闸门控制执行链路准备：control_requests 记录下发时间与指令ID。
-- 旧列语义不变：state/dispatched 仍由 038 迁移的 CHECK 保持 blocked/未下发口径，本迁移只追加新列。
-- 原 immutable_control_requests 触发器禁止一切 UPDATE，替换为按旧列收窄的形式：
-- 旧列依旧不可改不可删（含 dispatched 布尔位），仅允许回填 dispatched_at 与 command_id。
ALTER TABLE control_requests ADD COLUMN dispatched_at timestamptz,ADD COLUMN command_id uuid;
CREATE UNIQUE INDEX control_requests_command_id ON control_requests(command_id) WHERE command_id IS NOT NULL;
DROP TRIGGER immutable_control_requests ON control_requests;
CREATE TRIGGER immutable_control_requests BEFORE UPDATE OF object_id,device_id,profile_id,rule_id,purpose,authorization_ref,conditions,state,dispatched,blocked_reasons,created_by,created_at OR DELETE ON control_requests FOR EACH ROW EXECUTE FUNCTION preserve_measurement();
