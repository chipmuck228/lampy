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
  `CREATE INDEX IF NOT EXISTS moments_active_occurred_at
    ON moments (lifecycle_status, occurred_at);`,
  `CREATE TABLE IF NOT EXISTS family_pending_operations (
    user_id TEXT NOT NULL,
    command TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    param_family_id TEXT,
    PRIMARY KEY (user_id, command, operation_id)
  );`,
  `CREATE TABLE IF NOT EXISTS family_received_shares (
    user_id TEXT NOT NULL,
    family_id TEXT NOT NULL,
    share_id TEXT NOT NULL,
    snapshot_revision INTEGER NOT NULL,
    author_user_id TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    shared_at TEXT NOT NULL,
    receive_status TEXT NOT NULL,
    expected_media_count INTEGER NOT NULL,
    PRIMARY KEY (user_id, family_id, share_id)
  );`,
  `CREATE TABLE IF NOT EXISTS family_received_media (
    user_id TEXT NOT NULL,
    family_id TEXT NOT NULL,
    share_id TEXT NOT NULL,
    object_id TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_length INTEGER NOT NULL,
    content_sha256 TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (user_id, family_id, share_id, object_id)
  );`,
  `CREATE TABLE IF NOT EXISTS family_receive_pending_cleanup (
    prefix TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL
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
