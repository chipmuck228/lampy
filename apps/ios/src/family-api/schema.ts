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
  `CREATE TABLE family_creator_transfers (
    transfer_id TEXT PRIMARY KEY NOT NULL, family_id TEXT NOT NULL, request_id TEXT NOT NULL,
    from_user_id TEXT NOT NULL, to_user_id TEXT NOT NULL, from_membership_id TEXT NOT NULL, to_membership_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','accepted','cancelled','invalid')),
    revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(family_id, from_user_id, request_id)
  ); CREATE UNIQUE INDEX family_creator_transfers_one_pending ON family_creator_transfers(family_id) WHERE status = 'pending';`,
  `ALTER TABLE family_families ADD COLUMN dissolved_at TEXT;
   ALTER TABLE family_families ADD COLUMN cleanup_deadline TEXT;
   ALTER TABLE family_families ADD COLUMN dissolved_by TEXT;
   ALTER TABLE family_families ADD COLUMN cleanup_time_estimated INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE family_families ADD COLUMN snapshots_purged_at TEXT;
   ALTER TABLE family_families ADD COLUMN cleaned_at TEXT;
   ALTER TABLE family_families ADD COLUMN cleanup_attempts INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE family_families ADD COLUMN cleanup_error TEXT;
   CREATE TABLE family_media_cleanup (
     storage_key TEXT PRIMARY KEY NOT NULL, object_id TEXT NOT NULL, family_id TEXT NOT NULL,
     completed_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
   );
   CREATE TABLE family_media_cleanup_families (
     storage_key TEXT NOT NULL, family_id TEXT NOT NULL, PRIMARY KEY(storage_key,family_id)
   );
   UPDATE family_families SET cleanup_time_estimated=1, dissolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
     cleanup_deadline = strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'),
     dissolved_by = (SELECT user_id FROM family_memberships m WHERE m.family_id=family_families.family_id AND m.role='creator' ORDER BY joined_at DESC LIMIT 1)
     WHERE status='dissolved';`,
  `CREATE TABLE family_directory_history (
    user_id TEXT NOT NULL, family_id TEXT NOT NULL, name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('creator','member')),
    status TEXT NOT NULL CHECK(status IN ('left','removed','dissolved')),
    PRIMARY KEY(user_id,family_id)
   );
   INSERT INTO family_directory_history(user_id,family_id,name,role,status)
   SELECT m.user_id,m.family_id,f.name,m.role,
     CASE WHEN f.status='dissolved' THEN 'dissolved' ELSE m.status END
   FROM family_memberships m JOIN family_families f ON f.family_id=m.family_id
   WHERE (f.status='dissolved' OR m.status IN ('left','removed'))
     AND NOT EXISTS(SELECT 1 FROM family_memberships live WHERE live.family_id=m.family_id AND live.user_id=m.user_id
       AND live.status='active' AND f.status='active')
     AND m.rowid=(SELECT MAX(latest.rowid) FROM family_memberships latest WHERE latest.family_id=m.family_id AND latest.user_id=m.user_id);`,
  `ALTER TABLE family_directory_history ADD COLUMN created_at TEXT;
   UPDATE family_directory_history SET created_at=(SELECT created_at FROM family_families f WHERE f.family_id=family_directory_history.family_id);`,
  `CREATE TABLE family_user_profiles (
     user_id TEXT PRIMARY KEY NOT NULL, nickname TEXT NOT NULL, updated_at TEXT NOT NULL
   );`,
  `ALTER TABLE family_test_credentials ADD COLUMN operator_provisioned INTEGER NOT NULL DEFAULT 0 CHECK(operator_provisioned IN (0,1));`,
  `CREATE TABLE family_login_identities (
     provider TEXT NOT NULL CHECK(provider IN ('apple','controlled-password')),
     subject TEXT NOT NULL CHECK(length(trim(subject)) > 0),
     user_id TEXT NOT NULL REFERENCES family_accounts(user_id),
     created_at TEXT NOT NULL,
     PRIMARY KEY(provider,subject),
     UNIQUE(user_id,provider)
   );
   CREATE INDEX family_login_identities_user ON family_login_identities(user_id);
   INSERT INTO family_login_identities(provider,subject,user_id,created_at)
     SELECT 'apple',apple_subject,user_id,created_at FROM family_accounts WHERE apple_subject IS NOT NULL;
   INSERT INTO family_login_identities(provider,subject,user_id,created_at)
     SELECT 'controlled-password',login_normalized,user_id,created_at FROM family_test_credentials;`,
  `CREATE TABLE family_apple_challenges (id TEXT PRIMARY KEY, nonce TEXT NOT NULL UNIQUE, intent TEXT NOT NULL CHECK(intent IN ('login','link')), user_id TEXT REFERENCES family_accounts(user_id), session_token TEXT, expires_at TEXT NOT NULL);
   CREATE INDEX family_apple_challenges_expiry ON family_apple_challenges(expires_at);`,
  `CREATE TABLE family_albums (
    album_id TEXT PRIMARY KEY NOT NULL, family_id TEXT NOT NULL, json TEXT NOT NULL
  );
  CREATE INDEX family_albums_by_family ON family_albums(family_id);
  CREATE TABLE family_album_notices (
    family_id TEXT NOT NULL, membership_id TEXT NOT NULL, json TEXT NOT NULL,
    PRIMARY KEY(family_id,membership_id)
  );`,
  `CREATE TABLE family_purchase_tokens(user_id TEXT PRIMARY KEY NOT NULL REFERENCES family_accounts(user_id),token TEXT UNIQUE NOT NULL);
   CREATE TABLE family_purchases(purchase_key TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES family_accounts(user_id),json TEXT NOT NULL);
   CREATE INDEX family_purchases_by_user ON family_purchases(user_id);
   CREATE TABLE family_purchase_grants(family_id TEXT NOT NULL REFERENCES family_families(family_id),purchase_key TEXT NOT NULL REFERENCES family_purchases(purchase_key),json TEXT NOT NULL,PRIMARY KEY(family_id,purchase_key));`,
  `ALTER TABLE family_apple_challenges RENAME TO family_apple_challenges_old;
   DROP INDEX family_apple_challenges_expiry;
   CREATE TABLE family_apple_challenges (id TEXT PRIMARY KEY, nonce TEXT NOT NULL UNIQUE,
     intent TEXT NOT NULL CHECK(intent IN ('login','link','delete')), user_id TEXT REFERENCES family_accounts(user_id), session_token TEXT, expires_at TEXT NOT NULL);
   INSERT INTO family_apple_challenges SELECT * FROM family_apple_challenges_old;
   DROP TABLE family_apple_challenges_old;
   CREATE INDEX family_apple_challenges_expiry ON family_apple_challenges(expires_at);
   CREATE TABLE family_account_media_cleanup (storage_key TEXT PRIMARY KEY NOT NULL);`,

  `CREATE TABLE family_safety_reports (report_id TEXT PRIMARY KEY NOT NULL, reporter_user_id TEXT NOT NULL, author_user_id TEXT NOT NULL, share_id TEXT NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL);
   CREATE INDEX family_safety_reporter ON family_safety_reports(reporter_user_id,created_at);
   CREATE INDEX family_safety_share ON family_safety_reports(share_id);
   CREATE TABLE family_user_blocks (user_id TEXT NOT NULL, target_user_id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(user_id,target_user_id));
   CREATE TABLE family_content_moderation (share_id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
   CREATE TABLE family_moderation_audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, share_id TEXT NOT NULL, json TEXT NOT NULL);
   CREATE TABLE family_sharing_restrictions (user_id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
   CREATE TABLE family_sharing_restriction_audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, json TEXT NOT NULL);`,
  // Retention anchors are separate from creation dates. Existing resolved reports
  // receive a full grace period starting at migration, never a guessed review date.
  `ALTER TABLE family_shares ADD COLUMN content_purged_at TEXT;
   CREATE INDEX family_sessions_expiry ON family_sessions(expires_at);
   CREATE INDEX family_auth_rate_window ON family_auth_rate_limits(window_started_at);
   CREATE INDEX family_shares_retirement ON family_shares(status,content_purged_at,revoked_at);
   UPDATE family_safety_reports SET json=json_set(json,'$.retentionStartedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     WHERE json_extract(json,'$.status') IN ('reviewed','restricted')
       AND json_extract(json,'$.retentionStartedAt') IS NULL;`,
];

export const TEST_ACCOUNT_REQUIRED_SCHEMA_VERSIONS = [14, 15, 16, 27, 28] as const;

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
    'SELECT version FROM family_schema_migrations WHERE version IN (14, 15, 16, 27, 28)',
  );
  const have = new Set(rows.map((row) => row.version));
  if (TEST_ACCOUNT_REQUIRED_SCHEMA_VERSIONS.some((version) => !have.has(version))) {
    throw missingTestAccountSchemaError();
  }
}

function missingTestAccountSchemaError() {
  return new Error(
    'This database is missing family-api migrations 14–16, 27 and 28. Run npm run family-api:migrate on this file first. The test-account CLI does not apply schema changes.',
  );
}
