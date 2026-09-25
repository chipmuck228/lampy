import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { FamilySql } from './schema';

export function openFamilySqliteDatabase(filePath: string): FamilySql {
  const native = new DatabaseSync(filePath);
  native.exec('PRAGMA journal_mode = WAL;');
  native.exec('PRAGMA busy_timeout = 0;');
  native.exec('PRAGMA foreign_keys = ON;');

  return {
    async exec(sql) {
      native.exec(sql);
    },
    async run(sql, params = []) {
      const result = native.prepare(sql).run(...(params as SQLInputValue[]));
      return { changes: Number(result.changes) };
    },
    async getFirst(sql, params = []) {
      return (native.prepare(sql).get(...(params as SQLInputValue[])) as never) ?? null;
    },
    async getAll(sql, params = []) {
      return native.prepare(sql).all(...(params as SQLInputValue[])) as never;
    },
    async close() {
      native.close();
    },
  };
}
