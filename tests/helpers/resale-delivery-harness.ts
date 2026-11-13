import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import twilio from "twilio";

export const deliveryId = "11111111-1111-4111-8111-111111111111";
export const tenantId = "rescue-a";
export const sid = "SM" + "1".repeat(32);
export const accountSid = "AC" + "1".repeat(32);
export const token = "fake-delivery-test-token";
const baseUrl = "https://rescue.example";

// Bundle the real services, replacing only I/O boundaries. Neither server/db
// nor the outbound Twilio service is ever imported into the test process.
export async function compileDeliveryServices() {
  const mocks: Record<string, string> = {
    "../db": "export const pool=globalThis.fixture.pool; export const db=globalThis.fixture.db;",
    "../lib/twilio-service": "export const sendSms=()=>{throw Error('Live SMS forbidden')}; export const getTwilioConfigForTenant=(id)=>globalThis.fixture.config(id);",
    "../lib/app-base-url": `export const getAppBaseUrl=()=>${JSON.stringify(baseUrl)};`,
    "@shared/schema": "export const smsMessageLogs={tenantId:'tenantId',twilioMessageSid:'twilioMessageSid',status:'status'};",
    "drizzle-orm": "export const eq=(column,value)=>({op:'eq',column,value}); export const ne=(column,value)=>({op:'ne',column,value}); export const and=(...terms)=>({terms});",
    "twilio": "export default {validateRequest:(...args)=>globalThis.fixture.validate(...args)};",
  };
  const result = await build({
    stdin: {
      contents: `export * from './resale-delivery'; export * from './twilio-delivery-callback';`,
      resolveDir: `${process.cwd()}/server/services`, loader: "ts",
    },
    bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{
      name: "delivery-test-boundaries",
      setup(b) {
        b.onResolve({ filter: /.*/ }, args =>
          args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
        b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
      },
    }],
  });
  return result.outputFiles[0].text;
}

export function deliveryFixture(code: string) {
  const delivery = {
    id: deliveryId, tenant_id: tenantId, provider_sid: sid as string | null,
    status: "unknown", error_code: null as string | null, order_id: "order-a", recipient: "buyer",
  };
  const order = { id: "order-a", tenant_id: tenantId, data: { buyerNotice: "unknown", donorNotice: "sent" } };
  const logs = [
    { tenantId, twilioMessageSid: sid, status: "sent" },
    { tenantId: "rescue-b", twilioMessageSid: sid, status: "sent" },
    { tenantId, twilioMessageSid: "SM-other", status: "sent" },
  ];
  const queries: string[] = [], configLookups: string[] = [], unexpected: string[] = [];
  let releases = 0, logWrites = 0;
  async function query(raw: string, p: any[] = []) {
    const sql = raw.replace(/\s+/g, " ").trim();
    queries.push(sql);
    const rows = (values: any[] = []) => ({ rows: values });
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return rows();
    if (sql === "SELECT tenant_id FROM rescue_resale_deliveries WHERE id=$1")
      return rows(delivery.id === p[0] ? [{ tenant_id: delivery.tenant_id }] : []);
    if (sql === "SELECT * FROM rescue_resale_deliveries WHERE id=$1 AND tenant_id=$2 FOR UPDATE")
      return rows(delivery.id === p[0] && delivery.tenant_id === p[1] ? [{ ...delivery }] : []);
    if (sql.startsWith("UPDATE rescue_resale_deliveries SET provider_sid=$2,status=$3,error_code=$4")) {
      assert.ok(sql.endsWith("WHERE id=$1"));
      if (delivery.id === p[0]) Object.assign(delivery, { provider_sid: p[1], status: p[2], error_code: p[3] });
      return rows();
    }
    if (sql.startsWith("UPDATE rescue_resale_orders SET data=jsonb_set")) {
      assert.ok(sql.endsWith("WHERE id=$1 AND tenant_id=$4"));
      if (order.id === p[0] && order.tenant_id === p[3]) order.data[p[1] as keyof typeof order.data] = p[2];
      return rows();
    }
    unexpected.push(sql);
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  const fixture = {
    validate: twilio.validateRequest,
    config(id: string) {
      configLookups.push(id);
      return id === tenantId ? { accountSid, authToken: token } : null;
    },
    pool: { query, async connect() { return { query, release() { releases++; } }; } },
    db: {
      update() { return { set(values: { status: string }) { return { async where(predicate: any) {
        logWrites++;
        assert.equal(predicate.terms.length, 3);
        for (const row of logs) {
          if (predicate.terms.every((p: any) => p.op === "eq"
            ? row[p.column as keyof typeof row] === p.value
            : row[p.column as keyof typeof row] !== p.value)) Object.assign(row, values);
        }
      } }; } }; },
    },
  };
  const module = { exports: {} as any };
  runInNewContext(code, {
    module, exports: module.exports, fixture, URL,
    require(name: string) {
      // sendResaleSms is bundled but these tests never invoke a transport.
      if (name === "node:crypto") return { randomUUID() { throw new Error("Unexpected outbound send"); } };
      throw new Error(`Unmocked import: ${name}`);
    },
  });
  async function callback(status: string, options: {
    signingToken?: string; signature?: string; noSignature?: boolean;
    signPath?: string; id?: string; body?: Record<string, string>;
  } = {}) {
    const id = options.id ?? deliveryId;
    const path = `/api/webhooks/twilio/status?resaleDelivery=${id}`;
    const body = { MessageSid: sid, MessageStatus: status, AccountSid: accountSid, ...options.body };
    const signature = options.noSignature ? undefined : options.signature ??
      twilio.getExpectedTwilioSignature(options.signingToken ?? token, new URL(options.signPath ?? path, baseUrl).toString(), body);
    const response = { status: 200, body: "", type: "" };
    const req = { body, query: { resaleDelivery: id }, originalUrl: path, get: () => signature };
    const res = {
      status(n: number) { response.status = n; return this; },
      sendStatus(n: number) { response.status = n; return this; },
      type(t: string) { response.type = t; return this; },
      send(value: string) { response.body = value; return this; },
    };
    await module.exports.twilioDeliveryCallback(req, res);
    assert.deepEqual(unexpected, []);
    return response;
  }
  return {
    delivery, order, logs, queries, configLookups, callback,
    record: module.exports.recordResaleDelivery as (tenant: string, id: string, sid: string, status: string, error?: string) => Promise<void>,
    get releases() { return releases; }, get logWrites() { return logWrites; },
  };
}
