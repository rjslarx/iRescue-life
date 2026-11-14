import { pool } from "../db";

// Read the same durable operations that enforce submission idempotency.
// Never infer delivery from a saved provider-acceptance result.
export async function getTransportBroadcastHistory(tenantId: string, transportId: string, offset: number) {
  const { rows } = await pool.query(
    `SELECT operation_key AS id, message, created_at AS "createdAt", complete, results
     FROM transport_sms_operations WHERE tenant_id=$1 AND transport_id=$2
     ORDER BY created_at DESC, operation_key DESC LIMIT 21 OFFSET $3`,
    [tenantId, transportId, offset],
  );
  return {
    attempts: rows.slice(0, 20),
    nextOffset: rows.length > 20 ? offset + 20 : null,
  };
}
