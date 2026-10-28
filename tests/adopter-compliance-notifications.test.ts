import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import * as coverage from "../server/lib/current-rabies-coverage";

// Run: npx tsx --test tests/adopter-compliance-notifications.test.ts
// Load the real dispatcher and evidence loader, but allowlist dependencies so
// neither the real database nor any communications provider can be imported.
// The clock is module-local: tests do not mutate global time or need credentials.
const NOW = new Date("2026-10-28T12:00:00Z");
class Clock extends Date {
  constructor(value?: any) { super(value === undefined ? NOW.getTime() : value); }
  static now() { return NOW.getTime(); }
}
const day = (offset: number) => new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);
type Row = Record<string, any>;
const tenant = (extra: Row = {}) => ({
  id: "tenant-a", name: "Test Rescue", subdomain: "rescue",
  customDomain: null, adopterReminderFrequencyDays: 1, ...extra,
});
const adopter = (extra: Row = {}) => ({
  tenantId: "tenant-a", userId: "user-a", userEmail: "adopter@example.invalid",
  userName: "Test Adopter", animalId: "animal-a", animalName: "Milo",
  animalSpecies: "dog", ...extra,
});
const prefs = (extra: Row = {}) => ({
  tenantId: "tenant-a", userId: "user-a", emailNotifications: true,
  smsNotifications: true, phone: "+12025550101",
  vaccinationReminders: true, medicationReminders: true, ...extra,
});
const care = (extra: Row = {}) => ({
  tenantId: "tenant-a", animalId: "animal-a", id: "care-a",
  careName: "DHPP", careCategory: "vaccine", nextDueDate: day(-2), ...extra,
});
const medication = (extra: Row = {}) => ({
  tenantId: "tenant-a", animalId: "animal-a", id: "med-a",
  medicationName: "Daily medicine", isActive: true, nextDueDate: day(1), ...extra,
});
const history = (extra: Row = {}) => ({
  id: "log-old", tenantId: "tenant-a", userId: "user-a", animalId: "animal-a",
  itemId: "care-a", notificationType: "vaccination_overdue", channel: "email",
  sentAt: new Date(NOW.getTime() - 3600000), ...extra,
});

function harness(options: {
  tenants?: Row[]; adopters?: Row[]; preferences?: Row[]; care?: Row[];
  medications?: Row[]; confirmations?: Row[]; logs?: Row[];
  deliver?: (input: Row) => Row | Promise<Row>;
  failAudit?: boolean;
} = {}) {
  const sent: Row[] = [];
  const writes: Row[] = [];
  const logs = [...(options.logs ?? [])];
  const reads: string[] = [];
  const dialect = new PgDialect();
  const tables = new Map<any, Row[]>([
    [schema.tenants, options.tenants ?? [tenant()]],
    [schema.adopterNotificationPreferences, options.preferences ?? []],
    [schema.preventativeCareRecords, options.care ?? [care()]],
    [schema.adopterMedicationReminders, options.medications ?? []],
    [schema.adopterComplianceConfirmations, options.confirmations ?? []],
    [schema.vaccineRecords, []],
    [schema.adopterNotificationLogs, logs],
  ]);
  const columnKey = (table: any, column: string) => {
    const entry = Object.entries(orm.getTableColumns(table))
      .find(([, col]: any) => col.name === column);
    assert.ok(entry, `Unknown column ${column}`);
    return entry[0];
  };
  // Evaluate the actual generated predicates rather than returning canned rows
  // by call order. Removing a scope, status or time predicate changes results.
  function matches(table: any, row: Row, condition: any) {
    const query = dialect.sqlToQuery(condition);
    let expression = query.sql;
    expression = expression.replace(
      /"[^"]+"\."([^"]+)"\s*(=|<=|>)\s*\$(\d+)/g,
      (_, column, operator, index) => {
        let left = row[columnKey(table, column)];
        let right = query.params[Number(index) - 1];
        if (column === "sent_at" || column === "next_due_date") {
          left = left == null ? null : new Date(left).getTime();
          right = new Date(right as any).getTime();
        }
        const value = left != null && (operator === "=" ? left === right
          : operator === "<=" ? left <= right : left > right);
        return String(value);
      },
    );
    expression = expression.replace(
      /"[^"]+"\."([^"]+)" IN \(([^)]+)\)/g,
      (_, column, values) => String(
        [...values.matchAll(/'([^']+)'/g)].some(m => row[columnKey(table, column)] === m[1]),
      ),
    );
    // Fail closed if production starts using a predicate this double cannot model.
    assert.match(expression, /^[()\s truefalsand]+$/, `Unsupported SQL: ${query.sql}`);
    return !expression.includes("false");
  }
  const db = {
    select(selection?: Row) {
      let table: any;
      const query: any = {
        from(value: any) { table = value; reads.push(orm.getTableName(table)); return query; },
        innerJoin() { return query; },
        where(condition: any) {
          let rows: Row[];
          if (table === schema.users) {
            // Joined adopter lookup is fixture input; candidate eligibility is
            // covered separately. Still require the requested tenant predicate.
            const sql = dialect.sqlToQuery(condition);
            assert.match(sql.sql, /"users"\."tenant_id" = \$1/);
            rows = (options.adopters ?? [adopter()]).filter(r => r.tenantId === sql.params[0]);
          } else {
            assert.ok(tables.has(table), `Unexpected read: ${orm.getTableName(table)}`);
            rows = tables.get(table)!.filter(row => matches(table, row, condition));
            if (selection) rows = rows.map(row => Object.fromEntries(
              Object.entries(selection).map(([key, col]) => [key, row[columnKey(table, col.name)]]),
            ));
          }
          const result: any = Promise.resolve(rows);
          result.limit = (count: number) => Promise.resolve(rows.slice(0, count));
          return result;
        },
      };
      return query;
    },
    insert(table: any) {
      assert.equal(table, schema.adopterNotificationLogs);
      return { async values(row: Row) {
        if (options.failAudit) throw new Error("audit unavailable");
        writes.push({ ...row });
        logs.push({ ...row, id: `log-${logs.length}`, sentAt: new Date(NOW) });
      } };
    },
  };
  function load(path: string, dependencies: Row) {
    const code = transformSync(readFileSync(path, "utf8"), { loader: "ts", format: "cjs" }).code;
    const module = { exports: {} as any };
    new Function("require", "module", "exports", "Date", code)((name: string) => {
      assert.ok(Object.prototype.hasOwnProperty.call(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    }, module, module.exports, Clock);
    return module.exports;
  }
  const common = { "../db": { db }, "@shared/schema": schema, "drizzle-orm": orm };
  const loader = load("server/services/portal-rabies-coverage.ts", {
    ...common, "../lib/current-rabies-coverage": coverage,
  });
  const jobs = load("server/lib/adopter-compliance-notifications.ts", {
    ...common,
    "../services/portal-rabies-coverage": loader,
    "./current-rabies-coverage": coverage,
    "./app-base-url": { getAppBaseUrl: () => "https://example.invalid" },
    "./unified-comms": { async sendCommunication(input: Row) {
      sent.push(input);
      return options.deliver ? options.deliver(input)
        : { status: "delivered", messageQueueId: `queue-${input.channel}-${input.recipientUserId}` };
    } },
  });
  return { run: () => jobs.runAdopterComplianceNotifications("tenant-a"), sent, writes, reads };
}

test("missing preferences default to email only with a single-pet deep link", async () => {
  const h = harness();
  assert.deepEqual(await h.run(), {
    tenantId: "tenant-a", tenantName: "Test Rescue", emailsSent: 1, smsSent: 0, errors: [],
  });
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].recipientAddress, "adopter@example.invalid");
  assert.equal(h.sent[0].sourceType, "compliance");
  assert.equal(h.sent[0].relatedAnimalId, "animal-a");
  assert.match(h.sent[0].messageBody, /https:\/\/example.invalid\/rescue\/my-pets\/animal-a/);
  assert.deepEqual(h.writes, [{
    tenantId: "tenant-a", userId: "user-a", animalId: "animal-a",
    notificationType: "vaccination_overdue", channel: "email",
    subject: "Pet Care Reminder: DHPP",
    message: `Milo - DHPP is overdue (${day(-2)})`, itemId: "care-a",
    messageQueueId: "queue-email-user-a",
  }]);
});

for (const [name, preference, channels] of [
  ["both disabled", prefs({ emailNotifications: false, smsNotifications: false }), []],
  ["email only", prefs({ smsNotifications: false }), ["email"]],
  ["SMS only", prefs({ emailNotifications: false }), ["sms"]],
  ["both enabled", prefs(), ["email", "sms"]],
  ["SMS without a phone", prefs({ emailNotifications: false, phone: null }), []],
] as const) {
  test(`channel preferences: ${name}`, async () => {
    const h = harness({ preferences: [preference] });
    const result = await h.run();
    assert.deepEqual(result.errors, []);
    assert.deepEqual(h.sent.map(m => m.channel), channels);
    assert.equal(result.emailsSent, channels.includes("email" as never) ? 1 : 0);
    assert.equal(result.smsSent, channels.includes("sms" as never) ? 1 : 0);
    assert.deepEqual(h.writes.map(m => m.channel), channels);
    if (channels.includes("sms" as never)) {
      const sms = h.sent.find(m => m.channel === "sms")!;
      assert.equal(sms.recipientAddress, preference.phone);
      assert.equal(sms.sourceType, "reminder");
    }
  });
}

for (const vaccinationReminders of [false, true]) {
  for (const medicationReminders of [false, true]) {
    test(`category preferences: vaccines/prevention=${vaccinationReminders}, medication=${medicationReminders}`, async () => {
      const h = harness({
        preferences: [prefs({ vaccinationReminders, medicationReminders })],
        care: [care(), care({ id: "prevention", careName: "Flea prevention", careCategory: "parasite_prevention" })],
        medications: [medication()],
      });
      const result = await h.run();
      const expected = [...(vaccinationReminders ? ["care-a", "prevention"] : []),
        ...(medicationReminders ? ["med-a"] : [])];
      assert.deepEqual(result.errors, []);
      for (const channel of ["email", "sms"]) {
        assert.deepEqual(h.writes.filter(r => r.channel === channel).map(r => r.itemId), expected);
      }
      assert.equal(h.sent.length, expected.length ? 2 : 0);
    });
  }
}

test("paused tenant, missing tenant and no actionable care never dispatch or log", async () => {
  for (const options of [
    { tenants: [tenant({ adopterReminderFrequencyDays: 0 })] },
    { tenants: [] },
    { care: [], medications: [] },
    { care: [care({ nextDueDate: day(4) })], medications: [medication({ isActive: false })] },
  ]) {
    const h = harness(options);
    const result = await h.run();
    assert.deepEqual(result.errors, options.tenants?.length === 0 ? ["Tenant not found"] : []);
    assert.equal(result.emailsSent + result.smsSent, 0);
    assert.deepEqual(h.sent, []);
    assert.deepEqual(h.writes, []);
    if (options.tenants) assert.deepEqual(h.reads, ["tenants"]);
  }
});

for (const frequency of [null, 1, 7]) {
  test(`cadence ${frequency ?? "default"} suppresses recent history, permits exact cutoff and older history`, async () => {
    const days = frequency ?? 1;
    for (const offsetMs of [-1, 0, 1]) {
      const sentAt = new Date(NOW.getTime() - days * 86400000 + offsetMs);
      const h = harness({
        tenants: [tenant({ adopterReminderFrequencyDays: frequency })],
        logs: [history({ sentAt })],
      });
      const result = await h.run();
      assert.deepEqual(result.errors, []);
      assert.equal(result.emailsSent, offsetMs > 0 ? 0 : 1);
      assert.equal(h.writes.length, offsetMs > 0 ? 0 : 1);
    }
  });
}

test("cadence is tenant/user/item/type scoped and a delivered run suppresses the next run", async () => {
  const h = harness({ logs: [
    history({ tenantId: "tenant-b" }), history({ userId: "user-b" }),
    history({ itemId: "other-item" }), history({ notificationType: "vaccination_due" }),
  ] });
  assert.equal((await h.run()).emailsSent, 1);
  assert.equal((await h.run()).emailsSent, 0);
  assert.equal(h.sent.length, 1);
  assert.equal(h.writes.length, 1);
});

test("another tenant or user's preferences cannot opt this adopter out", async () => {
  const h = harness({ preferences: [
    prefs({ tenantId: "tenant-b", emailNotifications: false, smsNotifications: false }),
    prefs({ userId: "user-b", emailNotifications: false, smsNotifications: false }),
  ] });
  const result = await h.run();
  assert.deepEqual(result.errors, []);
  assert.equal(result.emailsSent, 1);
  assert.equal(result.smsSent, 0);
});

test("proof and recent history remove only their own items from a digest", async () => {
  const h = harness({
    preferences: [prefs()],
    care: [care(), care({ id: "reviewed", careName: "Bordetella" }),
      care({ id: "actionable", careName: "Flea prevention", careCategory: "parasite_prevention" })],
    confirmations: [{
      tenantId: "tenant-a", animalId: "animal-a",
      preventativeCareRecordId: "reviewed", status: "pending_review",
    }],
    logs: [history()],
  });
  const result = await h.run();
  assert.deepEqual(result.errors, []);
  assert.equal(result.emailsSent, 1);
  assert.equal(result.smsSent, 1);
  assert.deepEqual(h.writes.map(r => r.itemId), ["actionable", "actionable"]);
  assert.match(h.sent[0].messageBody, /Flea prevention/);
  assert.doesNotMatch(h.sent[0].messageBody, /DHPP|Bordetella/);
  assert.equal(h.sent[0].subject, "Pet Care Reminder: 1 item need attention");
});

test("pending/approved proof suppresses both channels; rejected or unrelated proof does not", async () => {
  for (const [extra, suppressed] of [
    [{ status: "pending_review" }, true], [{ status: "approved" }, true],
    [{ status: "rejected" }, false],
    [{ status: "pending_review", tenantId: "tenant-b" }, false],
    [{ status: "pending_review", animalId: "animal-b" }, false],
    [{ status: "pending_review", preventativeCareRecordId: "other-care" }, false],
  ] as const) {
    const h = harness({
      preferences: [prefs()],
      confirmations: [{ tenantId: "tenant-a", animalId: "animal-a", preventativeCareRecordId: "care-a", ...extra }],
    });
    const result = await h.run();
    assert.deepEqual(result.errors, []);
    assert.equal(h.sent.length, suppressed ? 0 : 2);
    assert.equal(h.writes.length, suppressed ? 0 : 2);
  }
});

test("multi-pet digest sends once per channel, counts messages not items, and audits each item", async () => {
  const h = harness({
    tenants: [tenant({ customDomain: "rescue.example.invalid" })],
    adopters: [adopter(), adopter({ animalId: "animal-b", animalName: "Luna" })],
    preferences: [prefs()],
    care: [care(), care({ id: "care-b", animalId: "animal-b", nextDueDate: day(3), careName: "Bordetella" })],
    medications: [medication()],
  });
  const result = await h.run();
  assert.deepEqual(result.errors, []);
  assert.equal(result.emailsSent, 1);
  assert.equal(result.smsSent, 1);
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[0].subject, "Pet Care Reminder: 3 items need attention");
  for (const name of ["Milo", "Luna", "DHPP", "Bordetella", "Daily medicine"]) {
    assert.ok(h.sent[0].messageBody.includes(name));
  }
  assert.equal(h.sent[1].messageBody,
    "Pet Care Reminder: 1 overdue item, 2 items due soon. View details: https://rescue.example.invalid/my-pets");
  for (const message of h.sent) {
    assert.equal(message.relatedAnimalId, null);
    assert.equal(message.recipientUserId, "user-a");
    assert.match(message.messageBody, /https:\/\/rescue.example.invalid\/my-pets/);
    assert.doesNotMatch(message.messageBody, /\/my-pets\/animal-/);
  }
  assert.equal(h.writes.length, 6);
  for (const channel of ["email", "sms"]) {
    assert.deepEqual(h.writes.filter(r => r.channel === channel).map(r => [
      r.tenantId, r.userId, r.animalId, r.itemId, r.notificationType, r.messageQueueId,
    ]), [
      ["tenant-a", "user-a", "animal-a", "care-a", "vaccination_overdue", `queue-${channel}-user-a`],
      ["tenant-a", "user-a", "animal-a", "med-a", "medication_due", `queue-${channel}-user-a`],
      ["tenant-a", "user-a", "animal-b", "care-b", "vaccination_due", `queue-${channel}-user-a`],
    ]);
  }
});

for (const channel of ["email", "sms"]) {
  for (const failure of ["failed", "queued", "throw"]) {
    test(`${channel} ${failure} does not count/log success or block the other channel/adopter`, async () => {
      const h = harness({
        adopters: [adopter(), adopter({ userId: "user-b", userEmail: "second@example.invalid", animalId: "animal-b" })],
        preferences: [prefs(), prefs({ userId: "user-b", phone: "+12025550102" })],
        care: [care(), care({ id: "care-b", animalId: "animal-b" })],
        deliver(input) {
          if (input.channel === channel && input.recipientUserId === "user-a") {
            if (failure === "throw") throw new Error("provider unavailable");
            return { status: failure, error: "provider unavailable" };
          }
          return { status: "delivered", messageQueueId: `queue-${input.channel}-${input.recipientUserId}` };
        },
      });
      const result = await h.run();
      assert.equal(result.emailsSent, channel === "email" ? 1 : 2);
      assert.equal(result.smsSent, channel === "sms" ? 1 : 2);
      assert.deepEqual(result.errors, [
        `${channel === "email" ? "Email" : "SMS"} ${failure === "throw" ? "error" : "failed"} for ${channel === "email" ? "adopter@example.invalid" : "+12025550101"}: provider unavailable`,
      ]);
      assert.equal(h.sent.length, 4);
      assert.equal(h.writes.length, 3);
      assert.equal(h.writes.some(r => r.userId === "user-a" && r.channel === channel), false);
    });
  }
}

test("fully failed delivery remains eligible for retry and creates no audit success", async () => {
  const h = harness({ preferences: [prefs()], deliver: () => ({ status: "failed", error: "unavailable" }) });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await h.run();
    assert.equal(result.emailsSent + result.smsSent, 0);
    assert.equal(result.errors.length, 2);
  }
  assert.equal(h.sent.length, 4);
  assert.deepEqual(h.writes, []);
});

test("audit write errors are surfaced and do not prevent attempting the other channel", async () => {
  const h = harness({ preferences: [prefs()], failAudit: true });
  const result = await h.run();
  assert.deepEqual(result.errors, [
    "Email error for adopter@example.invalid: audit unavailable",
    "SMS error for +12025550101: audit unavailable",
  ]);
  assert.equal(h.sent.length, 2);
  // Delivery happened even though the audit could not be persisted.
  assert.equal(result.emailsSent, 1);
  assert.equal(result.smsSent, 1);
  assert.deepEqual(h.writes, []);
});
