import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { SQL } from "drizzle-orm";
import * as schema from "../../shared/schema";

// Build disposable tables from the checked-in model, never copy application data.
export async function settlementDatabase() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL required for opted-in PostgreSQL tests");
  const namespace = `expense_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, max: 5,
    options: `-c search_path=${namespace} -c statement_timeout=8000 -c lock_timeout=6000`,
  });
  const dialect = new PgDialect();
  const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const literal = (v: any): string => {
    if (v instanceof SQL) {
      const q = dialect.sqlToQuery(v);
      assert.equal(q.params.length, 0);
      return q.sql;
    }
    if (typeof v === "boolean" || typeof v === "number") return String(v);
    return `'${(typeof v === "string" ? v : JSON.stringify(v)).replaceAll("'", "''")}'`;
  };
  async function close() {
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`); }
    finally { await admin.end(); }
  }
  try {
    await admin.query(`CREATE SCHEMA ${namespace}`);
    for (const table of [schema.tenants, schema.donors, schema.payments, schema.donations,
      schema.contacts, schema.expenseCampaigns, schema.campaignMatchPools,
      schema.adoptionCheckoutSessions, schema.shopOrders]) {
      const config = getTableConfig(table);
      const columns = config.columns.map(c => `${quote(c.name)} ${c.getSQLType()}${
        c.primary ? " PRIMARY KEY" : ""}${c.notNull ? " NOT NULL" : ""}${
        c.default === undefined ? "" : ` DEFAULT ${literal(c.default)}`}`);
      for (const unique of config.uniqueConstraints) {
        columns.push(`CONSTRAINT ${quote(unique.getName())} UNIQUE (${unique.columns.map(c => quote(c.name)).join(",")})`);
      }
      await pool.query(`CREATE TABLE ${quote(config.name)} (${columns.join(",")})`);
      for (const index of config.indexes.filter(i => i.config.unique)) {
        const { name, columns, where } = index.config;
        // These fixture tables use plain column indexes, not expression indexes.
        const names = columns.map(c => { assert.ok("name" in c); return quote(c.name!); });
        const predicate = where ? dialect.sqlToQuery(where).sql.replaceAll(`"${config.name}".`, "") : "";
        await pool.query(`CREATE UNIQUE INDEX ${quote(name!)} ON ${quote(config.name)} (${names.join(",")})${predicate ? ` WHERE ${predicate}` : ""}`);
      }
    }
    return { pool, db: drizzle(pool), close };
  } catch (error) {
    await close();
    throw error;
  }
}

export function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
