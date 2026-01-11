import * as schema from '@shared/schema';

export function getSchemaTable<K extends keyof typeof schema>(tableName: K): typeof schema[K] {
  const table = schema[tableName];
  if (!table) {
    throw new Error(`Schema table '${String(tableName)}' not found. This indicates a code error.`);
  }
  return table;
}

export const safeSchema = schema;
