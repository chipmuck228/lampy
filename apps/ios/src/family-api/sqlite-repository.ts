import { FamilyStoreConstraintError, type FamilyRepository, type FamilyTx } from './repository';
import type { FamilySql } from './schema';
import type { IdempotentRecord } from './store';
import type { Account, Family, Invitation, MediaObjectRecord, Membership, Session } from './types';

type AccountRow = {
  user_id: string;
  apple_subject: string;
  email: string | null;
  created_at: string;
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
    appleSubject: row.apple_subject,
    email: row.email || undefined,
    createdAt: row.created_at,
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
  if (/family_idempotency/i.test(message)) {
    return new FamilyStoreConstraintError('idempotency');
  }
  return error;
}

function createSqliteTx(db: FamilySql): FamilyTx {
  return {
    async findAccountByAppleSubject(appleSubject) {
      const row = await db.getFirst<AccountRow>(
        'SELECT user_id, apple_subject, email, created_at FROM family_accounts WHERE apple_subject = ?',
        [appleSubject],
      );
      return row ? accountFrom(row) : null;
    },
    async saveAccount(account) {
      await db.run(
        `INSERT INTO family_accounts (user_id, apple_subject, email, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET apple_subject = excluded.apple_subject, email = excluded.email`,
        [account.userId, account.appleSubject, account.email ?? null, account.createdAt],
      );
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
