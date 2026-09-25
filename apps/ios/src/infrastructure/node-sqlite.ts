import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { applyLampySchema, type SqlDatabase } from './sql';

export function openNodeSqliteDatabase(filePath: string): SqlDatabase {
  const native = new DatabaseSync(filePath);

  const db: SqlDatabase = {
    async exec(sql) {
      native.exec(sql);
    },
    async run(sql, params = []) {
      native.prepare(sql).run(...(params as SQLInputValue[]));
    },
    async getFirst(sql, params = []) {
      return (native.prepare(sql).get(...(params as SQLInputValue[])) as never) ?? null;
    },
    async getAll(sql, params = []) {
      return native.prepare(sql).all(...(params as SQLInputValue[])) as never;
    },
    async withTransaction(work) {
      native.exec('BEGIN');
      try {
        await work();
        native.exec('COMMIT');
      } catch (error) {
        native.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      native.close();
    },
  };

  return db;
}

export async function openPreparedNodeSqliteDatabase(filePath: string): Promise<SqlDatabase> {
  const db = openNodeSqliteDatabase(filePath);
  await applyLampySchema(db);
  return db;
}
