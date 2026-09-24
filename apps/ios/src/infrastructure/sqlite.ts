import * as SQLite from 'expo-sqlite';

import type { MomentRecord } from '../domain-adapters/moment-commands';
import type { DraftRepository, MomentRepository } from './repositories';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS moments (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    occurred_at TEXT,
    json TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY NOT NULL,
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
];

export async function openLampyDatabase(name = 'lampy.db'): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  );`);
  for (const [index, sql] of MIGRATIONS.entries()) {
    const applied = await db.getFirstAsync<{ version: number }>(
      'SELECT version FROM schema_migrations WHERE version = ?',
      index + 1,
    );
    if (!applied) {
      await db.execAsync(sql);
      await db.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        index + 1,
        new Date().toISOString(),
      );
    }
  }
  return db;
}

function parseMoment(json: string): MomentRecord {
  return JSON.parse(json) as MomentRecord;
}

export function createSqliteRepositories(db: SQLite.SQLiteDatabase): {
  moments: MomentRepository;
  drafts: DraftRepository;
} {
  return {
    moments: {
      async save(moment) {
        await db.runAsync(
          `INSERT OR REPLACE INTO moments
            (id, owner_id, lifecycle_status, recorded_at, occurred_at, json)
           VALUES (?, ?, ?, ?, ?, ?)`,
          moment.id,
          moment.ownerId,
          moment.lifecycle.status,
          moment.time.recordedAt,
          moment.time.occurredAt ?? null,
          JSON.stringify(moment),
        );
      },
      async findById(id) {
        const row = await db.getFirstAsync<{ json: string }>(
          'SELECT json FROM moments WHERE id = ?',
          id,
        );
        return row ? parseMoment(row.json) : null;
      },
      async listRecent(limit = 50) {
        const rows = await db.getAllAsync<{ json: string }>(
          `SELECT json FROM moments
           WHERE lifecycle_status = 'active'
           ORDER BY recorded_at DESC
           LIMIT ?`,
          limit,
        );
        return rows.map((row) => parseMoment(row.json));
      },
    },
    drafts: {
      async save(draft) {
        await db.execAsync('DELETE FROM drafts;');
        await db.runAsync(
          'INSERT INTO drafts (id, json, updated_at) VALUES (?, ?, ?)',
          draft.id,
          JSON.stringify(draft),
          draft.audit.updatedAt,
        );
      },
      async loadActive() {
        const row = await db.getFirstAsync<{ json: string }>(
          'SELECT json FROM drafts ORDER BY updated_at DESC LIMIT 1',
        );
        return row ? parseMoment(row.json) : null;
      },
      async clear(draftId) {
        await db.runAsync('DELETE FROM drafts WHERE id = ?', draftId);
      },
    },
  };
}
