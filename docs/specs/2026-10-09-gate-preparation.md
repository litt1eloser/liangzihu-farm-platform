# 闸门部署准备模块

日期：2026-10-09。承接 G15 和 C39，优化现有 `/control-records`，不替代真实执行适配器或现场签认。

## 目标与页面

- 当前对象内选择已登记设备，展示型号、厂家编号、序列号及现场核实状态。
- 概览按真实台账统计物理设备、最新闸门档案、待补协议和最近控制申请；无设备时引导前往配置管理，不自动创建设备。
- 新增可保存的闸门部署资料，分为设备与安装、协议与网络、状态反馈。未知参数允许为空。
- 采用“设备建档、资料核对、只读联调、受控验收”的路径。协议文档已收录只说明取得资料；只读适配器和真实控制仍未完成。
- 安全资料、专业规则、申请、反馈和人工接管按当前设备展示，复用既有接口和权限。

## 数据与接口

追加迁移 `045_gate_deployments.sql`；已有迁移不改写。`gate_deployments` 与实际物理设备、对象和人员关联，每次保存追加新版本，禁止修改和删除历史。

`POST /api/v1/control-records/gate-deployments` 复用同源检查、登录身份、对象 read/configure、稳定提交标识、同连接事务及域事件。客户端旧账号草稿由 expectedActorId 拦截。网关和摄像通道不能登记为闸门。

保存字段：deviceId、manufacturer、controllerModel、firmware、installationRef、protocol、protocolStatus、protocolRef、tcpRole、networkRef、messageRef、feedbackRef、requestKey。

- protocol 为 unknown / mqtt / tcp_rtu / modbus_tcp，TCP透传RTU与标准ModbusTCP分别登记。
- protocolStatus 为 pending / received。received 要求明确通信方式、控制器型号、固件版本和文档依据；它不表示协议兼容或允许控制。
- tcpRole 为 unknown / device_client / device_server；仅TCP方式适用。MQTT切换后不保留TCP方向。
- 本模块只保存资料说明，不采集密码、令牌或含凭据的地址，不建立网络连接。

overview 增加每台设备最新 gateDeployments/currentProfiles 和设备身份字段；历史业务关系导出包含 gate_deployments。

## 执行边界与升级

模块不创建动作任务，不修改 control_requests 的 blocked/dispatched=false 数据库约束。不存在开闸、关闸或停止下发入口。五层观测与实际外部凭证仍分开记录。

升级前保留独立备份，在隔离工作树完成类型检查、构建和相关测试，追加迁移后更新运行构建。回退保留新表和版本记录；旧程序忽略新增表，不删除迁移历史。

验收记录：[闸门准备模块](../acceptance/control/gate-preparation.md)。后续真实接入仍按 [G15](../contracts/三期真实资料与设备适配交接.md)逐设备推进。
