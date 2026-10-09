import type { PoolClient } from 'pg';
import type { Actor } from '../../platform/types';
import { AppError } from '../../platform/error';
import { choice, optionalText } from '../../platform/validation';
import { uuid } from '../identity/common';
import { scope } from '../field/common';
import { request, type Body } from '../inventory/common';

export const gateProtocols = ['unknown', 'mqtt', 'tcp_rtu', 'modbus_tcp'] as const;
export const gateTcpRoles = ['unknown', 'device_client', 'device_server'] as const;
export type GateProtocol = typeof gateProtocols[number];

export interface GateDeployment {
  id: string;
  device_id: string;
  version: number;
  manufacturer: string | null;
  controller_model: string | null;
  firmware: string | null;
  installation_ref: string | null;
  protocol: GateProtocol;
  protocol_status: 'pending' | 'received';
  protocol_ref: string | null;
  tcp_role: typeof gateTcpRoles[number];
  network_ref: string | null;
  message_ref: string | null;
  feedback_ref: string | null;
  created_at: string;
}

// Deployment records describe collected material; saving never establishes a device connection.
export async function saveGateDeployment(c: PoolClient, actor: Actor, input: Body) {
  uuid(input.deviceId);
  const device = (await c.query('SELECT id,object_id,kind FROM devices WHERE id=$1', [input.deviceId])).rows[0];
  if (!device) throw new AppError(404, 'DEVICE_NOT_FOUND', '设备不存在');
  await scope(c, actor, device.object_id, 'read');
  await scope(c, actor, device.object_id, 'configure');
  if (device.kind !== 'physical') throw new AppError(422, 'GATE_PHYSICAL_DEVICE_REQUIRED', '闸门部署资料须关联已登记的物理设备');

  return request(c, actor, input, 'control.gate-deployment', device.object_id, async () => {
    const protocol = choice(input.protocol, gateProtocols, '通信方式');
    const status = choice(input.protocolStatus, ['pending', 'received'] as const, '协议资料状态');
    const tcpRole = choice(input.tcpRole ?? 'unknown', gateTcpRoles, 'TCP连接方向');
    const model = optionalText(input.controllerModel, '控制器型号', 200);
    const firmware = optionalText(input.firmware, '固件版本', 200);
    const protocolRef = optionalText(input.protocolRef, '协议文档或待补说明', 2000);
    if (status === 'received' && (protocol === 'unknown' || !model || !firmware || !protocolRef)) {
      throw new AppError(422, 'GATE_PROTOCOL_DOCUMENT_REQUIRED', '登记已收到协议文档时，须填写通信方式、控制器型号、固件版本和文档依据');
    }
    if (protocol !== 'tcp_rtu' && protocol !== 'modbus_tcp' && tcpRole !== 'unknown') {
      throw new AppError(422, 'GATE_TCP_ROLE_SCOPE', 'TCP连接方向只适用于TCP通信方式');
    }
    await c.query('SELECT id FROM devices WHERE id=$1 FOR UPDATE', [device.id]);
    const version = Number((await c.query('SELECT COALESCE(max(version),0)+1 AS v FROM gate_deployments WHERE device_id=$1', [device.id])).rows[0].v);
    return (await c.query(`INSERT INTO gate_deployments
      (object_id,device_id,version,manufacturer,controller_model,firmware,installation_ref,protocol,protocol_status,protocol_ref,tcp_role,network_ref,message_ref,feedback_ref,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`, [
      device.object_id, device.id, version,
      optionalText(input.manufacturer, '厂家', 200), model, firmware,
      optionalText(input.installationRef, '安装位置与编号依据', 2000), protocol, status, protocolRef, tcpRole,
      optionalText(input.networkRef, '网络接入说明', 2000),
      optionalText(input.messageRef, '寄存器或消息格式依据', 2000),
      optionalText(input.feedbackRef, '状态反馈依据', 2000), actor.id,
    ])).rows[0];
  });
}
