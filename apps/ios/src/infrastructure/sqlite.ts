import * as SQLite from 'expo-sqlite';

import { createSqliteRepositories } from './sqlite-repositories';
import { applyLampySchema, type SqlDatabase } from './sql';

function wrapExpoDatabase(db: SQLite.SQLiteDatabase): SqlDatabase {
  return {
    exec: (sql) => db.execAsync(sql),
    async run(sql, params = []) {
      await db.runAsync(sql, ...(params as SQLite.SQLiteBindValue[]));
    },
    async getFirst(sql, params = []) {
      return (await db.getFirstAsync(sql, ...(params as SQLite.SQLiteBindValue[]))) ?? null;
    },
    getAll: (sql, params = []) => db.getAllAsync(sql, ...(params as SQLite.SQLiteBindValue[])),
    withTransaction: (work) => db.withTransactionAsync(work),
    close: () => db.closeAsync(),
  };
}

export async function openLampyDatabase(name = 'lampy.db'): Promise<SqlDatabase> {
  const native = await SQLite.openDatabaseAsync(name);
  const db = wrapExpoDatabase(native);
  await applyLampySchema(db);
  return db;
}

export { createSqliteRepositories };
