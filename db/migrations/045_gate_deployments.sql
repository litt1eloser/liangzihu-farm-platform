CREATE TABLE gate_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES objects(id),
  device_id uuid NOT NULL REFERENCES devices(id),
  version integer NOT NULL CHECK (version > 0),
  manufacturer text,
  controller_model text,
  firmware text,
  installation_ref text,
  protocol text NOT NULL CHECK (protocol IN ('unknown','mqtt','tcp_rtu','modbus_tcp')),
  protocol_status text NOT NULL CHECK (protocol_status IN ('pending','received')),
  protocol_ref text,
  tcp_role text NOT NULL CHECK (tcp_role IN ('unknown','device_client','device_server')),
  network_ref text,
  message_ref text,
  feedback_ref text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, version),
  CHECK (protocol_status <> 'received' OR (
    protocol <> 'unknown' AND controller_model IS NOT NULL AND firmware IS NOT NULL AND protocol_ref IS NOT NULL
  ))
);
CREATE INDEX gate_deployments_object ON gate_deployments(object_id, created_at DESC);
CREATE TRIGGER immutable_gate_deployments BEFORE UPDATE OR DELETE ON gate_deployments
  FOR EACH ROW EXECUTE FUNCTION preserve_measurement();
