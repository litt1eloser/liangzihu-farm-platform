# 三诚闸门只读 MQTT 接入契约状态

> 2026-10-10 新增：三诚单螺杆闸门（SCZM-LG，固件 VER:V2.4.05.000000.0000）只读采集第一阶段。仅被动订阅设备上行 JSON 并入库测值；不实现、不预埋任何下行查询或控制。契约与来源 `verified` 均为 false，真实接入未开放。

## 厂家确认记录（2026-10-13）

- **接入路线确定为方案 B：订阅厂家 MQTT 服务器**。厂家确认可开账号（仅能读写权限，无法限制只读；我方 worker 只有订阅代码、无发布路径，承诺只订不发）。备选：DTU 可远程改指我方服务器（单中心，切换后厂家平台收不到该设备，厂家留存原配置文档）。厂家有数据 API 但自述有数据限制与网络延迟，不推荐，放弃。
- 厂家确认 hbdxscz001 实际使用 **MQTT JSON 上报**；确认"双吊点"接线图与单螺杆机型接线相同，图纸适用。
- 厂家提供一条真实历史上行报文（设备当前不在线，为历史数据）：字段均带 `err:"0"`，value 为数字字符串，含 pulseEquivalent/opening/setOpening/currentMax 四项（无水位/流量字段，该台是否装水位计待现场确认）。该报文已经本地 normalizeGate 解析验证通过（err=0 判有效、字符串数值正确、未登记字段跳过、采样时间取 sys_time 正确），未入库。
- **待核实矛盾**：该报文 sys_sn=00100525060900149270、sys_imei=863059077974204 与《闸门编号与型号对应表》中 hbdxscz001 登记的 SN/IMEI 不一致，已向厂家提出核实；未澄清前不按此报文修改设备登记。

## 厂家确认记录（2026-10-14 第二轮）

- **err 完整语义**（厂家确认）：`0`=成功；`1`=从机无响应；`2`=CRC 校验不通过；其他值=Modbus 错误码（如 0x81 即十进制 129）。适配器已修正为 **err 非 0 一律记 invalid/vendor_field_error**（此前只判 `"1"`）。
- **currentMax 单位确认为 mA**；pulseEquivalent 可不采集（厂家认可）；上报间隔可配置（实测当前约 603 秒）。
- **水位/流量**：厂家确认这批闸门（hbdxscz001~029）**未安装水位计或测流箱**，waterLevel/流量字段不会上报；将来加装后厂家可远程开配置。
- **订阅行为**：厂家称所有订阅者都能收到，但要求**客户端 ID 唯一**（此前观测到同主题只有一个订阅者收到、桥接被秒踢，与该说法不完全一致，保留观察；当前架构为单一上游转发器，规避该问题）。
- 012 于 2026-10-14 16:21 后停止上报，厂家确认设备已离线（供电问题待现场处理）。

## 协议依据与边界

- 依据：厂家协议文件《闸门设备通过mqtt对接协议》（PDF），设备品牌三诚、型号 SCZM-LG、固件 VER:V2.4.05.000000.0000，首台接入设备编号 hbdxscz001。
- 上行主题每台一个：`/sdscdevice/gate/hbdxscz260302/publish/hbdxsczXXX`（XXX=001..029），设备编号取主题最后一段；下行主题为同路径 `publish` 换 `sub`。
- 只读边界更新（2026-11-24）：下行执行链路已在平台侧实现但**默认关闭**。`dispatchGateControl`（`src/modules/control/dispatch.ts`）复核操作权限、最新控制资料（许可/远程模式/现场保护/有效期）、已批准专业规则与已核实测点绑定后，按厂家 rw_prot 格式构造下行命令（`params` 包装、`Ver:"1.0.1"`、`dir="down"`、`id`=平台生成的指令ID、`w_data` 写 `setOpening`（开=100、关=0）），发布到本地 broker 的下行主题（上行 `publish/` 前缀换 `sub/`，或契约显式登记的 `downTopicPrefix`），并把下发时间与指令ID回填 `control_requests.dispatched_at/command_id`（第049号迁移新增列；旧列含 `state`/`dispatched` 仍不可改）。
- 2026-11-28 厂家书面确认下行协议并允许经现有 MQTT 桥接链路下发：开/关为 `w_data:[{name:"setOpening",value:"0"~"100"}]`（字符串），停止为 `w_data:[{name:"stop",value:"0"}]`（已补入 `buildGateCommand`）；设备回执为同 id 的 `dir:"rsp"` 回显 `w_data`。过程性反馈（执行中/到位/失败）厂家未提供，当前实现只确认"设备收到回执"，不得据回执声称闸门已动作到位。
- **启用前提（缺一不可）**：厂家书面确认执行中/到位/失败的过程反馈语义 + 联合签验授权，然后才设 `GATE_DISPATCH_ENABLED=1`。未启用时接口照常执行全部条件复核并以 503 `GATE_DISPATCH_DISABLED` 拒绝（错误信息附带完整阻断原因清单），不发布任何下行报文。
- 设备回执跟踪：上行主题上 `dir="rsp"` 的包由采集 worker 识别（`parseGateResponse`），不进上行解析与隔离区；按指令ID匹配 `control_requests.command_id` 后写入 `control_feedback`（layer=`device_received`、source=`vendor_receipt`、err 字段非 0 记 `not_observed`），仅表示"设备收到命令"，不伪造到位结论；匹配不到待回执指令的回执丢弃并记日志行。
- Modbus RTU 透传备用通道（9600/8/N/1，从站1，0x03/0x06）仍属于后续工作项，代码中没有实现。

## 上行报文与字段处理

自动上行 JSON（上报间隔设备侧可设，单位秒）形如：

```json
{"params":{"dir":"up","id":"1728629601","sys_sn":"...","sys_imei":"...","sys_time":"1728629601","r_data":[{"name":"opening","value":0}]}}
```

- 解析要求 `dir="up"`；采样时间取 `sys_time`（缺省用 `id` 兜底），Unix 秒转 Date；两者都缺时不拿收到时间伪造，记 `unknown_sample_time`。
- 幂等：`source_record_id` 取 `sys_sn/sys_imei/sys_time` 实际携带字段的组合；配合观测内容哈希去重，broker 重投与进程重启不会重复入库。
- 带 `"err":"1"` 的字段：rawValue 保留原值、value 置空、quality 记 invalid、原因记 `vendor_field_error`（与仁科离线状态同等方式）。
- value 支持数字或数字字符串；非数字不报错崩溃，记 invalid/`invalid_number`、原值保留，不会成为当前有效值。
- 单位换算当前全部为 scale=1/offset=0：currentMax 堵转电流 mA、opening 当前开度 %、setOpening 设置开度 %、cumulativeFlows 累计流量 m³、waterLevel 水位 mm、instantaneousFlow 瞬时流量 m³/s。pulseEquivalent 脉冲当量未登记为测点，报文中出现时跳过。

## 测点映射（登记工具 `registry:gate`）

| 报文字段 | 平台 metric | 单位 | 测点 code（首台） |
|---|---|---|---|
| opening | opening | % | GATE-001-OPENING |
| waterLevel | water_level | mm | GATE-001-WATER-LEVEL |
| instantaneousFlow | instantaneous_flow | m³/s | GATE-001-INSTANT-FLOW |
| cumulativeFlows | cumulative_flow | m³ | GATE-001-CUMULATIVE-FLOW |
| setOpening | set_opening | % | GATE-001-SET-OPENING |
| currentMax | stall_current | mA | GATE-001-STALL-CURRENT |

`externalDeviceId + metric` 必须唯一映射到一个 pointId，缺失或重复整体拒绝，不取第一项。未绑定对象前测值无法入库（resolvePointBinding 拒绝/隔离），属于预期。

## 已核实 / 待核实

已核实（来自厂家协议文件）：上行主题结构、params 包装、r_data 名称/数值结构、err 标记存在、字段含义与单位、id/sys_time 为 Unix 秒。

待现场或厂家核实（`verified` 置真前必须完成）：

- 真实 broker 地址、端口、TLS 与账号权限（账号存在于厂家资料，绝不写入仓库）。
- 设备在线/离线状态字段与 err 的完整语义（除 `"err":"1"` 外是否还有其他取值）。
- 各字段数值范围、字节序类问题（JSON 无字节序，但累计流量位数/溢出行为待确认）。
- 上报间隔实际配置与断网补报行为（MQTT 推送无分页，游标只记最近采样时间作断点参考，不做漏报补拉）。
- 多台设备 XXX=002..029 的编号与台账对应。

## 部署约定

- `GATE_MQTT_ENABLED` 默认 0；broker URL、客户端 ID 用 `GATE_MQTT_URL` / `GATE_MQTT_CLIENT_ID`；用户名密码只经 `GATE_CREDENTIAL_USERNAME` / `GATE_CREDENTIAL_PASSWORD` 放 `.env.local`，契约文件与仓库不保存任何凭据。
- 设备为单中心上报：正式接入需厂家把 DTU 指向我方 broker，当前 broker 地址未知。
- 采集配置（sourceId、actorId、测点映射）放私有契约文件，路径由 `GATE_CONTRACT_FILE` 指定，不入库。
- 并发防护：常驻订阅按 `gate-mqtt:<sourceId>` 取 advisory lock，重复启动返回 busy；心跳复用 `ingest` 服务名（实例 `gate-mqtt-<pid>`），与仁科拉取共用同一服务行，二者不应同时常驻。
- 回放：`worker:gate --replay 契约文件 报文信封文件`，信封 `{"topic":"...","payload":{...}}`；合成报文只能进 agri_test（`--synthetic-replay`），真实脱敏报文才可进开发库。
