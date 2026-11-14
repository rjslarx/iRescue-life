import type { SendResult } from '../lib/twilio-service';

type Query = (text: string, values: any[]) => Promise<{ rows: any[] }>;
type Operation = { message: string; results: SendResult[]; complete: boolean };

export class BroadcastRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * A committed INSERT owns the entire operation, not an in-memory lock or an
 * open transaction around SMS. Never reclaim it: a crashed worker may already
 * have handed a message to Twilio. Unknown outcomes must remain non-retryable.
 */
export async function runTransportBroadcast(
  query: Query,
  input: { tenantId: string; transportId: string; operationKey: string; message: string },
  getRecipients: () => Promise<string[]>,
  send: (number: string) => Promise<SendResult>,
) {
  const scope = [input.tenantId, input.transportId, input.operationKey];
  const read = async (): Promise<Operation | undefined> => (await query(
    `SELECT message, results, complete FROM transport_sms_operations
     WHERE tenant_id = $1 AND transport_id = $2 AND operation_key = $3`, scope,
  )).rows[0];
  const response = (operation: Operation) => {
    if (operation.message !== input.message) {
      throw new BroadcastRequestError(409, 'This operation key was already used for a different message.');
    }
    return {
      success: true,
      operationKey: input.operationKey,
      complete: operation.complete,
      sent: operation.results.filter(r => r.status === 'sent').length,
      failed: operation.results.filter(r => r.status === 'failed' && !r.uncertain).length,
      uncertain: operation.results.filter(r => r.uncertain).length,
      results: operation.results,
    };
  };
  const existing = await read();
  if (existing) return response(existing);

  const recipients = Array.from(new Map((await getRecipients()).map(number => {
    const digits = number.replace(/\D/g, '');
    return [digits.length === 10 ? `1${digits}` : digits, number];
  })).values());
  if (!recipients.length) throw new BroadcastRequestError(400, 'No SMS subscribers for this transport');
  const results: SendResult[] = recipients.map(number => ({
    number, status: 'failed', uncertain: true,
    error: 'Delivery is pending or unknown. This operation will not resend it.',
  }));
  const claimed = await query(
    `INSERT INTO transport_sms_operations (tenant_id, transport_id, operation_key, message, results)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (tenant_id, transport_id, operation_key) DO NOTHING RETURNING operation_key`,
    [...scope, input.message, JSON.stringify(results)],
  );
  if (!claimed.rows.length) return response((await read())!);

  for (let index = 0; index < recipients.length; index++) {
    try {
      results[index] = await send(recipients[index]);
    } catch (error) {
      results[index] = {
        number: recipients[index], status: 'failed', uncertain: true,
        error: 'Delivery could not be confirmed. This operation will not resend it.',
      };
    }
    // Fail closed if persistence fails after provider acceptance. The committed
    // unknown placeholder survives, and subsequent recipients are not attempted.
    await query(
      `UPDATE transport_sms_operations SET results = jsonb_set(results, ARRAY[$4::text], $5::jsonb)
       WHERE tenant_id = $1 AND transport_id = $2 AND operation_key = $3`,
      [...scope, String(index), JSON.stringify(results[index])],
    );
  }
  await query(
    `UPDATE transport_sms_operations SET complete = true
     WHERE tenant_id = $1 AND transport_id = $2 AND operation_key = $3`, scope,
  );
  return response({ message: input.message, results, complete: true });
}
