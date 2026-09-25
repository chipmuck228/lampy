export type FamilySql = {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  getFirst<T>(sql: string, params?: unknown[]): Promise<T | null>;
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
};

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS family_accounts (
    user_id TEXT PRIMARY KEY NOT NULL,
    apple_subject TEXT NOT NULL UNIQUE,
    email TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS family_sessions (
    token TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS family_families (
    family_id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS family_memberships (
    membership_id TEXT PRIMARY KEY NOT NULL,
    family_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    joined_at TEXT NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS family_memberships_one_active_per_user
    ON family_memberships(user_id) WHERE status = 'active';`,
  `CREATE TABLE IF NOT EXISTS family_invitations (
    invitation_id TEXT PRIMARY KEY NOT NULL,
    family_id TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_by_user_id TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS family_idempotency (
    user_id TEXT NOT NULL,
    command TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    status INTEGER NOT NULL,
    body_json TEXT NOT NULL,
    PRIMARY KEY (user_id, command, idempotency_key)
  );`,
  `CREATE TABLE IF NOT EXISTS family_media_objects (
    object_id TEXT PRIMARY KEY NOT NULL,
    owner_user_id TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_length INTEGER NOT NULL,
    content_sha256 TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS family_media_one_hash_per_owner
    ON family_media_objects(owner_user_id, content_sha256);`,
];

export async function applyFamilyApiSchema(db: FamilySql): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS family_schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  );`);
  for (const [index, sql] of MIGRATIONS.entries()) {
    const applied = await db.getFirst<{ version: number }>(
      'SELECT version FROM family_schema_migrations WHERE version = ?',
      [index + 1],
    );
    if (!applied) {
      await db.exec(sql);
      await db.run('INSERT INTO family_schema_migrations (version, applied_at) VALUES (?, ?)', [
        index + 1,
        new Date().toISOString(),
      ]);
    }
  }
}
