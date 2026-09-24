export type SqlDatabase = {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<void>;
  getFirst<T>(sql: string, params?: unknown[]): Promise<T | null>;
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>;
  withTransaction(work: () => Promise<void>): Promise<void>;
  close(): Promise<void>;
};

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
  `CREATE TABLE IF NOT EXISTS record_quarantine (
    fingerprint TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL,
    reason TEXT NOT NULL,
    errors_json TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    type TEXT NOT NULL,
    json TEXT NOT NULL
  );`,
];

export async function applyLampySchema(db: SqlDatabase): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  );`);
  for (const [index, sql] of MIGRATIONS.entries()) {
    const applied = await db.getFirst<{ version: number }>(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [index + 1],
    );
    if (!applied) {
      await db.exec(sql);
      await db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
        index + 1,
        new Date().toISOString(),
      ]);
    }
  }
}
