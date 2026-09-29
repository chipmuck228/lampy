import { FamilyStoreConstraintError, type FamilyRepository, type FamilyTx } from './repository';
import type { FamilySql } from './schema';
import type { IdempotentRecord } from './store';
import type {
  Account,
  AuthRateLimit,
  EmailCredential,
  EmailToken,
  Family,
  Invitation,
  MediaObjectRecord,
  Membership,
  Session,
  ShareRecord,
  ShareSnapshot,
} from './types';

type AccountRow = {
  user_id: string;
  apple_subject: string | null;
  email: string | null;
  created_at: string;
};

type EmailCredentialRow = {
  credential_id: string;
  user_id: string;
  email_normalized: string;
  password_hash: string;
  email_verified_at: string | null;
  created_at: string;
};

type EmailTokenRow = {
  token_id: string;
  user_id: string;
  purpose: string;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

type RateLimitRow = {
  bucket: string;
  window_started_at: string;
  hit_count: number;
};

type SessionRow = {
  token: string;
  user_id: string;
  expires_at: string;
};

type FamilyRow = {
  family_id: string;
  created_at: string;
  status: string;
};

type MembershipRow = {
  membership_id: string;
  family_id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
};

type InvitationRow = {
  invitation_id: string;
  family_id: string;
  code: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_by_user_id: string | null;
};

type IdempotentRow = {
  request_fingerprint: string;
  status: number;
  body_json: string;
};

type MediaRow = {
  object_id: string;
  owner_user_id: string;
  mime_type: string;
  byte_length: number;
  content_sha256: string;
  storage_key: string;
  created_at: string;
};

type ShareRow = {
  share_id: string;
  family_id: string;
  author_user_id: string;
  source_moment_id: string;
  source_revision: number;
  snapshot_json: string;
  audience_json: string;
  shared_at: string;
  status: string | null;
  revoked_at: string | null;
};

function shareFrom(row: ShareRow): ShareRecord {
  return {
    shareId: row.share_id,
    familyId: row.family_id,
    authorUserId: row.author_user_id,
    sourceMomentId: row.source_moment_id,
    sourceRevision: row.source_revision,
    snapshot: JSON.parse(row.snapshot_json) as ShareSnapshot,
    audienceUserIds: JSON.parse(row.audience_json) as string[],
    sharedAt: row.shared_at,
    status: row.status === 'revoked' ? 'revoked' : 'active',
    revokedAt: row.revoked_at || undefined,
  };
}

function mediaFrom(row: MediaRow): MediaObjectRecord {
  return {
    objectId: row.object_id,
    ownerUserId: row.owner_user_id,
    mimeType: row.mime_type,
    byteLength: row.byte_length,
    contentSha256: row.content_sha256,
    storageKey: row.storage_key,
    createdAt: row.created_at,
  };
}

function accountFrom(row: AccountRow): Account {
  return {
    userId: row.user_id,
    appleSubject: row.apple_subject || undefined,
    email: row.email || undefined,
    createdAt: row.created_at,
  };
}

function emailCredentialFrom(row: EmailCredentialRow): EmailCredential {
  return {
    credentialId: row.credential_id,
    userId: row.user_id,
    emailNormalized: row.email_normalized,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at || undefined,
    createdAt: row.created_at,
  };
}

function emailTokenFrom(row: EmailTokenRow): EmailToken {
  return {
    tokenId: row.token_id,
    userId: row.user_id,
    purpose: row.purpose === 'reset' ? 'reset' : 'verify',
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at || undefined,
    createdAt: row.created_at,
  };
}

function rateLimitFrom(row: RateLimitRow): AuthRateLimit {
  return {
    bucket: row.bucket,
    windowStartedAt: row.window_started_at,
    hitCount: row.hit_count,
  };
}

function sessionFrom(row: SessionRow): Session {
  return { token: row.token, userId: row.user_id, expiresAt: row.expires_at };
}

function familyFrom(row: FamilyRow): Family {
  return { familyId: row.family_id, createdAt: row.created_at, status: row.status as Family['status'] };
}

function membershipFrom(row: MembershipRow): Membership {
  return {
    membershipId: row.membership_id,
    familyId: row.family_id,
    userId: row.user_id,
    role: row.role as Membership['role'],
    status: row.status as Membership['status'],
    joinedAt: row.joined_at,
  };
}

function invitationFrom(row: InvitationRow): Invitation {
  return {
    invitationId: row.invitation_id,
    familyId: row.family_id,
    code: row.code,
    status: row.status as Invitation['status'],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedByUserId: row.accepted_by_user_id || undefined,
  };
}

export function mapFamilySqlConstraint(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/family_memberships_one_active_per_user|family_memberships\.user_id/i.test(message)) {
    return new FamilyStoreConstraintError('active_membership');
  }
  if (/family_invitations\.code/i.test(message)) {
    return new FamilyStoreConstraintError('invitation_code');
  }
  if (/family_accounts\.apple_subject/i.test(message)) {
    return new FamilyStoreConstraintError('apple_subject');
  }
  if (/family_email_credentials\.email_normalized/i.test(message)) {
    return new FamilyStoreConstraintError('email_normalized');
  }
  if (/family_email_credentials\.user_id/i.test(message)) {
    return new FamilyStoreConstraintError('email_user');
  }
  if (/family_idempotency/i.test(message)) {
    return new FamilyStoreConstraintError('idempotency');
  }
  return error;
}

function createSqliteTx(db: FamilySql): FamilyTx {
  return {
    async findAccountByAppleSubject(appleSubject) {
      if (!appleSubject) return null;
      const row = await db.getFirst<AccountRow>(
        'SELECT user_id, apple_subject, email, created_at FROM family_accounts WHERE apple_subject = ?',
        [appleSubject],
      );
      return row ? accountFrom(row) : null;
    },
    async findAccountByUserId(userId) {
      const row = await db.getFirst<AccountRow>(
        'SELECT user_id, apple_subject, email, created_at FROM family_accounts WHERE user_id = ?',
        [userId],
      );
      return row ? accountFrom(row) : null;
    },
    async saveAccount(account) {
      await db.run(
        `INSERT INTO family_accounts (user_id, apple_subject, email, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET apple_subject = excluded.apple_subject, email = excluded.email`,
        [account.userId, account.appleSubject ?? null, account.email ?? null, account.createdAt],
      );
    },
    async deleteAccount(userId) {
      await db.run('DELETE FROM family_accounts WHERE user_id = ?', [userId]);
    },
    async findSession(token) {
      const row = await db.getFirst<SessionRow>(
        'SELECT token, user_id, expires_at FROM family_sessions WHERE token = ?',
        [token],
      );
      return row ? sessionFrom(row) : null;
    },
    async saveSession(session) {
      await db.run(
        `INSERT INTO family_sessions (token, user_id, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at`,
        [session.token, session.userId, session.expiresAt],
      );
    },
    async deleteSession(token) {
      await db.run('DELETE FROM family_sessions WHERE token = ?', [token]);
    },
    async deleteOtherSessions(userId, keepToken) {
      await db.run('DELETE FROM family_sessions WHERE user_id = ? AND token != ?', [userId, keepToken]);
    },
    async deleteSessionsForUser(userId) {
      await db.run('DELETE FROM family_sessions WHERE user_id = ?', [userId]);
    },
    async findEmailCredentialByEmail(emailNormalized) {
      const row = await db.getFirst<EmailCredentialRow>(
        `SELECT credential_id, user_id, email_normalized, password_hash, email_verified_at, created_at
         FROM family_email_credentials WHERE email_normalized = ?`,
        [emailNormalized],
      );
      return row ? emailCredentialFrom(row) : null;
    },
    async findEmailCredentialByUserId(userId) {
      const row = await db.getFirst<EmailCredentialRow>(
        `SELECT credential_id, user_id, email_normalized, password_hash, email_verified_at, created_at
         FROM family_email_credentials WHERE user_id = ?`,
        [userId],
      );
      return row ? emailCredentialFrom(row) : null;
    },
    async saveEmailCredential(credential) {
      await db.run(
        `INSERT INTO family_email_credentials
         (credential_id, user_id, email_normalized, password_hash, email_verified_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(credential_id) DO UPDATE SET
           password_hash = excluded.password_hash,
           email_verified_at = excluded.email_verified_at`,
        [
          credential.credentialId,
          credential.userId,
          credential.emailNormalized,
          credential.passwordHash,
          credential.emailVerifiedAt ?? null,
          credential.createdAt,
        ],
      );
    },
    async deleteEmailCredential(userId) {
      await db.run('DELETE FROM family_email_credentials WHERE user_id = ?', [userId]);
    },
    async findEmailTokenByHash(tokenHash) {
      const row = await db.getFirst<EmailTokenRow>(
        `SELECT token_id, user_id, purpose, token_hash, expires_at, consumed_at, created_at
         FROM family_email_tokens WHERE token_hash = ?`,
        [tokenHash],
      );
      return row ? emailTokenFrom(row) : null;
    },
    async listEmailTokensForUser(userId, purpose) {
      const rows = await db.getAll<EmailTokenRow>(
        `SELECT token_id, user_id, purpose, token_hash, expires_at, consumed_at, created_at
         FROM family_email_tokens WHERE user_id = ? AND purpose = ?`,
        [userId, purpose],
      );
      return rows.map(emailTokenFrom);
    },
    async saveEmailToken(token) {
      await db.run(
        `INSERT INTO family_email_tokens
         (token_id, user_id, purpose, token_hash, expires_at, consumed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(token_id) DO UPDATE SET consumed_at = excluded.consumed_at`,
        [
          token.tokenId,
          token.userId,
          token.purpose,
          token.tokenHash,
          token.expiresAt,
          token.consumedAt ?? null,
          token.createdAt,
        ],
      );
    },
    async deleteEmailTokensForUser(userId, purpose) {
      if (purpose) {
        await db.run('DELETE FROM family_email_tokens WHERE user_id = ? AND purpose = ?', [userId, purpose]);
        return;
      }
      await db.run('DELETE FROM family_email_tokens WHERE user_id = ?', [userId]);
    },
    async findRateLimit(bucket) {
      const row = await db.getFirst<RateLimitRow>(
        'SELECT bucket, window_started_at, hit_count FROM family_auth_rate_limits WHERE bucket = ?',
        [bucket],
      );
      return row ? rateLimitFrom(row) : null;
    },
    async saveRateLimit(row) {
      await db.run(
        `INSERT INTO family_auth_rate_limits (bucket, window_started_at, hit_count) VALUES (?, ?, ?)
         ON CONFLICT(bucket) DO UPDATE SET window_started_at = excluded.window_started_at, hit_count = excluded.hit_count`,
        [row.bucket, row.windowStartedAt, row.hitCount],
      );
    },
    async listMediaByOwner(ownerUserId) {
      const rows = await db.getAll<MediaRow>(
        `SELECT object_id, owner_user_id, mime_type, byte_length, content_sha256, storage_key, created_at
         FROM family_media_objects WHERE owner_user_id = ?`,
        [ownerUserId],
      );
      return rows.map(mediaFrom);
    },
    async deleteMediaObject(objectId) {
      await db.run('DELETE FROM family_media_objects WHERE object_id = ?', [objectId]);
    },
    async listSharesByAuthor(authorUserId) {
      const rows = await db.getAll<ShareRow>(
        `SELECT share_id, family_id, author_user_id, source_moment_id, source_revision, snapshot_json, audience_json, shared_at, status, revoked_at
         FROM family_shares WHERE author_user_id = ?`,
        [authorUserId],
      );
      return rows.map(shareFrom);
    },
    async deleteIdempotentForUser(userId) {
      await db.run('DELETE FROM family_idempotency WHERE user_id = ?', [userId]);
    },
    async findFamily(familyId) {
      const row = await db.getFirst<FamilyRow>(
        'SELECT family_id, created_at, status FROM family_families WHERE family_id = ?',
        [familyId],
      );
      return row ? familyFrom(row) : null;
    },
    async saveFamily(family) {
      await db.run(
        `INSERT INTO family_families (family_id, created_at, status) VALUES (?, ?, ?)
         ON CONFLICT(family_id) DO UPDATE SET status = excluded.status`,
        [family.familyId, family.createdAt, family.status],
      );
    },
    async findActiveMembershipForUser(userId) {
      const row = await db.getFirst<MembershipRow>(
        `SELECT m.membership_id, m.family_id, m.user_id, m.role, m.status, m.joined_at
         FROM family_memberships m
         JOIN family_families f ON f.family_id = m.family_id
         WHERE m.user_id = ? AND m.status = 'active' AND f.status = 'active'`,
        [userId],
      );
      return row ? membershipFrom(row) : null;
    },
    async findActiveMembership(familyId, userId) {
      const family = await this.findFamily(familyId);
      if (!family || family.status !== 'active') return null;
      const row = await db.getFirst<MembershipRow>(
        `SELECT membership_id, family_id, user_id, role, status, joined_at
         FROM family_memberships WHERE family_id = ? AND user_id = ? AND status = 'active'`,
        [familyId, userId],
      );
      return row ? membershipFrom(row) : null;
    },
    async findMembership(familyId, userId) {
      const rows = await this.findMembershipsInFamily(familyId, userId);
      return rows.find((row) => row.status === 'active') ?? rows[rows.length - 1] ?? null;
    },
    async findMembershipsInFamily(familyId, userId) {
      const rows = await db.getAll<MembershipRow>(
        `SELECT membership_id, family_id, user_id, role, status, joined_at
         FROM family_memberships WHERE family_id = ? AND user_id = ?`,
        [familyId, userId],
      );
      return rows.map(membershipFrom);
    },
    async findMembershipsForUser(userId) {
      const rows = await db.getAll<MembershipRow>(
        `SELECT membership_id, family_id, user_id, role, status, joined_at
         FROM family_memberships WHERE user_id = ?`,
        [userId],
      );
      return rows.map(membershipFrom);
    },
    async listActiveMembers(familyId) {
      const rows = await db.getAll<MembershipRow>(
        `SELECT membership_id, family_id, user_id, role, status, joined_at
         FROM family_memberships WHERE family_id = ? AND status = 'active'`,
        [familyId],
      );
      return rows.map(membershipFrom);
    },
    async saveMembership(membership) {
      await db.run(
        `INSERT INTO family_memberships (membership_id, family_id, user_id, role, status, joined_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(membership_id) DO UPDATE SET
           family_id = excluded.family_id,
           user_id = excluded.user_id,
           role = excluded.role,
           status = excluded.status,
           joined_at = excluded.joined_at`,
        [
          membership.membershipId,
          membership.familyId,
          membership.userId,
          membership.role,
          membership.status,
          membership.joinedAt,
        ],
      );
    },
    async findInvitationByCode(code) {
      const row = await db.getFirst<InvitationRow>(
        `SELECT invitation_id, family_id, code, status, created_at, expires_at, accepted_by_user_id
         FROM family_invitations WHERE code = ?`,
        [code],
      );
      return row ? invitationFrom(row) : null;
    },
    async findInvitationById(invitationId) {
      const row = await db.getFirst<InvitationRow>(
        `SELECT invitation_id, family_id, code, status, created_at, expires_at, accepted_by_user_id
         FROM family_invitations WHERE invitation_id = ?`,
        [invitationId],
      );
      return row ? invitationFrom(row) : null;
    },
    async listPendingInvitations(familyId) {
      const rows = await db.getAll<InvitationRow>(
        `SELECT invitation_id, family_id, code, status, created_at, expires_at, accepted_by_user_id
         FROM family_invitations WHERE family_id = ? AND status = 'pending'`,
        [familyId],
      );
      return rows.map(invitationFrom);
    },
    async saveInvitation(invitation) {
      await db.run(
        `INSERT INTO family_invitations (invitation_id, family_id, code, status, created_at, expires_at, accepted_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(invitation_id) DO UPDATE SET
           status = excluded.status,
           expires_at = excluded.expires_at,
           accepted_by_user_id = excluded.accepted_by_user_id`,
        [
          invitation.invitationId,
          invitation.familyId,
          invitation.code,
          invitation.status,
          invitation.createdAt,
          invitation.expiresAt,
          invitation.acceptedByUserId ?? null,
        ],
      );
    },
    async claimPendingInvitation(invitationId, acceptedByUserId) {
      const updated = await db.run(
        `UPDATE family_invitations SET status = 'accepted', accepted_by_user_id = ?
         WHERE invitation_id = ? AND status = 'pending'`,
        [acceptedByUserId, invitationId],
      );
      if (updated.changes !== 1) return null;
      return this.findInvitationById(invitationId);
    },
    async findIdempotent(userId, command, idempotencyKey) {
      const row = await db.getFirst<IdempotentRow>(
        `SELECT request_fingerprint, status, body_json FROM family_idempotency
         WHERE user_id = ? AND command = ? AND idempotency_key = ?`,
        [userId, command, idempotencyKey],
      );
      if (!row) return null;
      return {
        requestFingerprint: row.request_fingerprint,
        status: row.status,
        body: JSON.parse(row.body_json) as unknown,
      } satisfies IdempotentRecord;
    },
    async saveIdempotent(userId, command, idempotencyKey, record) {
      await db.run(
        `INSERT INTO family_idempotency (user_id, command, idempotency_key, request_fingerprint, status, body_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, command, idempotencyKey, record.requestFingerprint, record.status, JSON.stringify(record.body)],
      );
    },
    async findMediaObject(objectId) {
      const row = await db.getFirst<MediaRow>(
        `SELECT object_id, owner_user_id, mime_type, byte_length, content_sha256, storage_key, created_at
         FROM family_media_objects WHERE object_id = ?`,
        [objectId],
      );
      return row ? mediaFrom(row) : null;
    },
    async findMediaByOwnerHash(ownerUserId, contentSha256) {
      const row = await db.getFirst<MediaRow>(
        `SELECT object_id, owner_user_id, mime_type, byte_length, content_sha256, storage_key, created_at
         FROM family_media_objects WHERE owner_user_id = ? AND content_sha256 = ?`,
        [ownerUserId, contentSha256],
      );
      return row ? mediaFrom(row) : null;
    },
    async saveMediaObject(object) {
      try {
        await db.run(
          `INSERT INTO family_media_objects
           (object_id, owner_user_id, mime_type, byte_length, content_sha256, storage_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            object.objectId,
            object.ownerUserId,
            object.mimeType,
            object.byteLength,
            object.contentSha256,
            object.storageKey,
            object.createdAt,
          ],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/UNIQUE|constraint/i.test(message)) throw new FamilyStoreConstraintError('media_hash');
        throw error;
      }
    },
    async findShare(shareId) {
      const row = await db.getFirst<ShareRow>(
        `SELECT share_id, family_id, author_user_id, source_moment_id, source_revision, snapshot_json, audience_json, shared_at, status, revoked_at
         FROM family_shares WHERE share_id = ?`,
        [shareId],
      );
      return row ? shareFrom(row) : null;
    },
    async findShareBySource(familyId, authorUserId, sourceMomentId, sourceRevision) {
      const row = await db.getFirst<ShareRow>(
        `SELECT share_id, family_id, author_user_id, source_moment_id, source_revision, snapshot_json, audience_json, shared_at, status, revoked_at
         FROM family_shares
         WHERE family_id = ? AND author_user_id = ? AND source_moment_id = ? AND source_revision = ?`,
        [familyId, authorUserId, sourceMomentId, sourceRevision],
      );
      return row ? shareFrom(row) : null;
    },
    async listSharesInFamily(familyId) {
      const rows = await db.getAll<ShareRow>(
        `SELECT share_id, family_id, author_user_id, source_moment_id, source_revision, snapshot_json, audience_json, shared_at, status, revoked_at
         FROM family_shares WHERE family_id = ? ORDER BY shared_at DESC`,
        [familyId],
      );
      return rows.map(shareFrom);
    },
    async saveShare(share) {
      try {
        await db.run(
          `INSERT INTO family_shares
           (share_id, family_id, author_user_id, source_moment_id, source_revision, snapshot_json, audience_json, shared_at, status, revoked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(share_id) DO UPDATE SET
             status = excluded.status,
             revoked_at = excluded.revoked_at`,
          [
            share.shareId,
            share.familyId,
            share.authorUserId,
            share.sourceMomentId,
            share.sourceRevision,
            JSON.stringify(share.snapshot),
            JSON.stringify(share.audienceUserIds),
            share.sharedAt,
            share.status,
            share.revokedAt ?? null,
          ],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/UNIQUE|constraint/i.test(message)) throw new FamilyStoreConstraintError('share_revision');
        throw error;
      }
    },
  };
}

async function beginImmediate(db: FamilySql) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await db.exec('BEGIN IMMEDIATE');
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/SQLITE_BUSY|database is locked/i.test(message) || attempt === 199) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

export function createSqliteFamilyRepository(db: FamilySql): FamilyRepository {
  const tx = createSqliteTx(db);
  let queue = Promise.resolve();
  return {
    withTransaction(work) {
      const run = queue.then(async () => {
        await beginImmediate(db);
        try {
          const result = await work(tx);
          await db.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            await db.exec('ROLLBACK');
          } catch {
            // The failed transaction is already closed or never opened.
          }
          throw mapFamilySqlConstraint(error);
        }
      });
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}
