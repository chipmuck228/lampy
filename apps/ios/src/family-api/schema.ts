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
  `CREATE TABLE IF NOT EXISTS family_shares (
    share_id TEXT PRIMARY KEY NOT NULL,
    family_id TEXT NOT NULL,
    author_user_id TEXT NOT NULL,
    source_moment_id TEXT NOT NULL,
    source_revision INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    audience_json TEXT NOT NULL,
    shared_at TEXT NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS family_shares_one_revision_per_author
    ON family_shares(family_id, author_user_id, source_moment_id, source_revision);`,
  `ALTER TABLE family_shares ADD COLUMN status TEXT NOT NULL DEFAULT 'active';`,
  `ALTER TABLE family_shares ADD COLUMN revoked_at TEXT;`,
  `CREATE TABLE family_accounts_v2 (
    user_id TEXT PRIMARY KEY NOT NULL,
    apple_subject TEXT UNIQUE,
    email TEXT,
    created_at TEXT NOT NULL
  );
  INSERT INTO family_accounts_v2 (user_id, apple_subject, email, created_at)
    SELECT user_id, apple_subject, email, created_at FROM family_accounts;
  DROP TABLE family_accounts;
  ALTER TABLE family_accounts_v2 RENAME TO family_accounts;`,
  `CREATE TABLE IF NOT EXISTS family_test_credentials (
    credential_id TEXT PRIMARY KEY NOT NULL,
    login_normalized TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    disabled_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS family_auth_rate_limits (
    bucket TEXT PRIMARY KEY NOT NULL,
    window_started_at TEXT NOT NULL,
    hit_count INTEGER NOT NULL
  );`,
  `ALTER TABLE family_families ADD COLUMN name TEXT NOT NULL DEFAULT '';`,
  `DROP INDEX family_memberships_one_active_per_user;
   CREATE UNIQUE INDEX family_memberships_one_active_per_pair
     ON family_memberships(user_id, family_id) WHERE status = 'active';
   CREATE UNIQUE INDEX family_memberships_one_active_creator
     ON family_memberships(family_id) WHERE status = 'active' AND role = 'creator';`,
  `CREATE TRIGGER family_memberships_limit_insert BEFORE INSERT ON family_memberships
   WHEN NEW.status = 'active' AND (SELECT COUNT(*) FROM family_memberships m
     JOIN family_families f ON f.family_id = m.family_id
     WHERE m.user_id = NEW.user_id AND m.status = 'active' AND f.status = 'active') >= 10
   BEGIN SELECT RAISE(ABORT, 'family_limit_reached'); END;
   CREATE TRIGGER family_memberships_limit_update BEFORE UPDATE OF status,user_id,family_id ON family_memberships
   WHEN NEW.status = 'active' AND (SELECT COUNT(*) FROM family_memberships m
     JOIN family_families f ON f.family_id = m.family_id
     WHERE m.user_id = NEW.user_id AND m.membership_id != OLD.membership_id
       AND m.status = 'active' AND f.status = 'active') >= 10
   BEGIN SELECT RAISE(ABORT, 'family_limit_reached'); END;`,
  `CREATE TABLE family_invite_links (
    invitation_id TEXT PRIMARY KEY NOT NULL, family_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('pending','accepted','revoked','expired')),
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, accepted_by_user_id TEXT
  ); CREATE INDEX family_invite_links_family ON family_invite_links(family_id);`,
  `ALTER TABLE family_families ADD COLUMN history_policy TEXT NOT NULL DEFAULT 'legacy' CHECK(history_policy IN ('legacy','family-history-v2'));
   ALTER TABLE family_families ADD COLUMN history_confirmed_at TEXT;
   ALTER TABLE family_families ADD COLUMN history_confirmed_by TEXT;`,
];

export const TEST_ACCOUNT_REQUIRED_SCHEMA_VERSIONS = [14, 15, 16] as const;

export async function applyFamilyApiSchema(db: FamilySql, options?: { upTo?: number }): Promise<void> {
  const last = options?.upTo ?? MIGRATIONS.length;
  await db.exec(`CREATE TABLE IF NOT EXISTS family_schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  );`);
  for (const [index, sql] of MIGRATIONS.entries()) {
    const version = index + 1;
    if (version > last) break;
    const applied = await db.getFirst<{ version: number }>(
      'SELECT version FROM family_schema_migrations WHERE version = ?',
      [version],
    );
    if (!applied) {
      // New multi-statement migrations must not leave half-replaced constraints.
      const atomic = version >= 17;
      if (atomic) await db.exec('BEGIN IMMEDIATE');
      try {
        await db.exec(sql);
        await db.run('INSERT INTO family_schema_migrations (version, applied_at) VALUES (?, ?)', [
          version,
          new Date().toISOString(),
        ]);
        if (atomic) await db.exec('COMMIT');
      } catch (error) {
        if (atomic) await db.exec('ROLLBACK');
        throw error;
      }
    }
  }
}

export async function assertFamilyTestAccountSchemaReady(db: FamilySql): Promise<void> {
  const table = await db.getFirst<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'family_schema_migrations'",
  );
  if (!table) {
    throw missingTestAccountSchemaError();
  }
  const rows = await db.getAll<{ version: number }>(
    'SELECT version FROM family_schema_migrations WHERE version IN (14, 15, 16)',
  );
  const have = new Set(rows.map((row) => row.version));
  if (TEST_ACCOUNT_REQUIRED_SCHEMA_VERSIONS.some((version) => !have.has(version))) {
    throw missingTestAccountSchemaError();
  }
}

function missingTestAccountSchemaError() {
  return new Error(
    'This database is missing family-api migrations 14–16. Run npm run family-api:migrate on this file first. The test-account CLI does not apply schema changes.',
  );
}
